import type { ConceptNode, CurriculumDoc } from './types.js';
import { effectiveSubjectId } from './types.js';

/**
 * S0-T6 — Curriculum DAG validation pipeline (pure, no I/O).
 *
 * Pipeline (Doc 07 TASK 1.3):
 *   ① schema check            (loader / zod — surfaced as SCHEMA issues here)
 *   ② unique concept IDs
 *   ③ referential integrity of prereq edges
 *   ④ self-loop rejection
 *   ⑤ cycle detection = Kahn's algorithm; on failure report the FULL cycle path
 *   ⑥ difficulty monotonicity warning along prereq chains
 *   ⑦ cross-subject edge guard
 *
 * Complexity: O(V + E) throughout — verified by the 10k-node perf gate.
 */

export type IssueCode =
  | 'SCHEMA'
  | 'DUPLICATE_ID'
  | 'DANGLING_REF'
  | 'SELF_LOOP'
  | 'CYCLE'
  | 'CROSS_SUBJECT_EDGE'
  | 'DIFFICULTY_NON_MONOTONIC';

export interface ValidationIssue {
  code: IssueCode;
  severity: 'error' | 'warning';
  message: string;
  /** Ordered path for CYCLE issues, e.g. ["a","b","c","a"]; otherwise involved ids. */
  conceptIds: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: {
    conceptCount: number;
    edgeCount: number;
    durationMs: number;
  };
}

/** Adjacency: concept -> set of its prerequisite ids (u depends on v ⇒ u→v). */
export function buildPrereqGraph(concepts: readonly ConceptNode[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const concept of concepts) {
    let edges = graph.get(concept.id);
    if (!edges) {
      edges = new Set<string>();
      graph.set(concept.id, edges);
    }
    for (const prereq of concept.prerequisiteIds) {
      edges.add(prereq);
    }
  }
  return graph;
}

/**
 * Kahn's algorithm over the dependency graph.
 * Returns a topological order when the graph is acyclic, or the residual
 * nodes that could not be processed (those participating in or feeding
 * unresolvable cycles) plus a concrete cycle path for diagnostics.
 */
export function kahnsAlgorithm(
  graph: ReadonlyMap<string, Set<string>>
): { order: string[]; residualNodes: string[]; cyclePath: string[] } {
  // Indegree in "depends-on" orientation: number of unprocessed prerequisites.
  const indegree = new Map<string, number>();
  const dependents = new Map<string, Set<string>>(); // v -> concepts depending on v
  for (const [node, prereqs] of graph) {
    if (!indegree.has(node)) indegree.set(node, 0);
    for (const prereq of prereqs) {
      indegree.set(node, (indegree.get(node) ?? 0) + 1);
      let back = dependents.get(prereq);
      if (!back) {
        back = new Set<string>();
        dependents.set(prereq, back);
      }
      back.add(node);
    }
  }

  // Deterministic processing order.
  const queue: string[] = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([n]) => n)
    .sort();
  const order: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const node = queue[head] as string;
    head += 1;
    order.push(node);
    for (const dep of [...(dependents.get(node) ?? [])].sort()) {
      const next = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }

  const residualNodes = [...indegree.entries()]
    .filter(([, d]) => d > 0)
    .map(([n]) => n)
    .sort();

  const cyclePath = residualNodes.length > 0 ? extractCyclePath(graph, new Set(residualNodes)) : [];
  return { order, residualNodes, cyclePath };
}

function extractCyclePath(
  graph: ReadonlyMap<string, Set<string>>,
  residual: ReadonlySet<string>
): string[] {
  // Every residual node has ≥1 outgoing edge into the residual set (its
  // unprocessed prerequisites), so walking prerequisite pointers must loop.
  const start = [...residual].sort()[0];
  if (!start) return [];

  const walk: string[] = [];
  const position = new Map<string, number>();
  let current: string | undefined = start;

  while (current !== undefined && !position.has(current)) {
    position.set(current, walk.length);
    walk.push(current);
    const successors = [...(graph.get(current) ?? [])]
      .filter((s) => residual.has(s))
      .sort();
    current = successors[0];
  }

  if (current === undefined) return [];
  const loopStart = position.get(current) ?? 0;
  return [...walk.slice(loopStart), current];
}

