import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildMisconceptionMatrix,
  resolveLockedConcepts,
  buildRoster,
  DEFAULT_K_ANONYMITY_FLOOR
} from '../../src/educator/aggregation.js';
import { planRoadmap, type PlannerNode, type TimeBudget } from '../../src/pedagogy/roadmap.js';

/**
 * aggregation.matrix.spec — Sprint 5 gate (S5-T6 / Doc 03 §10 / F11).
 * k-anonymity floor, misconception percentages, tenant-scoped topic locks
 * consumed by the S4 roadmap planner (TOPIC_LOCKED), alias-only roster.
 */

describe('aggregation.matrix.spec — S5-T6 gate', () => {
  describe('misconception matrix', () => {
    const attempts = [
      // concept 'quadratic': 4 learners — BELOW floor → suppressed
      ...[1, 2, 3, 4].map((n) => ({ userId: `u${n}`, conceptId: 'quadratic', correct: n % 2 === 0 })),
      // concept 'trig': exactly 5 learners — visible; 3 failed → 60%
      ...[1, 2, 3, 4, 5].map((n) => ({ userId: `t${n}`, conceptId: 'trig', correct: n > 3 })),
      // concept 'cells': 6 learners — visible; 1 failed → 17%
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ userId: `c${n}`, conceptId: 'cells', correct: n !== 1 }))
    ];

    it('suppresses cells below the k-anonymity floor and lists them', () => {
      const m = buildMisconceptionMatrix(attempts);
      expect(DEFAULT_K_ANONYMITY_FLOOR).toBe(5);
      expect(m.suppressedConceptIds).toEqual(['quadratic']);
      expect(m.cells.map((c) => c.conceptId).sort()).toEqual(['cells', 'trig']);
    });

    it('computes latest-attempt-wins failure percentages with rounding', () => {
      const m = buildMisconceptionMatrix(attempts);
      expect(m.cells.find((c) => c.conceptId === 'trig')).toEqual({
        conceptId: 'trig',
        failedPct: 60,
        learnerCount: 5
      });
      expect(m.cells.find((c) => c.conceptId === 'cells')).toMatchObject({
        failedPct: 17,
        learnerCount: 6
      });
      // Sorted by failing share descending for educator triage.
      expect(m.cells[0]!.conceptId).toBe('trig');
    });

    it('latest attempt per learner overrides earlier ones', () => {
      const m = buildMisconceptionMatrix([
        ...attempts,
        { userId: 'c1', conceptId: 'cells', correct: true }
      ]);
      // c1 corrected themselves: 0/6 failed → 0%.
      expect(m.cells.find((c) => c.conceptId === 'cells')).toMatchObject({ failedPct: 0 });
    });
  });

  describe('topic locks → roadmap planner consumption', () => {
    const nodes: PlannerNode[] = [
      { id: 'a', difficultyLevel: 3, estimatedMinutes: 20, prerequisiteIds: [] },
      { id: 'b', difficultyLevel: 1, estimatedMinutes: 10, prerequisiteIds: [], locked: true },
      { id: 'c', difficultyLevel: 5, estimatedMinutes: 15, prerequisiteIds: ['b'] },
      { id: 'd', difficultyLevel: 9, estimatedMinutes: 30, prerequisiteIds: ['a', 'c'] }
    ];

    it('locked roots excluded as TOPIC_LOCKED with descendants PREREQ_EXCLUDED', () => {
      const plan = planRoadmap(nodes, ['a', 'b', 'c', 'd'], 45, 1);
      expect(plan.planned.map((p) => p.conceptId)).toEqual(['a']);
      const byId = new Map(plan.excluded.map((e) => [e.conceptId, e.reason]));
      expect(byId.get('b')).toBe('TOPIC_LOCKED');
      expect(byId.get('c')).toBe('PREREQ_EXCLUDED');
      expect(byId.get('d')).toBe('PREREQ_EXCLUDED');
    });

    it('unlocking restores the original plan shape', () => {
      const unlocked = nodes.map(({ locked: _l, ...rest }) => rest);
      const plan = planRoadmap(unlocked, ['a', 'b', 'c', 'd'], 45, 1);
      expect(plan.planned.map((p) => p.conceptId)).toEqual(['b', 'a', 'c']);
    });

    it('property: budget invariant holds under arbitrary lock patterns', () => {
      const arbNodes: PlannerNode[] = [
        { id: 'x1', difficultyLevel: 2, estimatedMinutes: 10, prerequisiteIds: [] },
        { id: 'x2', difficultyLevel: 4, estimatedMinutes: 15, prerequisiteIds: ['x1'] },
        { id: 'x3', difficultyLevel: 6, estimatedMinutes: 25, prerequisiteIds: ['x2'] },
        { id: 'x4', difficultyLevel: 8, estimatedMinutes: 40, prerequisiteIds: ['x3'] }
      ];
      fc.assert(
        fc.property(
          fc.set(fc.constantFrom('x1', 'x2', 'x3', 'x4') as fc.Arbitrary<string>, { minLength: 0, maxLength: 4 }),
          fc.constantFrom(...([15, 30, 45, 60, 90] as const)) as fc.Arbitrary<TimeBudget>,
          (locked, budget) => {
            const withLocks = arbNodes.map((n) => ({ ...n, locked: locked.has(n.id) }));
            const plan = planRoadmap(withLocks, ['x1', 'x2', 'x3', 'x4'], budget, 7);
            if (plan.totalMinutes > budget) return false;
            return plan.planned.every((p) => !withLocks.find((n) => n.id === p.conceptId)!.locked);
          }
        )
      );
    });
  });

  describe('tenant scoping & roster shaping', () => {
    it('resolveLockedConcepts ignores other tenants’ locks', () => {
      const locks = [
        { tenantId: 'T1', conceptId: 'quadratic' },
        { tenantId: 'T2', conceptId: 'trig' }
      ];
      expect(resolveLockedConcepts(locks, 'T1')).toEqual(new Set(['quadratic']));
    });

    it('roster exposes deterministic aliases only — never raw ids', () => {
      const roster = buildRoster([
        { userId: 'uuid-1', aliasSeed: 'seed-1', status: 'SOLID' },
        { userId: 'uuid-2', aliasSeed: 'seed-2', status: 'PARTIAL' }
      ]);
      expect(roster).toEqual([
        { alias: expect.stringMatching(/^learner-[0-9a-z]{7}$/), overallStatus: 'SOLID' },
        { alias: expect.stringMatching(/^learner-[0-9a-z]{7}$/), overallStatus: 'PARTIAL' }
      ]);
      const again = buildRoster([
        { userId: 'other', aliasSeed: 'seed-1', status: 'NEEDS_WORK' }
      ]);
      expect(again[0]!.alias).toBe(roster[0]!.alias); // seed-derived, stable
      expect(JSON.stringify({ roster })).not.toContain('uuid-1');
    });
  });
});
