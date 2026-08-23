import { describe, it, expect } from 'vitest';
import { SessionMutex } from '../../src/redis/mutex.js';
import { InMemoryRedis } from '../../src/redis/adapters/memory.js';
import type { RedisLike } from '../../src/redis/types.js';

describe('session mutex — malformed reply hardening', () => {
  function fakeRedis(reply: unknown): RedisLike {
    return {
      eval: () => Promise.resolve(reply)
    };
  }

  it('supersede reply with unparseable payload surfaces <unknown> holder', async () => {
    const mutex = new SessionMutex(fakeRedis([0, 'not-json']));
    const result = await mutex.acquire('u1', 's1');
    expect(result).toEqual({
      acquired: false,
      reason: 'SESSION_SUPERSEDED',
      existingSessionId: '<unknown>'
    });
  });

  it('supersede reply missing token field still surfaces sessionId', async () => {
    const mutex = new SessionMutex(fakeRedis([0, JSON.stringify({ sessionId: 'sess-9' })]));
    const result = await mutex.acquire('u1', 's1');
    if (result.acquired) throw new Error('expected supersede');
    expect(result.existingSessionId).toBe('sess-9');
  });

  it('non-array eval replies are rejected loudly', async () => {
    const mutex = new SessionMutex(fakeRedis('garbage'));
    await expect(mutex.acquire('u1', 's1')).rejects.toThrow(/reply shape/i);
  });

  it('array-shaped release/heartbeat replies are accepted', async () => {
    const mutex = new SessionMutex(fakeRedis([1]));
    expect(await mutex.release('u1', 'tok')).toBe(true);
    expect(await mutex.heartbeat('u1', 'tok')).toBe(true);
  });
});

describe('upstash adapter — connection guard', () => {
  it('fails fast on an empty REDIS_URL', async () => {
    const { createRedisConnection } = await import('../../src/redis/adapters/upstash.js');
    expect(() => createRedisConnection('')).toThrow(/REDIS_URL/);
  });
});

describe('in-memory adapter — direct semantics', () => {
  it('rejects multi-key scripts and unknown scripts', async () => {
    const redis = new InMemoryRedis();
    await expect(redis.eval('--x', 2, 'a', 'b')).rejects.toThrow(/single-key/);
    await expect(redis.eval('--unknown-op', 1, 'k')).rejects.toThrow(/unsupported script/);
  });

  it('acquire with zero TTL creates a non-expiring lock', async () => {
    let now = 0;
    const redis = new InMemoryRedis(() => now);
    const [won] = (await redis.eval(
      '--learnos:mutex:acquire\nreturn 1',
      1,
      'k',
      '{"sessionId":"s","token":"t"}',
      '0'
    )) as [number];
    expect(won).toBe(1);
    now += 10_000_000;
    const again = (await redis.eval(
      '--learnos:mutex:acquire\nreturn 1',
      1,
      'k',
      '{"sessionId":"s","token":"t"}',
      '0'
    )) as [number];
    expect(again[0]).toBe(0); // still held
  });

  it('corrupt payloads never match ownership tokens', async () => {
    const redis = new InMemoryRedis();
    await redis.eval('--learnos:mutex:acquire', 1, 'k', '{{{broken', '1000');
    expect(await redis.eval('--learnos:mutex:release', 1, 'k', 't')).toBe(0);
    expect(await redis.eval('--learnos:mutex:heartbeat', 1, 'k', 't', '1000')).toBe(0);
    // non-object JSON decodes without token
    await redis.eval('--learnos:mutex:acquire', 1, 'k2', '[1,2]', '1000');
    expect(await redis.eval('--learnos:mutex:release', 1, 'k2', 'anything')).toBe(0);
  });
});
