import { describe, it, expect } from 'vitest';
import {
  buildCostReport,
  meetsCostGate,
  MAX_SESSION_COST_GBP,
  CACHE_HIT_RATE_MIN,
  TARGET_SESSION_COST_GBP
} from '../../src/evals/cost-report.js';
import type { AiExecutionAuditRow } from '../../src/ai/cost-audit.js';

/**
 * S6-T3 gate `cost.audit.report` (G7): replay analytics over audit rows —
 * blended ≤£0.05/session, cache hit ≥85%, per-model economics, itemized
 * anomalies.
 */

function row(partial: Partial<AiExecutionAuditRow> & { sessionId: string }): AiExecutionAuditRow {
  return {
    modelUsed: 'gpt-4o-mini',
    promptCacheHit: true,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 500,
    costGbp: 0.001,
    ...partial
  };
}

const S1 = '00000000-0000-4000-8000-000000000001';
const S2 = '00000000-0000-4000-8000-000000000002';
const WHALE = '00000000-0000-4000-8000-000000000003';

function healthyCorpus(): AiExecutionAuditRow[] {
  // Two lean sessions: 35 mini calls each at £0.0008 with 90% cache hits.
  const rows: AiExecutionAuditRow[] = [];
  for (const sid of [S1, S2]) {
    for (let i = 0; i < 35; i++) {
      rows.push(row({ sessionId: sid, costGbp: 0.0008, promptCacheHit: i !== 0 }));
    }
  }
  return rows;
}

describe('cost.audit.report — S6-T3 replay economics', () => {
  it('blended cost and cache hit rate computed across grouped sessions', () => {
    const report = buildCostReport(healthyCorpus());
    expect(report.sessions).toBe(2);
    expect(report.totalCalls).toBe(70);
    expect(report.blendedCostPerSessionGbp).toBeCloseTo(0.028, 10); // 35 × 0.0008
    expect(report.cacheHitRate).toBeCloseTo(34 / 35, 5); // module rounds to 6dp
    expect(meetsCostGate(report)).toEqual({ ok: true, reasons: [] });
    expect(report.anomalies).toHaveLength(0);
  });

  it('per-model table sorts by total spend and reports per-model cache rates', () => {
    const rows = [
      ...healthyCorpus(),
      row({ sessionId: S1, modelUsed: 'gpt-4o', costGbp: 0.02 }),
      row({ sessionId: S2, modelUsed: 'gpt-4o', costGbp: 0.01, promptCacheHit: false })
    ];
    const report = buildCostReport(rows);
    expect(report.perModel[0]!.model).toBe('gpt-4o-mini'); // 56 × 0.0008 = .0448 > .03
    expect(report.perModel.find((m) => m.model === 'gpt-4o')!.cacheHitRate).toBeCloseTo(0.5, 6);
    expect(report.perModel.map((m) => m.totalCostGbp)).toEqual(
      [...report.perModel.map((m) => m.totalCostGbp)].sort((a, b) => b - a)
    );
  });

  it('anomalies itemize over-limit sessions sorted by overshoot', () => {
    const rows = [
      row({ sessionId: WHALE, costGbp: 0.04 }),
      row({ sessionId: WHALE, costGbp: 0.03 }),
      row({ sessionId: WHALE, costGbp: 0.01 }), // whale total 0.08 → +0.03 over
      row({ sessionId: S1, costGbp: 0.06 }) // → +0.01 over
    ];
    const report = buildCostReport(rows);
    expect(report.anomalies).toEqual([
      { sessionId: WHALE, costGbp: 0.08, limitGbp: 0.05, overByGbp: 0.03 },
      { sessionId: S1, costGbp: 0.06, limitGbp: 0.05, overByGbp: 0.01 }
    ]);
  });

  it('gate fails with precise reasons when blended cost breaches the cap', () => {
    const rows = Array.from({ length: 35 }, (_, i) => row({ sessionId: S1, costGbp: 0.002, promptCacheHit: true }));
    const report = buildCostReport(rows); // 0.07/session
    const gate = meetsCostGate(report);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.startsWith('BLENDED_COST_ABOVE_LIMIT'))).toBe(true);
    expect(gate.reasons.some((r) => r.startsWith('SESSION_ANOMALIES_PRESENT'))).toBe(true);
  });

  it('gate fails when cache hit rate dips below 85%', () => {
    const rows = [
      row({ sessionId: S1, costGbp: 0.001, promptCacheHit: false }),
      row({ sessionId: S1, costGbp: 0.001, promptCacheHit: false })
    ];
    const gate = meetsCostGate(buildCostReport(rows));
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.startsWith('CACHE_HIT_RATE_BELOW_MIN'))).toBe(true);
  });

  it('a session exactly at the £0.05 limit is not an anomaly (boundary)', () => {
    const report = buildCostReport([
      row({ sessionId: S1, costGbp: 0.025 }),
      row({ sessionId: S1, costGbp: 0.025 })
    ]);
    expect(report.blendedCostPerSessionGbp).toBe(MAX_SESSION_COST_GBP);
    expect(report.anomalies).toHaveLength(0);
    expect(meetsCostGate(report).ok).toBe(true);
  });

  it('empty corpus is zero-safe and fails the cache gate loudly', () => {
    const report = buildCostReport([]);
    expect(report.sessions).toBe(0);
    expect(report.cacheHitRate).toBe(0);
    const gate = meetsCostGate(report);
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain(`CACHE_HIT_RATE_BELOW_MIN (0 < ${CACHE_HIT_RATE_MIN})`);
  });

  it('constants encode the Doc 03 §13/§14 contract', () => {
    expect(MAX_SESSION_COST_GBP).toBe(0.05);
    expect(TARGET_SESSION_COST_GBP).toBe(0.035);
    expect(CACHE_HIT_RATE_MIN).toBe(0.85);
  });
});
