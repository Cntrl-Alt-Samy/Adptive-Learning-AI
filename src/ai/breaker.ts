/**
 * S1-T5 — Per-provider failover circuit breaker (Doc 03 §11).
 *
 * Explicit three-state machine:
 *
 *   CLOSED ──N consecutive failures or any timeout>4s──► OPEN
 *   OPEN   ──jittered cooldown elapsed──► HALF_OPEN (single probe)
 *   HALF_OPEN ──probe ok──► CLOSED
 *   HALF_OPEN ──probe fail──► OPEN (new jittered window)
 *
 * The clock and randomness are injected so chaos tests are deterministic.
 */

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface Clock {
  now(): number;
}

export interface BreakerOptions {
  /** Consecutive failures that trip the breaker from CLOSED. */
  failureThreshold?: number;
  /** Base cooldown before a half-open probe is allowed. */
  openStateMs?: number;
  /** Requests slower than this count as failures (>4s per Doc 03 §11). */
  requestTimeoutMs?: number;
  /** Extra randomised window added to cooldown (anti sync-retry). */
  jitterMs?: number;
  clock?: Clock;
  random?: () => number;
}

interface ProviderRuntime {
  state: BreakerState;
  consecutiveFailures: number;
  openedAtMs: number;
  reopenAtMs: number;
  probesInFlight: number;
}

export class TimeoutError extends Error {
  constructor(public readonly providerKey: string, public readonly elapsedMs: number) {
    super(`Provider '${providerKey}' timed out after ${elapsedMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly openStateMs: number;
  private readonly requestTimeoutMs: number;
  private readonly jitterMs: number;
  private readonly clock: Clock;
  private readonly random: () => number;
  private readonly runtimes = new Map<string, ProviderRuntime>();

  constructor(options: BreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.openStateMs = options.openStateMs ?? 10_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 4_000;
    this.jitterMs = options.jitterMs ?? 2_000;
    this.clock = options.clock ?? { now: () => Date.now() };
    this.random = options.random ?? Math.random;
  }

  getState(providerKey: string): BreakerState {
    const rt = this.runtimes.get(providerKey);
    if (!rt) return 'CLOSED';
    if (rt.state === 'OPEN' && this.clock.now() >= rt.reopenAtMs) {
      rt.state = 'HALF_OPEN'; // lazy transition; probe gate below
    }
    return rt.state;
  }

  /**
   * Gate for dispatching a request right now. In HALF_OPEN exactly one probe
   * may be in flight — concurrent callers are rejected (no thundering herd)
   * and must use their fallback route.
   */
  canPass(providerKey: string): boolean {
    const state = this.getState(providerKey);
    if (state === 'CLOSED') return true;
    const rt = this.runtime(providerKey);
    if (state === 'OPEN') return false;
    // HALF_OPEN: single-probe gate.
    if (rt.probesInFlight >= 1) return false;
    rt.probesInFlight += 1;
    return true;
  }

  recordSuccess(providerKey: string): void {
    const rt = this.runtime(providerKey);
    rt.consecutiveFailures = 0;
    rt.probesInFlight = 0;
    rt.state = 'CLOSED';
  }

  recordFailure(providerKey: string): void {
    const rt = this.runtime(providerKey);
    const wasHalfOpen = this.getState(providerKey) === 'HALF_OPEN';
    rt.probesInFlight = Math.max(0, rt.probesInFlight - 1);
    rt.consecutiveFailures += 1;

    if (wasHalfOpen || rt.consecutiveFailures >= this.failureThreshold) {
      this.trip(rt);
    }
  }

  /** Release a half-open probe slot without counting success/failure. */
  releaseProbe(providerKey: string): void {
    const rt = this.runtime(providerKey);
    rt.probesInFlight = Math.max(0, rt.probesInFlight - 1);
  }

  /**
   * Execute `fn` under the provider's breaker policy: enforces the request
   * timeout, records outcome, and translates state into pass/fail gates.
   */
  async execute<T>(providerKey: string, fn: () => Promise<T>): Promise<T> {
    if (!this.canPass(providerKey)) {
      throw new Error(`CIRCUIT_OPEN:${providerKey}`);
    }
    const startedAt = this.clock.now();
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      const elapsed = this.clock.now() - startedAt;
      if (elapsed >= this.requestTimeoutMs && !(err instanceof Error && err.name === 'AbortError')) {
        this.recordFailure(providerKey);
        throw new TimeoutError(providerKey, elapsed);
      }
      this.recordFailure(providerKey);
      throw err;
    }
    // Resolved-but-slow calls count as failures too (Doc 03 §11 >4s policy).
    const elapsedOk = this.clock.now() - startedAt;
    if (elapsedOk >= this.requestTimeoutMs) {
      this.recordFailure(providerKey);
      throw new TimeoutError(providerKey, elapsedOk);
    }
    this.recordSuccess(providerKey);
    return result;
  }

  private trip(rt: ProviderRuntime): void {
    rt.state = 'OPEN';
    rt.openedAtMs = this.clock.now();
    const jitter = Math.floor(this.random() * this.jitterMs);
    rt.reopenAtMs = rt.openedAtMs + this.openStateMs + jitter;
    rt.consecutiveFailures = Math.min(rt.consecutiveFailures, this.failureThreshold);
  }

  private runtime(providerKey: string): ProviderRuntime {
    let rt = this.runtimes.get(providerKey);
    if (!rt) {
      rt = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        openedAtMs: 0,
        reopenAtMs: 0,
        probesInFlight: 0
      };
      this.runtimes.set(providerKey, rt);
    }
    return rt;
  }
}
