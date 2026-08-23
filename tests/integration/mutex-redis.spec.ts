import { describe, it, expect, afterAll } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { SessionMutex } from '../../src/redis/mutex.js';
import { createRedisConnection, IoredisRedisLike } from '../../src/redis/adapters/upstash.js';

/**
 * mutex.spec — Sprint 0 gate (integration; real Redis).
 * Uses TEST_REDIS_URL ?? REDIS_URL (Upstash or local compose redis).
 * Skips cleanly when unset or unreachable. Every test uses run-unique user
 * ids so stale locks (e.g. from a killed prior run) cannot interfere.
 */
const REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;

async function canReach(url: string): Promise<boolean> {
  try {
    const client = createRedisConnection(url);
    const pong = await client.ping();
    await client.quit();
    return true && pong === 'PONG';
  } catch {
    return false;
  }
}

const suite = REDIS_URL && (await canReach(REDIS_URL)) ? describe : describe.skip;

const RUN_ID = randomUUID().slice(0, 8);
const uid = (name: string): string => `${name}-${RUN_ID}`;
const touchedKeys: string[] = [];

suite('mutex.spec — real Redis (S0-T4 gate)', () => {
  let connection: ReturnType<typeof createRedisConnection>;
  let mutex: SessionMutex;

  function freshMutex(ttlMs = 30_000) {
    connection = createRedisConnection(REDIS_URL!);
    return new SessionMutex(new IoredisRedisLike(connection), { ttlMs });
  }

  afterAll(async () => {
    // Best-effort cleanup of any locks this run still holds.
    if (connection) {
      for (const key of [...touchedKeys]) {
        await connection.del(key).catch(() => undefined);
      }
      await connection.quit().catch(() => connection.disconnect());
    }
  });

  it('dual concurrent acquire ⇒ exactly one winner', async () => {
    mutex = freshMutex();
    const user = uid('gate-user');
    touchedKeys.push(`lock:session:user:${user}`);
    const [r1, r2] = await Promise.all([
      mutex.acquire(user, 'sess-A'),
      mutex.acquire(user, 'sess-B')
    ]);
    expect(r1.acquired !== r2.acquired).toBe(true);
    const loser = r1.acquired ? r2 : r1;
    if (!loser.acquired) {
      expect(loser.reason).toBe('SESSION_SUPERSEDED');
      expect(['sess-A', 'sess-B']).toContain(loser.existingSessionId);
    }
  });

  it('release requires ownership token', async () => {
    mutex = mutex ?? freshMutex();
    const user = uid('gate-user-2');
    touchedKeys.push(`lock:session:user:${user}`);
    const acquired = await mutex.acquire(user, 'sess-C');
    if (!acquired.acquired) throw new Error('setup: expected to win lock');
    expect(await mutex.release(user, 'forged-token')).toBe(false);
    expect((await mutex.acquire(user, 'sneak')).acquired).toBe(false);
    expect(await mutex.release(user, acquired.token)).toBe(true);
    expect((await mutex.acquire(user, 'sess-D')).acquired).toBe(true);
  });

  it('TTL expiry frees the lock', async () => {
    const short = freshMutex(800);
    const user = uid('gate-user-3');
    touchedKeys.push(`lock:session:user:${user}`);
    const first = await short.acquire(user, 'sess-E');
    if (!first.acquired) throw new Error('setup: expected to win lock');
    await new Promise((r) => setTimeout(r, 1000));
    const next = await short.acquire(user, 'sess-F');
    expect(next.acquired).toBe(true);
  });

  it('heartbeat extends the TTL past the original deadline', async () => {
    const short = freshMutex(900);
    const user = uid('gate-user-4');
    touchedKeys.push(`lock:session:user:${user}`);
    const first = await short.acquire(user, 'sess-G');
    if (!first.acquired) throw new Error('setup: expected to win lock');

    // Two heartbeats keep the lock alive across ~1.6s (> original 900ms TTL)
    await new Promise((r) => setTimeout(r, 600));
    expect(await short.heartbeat(user, first.token)).toBe(true);
    await new Promise((r) => setTimeout(r, 600));
    expect(await short.heartbeat(user, first.token)).toBe(true);
    expect((await short.acquire(user, 'squatter')).acquired).toBe(false);

    // Stop heartbeating → expiry frees the lock
    await new Promise((r) => setTimeout(r, 1100));
    expect((await short.acquire(user, 'sess-H')).acquired).toBe(true);
  });
});
