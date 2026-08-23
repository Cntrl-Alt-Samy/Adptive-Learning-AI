import type { RedisLike } from '../types.js';
import { SCRIPT_MARKERS } from '../types.js';

interface Entry {
  value: string;
  expiresAtMs: number | null;
}

/**
 * In-memory RedisLike test adapter (Sprint 0 DoD: "in-memory test adapter").
 * Mirrors the exact semantics of the mutex Lua scripts — including PX TTL
 * expiry and cjson payload decode guards — without any I/O.
 */
export class InMemoryRedis implements RedisLike {
  private readonly store = new Map<string, Entry>();
  private nowMs: () => number;

  constructor(nowMs: () => number = Date.now) {
    this.nowMs = nowMs;
  }

  async eval(script: string, numKeys: number, ...keysAndArgs: string[]): Promise<unknown> {
    if (numKeys !== 1) throw new Error('InMemoryRedis only supports single-key scripts');
    void numKeys;
    const key = keysAndArgs[0] ?? '';
    const args = keysAndArgs.slice(1);

    this.sweep(key);

    if (script.includes(SCRIPT_MARKERS.acquire)) return this.acquire(key, args);
    if (script.includes(SCRIPT_MARKERS.release)) return this.releaseIfOwner(key, args[0] ?? '');
    if (script.includes(SCRIPT_MARKERS.heartbeat)) {
      const ttl = Number.parseInt(args[1] ?? '0', 10);
      return this.expireIfOwner(key, args[0] ?? '', ttl);
    }
    throw new Error(`InMemoryRedis: unsupported script: ${script.slice(0, 80)}`);
  }

  private sweep(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.expiresAtMs !== null && entry.expiresAtMs <= this.nowMs()) {
      this.store.delete(key);
    }
  }

  private acquire(key: string, args: string[]): [number, string | null] {
    const existing = this.store.get(key);
    if (existing) return [0, existing.value];
    const ttl = Number.parseInt(args[1] ?? '0', 10);
    this.store.set(key, { value: args[0] ?? '', expiresAtMs: ttl > 0 ? this.nowMs() + ttl : null });
    return [1, args[0] ?? null];
  }

  private decodeToken(value: string | undefined): string | null {
    if (!value) return null;
    try {
      const decoded = JSON.parse(value) as { token?: unknown };
      return typeof decoded.token === 'string' ? decoded.token : null;
    } catch {
      return null;
    }
  }

  private releaseIfOwner(key: string, token: string): number {
    const entry = this.store.get(key);
    if (!entry) return 0;
    if (this.decodeToken(entry.value) === token) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }

  private expireIfOwner(key: string, token: string, ttlMs: number): number {
    const entry = this.store.get(key);
    if (!entry) return 0;
    if (this.decodeToken(entry.value) === token) {
      entry.expiresAtMs = ttlMs > 0 ? this.nowMs() + ttlMs : null;
      return 1;
    }
    return 0;
  }
}
