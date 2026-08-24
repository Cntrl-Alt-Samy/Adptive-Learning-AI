import type { EvalReport } from './golden-evals.js';
import type { CostReport } from './cost-report.js';

/**
 * S6-T5/T6 — Closed-beta health + exit review (Doc 07 TASK 4.3.2, PRD §11;
 * Sprint-06 gates `beta.health` and the GA Go/No-Go record).
 *
 * Staged waves 50 → 150 → 500 feed session outcomes in; `computeBetaHealth`
 * reduces them to the exit metrics (crash-free ≥99.5%, completion ≥75%,
 * P95 turn latency within budget, Sev-1 = 0, knowledge-gain trend ≥35%),
 * and `goNoGoDecision` aggregates evals + cost + health into the recorded
 * recommendation with an explicit launch-blocking list.
 */

export type BetaWave = 'WAVE_1_50' | 'WAVE_2_150' | 'WAVE_3_500';

export const BETA_TARGETS = {
  /** beta.health: crash-free sessions. */
  crashFreeSessionRateMin: 0.995,
  /** PRD §11 exit: completion rate. */
  completionRateMin: 0.75,
  /** Turn latency budget (Doc 03 §14). */
  p95TurnLatencyMsMax: 1200,
  /** Knowledge gain trend target (Doc 03 §12). */
  knowledgeGainTrendMinPct: 35
} as const;

export interface SessionOutcome {
  sessionId: string;
  wave: BetaWave;
  /** Reached REVIEW_COMPLETE / SPACED_REP_SCHEDULED. */
  completed: boolean;
  /** Unhandled client/server crash during the session. */
  crashed: boolean;
  sev1Incident?: boolean;
  turnLatenciesMs: number[];
  /** Session-level pre/post knowledge gain % (from the progress matrix). */
  knowledgeGainPct?: number;
  /** Queue depth samples across the session for growth detection. */
  queueDepthSamples?: number[];
}

export interface BetaHealth {
  sessions: number;
  crashFreeSessionRate: number;
  completionRate: number;
  p95TurnLatencyMs: number;
  sev1Count: number;
  medianKnowledgeGainPct: number | null;
  /** True when queue depth grows monotonically across ≥3 samples (leak signal). */
  unboundedQueueGrowth: boolean;
}

function percentileNearestRank(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[idx]!;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Detect monotonic non-decreasing queue growth over ≥3 samples. */
export function hasUnboundedQueueGrowth(samplesBySession: number[][]): boolean {
  return samplesBySession.some((samples) => {
    if (samples.length < 3) return false;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i]! < samples[i - 1]!) return false;
    }
    // Strictly increasing at least once — flat zero queues are healthy.
    return samples[samples.length - 1]! > samples[0]!;
  });
}

export function computeBetaHealth(sessions: SessionOutcome[]): BetaHealth {
  const n = sessions.length;
  if (n === 0) {
    return {
      sessions: 0,
      crashFreeSessionRate: 1,
      completionRate: 0,
      p95TurnLatencyMs: 0,
      sev1Count: 0,
      medianKnowledgeGainPct: null,
      unboundedQueueGrowth: false
    };
  }

  const latencies = sessions.flatMap((s) => s.turnLatenciesMs);
  const gains = sessions.map((s) => s.knowledgeGainPct).filter((g): g is number => typeof g === 'number');

  return {
    sessions: n,
    crashFreeSessionRate: round4(sessions.filter((s) => !s.crashed).length / n),
    completionRate: round4(sessions.filter((s) => s.completed).length / n),
    p95TurnLatencyMs: latencies.length > 0 ? percentileNearestRank(latencies, 0.95) : 0,
    sev1Count: sessions.filter((s) => s.sev1Incident === true).length,
    medianKnowledgeGainPct:
      gains.length > 0 ? percentileNearestRank(gains, 0.5) : null,
    unboundedQueueGrowth: hasUnboundedQueueGrowth(
      sessions.map((s) => s.queueDepthSamples ?? [])
    )
  };
}

export type BlockerCode =
  | 'EVAL_GATE_RED'
  | 'BLENDED_COST_OVER_LIMIT'
  | 'CACHE_HIT_RATE_LOW'
  | 'CRASH_FREE_RATE_LOW'
  | 'COMPLETION_RATE_LOW'
  | 'TURN_LATENCY_OVER_BUDGET'
  | 'SEV1_INCIDENT_PRESENT'
  | 'KNOWLEDGE_GAIN_TREND_LOW'
  | 'QUEUE_GROWTH_UNBOUNDED';

export interface GoNoGoDecision {
  recommendation: 'GO' | 'NO_GO';
  blockers: BlockerCode[];
}

/**
 * PRD §11 exit aggregation. Any blocker ⇒ NO_GO; an empty list records the GO
 * recommendation for the launch review.
 */
export function goNoGoDecision(input: {
  evals: EvalReport;
  costs: CostReport;
  health: BetaHealth;
}): GoNoGoDecision {
  const blockers = new Set<BlockerCode>();

  if (!input.evals.meetsGates) blockers.add('EVAL_GATE_RED');
  if (input.costs.blendedCostPerSessionGbp > 0.05) blockers.add('BLENDED_COST_OVER_LIMIT');
  if (input.costs.cacheHitRate < 0.85) blockers.add('CACHE_HIT_RATE_LOW');

  const h = input.health;
  if (h.crashFreeSessionRate < BETA_TARGETS.crashFreeSessionRateMin) blockers.add('CRASH_FREE_RATE_LOW');
  if (h.completionRate < BETA_TARGETS.completionRateMin) blockers.add('COMPLETION_RATE_LOW');
  if (h.p95TurnLatencyMs > BETA_TARGETS.p95TurnLatencyMsMax) blockers.add('TURN_LATENCY_OVER_BUDGET');
  if (h.sev1Count > 0) blockers.add('SEV1_INCIDENT_PRESENT');
  if (
    h.medianKnowledgeGainPct !== null &&
    h.medianKnowledgeGainPct < BETA_TARGETS.knowledgeGainTrendMinPct
  ) {
    blockers.add('KNOWLEDGE_GAIN_TREND_LOW');
  }
  if (h.unboundedQueueGrowth) blockers.add('QUEUE_GROWTH_UNBOUNDED');

  return { recommendation: blockers.size === 0 ? 'GO' : 'NO_GO', blockers: [...blockers].sort() };
}
