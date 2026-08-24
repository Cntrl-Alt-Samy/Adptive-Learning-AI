import { randomUUID } from 'node:crypto';

import { runTurn, toSseResponse } from '@/src/api/sse/turn-route.js';
import type { AiMode } from '@/src/ai/router.js';
import { createModelTransport } from '@/src/ai/transport.js';
import { CircuitBreaker } from '@/src/ai/breaker.js';
import { InMemoryCheckpointStore } from '@/src/state/checkpoint-store.js';
import { InMemoryAuditSink } from '@/src/ai/cost-audit.js';
import type { SanitizerFlag } from '@/src/security/sanitizer.js';
import { createDevMockTransport } from '@/lib/dev-mock-transport';

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

  const events = runTurn(
    {
      sessionId,
      userId: 'demo-user',
      mode,
      step,
      userMessage: String(body.text ?? ''),
      history: parseHistory(body.history)
    },
    deps
  );
  return toSseResponse(events);
}
