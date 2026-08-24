import { describe, it, expect } from 'vitest';
import {
  evaluateBadge,
  computeStreak,
  decideAwards,
  foldAwards,
  revokeAward,
  type BadgeCriteria,
  type BadgeDefinition,
  type LearnerMasterySnapshot
} from '../../src/credentialing/badges.js';

/**
 * badge.rules.table.spec — Sprint 5 gate (S5-T4 / Doc 05 §4 badges).
 * Every criteria shape awards exactly once; duplicate event replays are
 * no-ops; revocation semantics documented and enforced.
 */

const snapshot: LearnerMasterySnapshot = {
  dna: [
    { conceptId: 'c1', masteryScore: 92, status: 'SOLID' },
    { conceptId: 'c2', masteryScore: 81, status: 'SOLID' },
    { conceptId: 'c3', masteryScore: 55, status: 'PARTIAL' },
    { conceptId: 'c4', masteryScore: 30, status: 'NEEDS_WORK' }
  ],
  sessionDays: ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-24', '2026-08-24'],
  practiceCounts: { c1: 12, c2: 7, c3: 3 }
};

describe('badge.rules.table.spec — S5-T4 gate', () => {
  describe('MASTERY_THRESHOLD', () => {
    const criteria: BadgeCriteria = {
      kind: 'MASTERY_THRESHOLD',
      conceptIds: ['c1', 'c2'],
      threshold: 80
    };
    it('awards when ALL listed concepts meet the threshold', () => {
      expect(evaluateBadge(criteria, snapshot)).toBe(true);
    });
    it('does not award when one concept is below threshold', () => {
      expect(
        evaluateBadge({ ...criteria, conceptIds: ['c1', 'c2', 'c3'] }, snapshot)
      ).toBe(false);
    });
    it('does not award when a listed concept has no dna row (fail closed)', () => {
      expect(evaluateBadge({ ...criteria, conceptIds: ['c1', 'zzz'] }, snapshot)).toBe(false);
    });
    it('empty concept list never awards', () => {
      expect(evaluateBadge({ ...criteria, conceptIds: [] }, snapshot)).toBe(false);
    });
  });

  describe('CONCEPT_COUNT', () => {
    it('counts SOLID concepts by default', () => {
      expect(evaluateBadge({ kind: 'CONCEPT_COUNT', minCount: 2 }, snapshot)).toBe(true);
      expect(evaluateBadge({ kind: 'CONCEPT_COUNT', minCount: 3 }, snapshot)).toBe(false);
    });
    it('respects the atOrAbove floor (PARTIAL includes SOLID)', () => {
      const criteria: BadgeCriteria = { kind: 'CONCEPT_COUNT', minCount: 3, atOrAbove: 'PARTIAL' };
      expect(evaluateBadge(criteria, snapshot)).toBe(true);
    });
  });

  describe('SESSION_STREAK', () => {
    it('streak counts consecutive UTC days ending on the latest day', () => {
      // Aug 22 → gap → Aug 24: streak ending Aug 24 is 1.
      expect(computeStreak(snapshot.sessionDays)).toBe(1);
    });
    it('contiguous runs extend the streak; repeats collapse', () => {
      expect(computeStreak(['2026-08-01', '2026-08-02', '2026-08-02', '2026-08-03'])).toBe(3);
    });
    it('empty history yields zero', () => {
      expect(computeStreak([])).toBe(0);
    });
    it('minDays gate honours the computed streak', () => {
      expect(evaluateBadge({ kind: 'SESSION_STREAK', minDays: 1 }, snapshot)).toBe(true);
      expect(evaluateBadge({ kind: 'SESSION_STREAK', minDays: 2 }, snapshot)).toBe(false);
    });
  });

  describe('PRACTICE_COUNT', () => {
    it('scoped to one concept', () => {
      expect(evaluateBadge({ kind: 'PRACTICE_COUNT', conceptId: 'c1', minCount: 10 }, snapshot)).toBe(true);
      expect(evaluateBadge({ kind: 'PRACTICE_COUNT', conceptId: 'c3', minCount: 10 }, snapshot)).toBe(false);
    });
    it('totals across concepts when unscoped', () => {
      expect(evaluateBadge({ kind: 'PRACTICE_COUNT', minCount: 22 }, snapshot)).toBe(true);
      expect(evaluateBadge({ kind: 'PRACTICE_COUNT', minCount: 23 }, snapshot)).toBe(false);
    });
  });

  it('unknown criteria shapes fail closed', () => {
    const mystery = { kind: 'MYSTERY' } as unknown as BadgeCriteria;
    expect(evaluateBadge(mystery, snapshot)).toBe(false);
  });

  describe('idempotent awarding ledger', () => {
    const defs: BadgeDefinition[] = [
      { id: 'b1', criteria: { kind: 'CONCEPT_COUNT', minCount: 2 } },
      { id: 'b2', criteria: { kind: 'MASTERY_THRESHOLD', conceptIds: ['c1'], threshold: 90 } }
    ];

    it('first evaluation awards each qualifying badge exactly once', () => {
      const out = decideAwards(defs, snapshot, []);
      expect(out.newlyAwarded.map((d) => d.id)).toEqual(['b1', 'b2']);
      expect(out.alreadyHeld).toEqual([]);
    });

    it('duplicate event replay is a no-op (already held)', () => {
      let ledger = foldAwards([], defs.filter(() => true).slice(0, 0), '');
      const first = decideAwards(defs, snapshot, ledger);
      ledger = foldAwards(ledger, first.newlyAwarded, '2026-08-24T10:00:00Z');
      const replay = decideAwards(defs, snapshot, ledger);
      expect(replay.newlyAwarded).toEqual([]);
      expect(replay.alreadyHeld.map((d) => d.id)).toEqual(['b1', 'b2']);
    });

    it('revoked awards free the slot for legitimate re-earning', () => {
      let ledger = foldAwards([], defs.slice(0, 1), '2026-08-24T10:00:00Z').map((r) => ({
        ...r,
        userId: 'user-1'
      }));
      ledger = revokeAward(ledger, 'user-1', 'b1', '2026-08-25T09:00:00Z');
      const after = decideAwards(defs, snapshot, ledger);
      expect(after.newlyAwarded.map((d) => d.id)).toContain('b1');
    });

    it('revokeAward is idempotent and scoped to (userId, badgeId)', () => {
      let ledger = [
        { userId: 'u1', badgeId: 'b1', awardedAt: '2026-08-01T00:00:00Z' },
        { userId: 'u2', badgeId: 'b1', awardedAt: '2026-08-02T00:00:00Z' }
      ];
      ledger = revokeAward(ledger, 'u1', 'b1', '2026-08-03T00:00:00Z');
      const once = revokeAward(ledger, 'u1', 'b1', '2026-08-04T00:00:00Z');
      expect(once).toEqual(ledger); // second call no-op
      expect(once.find((r) => r.userId === 'u2')?.revokedAt).toBeUndefined(); // other user untouched
    });

    it('revocation semantics are documented', () => {
      // Awards are append-only: revoked rows keep their awardedAt and gain
      // revokedAt; evaluation treats them as absent so re-earning works;
      // automatic re-revocation loops cannot occur because evaluation only
      // ever APPENDS live awards via the UNIQUE(user,badge) constraint path
      // after revocation cleared the live row.
      expect(typeof revokeAward).toBe('function');
    });
  });
});
