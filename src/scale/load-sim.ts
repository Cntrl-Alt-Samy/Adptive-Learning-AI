import { mulberry32 } from '../pedagogy/rng.js';
import { percentile } from '../observability/metrics.js';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * S7-T1/T2 — k6-equivalent load certification harness (Doc 07 §16; gates
 * G8/G9) as a deterministic in-repo simulator.
 *
 * Virtual SSE sessions with exponential think-time pacing run against an
 * injected turn executor (unit: latency model; integration: real Redis mutex
 * + PG two-phase commit). Certification asserts the Doc 03 §14 budgets:
 * error rate <0.1% and TTFT P95 <1200ms — the same assertions the k6 cloud
 * run makes, executable on every CI machine.
 */

export const LOAD_ERROR_RATE_MAX = 0.001;
export const LOAD_TTFT_P95_MAX_MS = 1_200;

export interface LoadSimTurnOutcome {
  ttftMs: number;
  /** Optional: executors that track failure internally may set it; throws are always counted as errors. */
  errored?: boolean;
}

export interface LoadSimExecutorContext {
  sessionId: string;
  sessionIndex: number;
  turnIndex: number;
  mode: string;
  thinkTimeMs: number;
}

/** Executes one simulated streaming turn; resolves with its TTFT. */
export type LoadSimExecutor = (ctx: LoadSimExecutorContext) => Promise<LoadSimTurnOutcome>;

/** Minimal structural shape so PoolGuard can be injected without a cycle. */
export interface ConcurrencyLimiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export interface LoadSimOptions {
  concurrentSessions: number;
  turnsPerSession: number;
  seed: number;
  /** Mean of the exponential think-time distribution (ms). */
  thinkTimeMeanMs: number;
  executor: LoadSimExecutor;
  /** Optional bounded-concurrency wrapper (PoolGuard in integration runs). */
  limiter?: ConcurrencyLimiter;
  /** When set, sessions keep regenerating until this wall-clock budget. */
  soakDurationMs?: number;
  /** Persona-mode mix weights (defaults to the beta persona mix). */
  modeMix?: Array<{ mode: string; weight: number }>;
}

export interface LoadCertification {
  sessionsCompleted: number;
  turnsExecuted: number;
  errors: number;
  errorRate: number;
  ttftP95Ms: number;
  ttftMedianMs: number;
  durationMs: number;
  /** Peak limiter occupancy when a limiter was injected. */
  poolMaxObserved?: number;
  ok: boolean;
  reasons: string[];
}

const DEFAULT_MODE_MIX: Array<{ mode: string; weight: number }> = [
  { mode: 'TUTOR', weight: 0.45 },
  { mode: 'SOCRATIC_COACH', weight: 0.25 },
  { mode: 'ASSESSOR', weight: 0.15 },
  { mode: 'DIAGNOSTICIAN', weight: 0.1 },
  { mode: 'SESSION_REVIEWER', weight: 0.05 }
];

function sampleMode(r: () => number, mix: Array<{ mode: string; weight: number }>): string {
  let acc = 0;
  const x = r();
  for (const m of mix) {
    acc += m.weight;
    if (x <= acc) return m.mode;
  }
  return mix[mix.length - 1]!.mode;
}

/** Inverse-CDF exponential sample — deterministic under the seeded RNG. */
function expThinkTime(r: () => number, meanMs: number): number {
  const u = Math.max(1e-12, Math.min(1 - 1e-12, r()));
  return Math.round(-Math.log(1 - u) * meanMs);
}

async function timedWithThink(
  ctx: LoadSimExecutorContext,
  executor: LoadSimExecutor,
  limiter: ConcurrencyLimiter | undefined,
  thinkFn: () => Promise<void>
): Promise<LoadSimTurnOutcome> {
  try {
    // Think-time happens OUTSIDE any pooled resource — only the turn itself
    // occupies the limiter, mirroring real SSE pacing.
    await thinkFn();
    const exec = () => executor(ctx);
    return limiter ? await limiter.run(exec) : await exec();
  } catch {
    return { ttftMs: Number.POSITIVE_INFINITY, errored: true };
  }
}

