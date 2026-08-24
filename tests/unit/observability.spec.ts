import { describe, it, expect } from 'vitest';
import {
  computePlatformMetrics,
  evaluateAlerts,
  percentile,
  OBSERVABILITY_THRESHOLDS,
  type TurnTelemetry,
  type DecayLagSample
} from '../../src/observability/metrics.js';

/**
 * S6-T4 dashboards: TTFT P95 <1200ms (Doc 03 §14), stream error rate,
 * checkpoint commit P95, decay chunk lag — plus typed on-call alerts.
 */

function turn(partial: Partial<TurnTelemetry> = {}): TurnTelemetry {
  return {
    sessionId: 's',
    mode: 'TUTOR',
    ttftMs: 400,
    streamError: false,
    ...partial
  };
}

describe('observability.metrics — S6-T4 platform telemetry', () => {
  it('percentile uses nearest-rank semantics', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0.95)).toBe(5);
    expect(percentile([10, 1, 7, 3], 0.75)).toBe(7);
    expect(percentile([42], 0.99)).toBe(42);
    expect(() => percentile([], 0.95)).toThrow('empty');
  });

  it('reduces TTFT/error/commit/decay series', () => {
    const turns = [
      turn({ ttftMs: 100 }),
      turn({ ttftMs: 200, checkpointCommitMs: 40 }),
      turn({ ttftMs: 300 }),
      turn({ ttftMs: 400, streamError: true }),
      turn({ ttftMs: 5000, checkpointCommitMs: 900 })
    ];
    const lags: DecayLagSample[] = [{ chunkId: 'a', lagSeconds: 30 }, { chunkId: 'b', lagSeconds: 120 }];

    const m = computePlatformMetrics(turns, lags);
    expect(m.turns).toBe(5);
    expect(m.ttftP95Ms).toBe(5000);
    expect(m.ttftMedianMs).toBe(300);
    expect(m.streamErrorRate).toBe(0.2);
    expect(m.checkpointCommitP95Ms).toBe(900);
    expect(m.decayChunkLagMaxSeconds).toBe(120);
    expect(m.decayChunkLagAvgSeconds).toBe(75);
  });

  it('null-safe when no checkpoints or decay samples exist', () => {
    const m = computePlatformMetrics([turn()], []);
    expect(m.checkpointCommitP95Ms).toBeNull();
    expect(m.decayChunkLagMaxSeconds).toBeNull();
  });

  it('zero-turn input is zero-safe for dashboards at cold start', () => {
    const m = computePlatformMetrics([], []);
    expect(m.turns).toBe(0);
    expect(m.ttftP95Ms).toBe(0);
    expect(m.streamErrorRate).toBe(0);
  });

  it('alerts: quiet metrics raise nothing', () => {
    const m = computePlatformMetrics(
      [turn({ ttftMs: 600, checkpointCommitMs: 80 })],
      [{ chunkId: 'a', lagSeconds: 60 }]
    );
    expect(evaluateAlerts(m, 0.9)).toEqual([]);
  });

  it('alerts: TTFT breach pages with observed/threshold detail', () => {
    const m = computePlatformMetrics(
      [turn(), turn({ ttftMs: 2000 })],
      []
    );
    // P95 of two samples = max → 2000 > 1200.
    const alerts = evaluateAlerts(m);
    const ttft = alerts.find((a) => a.code === 'TTFT_P95_BREACH')!;
    expect(ttft.severity).toBe('page');
    expect(ttft.observed).toBe(2000);
    expect(ttft.threshold).toBe(OBSERVABILITY_THRESHOLDS.ttftP95Ms);
  });

  it('alerts: stream errors above 1% page; checkpoint and decay warn', () => {
    const turns = [
      turn({ streamError: true }),
      turn({ streamError: true }),
      turn({ streamError: true }),
      turn(),
      ...Array.from({ length: 196 }, (_, i) => turn({ checkpointCommitMs: i < 20 ? 400 : 50 }))
    ];
    const m = computePlatformMetrics(turns, [{ chunkId: 'a', lagSeconds: 3600 }]);
    const codes = new Set(evaluateAlerts(m).map((a) => a.code));
    expect(codes).toEqual(
      new Set(['STREAM_ERROR_RATE_BREACH', 'CHECKPOINT_COMMIT_P95_BREACH', 'DECAY_CHUNK_LAG_BREACH'])
    );
  });

  it('alerts: cache hit rate below floor warns when provided', () => {
    const m = computePlatformMetrics([turn()], []);
    const alerts = evaluateAlerts(m, 0.7);
    expect(alerts.map((a) => a.code)).toContain('CACHE_HIT_RATE_BREACH');
    // Absent cache metric raises no cache alert.
    expect(evaluateAlerts(m).map((a) => a.code)).not.toContain('CACHE_HIT_RATE_BREACH');
  });
});
