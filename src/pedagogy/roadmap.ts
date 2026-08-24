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
  /**
   * S5-T6 educator topic lock (F11): locked concepts are excluded from every
   * plan while true, and their descendants cascade as PREREQ_EXCLUDED.
   */
  locked?: boolean;
}

export const TIME_BUDGETS = [15, 30, 45, 60, 90] as const;
export type TimeBudget = (typeof TIME_BUDGETS)[number];

export interface RoadmapPlan {
  planned: Array<{ conceptId: string; estimatedMinutes: number; difficultyLevel: number }>;
  excluded: Array<{
    conceptId: string;
    reason: 'BUDGET_EXCEEDED' | 'PREREQ_EXCLUDED' | 'TOPIC_LOCKED';
  }>;
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

  // Full adjacency over the focus subgraph (lock-independent) used for
  // reachability cascades.
  const allChildren = new Map<string, string[]>();
  for (const id of focus) {
    allChildren.set(id, []);
    for (const pre of byId.get(id)!.prerequisiteIds) {
      if (focusSet.has(pre) && pre !== id) allChildren.get(pre)?.push(id);
    }
  }

  // S5-T6: locked topics plus every transitive descendant are removed from
  // the schedulable graph (a descendant whose prerequisite is locked cannot
  // be taught). Locked roots record TOPIC_LOCKED; descendants record
  // PREREQ_EXCLUDED.
  const blocked = new Set<string>();
  const blockedReasons = new Map<string, 'TOPIC_LOCKED' | 'PREREQ_EXCLUDED'>();
  {
    const stack = focus.filter((id) => byId.get(id)!.locked === true);
    for (const root of stack) {
      if (!blocked.has(root)) {
        blocked.add(root);
        blockedReasons.set(root, 'TOPIC_LOCKED');
      }
    }
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const child of allChildren.get(id) ?? []) {
        if (blocked.has(child)) continue;
        blocked.add(child);
        blockedReasons.set(child, 'PREREQ_EXCLUDED');
        stack.push(child);
      }
    }
  }
  const graphIds = focus.filter((id) => !blocked.has(id));
  const graphSet = new Set(graphIds);

  // Internal indegree/children maps restricted to the schedulable subgraph.
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const id of graphIds) {
    indegree.set(id, 0);
    children.set(id, []);
  }
  for (const id of graphIds) {
    const node = byId.get(id)!;
    for (const pre of node.prerequisiteIds) {
      if (graphSet.has(pre)) {
        indegree.set(id, (indegree.get(id) ?? 0) + 1);
        children.get(pre)?.push(id);
      }
    }
  }

  const heap = new MinHeap();
  for (const id of graphIds) {
    if ((indegree.get(id) ?? 0) === 0) {
      const n = byId.get(id)!;
      heap.push({ id, difficulty: n.difficultyLevel, minutes: n.estimatedMinutes, key: tieBreak(seed, id) });
    }
  }

  const planned: RoadmapPlan['planned'] = [];
  const excluded: RoadmapPlan['excluded'] = [];
  let used = 0;

  for (const id of blocked) {
    excluded.push({ conceptId: id, reason: blockedReasons.get(id)! });
  }
  excluded.sort((a, b) => a.conceptId.localeCompare(b.conceptId));

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
