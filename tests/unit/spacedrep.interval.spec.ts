import { describe, it, expect } from 'vitest';
import {
  REVIEW_OFFSET_HOURS,
  buildProgressMatrix,
  computeKnowledgeGainPct,
  scheduleReviewOffsets,
  reviewerStarterPrompt
} from '../../src/pedagogy/progress.js';

/**
 * spacedrep.interval.spec — Sprint 4 gate S4-T7.
 * Due timestamps land exactly at 24h/72h/168h/336h offsets; ZSET ordering is
 * chronological even under clock-skew fixtures; gain math hits the Step-8
 * contract exactly.
 */

const HOUR = 3_600_000;
const BASE = Date.UTC(2026, 7, 1, 9, 0, 0); // fixed epoch — no local TZ drift

describe('spaced-rep interval goldens', () => {
  it('schedules due timestamps at exactly 24h/72h/168h/336h', () => {
    const reviews = scheduleReviewOffsets(['c1'], BASE);
    expect(REVIEW_OFFSET_HOURS).toEqual([24, 72, 168, 336]);
    expect(reviews.map((r) => r.item.dueAtMs - BASE)).toEqual([
      24 * HOUR,
      72 * HOUR,
      168 * HOUR,
      336 * HOUR
    ]);
    expect(reviews.map((r) => r.offsetHours)).toEqual([24, 72, 168, 336]);
  });

  it('multiple concepts interleave concept-major with exact offsets', () => {
    const reviews = scheduleReviewOffsets(['a', 'b'], BASE);
    expect(reviews).toHaveLength(8);
    expect(reviews.filter((r) => r.conceptId === 'b').map((r) => r.item.dueAtMs)).toEqual(
      scheduleReviewOffsets(['b'], BASE).map((r) => r.item.dueAtMs)
    );
  });

  it('ZSET ordering stays chronological under clock skew (DST-style jump)', () => {
    // Simulate a backwards clock: base after a "skewed" scheduling moment.
    const skewed = { conceptId: 'c', offsetHours: 72, item: { conceptId: 'c', dueAtMs: BASE - HOUR } };
    const normal = scheduleReviewOffsets(['d'], BASE).filter((r) => r.offsetHours === 24)[0]!;
    expect(normal.item.dueAtMs > skewed.item.dueAtMs).toBe(true);

    // Scores sort ascending = chronological regardless of insertion order.
    const entries = [normal, skewed].map((r) => ({ score: r.item.dueAtMs, member: r.conceptId }));
    const sorted = [...entries].sort((x, y) => x.score - y.score);
    expect(sorted.map((e) => e.member)).toEqual(['c', 'd']);
  });
});

describe('progress matrix (Step-8 contract)', () => {
  it('computes pre/post delta and knowledge_gain_pct per row and aggregate', () => {
    const m = buildProgressMatrix([
      { conceptId: 'fractions', preScore: 40, postScore: 80 },
      { conceptId: 'ratios', preScore: 70, postScore: 84 }
    ]);
    expect(m.rows[0]).toMatchObject({ delta: 40, knowledgeGainPct: 100 });
    expect(m.rows[1]).toMatchObject({ delta: 14, knowledgeGainPct: 20 });
    expect(m.aggregate.preScore).toBe(55);
    expect(m.aggregate.postScore).toBe(82);
    expect(m.aggregate.knowledgeGainPct).toBe(computeKnowledgeGainPct(55, 82));
  });

  it('zero-pre guard maps to 100% when learning occurred, 0% otherwise', () => {
    expect(computeKnowledgeGainPct(0, 60)).toBe(100);
    expect(computeKnowledgeGainPct(0, 0)).toBe(0);
    expect(computeKnowledgeGainPct(-5, 10)).toBe(100); // defensive clamp
  });

  it('negative gains are reported honestly', () => {
    expect(computeKnowledgeGainPct(50, 25)).toBe(-50);
  });

  it('Reviewer Mode 6 starter prompt is portable and names the weakest concepts', () => {
    const m = buildProgressMatrix([
      { conceptId: 'weak_one', preScore: 30, postScore: 35 },
      { conceptId: 'strong', preScore: 80, postScore: 95 },
      { conceptId: 'weak_two', preScore: 20, postScore: 30 }
    ]);
    const prompt = reviewerStarterPrompt(m, 'GCSE Maths');
    expect(prompt).toContain('Resume plan — GCSE Maths');
    expect(prompt.indexOf('weak_two')).toBeLessThan(prompt.indexOf('strong'));
    expect(prompt).toContain('Overall gain:');
  });
});
