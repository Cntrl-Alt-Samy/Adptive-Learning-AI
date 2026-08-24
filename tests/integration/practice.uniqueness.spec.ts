import { describe, it, expect, afterAll } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type Redis } from 'ioredis';
import {
  generateUniqueQuestions,
  hashQuestion,
  type UniquenessRegistry
} from '../../src/pedagogy/practice.js';
import { createRedisConnection } from '../../src/redis/adapters/upstash.js';

/**
 * practice.uniqueness.spec — Sprint 4 gate S4-T6 (integration; real Redis).
 * Same learner cannot receive a duplicate question hash within the window;
 * registry expiry is honored (short-TTL probe).
 */
const REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;

async function canReach(url: string): Promise<boolean> {
  try {
    const c = createRedisConnection(url);
    const pong = await c.ping();
    await c.quit();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

const suite = REDIS_URL && (await canReach(REDIS_URL)) ? describe : describe.skip;

const RUN_ID = randomUUID().slice(0, 8);

/** SET NX EX-backed registry — production semantics over ioredis. */
class RedisUniquenessRegistry implements UniquenessRegistry {
  constructor(private readonly redis: Redis) {}

  async has(hash: string): Promise<boolean> {
    return (await this.redis.get(this.key(hash))) !== null;
  }

  async add(hash: string, ttlSeconds: number): Promise<void> {
    // NX ⇒ first writer wins; EX ⇒ rolling-window expiry.
    await this.redis.set(this.key(hash), '1', 'EX', ttlSeconds, 'NX');
  }

  key(hash: string): string {
    return `practice:served:${hash}`;
  }
}

suite('practice uniqueness — real Redis (S4-T6 gate)', () => {
  const connections: Redis[] = [];

  afterAll(async () => {
    for (const c of connections) await c.quit().catch(() => c.disconnect());
  });

  function withRedis(): { redis: Redis; registry: RedisUniquenessRegistry } {
    const redis = createRedisConnection(REDIS_URL!);
    connections.push(redis);
    return { redis, registry: new RedisUniquenessRegistry(redis) };
  }

  it('never serves the same hash twice within the window', async () => {
    const { redis, registry } = withRedis();
    const seen = new Set<string>();
    const questions = await generateUniqueQuestions(registry, { conceptId: `u1_${RUN_ID}`, count: 6 }, 42);
    for (const q of questions) {
      expect(seen.has(q.contentHash)).toBe(false);
      seen.add(q.contentHash);
      // Cross-check against Redis directly.
      expect(await redis.exists(registry.key(q.contentHash))).toBe(1);
    }
  });

  it('registry expiry frees the hash (short-TTL probe)', async () => {
    const { redis, registry } = withRedis();
    const h = hashQuestion(`expiry_${RUN_ID}`, 'RECALL', `probe ${RUN_ID}`);
    await registry.add(h, 2); // 2-second window
    expect(await registry.has(h)).toBe(true);
    await new Promise((r) => setTimeout(r, 2100));
    expect(await registry.has(h)).toBe(false);
  });

  it('a second generator call against the same registry diverges from round one', async () => {
    const { registry } = withRedis();
    const conceptId = `u2_${RUN_ID}`;
    const round1 = await generateUniqueQuestions(registry, { conceptId, count: 3 }, 99);
    const round2 = await generateUniqueQuestions(registry, { conceptId, count: 3 }, 99);
    const hashes1 = new Set(round1.map((q) => q.contentHash));
    for (const q of round2) {
      expect(hashes1.has(q.contentHash)).toBe(false);
    }
  });
});
