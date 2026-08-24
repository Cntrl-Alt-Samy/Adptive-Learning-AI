import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  planRoadmap,
  plannerNodesFromCurriculum,
  TIME_BUDGETS,
  type PlannerNode,
  type TimeBudget
} from '../../src/pedagogy/roadmap.js';
import type { CurriculumDoc } from '../../src/curriculum/types.js';

/**
 * roadmap.planner.spec — Sprint 4 gate S4-T2.
 * Unit goldens + property invariants: budget always respected, prereq order
 * never violated, exclusions non-empty iff truncation occurred, and full
 * determinism for identical inputs + seed.
 */

const node = (id: string, difficulty: number, minutes: number, prereqs: string[] = []): PlannerNode => ({
  id,
  difficultyLevel: difficulty,
  estimatedMinutes: minutes,
  prerequisiteIds: prereqs
});

describe('roadmap planner — golden units', () => {
  it('packs by difficulty within a ready set and respects the budget', () => {
    const nodes = [
      node('a', 3, 20),
      node('b', 1, 10),
      node('c', 5, 15, ['b']),
      node('d', 9, 30, ['a', 'c'])
    ];
    const plan = planRoadmap(nodes, ['d', 'a', 'b', 'c'], 45, 1);
    // Ready set ordered by difficulty: b(1) → {a(3), c(5)} → a before c.
    expect(plan.planned.map((p) => p.conceptId)).toEqual(['b', 'a', 'c']);
    expect(plan.totalMinutes).toBe(45);
    // 'd' cannot fit (45 used) → excluded; nothing depends on it further.
    expect(plan.excluded).toEqual([{ conceptId: 'd', reason: 'BUDGET_EXCEEDED' }]);
  });

  it('cascade-excludes descendants of an unplanned prerequisite', () => {
    const nodes = [
      node('root', 1, 40),
      node('child', 5, 5, ['root']),
      node('leaf', 2, 5)
    ];
    const plan = planRoadmap(nodes, ['root', 'child', 'leaf'], 15, 1);
    expect(plan.planned.map((p) => p.conceptId)).toEqual(['leaf']);
    const reasons = new Map(plan.excluded.map((e) => [e.conceptId, e.reason]));
    expect(reasons.get('root')).toBe('BUDGET_EXCEEDED');
    expect(reasons.get('child')).toBe('PREREQ_EXCLUDED');
  });

  it('no truncation ⇒ empty exclusions (exact fit allowed)', () => {
    const nodes = [node('x', 2, 15)];
    const plan = planRoadmap(nodes, ['x'], 15, 1);
    expect(plan.planned).toHaveLength(1);
    expect(plan.excluded).toEqual([]);
    expect(plan.totalMinutes).toBe(15);
  });

  it('ignores focus ids missing from the DAG', () => {
    const plan = planRoadmap([node('real', 1, 10)], ['ghost', 'real'], 30, 1);
    expect(plan.planned).toHaveLength(1);
  });

  it('identical inputs + seed ⇒ identical plan (different seed may reorder ties)', () => {
    const nodes = [
      node('m', 4, 10),
      node('n', 4, 10), // same difficulty — tie-break territory
      node('o', 6, 8, ['m'])
    ];
    const a1 = JSON.stringify(planRoadmap(nodes, ['m', 'n', 'o'], 60, 42));
    const a2 = JSON.stringify(planRoadmap(nodes, ['m', 'n', 'o'], 60, 42));
    expect(a1).toBe(a2);
  });
});

describe('roadmap planner — properties over random DAGs', () => {
  const dagArb = fc
    .integer({ min: 1, max: 24 })
    .chain((n) =>
      fc
        .tuple(
          fc.array(fc.constant(null), { minLength: n, maxLength: n }),
          fc.array(fc.integer({ min: 1, max: 10 }), { minLength: n, maxLength: n }),
          fc.array(fc.integer({ min: 1, max: 14 }), { minLength: n, maxLength: n }),
          fc.array(fc.integer({ min: 0, max: 90 }), { minLength: n, maxLength: n })
        )
        .map(([, diffs, mins, seeds]) => {
          // Acyclic by construction: edges only from lower index to higher.
          const ids = Array.from({ length: n }, (_, i) => `c${i}`);
          const nodes: PlannerNode[] = ids.map((id, i) => ({
            id,
            difficultyLevel: diffs[i]!,
            estimatedMinutes: mins[i]!,
            prerequisiteIds: ids.filter((_, j) => j < i && (i * 31 + j * 17) % 7 === 0)
          }));
          const focusCount = Math.max(1, Math.ceil(n / 2));
          const focus = ids.filter((_, i) => i % 2 === 0 || i < focusCount);
          return {
            nodes,
            focus,
            budget: TIME_BUDGETS[seeds[0]! % TIME_BUDGETS.length] as TimeBudget,
            seed: seeds[1]!
          };
        })
    );

  it('P1: planned minutes never exceed the budget', () => {
    fc.assert(
      fc.property(dagArb, ({ nodes, focus, budget, seed }) => {
        const plan = planRoadmap(nodes, focus, budget, seed);
        return plan.totalMinutes <= budget;
      })
    );
  });

  it('P2: prerequisite order is never violated among planned nodes', () => {
    fc.assert(
      fc.property(dagArb, ({ nodes, focus, budget, seed }) => {
        const plan = planRoadmap(nodes, focus, budget, seed);
        const pos = new Map(plan.planned.map((p, i) => [p.conceptId, i]));
        const byId = new Map(nodes.map((n) => [n.id, n]));
        for (const p of plan.planned) {
          for (const pre of byId.get(p.conceptId)!.prerequisiteIds) {
            if (pos.has(pre) && pos.get(pre)! > pos.get(p.conceptId)!) return false;
          }
        }
        return true;
      })
    );
  });

  it('P3: exclusions non-empty ⇔ truncation occurred', () => {
    fc.assert(
      fc.property(dagArb, ({ nodes, focus, budget, seed }) => {
        const plan = planRoadmap(nodes, focus, budget, seed);
        const allPlanned = plan.planned.length === new Set(focus).size;
        if (allPlanned) return plan.excluded.length === 0 && plan.totalMinutes <= budget;
        return plan.excluded.length > 0;
      })
    );
  });

  it('P4: determinism under fixed seed', () => {
    fc.assert(
      fc.property(dagArb, ({ nodes, focus, budget, seed }) => {
        const a = planRoadmap(nodes, focus, budget, seed);
        const b = planRoadmap(nodes, focus, budget, seed);
        return JSON.stringify(a) === JSON.stringify(b);
      })
    );
  });
});

describe('planner adapter', () => {
  it('derives planner nodes from a curriculum doc with the documented time model', () => {
    const doc = {
      subject: { id: 'maths_x', title: 'Maths', category: 'test' },
      curriculumVersion: '2026',
      concepts: [
        {
          id: 'abc',
          title: 'A',
          difficultyLevel: 3,
          specRef: 's',
          prerequisiteIds: [],
          contentChunks: []
        }
      ]
    } as unknown as CurriculumDoc;
    const nodes = plannerNodesFromCurriculum(doc);
    expect(nodes[0]).toMatchObject({ id: 'abc', difficultyLevel: 3, estimatedMinutes: 10 });
  });
});
