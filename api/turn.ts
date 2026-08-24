import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { runTurn } from '../src/api/sse/turn-route.js';
import type { AiMode } from '../src/ai/router.js';
import { createModelTransport } from '../src/ai/transport.js';
import { CircuitBreaker } from '../src/ai/breaker.js';
import { InMemoryCheckpointStore } from '../src/state/checkpoint-store.js';
import { InMemoryAuditSink, type AiExecutionAuditRow } from '../src/ai/cost-audit.js';
import type { SanitizerFlag } from '../src/security/sanitizer.js';

/**
 * Vercel serverless wrapper around the Sprint-1 turn pipeline.
 * Same contract as scripts/dev-server.ts: POST { text, mode?, step? } →
 * text/event-stream of typed pipeline events.
 *
 * Demo caveat: checkpoint/audit state is per-lambda-instance (InMemory*),
 * so a cold start starts a fresh session — acceptable for the shareable
 * demo; production persistence lands with the Postgres stores.
 */

export const maxDuration = 60;

const SESSION = randomUUID();
const store = new InMemoryCheckpointStore();
const audit = new InMemoryAuditSink();
const freeModel = process.env.LEARNOS_TUTOR_MODEL ?? 'x-preview-f-free';

const sharedTransport = createModelTransport();
const deps = {
  transports: { openai: sharedTransport, anthropic: sharedTransport },
  breaker: new CircuitBreaker({ failureThreshold: 3 }),
  checkpointStore: store,
  auditSink: audit,
  requestTimeoutMs: 30_000,
  routeOverrides: {
    tierModels: {
      1: { primary: { provider: 'openai' as const, model: freeModel } },
      2: { primary: { provider: 'openai' as const, model: freeModel } },
      3: { primary: { provider: 'openai' as const, model: freeModel } }
    }
  },
  onSanitizerFlags: (flags: SanitizerFlag[]) => console.log('[sanitizer]', flags.join(','))
};

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' }).end();
    return;
  }

  let body = '';
  for await (const c of req) body += String(c);
  let parsed: { text?: unknown; mode?: unknown; step?: unknown } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    /* keep defaults */
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive'
  });

  const t0 = Date.now();
  try {
    for await (const event of runTurn(
      {
        sessionId: SESSION,
        userId: 'demo-user',
        mode: typeof parsed.mode === 'string' ? (parsed.mode as AiMode) : 'TUTOR',
        step: typeof parsed.step === 'number' ? parsed.step : 4,
        userMessage: String(parsed.text ?? '')
      },
      deps
    )) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    res.write(
      `event: error\ndata: ${JSON.stringify({ v: 1, type: 'error', code: 'FATAL', message: (err as Error).message, retryable: false })}\n\n`
    );
  }

  const rows: AiExecutionAuditRow[] = await audit.listAudits(SESSION);
  const last = rows.at(-1);
  console.log(
    `[turn] ${Date.now() - t0}ms model=${last?.modelUsed ?? '?'} in=${last?.inputTokens ?? '?'} out=${last?.outputTokens ?? '?'} cost£=${last?.costGbp ?? '?'}`
  );
  res.end();
}
