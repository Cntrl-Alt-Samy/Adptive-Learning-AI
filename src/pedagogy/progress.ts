import type { SpacedRepItem, ZsetLike } from '../tools/spaced-rep.js';

/**
 * S4-T7 — Progress matrix + spaced-rep scheduling (PRD F8.1–F8.2).
 *
 * Step-8 review contract: pre_score / post_score / knowledge_gain_pct per the
 * checkpoint schema. Reviews are queued at exactly 24h / 3d / 7d / 14d via
 * T04's ZSET scored by due epoch-ms. Reviewer Mode 6 emits a portable
 * starter prompt so learners can resume outside the product.
 */

/** Review offsets in hours — golden contract, do not drift. */
export const REVIEW_OFFSET_HOURS = [24, 72, 168, 336] as const;

export interface MatrixRow {
  conceptId: string;
  preScore: number;
  postScore: number;
  /** Absolute percentage-point delta (post − pre). */
  delta: number;
  knowledgeGainPct: number;
}

export interface ProgressMatrix {
  rows: MatrixRow[];
  aggregate: { preScore: number; postScore: number; knowledgeGainPct: number };
}

/**
 * Relative gain against the pre-score baseline. A zero pre-score with any
 * learning shown maps to 100% (division-by-zero guard); nothing learned from
 * a zero base stays at 0%.
 */
export function computeKnowledgeGainPct(pre: number, post: number): number {
  if (pre <= 0) return post > 0 ? 100 : 0;
  return Math.round(((post - pre) / pre) * 10000) / 100;
}

export function buildProgressMatrix(
  entries: Array<{ conceptId: string; preScore: number; postScore: number }>
): ProgressMatrix {
  const rows: MatrixRow[] = entries.map((e) => ({
    conceptId: e.conceptId,
    preScore: e.preScore,
    postScore: e.postScore,
    delta: round2(e.postScore - e.preScore),
    knowledgeGainPct: computeKnowledgeGainPct(e.preScore, e.postScore)
  }));
  const n = rows.length || 1;
  const pre = round2(entries.reduce((s, e) => s + e.preScore, 0) / n);
  const post = round2(entries.reduce((s, e) => s + e.postScore, 0) / n);
  return {
    rows,
    aggregate: { preScore: pre, postScore: post, knowledgeGainPct: computeKnowledgeGainPct(pre, post) }
  };
}

export interface ScheduledReview {
  conceptId: string;
  offsetHours: number;
  item: SpacedRepItem;
}

/** Deterministic schedule: exact epoch-ms offsets from `fromMs`. */
export function scheduleReviewOffsets(conceptIds: string[], fromMs: number): ScheduledReview[] {
  const out: ScheduledReview[] = [];
  for (const conceptId of conceptIds) {
    for (const hours of REVIEW_OFFSET_HOURS) {
      const dueAtMs = fromMs + hours * 3600_000;
      out.push({ conceptId, offsetHours: hours, item: { conceptId, dueAtMs } });
    }
  }
  return out;
}

/** Enqueue the schedule into T04's ZSET (scored by due epoch-ms). */
export async function enqueueScheduledReviews(redis: ZsetLike, userId: string, reviews: ScheduledReview[]): Promise<number> {
  let added = 0;
  for (const r of reviews) {
    await redis.zadd(`queue:spaced_rep:${userId}`, r.item.dueAtMs, r.item.conceptId);
    added++;
  }
  return added;
}

/**
 * Reviewer Mode 6 portable starter prompt — self-contained text a learner
 * can paste anywhere to restart practice on their weakest concepts.
 */
export function reviewerStarterPrompt(matrix: ProgressMatrix, sessionSubject: string): string {
  const weakest = [...matrix.rows].sort((a, b) => a.postScore - b.postScore).slice(0, 3);
  const lines = [
    `Resume plan — ${sessionSubject}`,
    ...weakest.map((r) => `- Re-practice ${r.conceptId}: scored ${r.postScore}/100 (was ${r.preScore}).`),
    `- Overall gain: ${matrix.aggregate.knowledgeGainPct}%.`,
    '- Start each concept from its definition, then one applied problem.'
  ];
  return lines.join('\n');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
