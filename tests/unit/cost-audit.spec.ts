import { describe, it, expect } from 'vitest';
import {
  computeCostGbp,
  getPricing,
  computeCacheHitRate,
  InMemoryAuditSink
} from '../../src/ai/cost-audit.js';

describe('cost-audit gate', () => {
  it('prices known models from the published table (USD→GBP)', () => {
    expect(getPricing('gpt-4o')).toMatchObject({ inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 });
    // 1M in + 1M out on gpt-4o @ 0.79 = £9.875
    expect(computeCostGbp('gpt-4o', 1_000_000, 1_000_000)).toBeCloseTo(9.875, 6);
    // gpt-4o-mini is ~16x cheaper: (0.15+0.60)*0.79 = 0.5925
    expect(computeCostGbp('gpt-4o-mini', 1_000_000, 1_000_000)).toBeCloseTo(0.5925, 6);
  });

  it('unknown models price conservatively at Tier-1 rates', () => {
    const p = getPricing('totally-custom-model');
    expect(p).toEqual(getPricing('gpt-4o'));
  });

  it('tiny turns produce sub-penny costs without float dust', () => {
    const c = computeCostGbp('gpt-4o-mini', 1_200, 320);
    expect(c).toBeGreaterThan(0);
    expect(Number(c.toFixed(9))).toBe(c);
  });

  it('cache-hit rate metric computes the dashboard target numerator', () => {
    expect(computeCacheHitRate([])).toBe(0);
    expect(computeCacheHitRate([{ promptCacheHit: true }, { promptCacheHit: false }, { promptCacheHit: true }])).toBeCloseTo(2 / 3);
  });

  it('InMemoryAuditSink enriches rows with costGbp and lists per-session', async () => {
    const sink = new InMemoryAuditSink();
    await sink.writeAiExecutionAudit({
      sessionId: 'sess-1',
      modelUsed: 'gpt-4o',
      promptCacheHit: true,
      inputTokens: 1100,
      outputTokens: 350,
      latencyMs: 900
    });
    await sink.writeAiExecutionAudit({
      sessionId: 'sess-2',
      modelUsed: 'gpt-4o-mini',
      promptCacheHit: false,
      inputTokens: 500,
      outputTokens: 200,
      latencyMs: 300
    });
    const all = await sink.listAudits();
    expect(all).toHaveLength(2);
    expect(all[0]?.costGbp).toBeGreaterThan(0);

    const only = await sink.listAudits('sess-2');
    expect(only).toHaveLength(1);
    expect(only[0]?.modelUsed).toBe('gpt-4o-mini');
  });
});
