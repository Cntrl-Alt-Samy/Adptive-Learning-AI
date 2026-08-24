import { describe, it, expect } from 'vitest';
import { bandFor, decayedScore } from '../../src/pedagogy/decay-math.js';

/**
 * decay.math.spec — Sprint 4 gate S4-T8 (golden values).
 * Formula: score' = max(10, score·e^(−decayRate·Δdays)).
 * Locks: floor clamps at exactly 10.0; Δ=0 ⇒ unchanged; status bands flip
 * exactly at 50/80.
 */

const EPS = 1e-6;

describe('Ebbinghaus decay goldens', () => {
  it('matches hand-computed values', () => {
    expect(Math.abs(decayedScore(100, 0.05, 1) - 95.122942) < EPS).toBe(true);
    expect(Math.abs(decayedScore(100, 0.05, 7) - 70.468809) < EPS).toBe(true);
    expect(Math.abs(decayedScore(60, 0.1, 3) - 44.449093) < EPS).toBe(true);
    // e^(-0.2) = 0.81873075…
    expect(Math.abs(decayedScore(50, 0.2, 1) - 40.936538) < EPS).toBe(true);
  });

  it('Δ=0 ⇒ unchanged (no rounding drift)', () => {
    expect(decayedScore(87.5, 0.05, 0)).toBe(87.5);
    expect(decayedScore(10.000001, 0.99, 0)).toBe(10.000001);
  });

  it('floor clamps at exactly 10.0', () => {
    expect(decayedScore(12, 0.9, 30)).toBe(10.0);
    expect(decayedScore(100, 0.05, 365)).toBe(10.0); // 100·e^−18.25 ≈ 1.2e-8
    // Values that land above the floor are untouched by the clamp.
    const aboveFloor = decayedScore(12, 0.05, 2); // 12·e^−0.1 ≈ 10.86
    expect(aboveFloor).toBeGreaterThan(10.0);
  });

  it('status bands flip exactly at 50/80', () => {
    expect(bandFor(80)).toBe('SOLID');
    expect(bandFor(80.000001)).toBe('SOLID');
    expect(bandFor(79.999999)).toBe('PARTIAL');
    expect(bandFor(50)).toBe('PARTIAL');
    expect(bandFor(50.000001)).toBe('PARTIAL');
    expect(bandFor(49.999999)).toBe('NEEDS_WORK');
    expect(bandFor(10)).toBe('NEEDS_WORK');
  });

  it('composed pipeline: decaying a SOLID score can demote its band', () => {
    expect(bandFor(decayedScore(85, 0.05, 14))).toBe('NEEDS_WORK'); // ≈42.2
    expect(bandFor(decayedScore(85, 0.05, 4))).toBe('PARTIAL'); // ≈69.6
    expect(bandFor(decayedScore(85, 0.01, 4))).toBe('SOLID'); // ≈81.7
  });
});
