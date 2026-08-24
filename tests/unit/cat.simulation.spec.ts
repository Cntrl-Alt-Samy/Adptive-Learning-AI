import { describe, it, expect } from 'vitest';
import { CatEngine, bandOf, bandIndex, rasch, type CatItem } from '../../src/pedagogy/cat.js';
import { mulberry32 } from '../../src/pedagogy/rng.js';

/**
 * cat.simulation.spec — Sprint 4 gate S4-T1.
 * Monte Carlo: ≥90% of 10k synthetic learners must calibrate within ±1 level
 * band of ground truth. Also locks the no-verdict-leakage invariant by
 * construction: the per-turn surface exposes no pass/fail data at all.
 */

const LEARNERS = 10_000;

function buildBank(): CatItem[] {
  // 8 concepts × 5 difficulties each = 40 items spanning levels 1–10.
  const items: CatItem[] = [];
  for (let c = 0; c < 8; c++) {
    for (let d = 0; d < 5; d++) {
      const difficulty = 1 + ((c * 5 + d) * 9) / 39; // spread 1..10 deterministically
      items.push({ itemId: `it_${c}_${d}`, conceptId: `concept_${c}`, difficulty });
    }
  }
  return items;
}

describe('CAT calibration — Monte Carlo simulation (10k learners)', () => {
  it('calibrates ≥90% of synthetic learners within ±1 band of ground truth', () => {
    const bank = buildBank();
    let withinOne = 0;

    for (let i = 0; i < LEARNERS; i++) {
      const rng = mulberry32(0xa11ce + i);
      const trueAbility = 0.5 + rng() * 9;
      const engine = new CatEngine(bank, { seed: 1000 + i });

      for (;;) {
        const item = engine.selectNext();
        if (!item) break;
        const p = rasch(trueAbility, item.difficulty);
        engine.recordResponse(item.itemId, rng() < p);
      }

      const result = engine.diagnose();
      const err = Math.abs(bandIndex(result.calibratedLevel) - bandIndex(bandOf(trueAbility)));
      if (err <= 1) withinOne++;
    }

    const rate = withinOne / LEARNERS;
    expect(rate).toBeGreaterThanOrEqual(0.9);
  }, 60_000);

  it('is deterministic: same learner stream + seed ⇒ identical result', () => {
    const bank = buildBank();
    const run = (): string => {
      const rng = mulberry32(424242);
      const trueAbility = 6.3;
      const engine = new CatEngine(bank, { seed: 99 });
      for (;;) {
        const item = engine.selectNext();
        if (!item) break;
        engine.recordResponse(item.itemId, rng() < rasch(trueAbility, item.difficulty));
      }
      return JSON.stringify(engine.diagnose());
    };
    expect(run()).toBe(run());
  });

  it('gap map holds the 3–6 concept contract when the bank allows', () => {
    const bank = buildBank();
    const engine = new CatEngine(bank, { seed: 7 });
    let item = engine.selectNext();
    while (item) {
      engine.recordResponse(item.itemId, false);
      item = engine.selectNext();
    }
    const { gapMap, strengthMap } = engine.diagnose();
    expect(gapMap.length).toBeGreaterThanOrEqual(3);
    expect(gapMap.length).toBeLessThanOrEqual(6);
    expect(strengthMap).toHaveLength(0); // nothing answered correctly
  });

  it('no intermediate verdict leakage — selection/record surfaces carry no outcome fields', () => {
    const bank = buildBank();
    const engine = new CatEngine(bank, { seed: 1 });
    const item = engine.selectNext()!;
    const feedback = engine.recordResponse(item.itemId, false);
    expect(feedback).toBeUndefined();
    expect(Object.keys(item)).toEqual(['itemId', 'conceptId', 'difficulty']);
  });

  it('rejects banks thinner than the 5-item hard cap', () => {
    const thin: CatItem[] = Array.from({ length: 4 }, (_, i) => ({
      itemId: `t${i}`,
      conceptId: 'c',
      difficulty: 2 + i
    }));
    expect(() => new CatEngine(thin)).toThrow(/bank too thin/i);
  });
});
