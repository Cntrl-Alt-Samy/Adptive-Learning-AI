import { tieBreak } from './rng.js';

/**
 * S4-T2 — Prerequisite-respecting roadmap planner (PRD F4.1–F4.2).
 *
 * Input: gap-map concept ids + time budget {15/30/45/60/90} + the prereq DAG
 * from the S0 curriculum store. Kahn's topological layering over a binary
 * min-heap keyed (difficultyLevel, seeded tie-break) packs the session in
 * difficulty order. Complexity: O(V + E log V).
 *
 * Invariants (all property-tested):
 *  - Σ estimatedMinutes(planned) ≤ budget — always fits the time budget.
 *  - Planned order never violates prerequisite direction.
 *  - A node whose prerequisite is excluded is itself excluded (transitively).
 *  - Exclusions are non-empty exactly when truncation occurred.
 *  - Identical inputs + seed ⇒ identical plan.
 */

export interface PlannerNode {
  id: string;
  /** 1–10, lower taught first within a ready set. */
  difficultyLevel: number;
  estimatedMinutes: number;
  prerequisiteIds: string[];
}

export const TIME_BUDGETS = [15, 30, 45, 60, 90] as const;
export type TimeBudget = (typeof TIME_BUDGETS)[number];

export interface RoadmapPlan {
  planned: Array<{ conceptId: string; estimatedMinutes: number; difficultyLevel: number }>;
  excluded: Array<{ conceptId: string; reason: 'BUDGET_EXCEEDED' | 'PREREQ_EXCLUDED' }>;
  totalMinutes: number;
}

interface HeapEntry {
  id: string;
  difficulty: number;
  minutes: number;
  key: number;
}

/** Binary min-heap on (difficulty, seeded key). */
class MinHeap {
  private readonly a: HeapEntry[] = [];

  get size(): number {
    return this.a.length;
  }

  push(e: HeapEntry): void {
    this.a.push(e);
    let i = this.a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(i, parent)) {
        this.swap(i, parent);
        i = parent;
      } else break;
    }
  }

  pop(): HeapEntry | undefined {
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length > 0 && last && top !== last) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.a.length && this.less(l, m)) m = l;
        if (r < this.a.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private less(i: number, j: number): boolean {
    const x = this.a[i]!;
    const y = this.a[j]!;
    return x.difficulty < y.difficulty || (x.difficulty === y.difficulty && x.key < y.key);
  }

  private swap(i: number, j: number): void {
    const t = this.a[i]!;
    this.a[i] = this.a[j]!;
    this.a[j] = t;
  }
}

/**
 * Plan a session. Only `focusIds` are candidates; prerequisites outside the
 * focus set are treated as already mastered (their edges are dropped).
 */
export function planRoadmap(
  nodes: PlannerNode[],
  focusIds: string[],
  budget: TimeBudget,
  seed: number
): RoadmapPlan {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = [...new Set(focusIds.filter((id) => byId.has(id)))];
  const focusSet = new Set(focus);

  // Internal indegree/children maps restricted to the focus subgraph.
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const id of focus) {
    indegree.set(id, 0);
    children.set(id, []);
  }
  for (const id of focus) {
    const node = byId.get(id)!;
    for (const pre of node.prerequisiteIds) {
      if (focusSet.has(pre) && pre !== id) {
        indegree.set(id, (indegree.get(id) ?? 0) + 1);
        children.get(pre)!.push(id);
      }
    }
  }

  const heap = new MinHeap();
  for (const id of focus) {
    if ((indegree.get(id) ?? 0) === 0) {
      const n = byId.get(id)!;
      heap.push({ id, difficulty: n.difficultyLevel, minutes: n.estimatedMinutes, key: tieBreak(seed, id) });
    }
  }

  const planned: RoadmapPlan['planned'] = [];
  const excluded: RoadmapPlan['excluded'] = [];
  let used = 0;

  const cascadeExclude = (rootId: string): void => {
    // Descendants of an unplanned node can never be scheduled.
    const stack = [...(children.get(rootId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (excluded.some((e) => e.conceptId === id)) continue;
      excluded.push({ conceptId: id, reason: 'PREREQ_EXCLUDED' });
      for (const child of children.get(id) ?? []) stack.push(child);
    }
  };

  while (heap.size > 0) {
    const entry = heap.pop()!;
    if ((indegree.get(entry.id) ?? -1) < 0) continue; // already excluded via cascade
    if (used + entry.minutes <= budget) {
      used += entry.minutes;
      planned.push({ conceptId: entry.id, estimatedMinutes: entry.minutes, difficultyLevel: entry.difficulty });
      indegree.set(entry.id, -1); // done
      for (const child of children.get(entry.id) ?? []) {
        const left = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, left);
        if (left === 0) {
          const cn = byId.get(child)!;
          heap.push({ id: child, difficulty: cn.difficultyLevel, minutes: cn.estimatedMinutes, key: tieBreak(seed, child) });
        }
      }
    } else {
      excluded.push({ conceptId: entry.id, reason: 'BUDGET_EXCEEDED' });
      indegree.set(entry.id, -2); // excluded marker
      cascadeExclude(entry.id);
      for (const id of excluded) indegree.set(id.conceptId, -2);
    }
  }

  return { planned, excluded, totalMinutes: used };
}

/** Adapter: derive planner nodes from a validated S0 CurriculumDoc. */
export function plannerNodesFromCurriculum(doc: import('../curriculum/types.js').CurriculumDoc): PlannerNode[] {
  return doc.concepts.map((c) => ({
    id: c.id,
    difficultyLevel: c.difficultyLevel,
    // Estimation model: base 4 min + 2 min per difficulty step (documented
    // heuristic; content teams override per-concept timings upstream).
    estimatedMinutes: 4 + c.difficultyLevel * 2,
    prerequisiteIds: c.prerequisiteIds
  }));
}
