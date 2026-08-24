import { describe, it, expect } from 'vitest';
import { StrikeBreaker, type StrikeIntervention } from '../../src/pedagogy/strike-breaker.js';

/**
 * strike-breaker.fsm.spec — Sprint 4 gate S4-T5 (exhaustive).
 * Every sequence of pass/fail over ≤3 attempts maps to the correct
 * intervention; the 3rd fail always pivots/flags; only mastery resets.
 */

const CONCEPT = 'quadratic_factoring';

/** Expected state after `fails` consecutive recorded failures (mastery resets to zero). */
function expectedStateFor(fails: number): { state: string; intervention: StrikeIntervention } {
  switch (fails) {
    case 0:
      return { state: 'CLEAR', intervention: { kind: 'NONE', strike: 0 } };
    case 1:
      return { state: 'STRIKE_1', intervention: { kind: 'HINT_AND_ANALOGY', strike: 1 } };
    case 2:
      return { state: 'STRIKE_2', intervention: { kind: 'DECOMPOSE_SUBSTEPS', strike: 2 } };
    default:
      return {
        state: 'BREAKER_TRIPPED',
        intervention: { kind: 'BREAKER_TRIP', strike: 3, dnaTag: 'NEEDS_REVISIT', pivot: 'PREREQ_NODE' }
      };
  }
}

describe('strike breaker FSM — exhaustive sequences', () => {
  it('all pass/fail sequences of length ≤ 3 land on the documented intervention', () => {
    // Sequences are strings of F (fail) / P (pass) / M (mastery).
    const alphabet = ['F', 'P', 'M'] as const;
    const sequences: string[] = [''];
    for (let len = 1; len <= 3; len++) {
      for (let mask = 0; mask < Math.pow(alphabet.length, len); mask++) {
        let s = '';
        let m = mask;
        for (let i = 0; i < len; i++) {
          s += alphabet[m % alphabet.length];
          m = Math.floor(m / alphabet.length);
        }
        sequences.push(s);
      }
    }

    for (const seq of sequences) {
      const breaker = new StrikeBreaker();
      let fails = 0;
      let mastered = false;
      let lastIntervention: StrikeIntervention = { kind: 'NONE', strike: 0 };
      for (const step of seq) {
        if (step === 'F') {
          fails++;
          lastIntervention = breaker.recordFailure(CONCEPT).intervention;
        } else if (step === 'P') {
          breaker.recordPass(CONCEPT);
        } else {
          breaker.recordMastery(CONCEPT);
          mastered = true;
          fails = 0;
        }
      }
      const want = expectedStateFor(fails);
      expect(breaker.state(CONCEPT), `seq=${seq}`).toBe(want.state);
      // The returned intervention corresponds to the most recent failure.
      if (seq.endsWith('F')) {
        expect(lastIntervention.kind, `seq=${seq}`).toBe(want.intervention.kind);
      }
    }
  });

  it('3rd fail always pivots/flags with telemetry', () => {
    const breaker = new StrikeBreaker();
    breaker.recordFailure(CONCEPT);
    breaker.recordFailure(CONCEPT);
    const trip = breaker.recordFailure(CONCEPT);
    expect(trip.intervention).toMatchObject({ kind: 'BREAKER_TRIP', dnaTag: 'NEEDS_REVISIT' });
    expect(trip.events.map((e) => e.event)).toEqual(['pedagogical_strike_3', 'circuit_breaker_tripped']);
    // Further fails stay pinned at the trip point — no counter overflow.
    const again = breaker.recordFailure(CONCEPT);
    expect(again.state).toBe('BREAKER_TRIPPED');
    expect(breaker.count(CONCEPT)).toBe(3);
  });

  it('passes never reset or advance the counter — mastery is the only reset', () => {
    const breaker = new StrikeBreaker();
    breaker.recordFailure(CONCEPT);
    breaker.recordPass(CONCEPT);
    breaker.recordPass(CONCEPT);
    expect(breaker.count(CONCEPT)).toBe(1);

    breaker.recordMastery(CONCEPT);
    expect(breaker.state(CONCEPT)).toBe('CLEAR');
    expect(breaker.count(CONCEPT)).toBe(0);
  });

  it('tracks concepts independently', () => {
    const breaker = new StrikeBreaker();
    breaker.recordFailure('a');
    breaker.recordFailure('b');
    breaker.recordFailure('b');
    expect(breaker.state('a')).toBe('STRIKE_1');
    expect(breaker.state('b')).toBe('STRIKE_2');
    expect(breaker.state('c')).toBe('CLEAR');
  });
});
