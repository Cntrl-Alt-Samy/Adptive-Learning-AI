import { describe, it, expect, vi } from 'vitest';
import {
  prefetchRoadmapContext,
  readGroundedContext,
  ragCacheKey,
  RAG_CACHE_TTL_SECONDS,
  type RagCacheLike,
  type VectorStoreLike
} from '../../src/pedagogy/rag-prefetch.js';

/**
 * rag-prefetch.spec — S4-T9 unit gate (latency gate lives in the
 * integration suite with real Redis).
 * Cache-first read path; Pinecone only on miss; backfill on cold read;
 * corrupt cache entries degrade to a miss and repair.
 */

function fakeCache(): RagCacheLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async setex(key, _ttl, value) {
      store.set(key, value);
    }
  };
}

function fakeVector(chunks = 12): VectorStoreLike & { calls: number } {
  return {
    calls: 0,
    async queryBatch(conceptIds: string[]) {
      this.calls++;
      return conceptIds.flatMap((c) =>
        Array.from({ length: Math.ceil(chunks / conceptIds.length) }, (_, i) => ({
          conceptId: c,
          chunkType: 'canonical_definition' as const,
          text: `${c} def ${i}`,
          specRef: `spec:${c}:${i}`
        }))
      );
    }
  };
}

describe('roadmap RAG pre-fetch', () => {
  it('prefetches ~12 chunks for roadmap concepts into the session cache key', async () => {
    const cache = fakeCache();
    const vector = fakeVector(12);
    const res = await prefetchRoadmapContext(cache, vector, 'sess-1', ['a', 'b', 'c']);
    expect(res.cachedChunks).toBeGreaterThanOrEqual(12);
    expect(vector.calls).toBe(1);
    expect(cache.store.has(ragCacheKey('sess-1'))).toBe(true);
  });

  it('warm path serves from Redis without touching Pinecone', async () => {
    const cache = fakeCache();
    const vector = fakeVector();
    await prefetchRoadmapContext(cache, vector, 'sess-2', ['x', 'y']);

    vector.calls = 0;
    const ctx = await readGroundedContext(cache, vector, 'sess-2', ['x', 'y']);
    expect(ctx.fromCache).toBe(true);
    expect(ctx.chunks.length).toBeGreaterThan(0);
    expect(vector.calls).toBe(0); // zero vector-store traffic
  });

  it('cold path falls back to Pinecone and backfills the cache', async () => {
    const cache = fakeCache();
    const vector = fakeVector();
    expect(await cache.get(ragCacheKey('sess-3'))).toBeNull();

    const ctx = await readGroundedContext(cache, vector, 'sess-3', ['z']);
    expect(ctx.fromCache).toBe(false);
    expect(ctx.chunks.length).toBeGreaterThanOrEqual(3);
    expect(vector.calls).toBe(1);
    // Second read is warm — backfill took effect.
    const again = await readGroundedContext(cache, vector, 'sess-3', ['z']);
    expect(again.fromCache).toBe(true);
    expect(vector.calls).toBe(1);
  });

  it('corrupt cache payload degrades to a miss and repairs via backfill', async () => {
    const cache = fakeCache();
    const vector = fakeVector();
    await cache.setex(ragCacheKey('sess-4'), RAG_CACHE_TTL_SECONDS, '{not json');
    const ctx = await readGroundedContext(cache, vector, 'sess-4', ['q']);
    expect(ctx.fromCache).toBe(false);
    expect(ctx.chunks.length).toBeGreaterThan(0);
    expect(() => JSON.parse(cache.store.get(ragCacheKey('sess-4'))!)).not.toThrow();
  });

  it('empty roadmap short-circuits without vector calls', async () => {
    const cache = fakeCache();
    const vector = fakeVector();
    const res = await prefetchRoadmapContext(cache, vector, 'sess-5', []);
    expect(res.cachedChunks).toBe(0);
    expect(vector.calls).toBe(0);
  });
});
