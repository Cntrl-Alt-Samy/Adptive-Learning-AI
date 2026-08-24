/**
 * S4-T8 — Rolling Ebbinghaus decay (Doc 04 §5.1, B-02).
 *
 * Formula: score' = max(10, score · e^(−decayRate · Δdays))
 * Status re-band: ≥80 SOLID / ≥50 PARTIAL / else NEEDS_WORK.
 * Golden boundaries are locked by decay.math.spec — do not drift.
 */

export type MasteryBand = 'SOLID' | 'PARTIAL' | 'NEEDS_WORK';

export const SCORE_FLOOR = 10.0;

export function decayedScore(score: number, decayRate: number, deltaDays: number): number {
  const raw = score * Math.exp(-decayRate * deltaDays);
  return Math.max(SCORE_FLOOR, Math.round(raw * 1e6) / 1e6);
}

export function bandFor(score: number): MasteryBand {
  if (score >= 80) return 'SOLID';
  if (score >= 50) return 'PARTIAL';
  return 'NEEDS_WORK';
}
