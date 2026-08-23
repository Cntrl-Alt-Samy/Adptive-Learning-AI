import { randomUUID } from 'node:crypto';
import type { RedisLike } from './types.js';
import { SCRIPT_MARKERS } from './types.js';

export const SESSION_LOCK_TTL_MS_DEFAULT = 30_000;

const ACQUIRE_SCRIPT = `
${SCRIPT_MARKERS.acquire}
local current = redis.call('GET', KEYS[1])
if current then
  return {0, current}
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return {1, ARGV[1]}
`;

const RELEASE_SCRIPT = `
${SCRIPT_MARKERS.release}
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local ok, decoded = pcall(cjson.decode, current)
if ok and decoded['token'] == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`;

const HEARTBEAT_SCRIPT = `
${SCRIPT_MARKERS.heartbeat}
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local ok, decoded = pcall(cjson.decode, current)
if ok and decoded['token'] == ARGV[1] then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
end
return 0
`;

export function sessionLockKey(userId: string): string {
  return `lock:session:user:${userId}`;
}

interface LockPayload {
  sessionId: string;
  token?: string;
}

export type AcquireResult =
  | { acquired: true; token: string; ttlMs: number }
  | { acquired: false; reason: 'SESSION_SUPERSEDED'; existingSessionId: string };

export type ReleaseResult = boolean;
export type HeartbeatResult = boolean;

export interface SessionMutexOptions {
  ttlMs?: number;
}

function parseHolder(raw: unknown): LockPayload | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const decoded = JSON.parse(raw) as Partial<LockPayload>;
    // sessionId alone is enough for supersede reporting; ownership always
    // additionally requires the token (enforced in Lua).
    if (typeof decoded.sessionId === 'string') {
      return { sessionId: decoded.sessionId, token: decoded.token };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Single-active-session concurrency lock (Doc 05 §8 / Doc 04 §13.2).
 *
 * - Key: lock:session:user:{userId}, TTL 30s, refreshed by heartbeat.
 * - Acquire/release/heartbeat are each atomic single-round-trip Lua ops
 *   (GET+SET NX+PX fused; ownership-token-guarded DEL/PEXPIRE).
 * - Supersede semantics: acquiring while another session holds the lock
 *   surfaces the existing sessionId so the gateway can terminate the old
 *   socket with 4009_SESSION_SUPERSEDED.
 */
export class SessionMutex {
  private readonly defaultTtlMs: number;

  constructor(
    private readonly redis: RedisLike,
    options: SessionMutexOptions = {}
  ) {
    this.defaultTtlMs = options.ttlMs ?? SESSION_LOCK_TTL_MS_DEFAULT;
  }

  async acquire(userId: string, sessionId: string, options: SessionMutexOptions = {}): Promise<AcquireResult> {
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;
    const token = randomUUID();
    const payload = JSON.stringify({ sessionId, token });
    const result = await this.redis.eval(ACQUIRE_SCRIPT, 1, sessionLockKey(userId), payload, String(ttlMs));
    const [won, holderRaw] = this.asPair(result);
    if (won === 1) {
      return { acquired: true, token, ttlMs };
    }
    const holder = parseHolder(holderRaw);
    return {
      acquired: false,
      reason: 'SESSION_SUPERSEDED',
      existingSessionId: holder?.sessionId ?? '<unknown>'
    };
  }

  /** Release requires the ownership token; non-owners cannot delete the lock. */
  async release(userId: string, token: string): Promise<ReleaseResult> {
    const result = await this.redis.eval(RELEASE_SCRIPT, 1, sessionLockKey(userId), token);
    return result === 1 || (Array.isArray(result) && result[0] === 1);
  }

  /** Heartbeat refresher: extends TTL only while the caller still owns the lock. */
  async heartbeat(userId: string, token: string, options: SessionMutexOptions = {}): Promise<HeartbeatResult> {
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;
    const result = await this.redis.eval(HEARTBEAT_SCRIPT, 1, sessionLockKey(userId), token, String(ttlMs));
    return result === 1 || (Array.isArray(result) && result[0] === 1);
  }

  private asPair(result: unknown): [number, unknown] {
    if (Array.isArray(result)) {
      return [Number(result[0]), result[1]];
    }
    throw new Error(`Unexpected mutex reply shape: ${String(result)}`);
  }
}
