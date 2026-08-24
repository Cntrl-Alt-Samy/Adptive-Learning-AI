import { hash32 } from './rng.js';

/**
 * S4-T1 — CAT diagnostic engine (PRD F2.1–F2.3).
 *
 * Pure selection policy over a concept-tagged item bank using 1PL Rasch
 * targeting with maximum-likelihood ability estimation. Deterministic for a
 * given (bank, responses, seed): item tie-breaks come from the seeded RNG.
 *
 * Invariants:
 *  - NO intermediate verdict leakage: `selectNext` / `recordResponse` expose
 *    no pass/fail language by construction; only the terminal `diagnose()`
 *    output carries results.
 *  - Stop rule: minimum 4 items, hard cap 5 items, or early stop when the
 *    standard error of the estimate drops to ≤ 0.60.
 *  - Output = Calibrated Level + Gap Map (3–6 concepts when the bank allows)
 *    + Strength Map.
 */

export interface CatItem {
  itemId: string;
  conceptId: string;
  /** Rasch difficulty b on the same 1–10 scale as the ability estimate θ. */
  difficulty: number;
}

export type CalibratedLevel =
  | 'confirmed_beginner'
  | 'low_intermediate'
  | 'high_intermediate'
  | 'near_advanced';

export interface CatConfig {
  minItems?: number;
  maxItems?: number;
  /** Early-stop standard-error threshold. */
  seThreshold?: number;
  seed?: number;
}

export interface CatResult {
  calibratedLevel: CalibratedLevel;
  abilityEstimate: number;
  standardError: number;
  itemsAdministered: number;
  gapMap: string[];
  strengthMap: string[];
}

export const CAT_MIN_ITEMS = 4;
export const CAT_MAX_ITEMS = 5;
export const CAT_SE_THRESHOLD = 0.6;

/** Ability bands aligned with the checkpoint contract's calibrated_level enum. */
export function bandOf(ability: number): CalibratedLevel {
  if (ability < 3) return 'confirmed_beginner';
  if (ability < 5.5) return 'low_intermediate';
  if (ability < 8) return 'high_intermediate';
  return 'near_advanced';
}

export function bandIndex(level: CalibratedLevel): number {
  return ['confirmed_beginner', 'low_intermediate', 'high_intermediate', 'near_advanced'].indexOf(level);
}

/** 1PL Rasch response probability. */
export function rasch(ability: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-(ability - difficulty)));
}

const ABILITY_FLOOR = 0.25;
const ABILITY_CEIL = 9.75;

export class CatEngine {
  private readonly items: CatItem[];
  private readonly byId = new Map<string, CatItem>();
  private readonly asked: string[] = [];
  private readonly responses: Array<{ item: CatItem; correct: boolean }> = [];
  private readonly seed: number;

  constructor(items: CatItem[], config: CatConfig = {}) {
    if (items.length < CAT_MAX_ITEMS) {
      throw new Error(`CAT bank too thin: need ≥ ${CAT_MAX_ITEMS} items, got ${items.length}`);
    }
    this.items = [...items];
    for (const item of this.items) this.byId.set(item.itemId, item);
    this.seed = config.seed ?? 0;
  }

  get administered(): number {
    return this.asked.length;
  }

  /**
   * Next item targeting the current ability estimate (closest difficulty);
   * deterministic seeded tie-break on equal distance. Returns null at stop.
   */
  selectNext(): CatItem | null {
    if (this.shouldStop()) return null;
    const askedSet = new Set(this.asked);
    const theta = this.currentAbility();
    let best: CatItem | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    let bestTie = Number.POSITIVE_INFINITY;
    for (const item of this.items) {
      if (askedSet.has(item.itemId)) continue;
      const dist = Math.abs(theta - item.difficulty);
      const tie = hash32(`${item.itemId}@${item.conceptId}:${this.seed}`) / 4294967296;
      if (dist < bestDist || (dist === bestDist && tie < bestTie)) {
        best = item;
        bestDist = dist;
        bestTie = tie;
      }
    }
    if (!best) return null;
    this.asked.push(best.itemId);
    return best;
  }

