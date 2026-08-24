/**
 * S4-T9 — Roadmap RAG pre-fetch (Doc 04 §12.1, B-04 fix).
 *
 * On Step-4 roadmap approval the gateway batch-fetches ~12 grounded chunks
 * for the roadmap concepts and writes them to Redis at
 * `session:{sessionId}:rag_cache` (TTL 7200s). Tutor turns read cache-first:
 * warm path is a single Redis GET (<3ms), Pinecone is touched only on a miss
 * and the result backfills the cache.
 */

export interface RagChunk {
  conceptId: string;
  chunkType: 'canonical_definition' | 'misconception' | 'worked_example';
  text: string;
  specRef: string;
  score?: number;
}

export interface RagCacheLike {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
}

export interface VectorStoreLike {
  /** Batch retrieval across roadmap concepts (~12 chunks total per Doc 04 §12.1). */
  queryBatch(conceptIds: string[], topKPerConcept: number): Promise<RagChunk[]>;
}

export const ragCacheKey = (sessionId: string): string => `session:${sessionId}:rag_cache`;
export const RAG_CACHE_TTL_SECONDS = 7200;
/** ~12 chunks across the session's concepts (3–4 concepts × top-3). */
export const PREFETCH_TOP_K_PER_CONCEPT = 3;

export interface PrefetchResult {
  cachedChunks: number;
  conceptIds: string[];
}

/** Step-4 approval hook — batch fetch + cache fill. Idempotent re-runs refresh TTL. */
export async function prefetchRoadmapContext(
  cache: RagCacheLike,
  vector: VectorStoreLike,
  sessionId: string,
  roadmapConceptIds: string[]
): Promise<PrefetchResult> {
  if (roadmapConceptIds.length === 0) return { cachedChunks: 0, conceptIds: [] };
  const chunks = await vector.queryBatch(roadmapConceptIds, PREFETCH_TOP_K_PER_CONCEPT);
  await cache.setex(ragCacheKey(sessionId), RAG_CACHE_TTL_SECONDS, JSON.stringify(chunks));
  return { cachedChunks: chunks.length, conceptIds: [...roadmapConceptIds] };
}

export interface GroundedContext {
  chunks: RagChunk[];
  /** true ⇒ served from Redis without touching Pinecone. */
  fromCache: boolean;
}

/**
 * Tutor-turn read path: cache-first; on miss fall back to the vector store
 * and backfill so at most one cold query pays Pinecone latency.
 */
export async function readGroundedContext(
  cache: RagCacheLike,
  vector: VectorStoreLike,
  sessionId: string,
  roadmapConceptIds: string[]
): Promise<GroundedContext> {
  const key = ragCacheKey(sessionId);
  const hit = await cache.get(key);
  if (hit !== null) {
    try {
      return { chunks: JSON.parse(hit) as RagChunk[], fromCache: true };
    } catch {
      // Corrupt entry behaves like a miss; backfill below repairs it.
    }
  }
  const chunks =
    roadmapConceptIds.length > 0 ? await vector.queryBatch(roadmapConceptIds, PREFETCH_TOP_K_PER_CONCEPT) : [];
  if (chunks.length > 0) {
    await cache.setex(key, RAG_CACHE_TTL_SECONDS, JSON.stringify(chunks));
  }
  return { chunks, fromCache: false };
}
