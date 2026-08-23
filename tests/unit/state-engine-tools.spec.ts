import { describe, it, expect } from 'vitest';
import {
  TRANSITION_TABLE,
  STEP_SEQUENCE,
  advance,
  legalSteps,
  validateCheckpointStep,
  IllegalTransitionError
} from '../../src/state/transition-table.js';
import { serializeLearnerState } from '../../src/tools/dna-serializer.js';
import { enqueueSpacedRepetition } from '../../src/tools/spaced-rep.js';
import { classifyIntent, REFUSAL_SCAFFOLD_TEMPLATE } from '../../src/integrity/classifier.js';

const MODES = Object.keys(TRANSITION_TABLE) as Array<keyof typeof TRANSITION_TABLE>;

describe('transition-table.spec (S2-T1, exhaustive)', () => {
  it('table covers all 6 modes; step labels are contiguous 0..8', () => {
    expect(MODES).toHaveLength(6);
    expect(STEP_SEQUENCE).toHaveLength(9);
    for (const m of MODES) {
      const steps = TRANSITION_TABLE[m]!;
      expect(steps.length).toBeGreaterThan(0);
      for (const s of steps) expect(s).toBeGreaterThanOrEqual(0), expect(s).toBeLessThanOrEqual(8);
    }
  });

  it('every legal transition advances to the expected next owned step', () => {
    for (const m of MODES) {
      const steps = TRANSITION_TABLE[m]!;
      for (let i = 0; i < steps.length - 1; i++) {
        expect(advance(m, steps[i]!)).toBe(steps[i + 1]!);
      }
      // final step of a mode is a mode-switch boundary -> typed error
      expect(() => advance(m, steps[steps.length - 1]!)).toThrow(IllegalTransitionError);
    }
  });

  it('every illegal (mode, step) pair throws the typed error', () => {
    let illegalPairs = 0;
    for (const m of MODES) {
      for (let step = 0; step <= 8; step++) {
        if (!legalSteps(m).includes(step)) {
          expect(() => advance(m, step)).toThrowError(IllegalTransitionError);
          expect(() => validateCheckpointStep(m, step)).toThrowError(IllegalTransitionError);
          illegalPairs++;
        } else {
          expect(() => validateCheckpointStep(m, step)).not.toThrow();
        }
      }
    }
    expect(illegalPairs).toBeGreaterThan(40); // matrix genuinely exercised
  });
});

describe('deterministic learner state + spaced rep (S2-T5/T6)', () => {
  it('serializer output is byte-stable regardless of input ordering', () => {
    const base = {
      userId: 'u',
      subjectId: 'maths',
      mastery: [
        { conceptId: 'b', masteryScore: 0.856, status: 'PARTIAL' as const },
        { conceptId: 'a', masteryScore: 1, status: 'SOLID' as const }
      ]
    };
    const s1 = serializeLearnerState(base, [
      { conceptId: 'y', dueAtMs: 200 },
      { conceptId: 'x', dueAtMs: 100 }
    ]);
    const s2 = serializeLearnerState(
      {
        ...base,
        mastery: [base.mastery[1]!, base.mastery[0]!]
      },
      [
        { conceptId: 'x', dueAtMs: 100 },
        { conceptId: 'y', dueAtMs: 200 }
      ]
    );
    expect(s1).toBe(s2);
    const parsed = JSON.parse(s1);
    expect(parsed.matrix.map((r: string[]) => r[0])).toEqual(['a', 'b']);
    expect(parsed.due.map((d: { c: string }) => d.c)).toEqual(['x', 'y']);
  });

  it('enqueue writes ZSET members scored by due epoch-ms', async () => {
    const calls: Array<[string, number, string]> = [];
    const redis = { zadd: async (k: string, s: number, m: string) => void calls.push([k, s, m]) };
    const n = await enqueueSpacedRepetition(redis, 'user-9', [
      { conceptId: 'quad', dueAtMs: 1234 },
      { conceptId: 'trig', dueAtMs: 999 }
    ]);
    expect(n).toBe(2);
    expect(calls[0]).toEqual(['queue:spaced_rep:user-9', 1234, 'quad']);
    expect(await enqueueSpacedRepetition(redis, 'user-9', [])).toBe(0);
  });
});

describe('integrity.classifier.spec (S2-T7 corpus)', () => {
  const CORPUS: Array<{ text: string; want: 'LEARNING' | 'CHEATING' }> = [
    { text: 'Can you explain how the quadratic formula works?', want: 'LEARNING' },
    { text: 'I am stuck on this integration — help me understand the substitution', want: 'LEARNING' },
    { text: 'Give me practice questions on circle theorems', want: 'LEARNING' },
    { text: 'Walk me through a worked example of differentiation', want: 'LEARNING' },
    { text: 'Why does photosynthesis need chlorophyll?', want: 'LEARNING' },
    { text: 'Do my homework for me please', want: 'CHEATING' },
    { text: 'Send me the answers to the exam', want: 'CHEATING' },
    { text: 'Write my essay on climate change', want: 'CHEATING' },
    { text: 'Solve this for me without showing workings', want: 'CHEATING' },
    { text: 'Take the test for me during my exam', want: 'CHEATING' }
  ];

  it('classifies >=90% of labeled corpus correctly', () => {
    let hits = 0;
    for (const c of CORPUS) {
      if (classifyIntent(c.text).verdict === c.want) hits++;
    }
    expect(hits / CORPUS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('cheating path yields scaffold guidance containing no direct solution', () => {
    expect(REFUSAL_SCAFFOLD_TEMPLATE).toMatch(/can't provide a direct solution/i);
    expect(REFUSAL_SCAFFOLD_TEMPLATE).toMatch(/scaffold/i);
    expect(classifyIntent('Do my homework').verdict).toBe('CHEATING');
    expect(classifyIntent('hello there').verdict).toBe('AMBIGUOUS');
  });
});