export function validateCurriculum(doc: CurriculumDoc): ValidationResult {
  const startedAt = process.hrtime.bigint();
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const concepts = doc.concepts;

  // ② Unique concept IDs
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const concept of concepts) {
    if (seen.has(concept.id)) duplicates.add(concept.id);
    seen.add(concept.id);
  }
  if (duplicates.size > 0) {
    errors.push({
      code: 'DUPLICATE_ID',
      severity: 'error',
      message: `Duplicate concept ids: ${[...duplicates].sort().join(', ')}`,
      conceptIds: [...duplicates].sort()
    });
  }

  const knownIds = seen;
  const graph = buildPrereqGraph(concepts);
  // Self-loops are diagnosed separately in step ④; strip them so step ⑤
  // reports genuine multi-node cycles only.
  for (const concept of concepts) {
    graph.get(concept.id)?.delete(concept.id);
  }

  // ③ Referential integrity + ④ self-loops + ⑦ cross-subject guard
  const byId = new Map(concepts.map((c) => [c.id, c]));
  for (const concept of concepts) {
    for (const prereq of concept.prerequisiteIds) {
      if (prereq === concept.id) {
        errors.push({
          code: 'SELF_LOOP',
          severity: 'error',
          message: `Self-loop: concept '${concept.id}' depends on itself`,
          conceptIds: [concept.id]
        });
        continue;
      }
      if (!knownIds.has(prereq)) {
        errors.push({
          code: 'DANGLING_REF',
          severity: 'error',
          message: `Dangling prerequisite: '${concept.id}' references unknown concept '${prereq}'`,
          conceptIds: [concept.id, prereq]
        });
        continue;
      }
      const prereqNode = byId.get(prereq);
      if (
        prereqNode &&
        effectiveSubjectId(doc, prereqNode) !== effectiveSubjectId(doc, concept)
      ) {
        errors.push({
          code: 'CROSS_SUBJECT_EDGE',
          severity: 'error',
          message:
            `Cross-subject edge: '${concept.id}' (${effectiveSubjectId(doc, concept)}) ` +
            `depends on '${prereq}' (${effectiveSubjectId(doc, prereqNode)}). ` +
            `Declare cross-subject grounding via RAG metadata instead of prereq edges.`,
          conceptIds: [concept.id, prereq]
        });
      }
    }
  }

  // ⑤ Cycle detection (Kahn's) with full cycle-path reporting
  const { residualNodes, cyclePath } = kahnsAlgorithm(graph);
  if (cyclePath.length > 0) {
    errors.push({
      code: 'CYCLE',
      severity: 'error',
      message: `Prerequisite cycle detected (${residualNodes.length} unresolvable nodes). Cycle path: ${cyclePath.join(' -> ')}`,
      conceptIds: cyclePath
    });
  }

  // ⑥ Difficulty monotonicity warnings along prereq chains
  for (const concept of concepts) {
    for (const prereq of concept.prerequisiteIds) {
      const prereqNode = byId.get(prereq);
      if (!prereqNode || prereq === concept.id) continue;
      if (prereqNode.difficultyLevel > concept.difficultyLevel) {
        warnings.push({
          code: 'DIFFICULTY_NON_MONOTONIC',
          severity: 'warning',
          message:
            `Difficulty regression: prerequisite '${prereq}' (${prereqNode.difficultyLevel}) is harder ` +
            `than dependent '${concept.id}' (${concept.difficultyLevel})`,
          conceptIds: [concept.id, prereq]
        });
      }
    }
  }

  const endedAt = process.hrtime.bigint();
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      conceptCount: concepts.length,
      edgeCount: concepts.reduce((sum, c) => sum + c.prerequisiteIds.length, 0),
      durationMs: Number(endedAt - startedAt) / 1e6
    }
  };
}

/** Topological order (Kahn's) for downstream consumers; throws on cycles. */
export function requireTopologicalOrder(doc: CurriculumDoc): string[] {
  const { order, cyclePath } = kahnsAlgorithm(buildPrereqGraph(doc.concepts));
  if (cyclePath.length > 0) {
    throw new Error(`Cannot topologically sort curriculum containing cycle: ${cyclePath.join(' -> ')}`);
  }
  return order;
}
