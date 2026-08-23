import { resolveRoute, type AiMode } from '../../ai/router.js';
import { STATIC_PROMPT_PREFIX, buildPrefixMessages, estimateTokens } from '../../ai/prompt-prefix.js';
import type { ModelTransport, TransportChunk } from '../../ai/transport.js';
import { CircuitBreaker, TimeoutError } from '../../ai/breaker.js';
import { sanitize, type SanitizerFlag } from '../../security/sanitizer.js';
import { CheckpointStreamScanner, extractStateCheckpoints } from '../../state/checkpoint-parser.js';
import {
  CHECKPOINT_STEPS,
  StateCheckpointSchema
} from '../../state/checkpoint-contract.js';
import type { CheckpointStore } from '../../state/checkpoint-store.js';
import type { AuditSink } from '../../ai/cost-audit.js';
import {
  STREAM_EVENT_SCHEMA_VERSION,
  TokenEventSchema,
  CheckpointConfirmedEventSchema,
  ErrorEventSchema,
  type StreamEvent
} from './events.js';

/**
 * S1-T1/T6 — the secured streaming spine. Pipeline per turn:
 *   sanitize → route → breaker-gated stream (failover before first token)
 *   → live token events → [STATE_CHECKPOINT] intercepted → Phase 1 atomic
 *   commit (mid-stream; survives client disconnect) → Phase 2 confirm event.
 */

export interface TurnRequest {
  sessionId: string;
  userId: string;
  mode: AiMode;
  step: number;
  userMessage: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface TurnDeps {
  transports: { openai: ModelTransport; anthropic: ModelTransport };
  breaker: CircuitBreaker;
  checkpointStore: CheckpointStore;
  auditSink: AuditSink;
  /** ms before an in-flight stream counts as a breaker failure (>4s policy). */
  requestTimeoutMs?: number;
  now?: () => number;
  onSanitizerFlags?: (flags: SanitizerFlag[], sessionId: string) => void;
}

const tokenEvent = (text: string) => TokenEventSchema.parse({ v: STREAM_EVENT_SCHEMA_VERSION, type: 'token', text });

/**
 * Hides complete [STATE_CHECKPOINT: ...] blocks from client-visible tokens
 * while tolerating chunk boundaries that split the opener/closer.
 */
export class CheckpointGate {
  private buf = '';
  private inside = false;

  feed(chunk: string): string {
    this.buf += chunk;
    let out = '';
    for (;;) {
      if (!this.inside) {
        const i = this.buf.indexOf('[STATE_CHECKPOINT');
        if (i === -1) {
          const safe = Math.max(0, this.buf.length - 24); // opener may be split
          out += this.buf.slice(0, safe);
          this.buf = this.buf.slice(safe);
          return out;
        }
        out += this.buf.slice(0, i);
        this.buf = this.buf.slice(i);
        this.inside = true;
      } else {
        const close = /\}\s*\]/.exec(this.buf);
        if (!close || close.index === undefined) return out; // wait for rest
        this.buf = this.buf.slice(close.index + close[0].length);
        this.inside = false;
      }
    }
  }

  flush(): string {
    const rest = this.buf;
    this.buf = '';
    this.inside = false;
    return rest;
  }
}

interface AttemptOutcome {
  text: string;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  cacheHit: boolean;
  modelUsed: string;
  latencyMs: number;
  committedStep?: { stepNumber: number; replayed: boolean; statePayload: unknown };
}

