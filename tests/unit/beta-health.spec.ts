import { describe, it, expect } from 'vitest';
import {
  computeBetaHealth,
  goNoGoDecision,
  hasUnboundedQueueGrowth,
  BETA_TARGETS,
  type SessionOutcome
} from '../../src/evals/beta-health.js';
import { runGoldenEvals, buildGoldenCorpus, referenceResponder } from '../../src/evals/golden-evals.js';
import { buildCostReport } from '../../src/evals/cost-report.js';
import type { AiExecutionAuditRow } from '../../src/ai/cost-audit.js';

/**
 * S6-T5/T6 — beta.health gate and the PRD §11 Go/No-Go aggregation.
 */

function session(partial: Partial<SessionOutcome> & { sessionId: string }): SessionOutcome {
  return {
    wave: 'WAVE_2_150',
    completed: true,
    crashed: false,
    turnLatenciesMs: [400, 500, 600],
    knowledgeGainPct: 40,
    ...partial
  };
}

function healthyFleet(): SessionOutcome[] {
  return Array.from({ length: 50 }, (_, i) =>
    session({
      sessionId: `s${i}`,
      turnLatenciesMs: [300 + (i % 7) * 10],
      knowledgeGainPct: 36 + (i % 5)
    })
  );
}

const greenEvals = () => runGoldenEvals(buildGoldenCorpus(), referenceResponder);
const greenCost = (): ReturnType<typeof buildCostReport> => {
  const rows: AiExecutionAuditRow[] = [];
  for (let i = 0; i < 35; i++) {
    rows.push({
      sessionId: '00000000-0000-4000-8000-00000000abcd',
      modelUsed: 'gpt-4o-mini',
      promptCacheHit: i !== 0,
      inputTokens: 100,
      outputTokens: 100,
      latencyMs: 400,
      costGbp: 0.0008
    });
  }
  return buildCostReport(rows);
};

describe('beta.health — S6-T5 staged-wave telemetry', () => {
  it('healthy fleet clears every beta target', () => {
    const h = computeBetaHealth(healthyFleet());
    expect(h.sessions).toBe(50);
    expect(h.crashFreeSessionRate).toBeGreaterThanOrEqual(BETA_TARGETS.crashFreeSessionRateMin);
    expect(h.completionRate).toBeGreaterThanOrEqual(BETA_TARGETS.completionRateMin);
    expect(h.p95TurnLatencyMs).toBeLessThanOrEqual(BETA_TARGETS.p95TurnLatencyMsMax);
    expect(h.sev1Count).toBe(0);
    expect(h.medianKnowledgeGainPct).toBeGreaterThanOrEqual(BETA_TARGETS.knowledgeGainTrendMinPct);
    expect(h.unboundedQueueGrowth).toBe(false);
  });

  it('crash-free rate, completion and P95 latency reduce across waves', () => {
    const h = computeBetaHealth([
      session({ sessionId: 'a' }),
      session({ sessionId: 'b', completed: false }),
      session({ sessionId: 'c', crashed: true, turnLatenciesMs: [900, 5000] })
    ]);
    expect(h.crashFreeSessionRate).toBe(0.6667);
    expect(h.completionRate).toBe(0.6667);
    expect(h.p95TurnLatencyMs).toBe(5000);
  });

  it('median knowledge gain ignores sessions without scores', () => {
    const h = computeBetaHealth([
      session({ sessionId: 'a', knowledgeGainPct: 30 }),
      session({ sessionId: 'b', knowledgeGainPct: 50 }),
      session({ sessionId: 'c', knowledgeGainPct: undefined })
    ]);
    expect(h.medianKnowledgeGainPct).toBe(30); // nearest-rank p50 of [30,50] → lower
  });

  it('queue growth detector flags monotonic growth only', () => {
    expect(hasUnboundedQueueGrowth([[0, 1, 2, 5]])).toBe(true);
    expect(hasUnboundedQueueGrowth([[5, 5, 5]])).toBe(false); // flat healthy queue
    expect(hasUnboundedQueueGrowth([[0, 9, 4]])).toBe(false); // dips back down
    expect(hasUnboundedQueueGrowth([[0, 1]])).toBe(false); // too few samples
  });

  it('empty fleet is cold-start safe', () => {
    const h = computeBetaHealth([]);
    expect(h.sessions).toBe(0);
    expect(h.crashFreeSessionRate).toBe(1);
    expect(h.completionRate).toBe(0);
  });
});

describe('go/no-go — S6-T6 exit review aggregation', () => {
  it('all-green inputs produce GO with an empty launch-blocking list', () => {
    const decision = goNoGoDecision({
      evals: greenEvals(),
      costs: greenCost(),
      health: computeBetaHealth(healthyFleet())
    });
    expect(decision.recommendation).toBe('GO');
    expect(decision.blockers).toEqual([]);
  });

  it.each([
    ['eval gate red', { evals: false, cost: true, health: true }, ['EVAL_GATE_RED']],
    [
      'cost red (cache still healthy)',
      { evals: true, cost: false, health: true },
      ['BLENDED_COST_OVER_LIMIT']
    ],
    [
      'health red',
      { evals: true, cost: true, health: false },
      null // asserted via containment below — multiple blockers possible
    ]
  ])('%s blocks the GA recommendation', (_name, gates, expectedBlockers) => {
    const evals = gates.evals ? greenEvals() : { ...greenEvals(), meetsGates: false };
    const costs = gates.cost
      ? greenCost()
      : buildCostReport(
          Array.from({ length: 35 }, (_, i) => ({
            sessionId: 'x',
            modelUsed: 'gpt-4o',
            promptCacheHit: i !== 0,
            inputTokens: 1000,
            outputTokens: 2000,
            latencyMs: 800,
            costGbp: 0.003
          }))
        );
    const health = gates.health
      ? computeBetaHealth(healthyFleet())
      : computeBetaHealth([
          session({ sessionId: 'bad', crashed: true, sev1Incident: true }),
          ...Array.from({ length: 60 }, (_, i) =>
            session({ sessionId: `w${i}`, completed: false, turnLatenciesMs: [3000], knowledgeGainPct: 10 })
          )
        ]);

    const decision = goNoGoDecision({ evals, costs, health });
    expect(decision.recommendation).toBe('NO_GO');
    if (expectedBlockers) {
      for (const b of expectedBlockers) expect(decision.blockers).toContain(b);
    }
  });

  it('sev-1 incident alone is launch-blocking even with green KPIs', () => {
    const health = computeBetaHealth([session({ sessionId: 's1', sev1Incident: true })]);
    const decision = goNoGoDecision({ evals: greenEvals(), costs: greenCost(), health });
    expect(decision.recommendation).toBe('NO_GO');
    expect(decision.blockers).toEqual(['SEV1_INCIDENT_PRESENT']);
  });
});
