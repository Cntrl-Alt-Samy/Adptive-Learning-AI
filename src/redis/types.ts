/**
 * Minimal Redis surface required by the LearnOS primitives (S0-T4/S0-T5).
 * Adapters implement `eval` following the ioredis convention:
 *   EVAL script numkeys key... arg...
 * The in-memory test adapter executes equivalent semantics locally by
 * recognising the learnos:* marker comments embedded in our own scripts.
 */
export interface RedisLike {
  eval(script: string, numKeys: number, ...keysAndArgs: string[]): Promise<unknown>;
}

export const SCRIPT_MARKERS = {
  acquire: '--learnos:mutex:acquire',
  release: '--learnos:mutex:release',
  heartbeat: '--learnos:mutex:heartbeat'
} as const;