export async function* runTurn(req: TurnRequest, deps: TurnDeps): AsyncGenerator<StreamEvent> {
  // ① Sanitize learner input.
  const { clean, flags } = sanitize(req.userMessage);
  if (flags.length > 0) deps.onSanitizerFlags?.(flags, req.sessionId);

  // ② Route.
  const route = resolveRoute(req.mode, req.step);
  const startedAt = (deps.now ?? Date.now)();

  const attempt = async function* (
    candidate: typeof route.primary
  ): AsyncGenerator<StreamEvent, AttemptOutcome> {
    const providerKey = `${candidate.provider}:${candidate.model}`;
    if (!deps.breaker.canPass(providerKey)) {
      throw new Error(`CIRCUIT_OPEN:${providerKey}`);
    }
    const t0 = (deps.now ?? Date.now)();
    const transport =
      candidate.provider === 'anthropic' ? deps.transports.anthropic : deps.transports.openai;

    const prefix = buildPrefixMessages(candidate.provider === 'anthropic' ? 'anthropic' : 'openai');
    const messages = [
      ...(req.history ?? []),
      { role: 'user' as const, content: `[MODE: ${req.mode} | STEP: ${req.step}] ${clean}` }
    ];

    const gate = new CheckpointGate();
    const scanner = new CheckpointStreamScanner();
    let fullText = '';
    let emittedAny = false;
    let usage: Extract<TransportChunk, { type: 'usage' }> | undefined;
    let committed: AttemptOutcome['committedStep'];

    try {
      const it = transport
        .stream({
          provider: candidate.provider,
          model: candidate.model,
          systemPrefix: STATIC_PROMPT_PREFIX,
          messages,
          signal: undefined
        })
        [Symbol.asyncIterator]();
      for (;;) {
        const next = await it.next();
        if (next.done) break;
        const chunk = next.value;
        if (chunk.type === 'usage') {
          usage = chunk;
          continue;
        }
        fullText += chunk.text;
        emittedAny = true;
        const visible = gate.feed(chunk.text);
        if (visible.length > 0) yield tokenEvent(visible);

        scanner.push(fullText);
        const ready = scanner.takeIfReady();
        if (ready && ready.found && !committed) {
          committed = await interceptCheckpoint(ready, req, deps);
          if (committed) {
            yield CheckpointConfirmedEventSchema.parse({
              v: STREAM_EVENT_SCHEMA_VERSION,
              type: 'checkpoint_confirmed',
              sessionId: req.sessionId,
              stepNumber: committed.stepNumber,
              replayed: committed.replayed,
              statePayload: committed.statePayload
            });
          }
          if (ready.error) {
            yield ErrorEventSchema.parse({
              v: STREAM_EVENT_SCHEMA_VERSION,
              type: 'error',
              code: 'CHECKPOINT_INVALID',
              message: ready.error,
              retryable: false
            });
          }
        }
      }
      const tail = gate.flush();
      if (tail.length > 0 && !committed) yield tokenEvent(tail);
    } catch (err) {
      if (emittedAny) {
        deps.breaker.recordFailure(providerKey);
        yield ErrorEventSchema.parse({
          v: STREAM_EVENT_SCHEMA_VERSION,
          type: 'error',
          code: 'STREAM_INTERRUPTED',
          message: (err as Error).message,
          retryable: true
        });
        // Partial content already shipped — do not silently restart with fallback.
        throw new Error('STREAM_INTERRUPTED_NO_FAILOVER');
      }
      throw err;
    }

    deps.breaker.recordSuccess(providerKey);
    return {
      text: fullText,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      cacheHit: usage?.cacheHit ?? false,
      modelUsed: `${candidate.provider}:${candidate.model}`,
      latencyMs: (deps.now ?? Date.now)() - t0,
      committedStep: committed
    };
  };

  const deadlineMs = deps.requestTimeoutMs ?? 4_000;
  const candidates: Array<typeof route.primary> = [route.primary, route.fallback];
  let lastError: unknown;

  for (const candidate of candidates) {
    const providerKey = `${candidate.provider}:${candidate.model}`;
    const gen = attempt(candidate);
    const t0 = (deps.now ?? Date.now)();
    let outcome: AttemptOutcome | null = null;
    let timedOut = false;

    try {
      for (;;) {
        const next = await gen.next();
        if (next.done) {
          outcome = next.value;
          break;
        }
        if ((deps.now ?? Date.now)() - t0 > deadlineMs && !outcome) {
          timedOut = true;
          break;
        }
        yield next.value; // forward token/checkpoint/error events
      }
    } catch (err) {
      lastError = err;
      deps.breaker.recordFailure(providerKey);
      if ((err as Error)?.message === 'STREAM_INTERRUPTED_NO_FAILOVER') return;
      continue; // failover
    }

    if (outcome) {
      // Audit row (S1-T7) — estimates only when provider omitted usage.
      const inputTokens = outcome.inputTokens ?? estimateTokens(STATIC_PROMPT_PREFIX) + 64;
      const outputTokens = outcome.outputTokens ?? estimateTokens(outcome.text);
      await deps.auditSink.writeAiExecutionAudit({
        sessionId: req.sessionId,
        modelUsed: outcome.modelUsed,
        promptCacheHit: outcome.cacheHit,
        inputTokens,
        outputTokens,
        latencyMs: outcome.latencyMs
      });
      return;
    }

    if (timedOut) {
      deps.breaker.recordFailure(providerKey);
      lastError = new TimeoutError(providerKey, (deps.now ?? Date.now)() - t0);
      continue; // failover (no tokens emitted yet by contract)
    }
  }

  yield ErrorEventSchema.parse({
    v: STREAM_EVENT_SCHEMA_VERSION,
    type: 'error',
    code: 'MODEL_UNAVAILABLE',
    message: `All routes failed${lastError ? `: ${(lastError as Error).message}` : ''}`,
    retryable: true
  });
}

async function interceptCheckpoint(
  ready: ReturnType<typeof extractStateCheckpoints>,
  req: TurnRequest,
  deps: TurnDeps
): Promise<AttemptOutcome['committedStep']> {
  if (!ready.checkpoint) return undefined;
  const parsed = StateCheckpointSchema.safeParse(ready.checkpoint);
  if (!parsed.success) return undefined;
  if (!(CHECKPOINT_STEPS as readonly number[]).includes(parsed.data.step)) return undefined;

  // PHASE 1 — atomic server-side commit (idempotent on retry/replay).
  const result = await deps.checkpointStore.commitCheckpoint({
    sessionId: req.sessionId,
    userId: req.userId,
    stepNumber: parsed.data.step,
    activeMode: req.mode,
    statePayload: parsed.data,
    userMessage: req.userMessage,
    assistantResponse: ready.visibleText.trim(),
    latencyMs: 0
  });
  // PHASE 2 happens at the call site once the row is durable.
  return { stepNumber: parsed.data.step, replayed: result.replayed, statePayload: parsed.data };
}

/** Wrap a turn generator into an SSE Response (Edge/Node Web fetch compatible). */
export function toSseResponse(events: AsyncGenerator<StreamEvent>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await events.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`event: ${next.value.type}\ndata: ${JSON.stringify(next.value)}\n\n`));
    }
  });
  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  });
}