  /**
   * Record an outcome for the previously selected item. Deliberately returns
   * void — no intermediate verdict is ever surfaced to the client (F2.2).
   */
  recordResponse(itemId: string, correct: boolean): void {
    const item = this.byId.get(itemId) ?? this.items.find((i) => i.itemId === itemId);
    if (!item) throw new Error(`Unknown CAT item: ${itemId}`);
    if (this.responses.some((r) => r.item.itemId === itemId)) {
      throw new Error(`CAT item already answered: ${itemId}`);
    }
    this.responses.push({ item, correct });
  }

  /** Terminal result — the only place outcomes become visible. */
  diagnose(): CatResult {
    const theta = this.currentAbility();
    const se = this.standardError();

    // Concept mastery aggregation over administered items.
    const perConcept = new Map<string, { hits: number; total: number; hardestCorrect: number }>();
    for (const { item, correct } of this.responses) {
      const agg = perConcept.get(item.conceptId) ?? { hits: 0, total: 0, hardestCorrect: 0 };
      agg.total++;
      if (correct) {
        agg.hits++;
        agg.hardestCorrect = Math.max(agg.hardestCorrect, item.difficulty);
      }
      perConcept.set(item.conceptId, agg);
    }

    const entries = [...perConcept.entries()].map(([conceptId, agg]) => ({
      conceptId,
      mastery: agg.hits / agg.total,
      hardestCorrect: agg.hardestCorrect
    }));
    const measured = new Set(entries.map((e) => e.conceptId));

    const strengthMap = entries
      .filter((e) => e.mastery >= 0.8)
      .sort((a, b) => b.mastery - a.mastery || b.hardestCorrect - a.hardestCorrect)
      .map((e) => e.conceptId);

    const gaps = entries
      .filter((e) => e.mastery < 0.8)
      .sort((a, b) => a.mastery - b.mastery || b.hardestCorrect - a.hardestCorrect)
      .map((e) => e.conceptId);

    // Gap map contract is 3–6 concepts; pad from unmeasured concepts (weakest
    // evidence first — deterministic seeded order).
    const gapMap = gaps.slice(0, 6);
    if (gapMap.length < 3) {
      const universe = [...new Set(this.items.map((i) => i.conceptId))].filter((c) => !measured.has(c));
      universe.sort(
        (a, b) =>
          hash32(`${this.seed}:${a}`) - hash32(`${this.seed}:${b}`)
      );
      for (const conceptId of universe) {
        if (gapMap.length >= 3) break;
        gapMap.push(conceptId);
      }
    }

    return {
      calibratedLevel: bandOf(theta),
      abilityEstimate: round2(theta),
      standardError: round3(se),
      itemsAdministered: this.responses.length,
      gapMap,
      strengthMap
    };
  }

  private shouldStop(): boolean {
    const n = this.administered;
    if (n >= CAT_MAX_ITEMS) return true;
    if (n >= CAT_MIN_ITEMS && this.standardError() <= CAT_SE_THRESHOLD) return true;
    return false;
  }

  /** MLE ability estimate via Newton iterations over the 1PL likelihood. */
  private currentAbility(): number {
    if (this.responses.length === 0) {
      // Start at bank midpoint.
      const diffs = this.items.map((i) => i.difficulty);
      return diffs.reduce((s, d) => s + d, 0) / diffs.length;
    }
    let theta = this.items.reduce((s, i) => s + i.difficulty, 0) / this.items.length;
    for (let iter = 0; iter < 30; iter++) {
      let grad = 0;
      let fisher = 0;
      for (const { item, correct } of this.responses) {
        const p = rasch(theta, item.difficulty);
        grad += (correct ? 1 : 0) - p;
        fisher += p * (1 - p);
      }
      if (fisher <= 1e-9) break;
      theta += grad / fisher;
      theta = Math.min(ABILITY_CEIL, Math.max(ABILITY_FLOOR, theta));
    }
    return Math.min(10, Math.max(0, theta));
  }

  private standardError(): number {
    if (this.responses.length === 0) return Number.POSITIVE_INFINITY;
    const theta = this.currentAbility();
    let fisher = 0;
    for (const { item } of this.responses) {
      const p = rasch(theta, item.difficulty);
      fisher += p * (1 - p);
    }
    return fisher > 1e-9 ? 1 / Math.sqrt(fisher) : Number.POSITIVE_INFINITY;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
