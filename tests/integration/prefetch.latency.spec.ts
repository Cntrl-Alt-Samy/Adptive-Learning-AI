import { describe, it, expect, afterAll } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type Redis } from 'ioredis';
import {
  prefetchRoadmapContext,
  readGroundedContext,
  ragCacheKey,
  type RagCacheLike,
  type VectorStoreLike
} from '../../src/pedagogy/rag-prefetch.js';
import { createRedisConnection } from '../../src/redis/adapters/upstash.js';

/**
 * prefetch.latency.spec — Sprint 4 gate S4-T9 (integration; real Redis).
 * Warm path serves a tutor turn's grounded context in <3ms; cold path falls
 * back to the vector store and backfills.
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

suite('RAG pre-fetch latency — real Redis (S4-T9 gate)', () => {
  const sessionId = `lat-${randomUUID().slice(0, 8)}`;
  let redis: Redis;

  const cache: RagCacheLike = {
    get: async (key) => redis.get(key),
    setex: async (key, ttl, value) => void (await redis.setex(key, ttl, value))
  };

  let vectorCalls = 0;
  const vector: VectorStoreLike = {
    async queryBatch(conceptIds) {
      vectorCalls++;
      return conceptIds.flatMap((c) =>
        Array.from({ length: 4 }, (_, i) => ({
          conceptId: c,
          chunkType: 'canonical_definition' as const,
          text: `${c} grounded chunk ${i} — definition text`,
          specRef: `${c}/spec/${i}`
        }))
      );
    }
  };

  afterAll(async () => {
    if (redis) {
      await redis.del(ragCacheKey(sessionId)).catch(() => undefined);
      await redis.quit().catch(() => redis.disconnect());
    }
  });

  it('cold path queries the vector store once and backfills', async () => {
    redis = createRedisConnection(REDIS_URL!);
    vectorCalls = 0;
    const ctx = await readGroundedContext(cache, vector, sessionId, ['c1', 'c2', 'c3']);
    expect(ctx.fromCache).toBe(false);
    expect(ctx.chunks.length).toBeGreaterThanOrEqual(12);
    expect(vectorCalls).toBe(1);
  });

  it('warm path serves the tutor turn from Redis in <3ms with zero vector traffic', async () => {
    // Prime JIT-ish paths so we measure steady state.
    for (let i = 0; i < 5; i++) await readGroundedContext(cache, vector, sessionId, ['c1']);
    vectorCalls = 0;

    const start = performance.now();
    const ctx = await readGroundedContext(cache, vector, sessionId, ['c1', 'c2', 'c3']);
    const elapsedMs = performance.now() - start;

    expect(ctx.fromCache).toBe(true);
    expect(ctx.chunks.length).toBeGreaterThanOrEqual(12);
    expect(vectorCalls).toBe(0);
    expect(elapsedMs).toBeLessThan(3);
  }, 30_000);
});
