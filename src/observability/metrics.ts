/**
 * S6-T4 — Observability completion (Doc 04 §15; Sprint-06 dashboards).
 *
 * Pure reducers over telemetry rows producing the dashboard series:
 * TTFT P95, stream error rate, checkpoint commit latency P95, decay chunk
 * lag, strike-breaker event volume, and cache hit rate. `evaluateAlerts`
 * maps breaches onto typed on-call alerts with Doc 03 §14 / Doc 04 §15
 * default budgets.
 */

export interface TurnTelemetry {
  sessionId: string;
  mode: string;
  /** Time to first streamed token (ms). */
  ttftMs: number;
  /** Terminal stream error (typed SSE error event) for this turn. */
  streamError: boolean;
  /** Checkpoint two-phase-commit duration (ms), when a checkpoint ran. */
  checkpointCommitMs?: number;
}

export interface DecayLagSample {
  chunkId: string;
  /** Seconds between scheduled decay slot and actual worker drain. */
  lagSeconds: number;
}

export interface PlatformMetrics {
  turns: number;
  ttftP95Ms: number;
  ttftMedianMs: number;
  streamErrorRate: number;
  checkpointCommitP95Ms: number | null;
  decayChunkLagMaxSeconds: number | null;
  decayChunkLagAvgSeconds: number | null;
}

/** Nearest-rank percentile over an unsorted copy of the input. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of empty set');
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[idx]!;
}

export const OBSERVABILITY_THRESHOLDS = {
  /** Doc 03 §14: P95 first-token latency < 1200 ms. */
  ttftP95Ms: 1200,
  /** Doc 04 §15: stream error rate under 1%. */
  streamErrorRate: 0.01,
  /** Checkpoint commit P95 budget (ms) — two-phase write must stay invisible. */
  checkpointCommitP95Ms: 250,
  /** Nightly Ebbinghaus decay may lag at most one schedule slot (15 min). */
  decayChunkLagSeconds: 900,
  /** Cache hit floor from the cost gate (shared KPI). */
  cacheHitRateMin: 0.85
} as const;

export type AlertSeverity = 'page' | 'warn';

export type AlertCode =
  | 'TTFT_P95_BREACH'
  | 'STREAM_ERROR_RATE_BREACH'
  | 'CHECKPOINT_COMMIT_P95_BREACH'
  | 'DECAY_CHUNK_LAG_BREACH'
  | 'CACHE_HIT_RATE_BREACH';

export interface Alert {
  code: AlertCode;
  severity: AlertSeverity;
  observed: number;
  threshold: number;
  message: string;
}

export function computePlatformMetrics(
  turns: TurnTelemetry[],
  decayLags: DecayLagSample[]
): PlatformMetrics {
  if (turns.length === 0) {
    return {
      turns: 0,
      ttftP95Ms: 0,
      ttftMedianMs: 0,
      streamErrorRate: 0,
      checkpointCommitP95Ms: null,
      decayChunkLagMaxSeconds: null,
      decayChunkLagAvgSeconds: null
    };
  }

  const ttfts = turns.map((t) => t.ttftMs);
  const commits = turns.map((t) => t.checkpointCommitMs).filter((v): v is number => typeof v === 'number');
  const errors = turns.filter((t) => t.streamError).length;

  return {
    turns: turns.length,
    ttftP95Ms: percentile(ttfts, 0.95),
    ttftMedianMs: percentile(ttfts, 0.5),
    streamErrorRate: Math.round((errors / turns.length) * 10000) / 10000,
    checkpointCommitP95Ms: commits.length > 0 ? percentile(commits, 0.95) : null,
    decayChunkLagMaxSeconds:
      decayLags.length > 0 ? Math.max(...decayLags.map((d) => d.lagSeconds)) : null,
    decayChunkLagAvgSeconds:
      decayLags.length > 0
        ? Math.round((decayLags.reduce((s, d) => s + d.lagSeconds, 0) / decayLags.length) * 100) / 100
        : null
  };
}

/**
 * Map metrics against budgets. Page-severity = user-facing latency/error
 * budgets; warn = background pipeline health.
 */
export function evaluateAlerts(
  metrics: PlatformMetrics,
  cacheHitRate?: number,
  thresholds: typeof OBSERVABILITY_THRESHOLDS = OBSERVABILITY_THRESHOLDS
): Alert[] {
  const alerts: Alert[] = [];
  if (metrics.ttftP95Ms > thresholds.ttftP95Ms) {
    alerts.push({
      code: 'TTFT_P95_BREACH',
      severity: 'page',
      observed: metrics.ttftP95Ms,
      threshold: thresholds.ttftP95Ms,
      message: `TTFT P95 ${metrics.ttftP95Ms}ms exceeds ${thresholds.ttftP95Ms}ms budget`
    });
  }
  if (metrics.streamErrorRate > thresholds.streamErrorRate) {
    alerts.push({
      code: 'STREAM_ERROR_RATE_BREACH',
      severity: 'page',
      observed: metrics.streamErrorRate,
      threshold: thresholds.streamErrorRate,
      message: `Stream error rate ${(metrics.streamErrorRate * 100).toFixed(2)}% above ${(thresholds.streamErrorRate * 100).toFixed(0)}%`
    });
  }
  if (
    metrics.checkpointCommitP95Ms !== null &&
    metrics.checkpointCommitP95Ms > thresholds.checkpointCommitP95Ms
  ) {
    alerts.push({
      code: 'CHECKPOINT_COMMIT_P95_BREACH',
      severity: 'warn',
      observed: metrics.checkpointCommitP95Ms,
      threshold: thresholds.checkpointCommitP95Ms,
      message: `Checkpoint commit P95 ${metrics.checkpointCommitP95Ms}ms exceeds ${thresholds.checkpointCommitP95Ms}ms`
    });
  }
  if (metrics.decayChunkLagMaxSeconds !== null && metrics.decayChunkLagMaxSeconds > thresholds.decayChunkLagSeconds) {
    alerts.push({
      code: 'DECAY_CHUNK_LAG_BREACH',
      severity: 'warn',
      observed: metrics.decayChunkLagMaxSeconds,
      threshold: thresholds.decayChunkLagSeconds,
      message: `Decay chunk lag peaked at ${metrics.decayChunkLagMaxSeconds}s (budget ${thresholds.decayChunkLagSeconds}s)`
    });
  }
  if (typeof cacheHitRate === 'number' && cacheHitRate < thresholds.cacheHitRateMin) {
    alerts.push({
      code: 'CACHE_HIT_RATE_BREACH',
      severity: 'warn',
      observed: cacheHitRate,
      threshold: thresholds.cacheHitRateMin,
      message: `Prompt cache hit rate ${(cacheHitRate * 100).toFixed(1)}% below ${(thresholds.cacheHitRateMin * 100).toFixed(0)}%`
    });
  }
  return alerts;
}
