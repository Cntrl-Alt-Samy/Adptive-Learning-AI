/**
 * S2-T6 — Spaced-repetition enqueue (Doc 05 §8).
 * Redis ZSET `queue:spaced_rep:{userId}` scored by due epoch-ms.
 */

export interface ZsetLike {
  zadd(key: string, score: number, member: string): Promise<unknown>;
}

export interface SpacedRepItem {
  conceptId: string;
  /** due timestamp as epoch ms */
  dueAtMs: number;
}

export const spacedRepKey = (userId: string): string => `queue:spaced_rep:${userId}`;

export async function enqueueSpacedRepetition(
  redis: ZsetLike,
  userId: string,
  items: SpacedRepItem[]
): Promise<number> {
  if (items.length === 0) return 0;
  let added = 0;
  for (const item of items) {
    await redis.zadd(spacedRepKey(userId), item.dueAtMs, item.conceptId);
    added++;
  }
  return added;
}
