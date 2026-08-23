import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateCurriculum,
  kahnsAlgorithm,
  buildPrereqGraph,
  requireTopologicalOrder
} from '../../src/curriculum/dag-validator.js';
import { parseCurriculum } from '../../src/curriculum/loader.js';
import type { CurriculumDoc } from '../../src/curriculum/types.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const CURRICULA = join(import.meta.dirname, '..', '..', 'curricula');

function loadFixture(name: string): CurriculumDoc {
  const result = parseCurriculum(readFileSync(join(FIXTURES, name), 'utf8'));
  if (!result.ok || !result.doc) throw new Error(`fixture ${name} failed schema: ${JSON.stringify(result.issues)}`);
  return result.doc;
}

describe('dag-validator — valid DAGs', () => {
  it.each(['gcse_maths_edexcel.json', 'python_programming.json', 'gcse_economics_aqa.json'])(
    '%s validates clean',
    (file) => {
      const doc = parseCurriculum(readFileSync(join(CURRICULA, file), 'utf8'));
      expect(doc.ok).toBe(true);
      const result = validateCurriculum(doc.doc as CurriculumDoc);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    }
  );

  it('reports difficulty regressions as warnings without failing the DAG', () => {
    const doc = loadFixture('curricula.cycle.json');
    // topic_c(4) -> topic_b(3): prereq harder than dependent is a warning case in the cycle fixture
    const result = validateCurriculum(doc);
    expect(result.valid).toBe(false); // has a cycle too
    expect(result.warnings.some((w) => w.code === 'DIFFICULTY_NON_MONOTONIC')).toBe(true);
  });

  it('requireTopologicalOrder returns all nodes for an acyclic graph', () => {
    const maths = parseCurriculum(readFileSync(join(CURRICULA, 'gcse_maths_edexcel.json'), 'utf8'));
    const order = requireTopologicalOrder(maths.doc as CurriculumDoc);
    expect(order.length).toBe((maths.doc as CurriculumDoc).concepts.length);
  });
});

describe('dag-validator — rejection diagnostics', () => {
  it('rejects cycles with the FULL cycle path reported', () => {
    const doc = loadFixture('curricula.cycle.json');
    const result = validateCurriculum(doc);
    expect(result.valid).toBe(false);
    const cycle = result.errors.find((e) => e.code === 'CYCLE');
    expect(cycle).toBeDefined();
    expect(cycle?.conceptIds).toEqual(expect.arrayContaining(['topic_a', 'topic_b', 'topic_c']));
    // Path must be a closed walk: first element repeats at the end
    const path = cycle?.conceptIds ?? [];
    expect(path.length).toBeGreaterThanOrEqual(4);
    expect(path[0]).toBe(path[path.length - 1]);
    expect(cycle?.message).toContain('->');
  });

  it('rejects duplicate concept ids precisely', () => {
    const result = validateCurriculum(loadFixture('curricula.duplicate_ids.json'));
    const dup = result.errors.find((e) => e.code === 'DUPLICATE_ID');
    expect(dup?.conceptIds).toEqual(['same_id']);
  });

  it('rejects dangling prerequisite references with both endpoints named', () => {
    const result = validateCurriculum(loadFixture('curricula.dangling_ref.json'));
    const dangling = result.errors.find((e) => e.code === 'DANGLING_REF');
    expect(dangling?.conceptIds).toEqual(['real_node', 'ghost_node']);
    expect(dangling?.message).toContain('unknown concept');
  });

  it('rejects self-loops without double-reporting a cycle', () => {
    const result = validateCurriculum(loadFixture('curricula.self_loop.json'));
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('SELF_LOOP');
    expect(codes).not.toContain('CYCLE');
  });

  it('guards cross-subject prerequisite edges', () => {
    const result = validateCurriculum(loadFixture('curricula.cross_subject.json'));
    const edge = result.errors.find((e) => e.code === 'CROSS_SUBJECT_EDGE');
    expect(edge?.conceptIds).toEqual(['physics_node', 'maths_node']);
  });
});

describe('dag-validator — Kahn algorithm unit properties', () => {
  it('empty graph yields empty order/residual', () => {
    const { order, residualNodes, cyclePath } = kahnsAlgorithm(new Map());
    expect(order).toEqual([]);
    expect(residualNodes).toEqual([]);
    expect(cyclePath).toEqual([]);
  });

  it('diamond dependency graph topologically sorts', () => {
    const graph = new Map<string, Set<string>>([
      ['a', new Set()],
      ['b', new Set(['a'])],
      ['c', new Set(['a'])],
      ['d', new Set(['b', 'c'])]
    ]);
    const { order, residualNodes } = kahnsAlgorithm(graph);
    expect(residualNodes).toEqual([]);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
  });

  it('two disjoint cycles each get detected via one reported path', () => {
    const graph = new Map<string, Set<string>>([
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
      ['c', new Set(['d'])],
      ['d', new Set(['c'])]
    ]);
    const { residualNodes, cyclePath } = kahnsAlgorithm(graph);
    expect([...residualNodes].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(cyclePath.length).toBeGreaterThanOrEqual(2);
    expect(cyclePath[0]).toBe(cyclePath[cyclePath.length - 1]);
  });
});

describe('dag-validator — O(V+E) performance gate (10k nodes <1s)', () => {
  it('validates a 10k-node synthetic chain+fanout DAG under budget', () => {
    const N = 10_000;
    const concepts = Array.from({ length: N }, (_, i) => ({
      id: `n${i}`,
      title: `Concept ${i}`,
      difficultyLevel: (i % 10) + 1,
      specRef: `S.${i}`,
      prerequisiteIds: i < 4 ? [] : [`n${i - 1}`, `n${i - 2}`].filter((p) => Number(p.slice(1)) >= 0),
      contentChunks: []
    }));
    const doc: CurriculumDoc = {
      subject: { id: 'perf_fixture', title: 'Perf', category: 'test' },
      curriculumVersion: '2026.1',
      concepts
    };
    const startedAt = performance.now();
    const result = validateCurriculum(doc);
    const elapsed = performance.now() - startedAt;
    expect(result.valid).toBe(true);
    expect(elapsed).toBeLessThan(1000);
    expect(result.stats.conceptCount).toBe(N);
  });
});

describe('loader — schema gate', () => {
  it('surfaces zod violations as SCHEMA issues with json paths', () => {
    const result = parseCurriculum('{ "subject": { "id": "x" }, "concepts": [{}] }');
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('SCHEMA');
  });

  it('invalid JSON reports SCHEMA error not a crash', () => {
    const result = parseCurriculum('{not json}');
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain('Invalid JSON');
  });
});
