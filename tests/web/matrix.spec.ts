import { describe, expect, it } from 'vitest';

import { buildMatrixView, buildPreScores } from '@/lib/progress-view';
import { UNIVERSAL_BADGES, buildCatalog, subjectBadge } from '@/lib/badge-catalog';
import { computeStreak, decideAwards, foldAwards } from '@/src/credentialing/badges.js';

/**
 * S8B-T2/T3 — view-layer gates over the pure engines: CAT prior heuristic,
 * matrix mapping with titles, badge catalog construction and the award
 * decision table end-to-end.
 */

describe('buildPreScores diagnostic prior', () => {
  it('maps gaps to 30, strengths to 75, unmeasured to 50', () => {
    const scores = buildPreScores(['a', 'b', 'c'], ['a'], ['b']);
    expect(scores).toEqual({ a: 30, b: 75, c: 50 });
  });
});

describe('buildMatrixView', () => {
  it('attaches titles and computes deltas via the engine', () => {
    const view = buildMatrixView(
      [
        { conceptId: 'a', title: 'Alpha', masteryScore: 80 },
        { conceptId: 'b', title: 'Beta', masteryScore: 40 }
      ],
      { a: 30, b: 50 }
    );
    expect(view.rows.map((r) => [r.title, r.delta])).toEqual([
      ['Alpha', 50],
      ['Beta', -10]
    ]);
    expect(view.aggregate.postScore).toBe(60);
  });

  it('full pre→post climb yields 100% knowledge gain (engine contract)', () => {
    const view = buildMatrixView([{ conceptId: 'x', title: 'X', masteryScore: 70 }], { x: 0 });
    expect(view.rows[0]?.knowledgeGainPct).toBe(100);
  });
});

describe('badge catalog + award engine', () => {
  it('builds universal badges plus one subject badge', () => {
    const catalog = buildCatalog('GCSE Economics', ['eco_a', 'eco_b']);
    expect(catalog).toHaveLength(UNIVERSAL_BADGES.length + 1);
    expect(catalog.at(-1)).toMatchObject({ id: 'mastery-gcse-economics', criteria: { kind: 'MASTERY_THRESHOLD', threshold: 75 } });
  });

  it('subject badge id is slugified deterministically', () => {
    expect(subjectBadge('Python Programming! 101', ['p1']).id).toBe('mastery-python-programming-101');
  });

  it('decideAwards → foldAwards produces append-only ledger entries', () => {
    const catalog = buildCatalog(null, []);
    const snapshot = {
      dna: [{ conceptId: 'c1', masteryScore: 90, status: 'SOLID' as const }],
      sessionDays: ['2026-08-22', '2026-08-23', '2026-08-24'],
      practiceCounts: {}
    };
    const outcome = decideAwards(catalog, snapshot, []);
    expect(outcome.newlyAwarded.map((b) => b.id)).toContain('first-steps');
    expect(outcome.newlyAwarded.map((b) => b.id)).toContain('streak-three');
    const ledger = foldAwards([], outcome.newlyAwarded, '2026-08-24T00:00:00Z');
    expect(ledger).toHaveLength(outcome.newlyAwarded.length);
    // Re-running with the folded ledger awards nothing new.
    expect(decideAwards(catalog, snapshot, ledger).newlyAwarded).toHaveLength(0);
  });

  it('computeStreak counts consecutive days ending today or yesterday', () => {
    const today = new Date();
    const iso = (d: Date): string => d.toISOString().slice(0, 10);
    const yesterday = new Date(today.getTime() - 86_400_000);
    expect(computeStreak([iso(yesterday), iso(today)])).toBeGreaterThanOrEqual(2);
    expect(computeStreak([])).toBe(0);
  });
});
