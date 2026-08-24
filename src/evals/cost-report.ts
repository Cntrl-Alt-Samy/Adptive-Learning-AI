import type { AiExecutionAuditRow } from '../ai/cost-audit.js';

/**
 * S6-T3 — Cost verification replay (Doc 03 §14; Sprint-06 gate `cost.audit.report`
 * G7). Replays ai_execution_audits rows through the blended-cost model:
 *
 *  - blended inference cost per session ≤ £0.05 (target ~£0.035)
 *  - prompt cache hit rate ≥ 85%
 *  - per-model economics table for router tuning
 *  - anomalies itemized with owner-ready detail (session + overshoot)
 */

export const MAX_SESSION_COST_GBP = 0.05;
export const TARGET_SESSION_COST_GBP = 0.035;
export const CACHE_HIT_RATE_MIN = 0.85;

export interface PerModelEconomics {
  model: string;
  calls: number;
  totalCostGbp: number;
  avgCostGbp: number;
  cacheHitRate: number;
}

export interface CostAnomaly {
  sessionId: string;
  costGbp: number;
  limitGbp: number;
  overByGbp: number;
}

export interface CostReport {
  sessions: number;
  totalCalls: number;
  totalCostGbp: number;
  blendedCostPerSessionGbp: number;
  cacheHitRate: number;
  /** Descending by totalCostGbp — the levers for router/breaker tuning. */
  perModel: PerModelEconomics[];
  /** Descending by overByGbp. */
  anomalies: CostAnomaly[];
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Replay audit rows into the gated cost report. Rows may span many sessions;
 * grouping is by sessionId exactly as production billing will attribute it.
 */
export function buildCostReport(rows: AiExecutionAuditRow[]): CostReport {
  const bySession = new Map<string, AiExecutionAuditRow[]>();
  for (const row of rows) {
    const bucket = bySession.get(row.sessionId);
    if (bucket) bucket.push(row);
    else bySession.set(row.sessionId, [row]);
  }

  let totalCost = 0;
  for (const row of rows) totalCost += row.costGbp;

  const anomalies: CostAnomaly[] = [];
  for (const [sessionId, calls] of bySession) {
    const cost = calls.reduce((s, c) => s + c.costGbp, 0);
    if (cost > MAX_SESSION_COST_GBP) {
      anomalies.push({
        sessionId,
        costGbp: round6(cost),
        limitGbp: MAX_SESSION_COST_GBP,
        overByGbp: round6(cost - MAX_SESSION_COST_GBP)
      });
    }
  }
  anomalies.sort((a, b) => b.overByGbp - a.overByGbp);

  const byModel = new Map<string, AiExecutionAuditRow[]>();
  for (const row of rows) {
    const bucket = byModel.get(row.modelUsed);
    if (bucket) bucket.push(row);
    else byModel.set(row.modelUsed, [row]);
  }
  const perModel: PerModelEconomics[] = [...byModel.entries()]
    .map(([model, calls]) => {
      const total = calls.reduce((s, c) => s + c.costGbp, 0);
      return {
        model,
        calls: calls.length,
        totalCostGbp: round6(total),
        avgCostGbp: round6(total / calls.length),
        cacheHitRate: round6(calls.filter((c) => c.promptCacheHit).length / calls.length)
      };
    })
    .sort((a, b) => b.totalCostGbp - a.totalCostGbp);

  const sessions = bySession.size;
  const hits = rows.filter((r) => r.promptCacheHit).length;

  return {
    sessions,
    totalCalls: rows.length,
    totalCostGbp: round6(totalCost),
    blendedCostPerSessionGbp: sessions === 0 ? 0 : round6(totalCost / sessions),
    cacheHitRate: rows.length === 0 ? 0 : round6(hits / rows.length),
    perModel,
    anomalies
  };
}

export interface GateResult {
  ok: boolean;
  reasons: string[];
}

/** G7 pass condition: ≤£0.05/session blended AND cache hit ≥85%. */
export function meetsCostGate(report: CostReport): GateResult {
  const reasons: string[] = [];
  if (report.blendedCostPerSessionGbp > MAX_SESSION_COST_GBP) {
    reasons.push(
      `BLENDED_COST_ABOVE_LIMIT (${report.blendedCostPerSessionGbp} > ${MAX_SESSION_COST_GBP})`
    );
  }
  if (report.cacheHitRate < CACHE_HIT_RATE_MIN) {
    reasons.push(`CACHE_HIT_RATE_BELOW_MIN (${report.cacheHitRate} < ${CACHE_HIT_RATE_MIN})`);
  }
  if (report.anomalies.length > 0) {
    reasons.push(`SESSION_ANOMALIES_PRESENT (${report.anomalies.length})`);
  }
  return { ok: reasons.length === 0, reasons };
}
