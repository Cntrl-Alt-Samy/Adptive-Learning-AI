import { describe, it, expect } from 'vitest';
import { SessionMutex } from '../../src/redis/mutex.js';
import { InMemoryRedis } from '../../src/redis/adapters/memory.js';

/**
 * mutex.spec semantics (Sprint 0 gate) — exercised here against the in-memory
 * adapter; the same suite runs against real Redis in tests/integration.
 */
function makeMutex(ttlMs = 30_000) {
  const redis = new InMemoryRedis();
  return { redis, mutex: new SessionMutex(redis, { ttlMs }) };
}

describe('session mutex — acquire', () => {
  it('dual concurrent acquire ⇒ exactly one winner', async () => {
    const { mutex } = makeMutex();
    const [r1, r2] = await Promise.all([
      mutex.acquire('user1', 'sess-A'),
      mutex.acquire('user1', 'sess-B')
    ]);
    const winners = [r1, r2].filter((r) => r.acquired);
    expect(winners).toHaveLength(1);
    const loser = r1.acquired ? r2 : r1;
    if (!loser.acquired) {
      expect(loser.reason).toBe('SESSION_SUPERSEDED');
      expect(loser.existingSessionId).toBe(r1.acquired ? 'sess-A' : 'sess-B');
    }
  });

  it('same user different sessions cannot both hold; different users are independent locks', async () => {
    const { mutex } = makeMutex();
    const u1 = await mutex.acquire('u1', 's1');
    const u2 = await mutex.acquire('u2', 's2');
    expect(u1.acquired).toBe(true);
    expect(u2.acquired).toBe(true);

    const clash = await mutex.acquire('u1', 's3');
    expect(clash.acquired).toBe(false);
  });
});

describe('session mutex — release ownership', () => {
  it('release requires the ownership token; wrong token is a no-op', async () => {
    const { mutex } = makeMutex();
    const acquired = await mutex.acquire('u1', 's1');
    if (!acquired.acquired) throw new Error('setup failed');

    expect(await mutex.release('u1', 'not-the-owner')).toBe(false);
    const stillHeld = await mutex.acquire('u1', 's2');
    expect(stillHeld.acquired).toBe(false);

    expect(await mutex.release('u1', acquired.token)).toBe(true);
    const reAcquired = await mutex.acquire('u1', 's3');
    expect(reAcquired.acquired).toBe(true);
  });

  it('release with unknown key returns false without error', async () => {
    const { mutex } = makeMutex();
    expect(await mutex.release('nobody', 'token')).toBe(false);
  });
});

describe('session mutex — TTL expiry & heartbeat', () => {
  it('TTL expiry frees the lock for a new acquirer', async () => {
    let now = 0;
    const clock = { nowMs: () => now };
    const redis = new InMemoryRedis(clock.nowMs);
    const mutex = new SessionMutex(redis, { ttlMs: 500 });

    const first = await mutex.acquire('u1', 's1');
    expect(first.acquired).toBe(true);
    if (!first.acquired) return;

    now += 499;
    expect((await mutex.acquire('u1', 's2')).acquired).toBe(false);

    now += 2; // past TTL
    const next = await mutex.acquire('u1', 's3');
    expect(next.acquired).toBe(true);
    void first.token;
  });

  it('heartbeat extends TTL only while owner still holds the lock', async () => {
    let now = 0;
    const redis = new InMemoryRedis(() => now);
    const mutex = new SessionMutex(redis, { ttlMs: 1000 });

    const first = await mutex.acquire('u1', 's1');
    if (!first.acquired) throw new Error('setup failed');

    // Heartbeat before expiry keeps extending
    for (let i = 0; i < 5; i++) {
      now += 900;
      expect(await mutex.heartbeat('u1', first.token)).toBe(true);
      expect((await mutex.acquire('u1', 'squatter')).acquired).toBe(false);
    }

    // Owner releases via expiry: stop heartbeating, cross full TTL
    now += 1100;
    expect(await mutex.heartbeat('u1', first.token)).toBe(false); // lock gone → false
    expect((await mutex.acquire('u1', 'next')).acquired).toBe(true);
  });

  it('heartbeat with wrong token does not extend', async () => {
    let now = 0;
    const redis = new InMemoryRedis(() => now);
    const mutex = new SessionMutex(redis, { ttlMs: 300 });
    const first = await mutex.acquire('u1', 's1');
    if (!first.acquired) throw new Error('setup failed');

    expect(await mutex.heartbeat('u1', 'wrong-token')).toBe(false);
    now += 301;
    expect((await mutex.acquire('u1', 's2')).acquired).toBe(true);
  });
});
