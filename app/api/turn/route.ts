import { randomUUID } from 'node:crypto';

import { runTurn, toSseResponse } from '@/src/api/sse/turn-route.js';
import type { AiMode } from '@/src/ai/router.js';
import { createModelTransport } from '@/src/ai/transport.js';
import { CircuitBreaker } from '@/src/ai/breaker.js';
import { InMemoryCheckpointStore } from '@/src/state/checkpoint-store.js';
import { InMemoryAuditSink } from '@/src/ai/cost-audit.js';
import type { SanitizerFlag } from '@/src/security/sanitizer.js';
import { createDevMockTransport } from '@/lib/dev-mock-transport';
import { resolveConceptContext, formatCurriculumContext } from '@/src/curriculum/context-resolver.js';

/**
 * S8A-T1 — Route Handler port of the legacy `api/turn.ts` serverless
 * wrapper. Same SSE contract; session id now comes from the client so
 * reconnect/resume (SessionResumeBuffer) hydrates the same checkpoint
 * stream instead of a per-lambda random session.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const AI_MODES: ReadonlySet<string> = new Set<AiMode>([
  'PROFILER',
  'DIAGNOSTICIAN',
  'TUTOR',
  'SOCRATIC_COACH',
  'ASSESSOR',
  'SESSION_REVIEWER'
]);

const sharedTransport =
  process.env.LEARNOS_MOCK_TRANSPORT === '1' ? createDevMockTransport() : createModelTransport();

const deps = {
  transports: { openai: sharedTransport, anthropic: sharedTransport },
  breaker: new CircuitBreaker({ failureThreshold: 3 }),
  checkpointStore: new InMemoryCheckpointStore(),
  auditSink: new InMemoryAuditSink(),
  requestTimeoutMs: 30_000,
  routeOverrides: {
    tierModels: {
      1: { primary: { provider: 'openai' as const, model: process.env.LEARNOS_TUTOR_MODEL ?? 'x-preview-f-free' } },
      2: { primary: { provider: 'openai' as const, model: process.env.LEARNOS_TUTOR_MODEL ?? 'x-preview-f-free' } },
      3: { primary: { provider: 'openai' as const, model: process.env.LEARNOS_TUTOR_MODEL ?? 'x-preview-f-free' } }
    }
  },
  onSanitizerFlags: (flags: SanitizerFlag[]) => console.log('[sanitizer]', flags.join(','))
};

interface TurnBody {
  sessionId?: unknown;
  text?: unknown;
  mode?: unknown;
  step?: unknown;
  history?: unknown;
  /** Learner context for personalized tutoring. */
  persona?: unknown;
  dna?: unknown;
  conceptId?: unknown;
}

function parseHistory(raw: unknown): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is { role: 'user' | 'assistant'; content: string } =>
      typeof m === 'object' &&
      m !== null &&
      ((m as Record<string, unknown>).role === 'user' || (m as Record<string, unknown>).role === 'assistant') &&
      typeof (m as Record<string, unknown>).content === 'string'
  );
}

function parsePersona(raw: unknown): import('@/src/ai/learner-context.js').LearnerPersona | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const p = raw as Record<string, unknown>;
  if (typeof p.subjectId !== 'string' || typeof p.subjectTitle !== 'string') return undefined;
  const selfLevel = p.selfLevel;
  if (selfLevel !== 'beginner' && selfLevel !== 'some_exposure' && selfLevel !== 'intermediate' && selfLevel !== 'advanced') return undefined;
  return {
    subjectId: p.subjectId,
    subjectTitle: p.subjectTitle,
    selfLevel,
    goal: typeof p.goal === 'string' ? p.goal : '',
    timeMinutes: typeof p.timeMinutes === 'number' ? p.timeMinutes : 30,
    modality: (['stepwise', 'examples', 'visual', 'hands_on'] as const).includes(p.modality as never)
      ? (p.modality as import('@/src/ai/learner-context.js').LearnerPersona['modality'])
      : 'stepwise'
  };
}

function parseDna(raw: unknown): import('@/src/ai/learner-context.js').LearnerDnaContext | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.mastery)) return undefined;
  const mastery = d.mastery
    .filter(
      (m: unknown): m is import('@/src/ai/learner-context.js').MasteryEntry =>
        typeof m === 'object' &&
        m !== null &&
        typeof (m as Record<string, unknown>).conceptId === 'string' &&
        typeof (m as Record<string, unknown>).masteryScore === 'number'
    )
    .map((m) => ({
      conceptId: m.conceptId as string,
      masteryScore: m.masteryScore as number,
      status: (['SOLID', 'PARTIAL', 'NEEDS_WORK'].includes(m.status as string) ? m.status : 'NEEDS_WORK') as 'SOLID' | 'PARTIAL' | 'NEEDS_WORK'
    }));
  const dueReviews = Array.isArray(d.dueReviews)
    ? d.dueReviews
        .filter(
          (r: unknown): r is { conceptId: string; dueAtMs: number } =>
            typeof r === 'object' &&
            r !== null &&
            typeof (r as Record<string, unknown>).conceptId === 'string' &&
            typeof (r as Record<string, unknown>).dueAtMs === 'number'
        )
        .slice(0, 20)
    : [];
  return { mastery, dueReviews };
}

export async function POST(req: Request): Promise<Response> {
  let body: TurnBody = {};
  try {
    body = (await req.json()) as TurnBody;
  } catch {
    /* empty body → defaults */
  }

  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim().length > 0 ? body.sessionId : randomUUID();
  const mode: AiMode =
    typeof body.mode === 'string' && AI_MODES.has(body.mode) ? (body.mode as AiMode) : 'TUTOR';
  const step = typeof body.step === 'number' && Number.isInteger(body.step) && body.step >= 0 && body.step <= 8 ? body.step : 4;

  const persona = parsePersona(body.persona);
  const dna = parseDna(body.dna);

  // Auto-resolve curriculum chunks server-side from subjectId + conceptId.
  let curriculumChunks: string | undefined;
  if (persona !== undefined && typeof body.conceptId === 'string' && body.conceptId.length > 0) {
    const ctx = resolveConceptContext(persona.subjectId, body.conceptId);
    if (ctx !== null) {
      curriculumChunks = formatCurriculumContext(ctx);
    }
  }

  const events = runTurn(
    {
      sessionId,
      userId: 'demo-user',
      mode,
      step,
      userMessage: String(body.text ?? ''),
      history: parseHistory(body.history),
      learnerContext: {
        persona,
        dna,
        curriculumChunks
      }
    },
    deps
  );
  return toSseResponse(events);
}