/**
 * Run the simulation. Deterministic for identical options + a deterministic
 * executor: seeds are per-session derived, think-times come from the shared
 * seeded stream in launch order.
 */
export async function runLoadSim(opts: LoadSimOptions): Promise<LoadCertification> {
  if (!Number.isInteger(opts.concurrentSessions) || opts.concurrentSessions < 1) {
    throw new Error('concurrentSessions must be a positive integer');
  }
  if (!Number.isInteger(opts.turnsPerSession) || opts.turnsPerSession < 1) {
    throw new Error('turnsPerSession must be a positive integer');
  }

  const startedAt = Date.now();
  const rng = mulberry32(opts.seed);
  const mix = opts.modeMix ?? DEFAULT_MODE_MIX;
  const soak = opts.soakDurationMs ?? 0;

  const outcomes: LoadSimTurnOutcome[] = [];
  let sessionsCompleted = 0;

  const runSession = async (sessionIndex: number): Promise<void> => {
    const sessionRng = mulberry32((opts.seed ^ (sessionIndex * 0x9e3779b9)) >>> 0);
    const sessionId = `sim-${opts.seed}-${sessionIndex}`;
    const deadline = soak > 0 ? startedAt + soak : null;
    let turnIndex = 0;
    // Fixed-count mode OR soak mode — whichever bounds first.
    while (turnIndex < opts.turnsPerSession || (deadline !== null && Date.now() < deadline)) {
      const mode = sampleMode(sessionRng, mix);
      const thinkTimeMs = expThinkTime(sessionRng, opts.thinkTimeMeanMs);
      const outcome = await timedWithThink(
        { sessionId, sessionIndex, turnIndex, mode, thinkTimeMs },
        opts.executor,
        opts.limiter,
        async () => {
          if (thinkTimeMs > 0) await sleep(thinkTimeMs);
        }
      );
      outcomes.push(outcome);
      turnIndex++;
    }
    sessionsCompleted++;
  };

  await Promise.all(Array.from({ length: opts.concurrentSessions }, (_, i) => runSession(i)));

  const durationMs = Date.now() - startedAt;
  const ttfts = outcomes.filter((o) => !o.errored).map((o) => o.ttftMs);
  const errors = outcomes.length - ttfts.length;
  const errorRate = outcomes.length === 0 ? 0 : errors / outcomes.length;
  const ttftP95Ms = ttfts.length > 0 ? Math.round(percentile(ttfts, 0.95)) : Number.POSITIVE_INFINITY;
  const ttftMedianMs = ttfts.length > 0 ? Math.round(percentile(ttfts, 0.5)) : Number.POSITIVE_INFINITY;

  const partial = {
    sessionsCompleted,
    turnsExecuted: outcomes.length,
    errors,
    errorRate,
    ttftP95Ms,
    ttftMedianMs,
    durationMs,
    poolMaxObserved: undefined as number | undefined
  };
  const verdict = certifyLoad(partial);
  return { ...partial, ...verdict };
}

/** G8 pass condition: error rate <0.1% AND TTFT P95 within budget. */
export function certifyLoad(
  r: Pick<LoadCertification, 'errorRate' | 'ttftP95Ms' | 'turnsExecuted'>
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (r.turnsExecuted === 0) reasons.push('NO_TURNS_EXECUTED');
  if (r.errorRate >= LOAD_ERROR_RATE_MAX) {
    reasons.push(`ERROR_RATE_BREACH (${r.errorRate.toFixed(4)} ≥ ${LOAD_ERROR_RATE_MAX})`);
  }
  if (r.ttftP95Ms > LOAD_TTFT_P95_MAX_MS) {
    reasons.push(`TTFT_P95_BREACH (${r.ttftP95Ms}ms > ${LOAD_TTFT_P95_MAX_MS}ms)`);
  }
  return { ok: reasons.length === 0, reasons };
}
