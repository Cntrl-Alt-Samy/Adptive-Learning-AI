import { setTimeout as delay } from 'node:timers/promises';

/**
 * S7-T1 — Connection-pool guard (Doc 07 §16; Supavisor pool caps at
 * 20/container).
 *
 * A FIFO bounded-concurrency semaphore placed in front of every DB checkout:
 * bursts queue instead of exhausting the pool, waiters time out with a typed
 * error (fail loud beats connection storms), and live metrics feed the
 * "connection-count alarm at 70%" watch item.
 */

export class PoolExhaustedError extends Error {
  readonly code = 'POOL_EXHAUSTED';
  constructor(
    /** ms the waiter waited before giving up. */
    public readonly waitedMs: number,
    public readonly maxConcurrent: number
  ) {
    super(`Pool guard exhausted: waited ${waitedMs}ms beyond cap ${maxConcurrent}`);
    this.name = 'PoolExhaustedError';
  }
}

export interface PoolGuardOptions {
  /** Hard ceiling on simultaneous checkouts (Supavisor: 20/container). */
  maxConcurrent?: number;
  /** How long a queued waiter waits before POOL_EXHAUSTED. */
  acquireTimeoutMs?: number;
}

export interface PoolGuardSnapshot {
  inFlight: number;
  queued: number;
  acquiredTotal: number
  rejectedTotal: number;
  maxObservedInFlight: number;
}

interface Waiter {
  resolve: () => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  enqueuedAt: number;
}

const DEFAULT_MAX = 20;
const DEFAULT_TIMEOUT_MS = 5_000;

export class PoolGuard {
  private readonly maxConcurrent: number;
  private readonly acquireTimeoutMs: number;
  private readonly waiters: Waiter[] = [];
  private inFlight = 0;
  private acquiredTotal = 0;
  private rejectedTotal = 0;
  private maxObservedInFlight = 0;

  constructor(opts: PoolGuardOptions = {}) {
    this.maxConcurrent = opts.maxConcurrent ?? DEFAULT_MAX;
    this.acquireTimeoutMs = opts.acquireTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(this.maxConcurrent) || this.maxConcurrent < 1) {
      throw new Error('maxConcurrent must be a positive integer');
    }
  }

  get capacity(): number {
    return this.maxConcurrent;
  }

  snapshot(): PoolGuardSnapshot {
    return {
      inFlight: this.inFlight,
      queued: this.waiters.length,
      acquiredTotal: this.acquiredTotal,
      rejectedTotal: this.rejectedTotal,
      maxObservedInFlight: this.maxObservedInFlight
    };
  }

  /** 70% headroom alarm threshold from the Sprint-7 risk register. */
  isNearCapacity(threshold = 0.7): boolean {
    return this.maxObservedInFlight >= Math.ceil(this.maxConcurrent * threshold);
  }

  /**
   * Acquire a slot; resolves with the release function. Waits FIFO behind
   * in-flight work; rejects typed after `acquireTimeoutMs`.
   */
  async acquire(): Promise<() => void> {
    if (this.inFlight < this.maxConcurrent && this.waiters.length === 0) {
      return this.take();
    }
    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve: () => resolve(this.take()),
        reject,
        timer: setTimeout(() => {
          const idx = this.waiters.indexOf(waiter);
          if (idx !== -1) this.waiters.splice(idx, 1);
          this.rejectedTotal++;
          reject(new PoolExhaustedError(this.acquireTimeoutMs, this.maxConcurrent));
        }, this.acquireTimeoutMs),
        enqueuedAt: Date.now()
      };
      this.waiters.push(waiter);
    });
  }

  /**
   * Run `fn` while holding a slot — the shape call sites use.
   * The slot releases even when `fn` throws or times out upstream.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Drain helper for tests/graceful shutdown — resolves when fully idle. */
  async idle(): Promise<void> {
    while (this.inFlight > 0 || this.waiters.length > 0) {
      await delay(5);
    }
  }

  private take(): () => void {
    this.inFlight++;
    this.acquiredTotal++;
    if (this.inFlight > this.maxObservedInFlight) this.maxObservedInFlight = this.inFlight;

    let released = false;
    return () => {
      if (released) return; // double-release is a no-op by contract
      released = true;
      this.inFlight--;
      const next = this.waiters.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve();
      }
    };
  }
}
