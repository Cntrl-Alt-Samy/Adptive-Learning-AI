import { describe, it, expect } from 'vitest';
import {
  runLoadSim,
  certifyLoad,
  LOAD_ERROR_RATE_MAX,
  LOAD_TTFT_P95_MAX_MS,
  type LoadSimExecutorContext
} from '../../src/scale/load-sim.js';
import { PoolGuard } from '../../src/scale/pool-guard.js';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * S7-T1 — load certification harness semantics (G8): think-time pacing,
 * persona-mode mix, limiter occupancy, and the Doc 03 §14 budgets.
 */

function latencyModel(ctx: LoadSimExecutorContext): Promise<{ ttftMs: number }> {
  // Deterministic-ish latency: 40–120ms scaled by mode weight bucket.
  const base = ctx.mode === 'TUTOR' ? 80 : 50;
  return sleep(base).then(() => ({ ttftMs: base }));
}

describe('load.sim — S7-T1 certification harness', () => {
  it('executes the full turn matrix with healthy budgets', async () => {
    const result = await runLoadSim({
      concurrentSessions: 100,
      turnsPerSession: 5,
      seed: 42,
      thinkTimeMeanMs: 2,
      executor: latencyModel
    });
    expect(result.turnsExecuted).toBe(500);
    expect(result.sessionsCompleted).toBe(100);
    expect(result.errors).toBe(0);
    expect(result.errorRate).toBeLessThan(LOAD_ERROR_RATE_MAX);
    expect(result.ttftP95Ms).toBeLessThan(LOAD_TTFT_P95_MAX_MS);
    expect(result.ok).toBe(true);
  }, 60_000);

  it('mode mix honours weights across many turns', async () => {
    const seen: Record<string, number> = {};
    await runLoadSim({
      concurrentSessions: 20,
      turnsPerSession: 25,
      seed: 9,
      thinkTimeMeanMs: 0,
      executor: async (ctx) => {
        seen[ctx.mode] = (seen[ctx.mode] ?? 0) + 1;
        return { ttftMs: 1 };
      }
    });
    const total = Object.values(seen).reduce((a, b) => a + b, 0);
    expect(total).toBe(500);
    // TUTOR is the heaviest bucket in the default mix.
    expect(seen['TUTOR']!).toBeGreaterThan(seen['SESSION_REVIEWER']! * 3);
  }, 30_000);

  it('executor failures surface in errorRate and fail certification', async () => {
    let calls = 0;
    const result = await runLoadSim({
      concurrentSessions: 10,
      turnsPerSession: 10,
      seed: 5,
      thinkTimeMeanMs: 0,
      executor: async () => {
        calls++;
        if (calls % 10 === 0) throw new Error('upstream 500'); // ~10% failure
        return { ttftMs: 30 };
      }
    });
    expect(result.errors).toBeGreaterThan(0);
    expect(result.errorRate).toBeGreaterThanOrEqual(LOAD_ERROR_RATE_MAX);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.startsWith('ERROR_RATE_BREACH'))).toBe(true);
  });

  it('limiter caps executor concurrency at the pool cap', async () => {
    const guard = new PoolGuard({ maxConcurrent: 5, acquireTimeoutMs: 2_000 });
    let peak = 0;
    let current = 0;
    const result = await runLoadSim({
      concurrentSessions: 30,
      turnsPerSession: 4,
      seed: 11,
      thinkTimeMeanMs: 0,
      limiter: guard,
      executor: async () => {
        current++;
        peak = Math.max(peak, current);
        await sleep(4);
        current--;
        return { ttftMs: 4 };
      }
    });
    expect(peak).toBeLessThanOrEqual(5);
    expect(result.poolMaxObserved).toBeUndefined(); // sim reports guard metrics via caller
    expect(guard.snapshot().maxObservedInFlight).toBeLessThanOrEqual(5);
    expect(result.ok).toBe(true); // tiny latencies stay within budget
  }, 60_000);

  it('soak mode keeps regenerating turns until the wall-clock budget', async () => {
    const fixed = await runLoadSim({
      concurrentSessions: 4,
      turnsPerSession: 3,
      seed: 3,
      thinkTimeMeanMs: 0,
      executor: async () => ({ ttftMs: 1 })
    });
    const soaked = await runLoadSim({
      concurrentSessions: 4,
      turnsPerSession: 3,
      seed: 3,
      thinkTimeMeanMs: 0,
      soakDurationMs: 120,
      executor: async () => ({ ttftMs: 1 })
    });
    expect(fixed.turnsExecuted).toBe(12);
    expect(soaked.turnsExecuted).toBeGreaterThan(12);
  }, 30_000);

  it('certifyLoad enumerates precise breach reasons', () => {
    const ok = certifyLoad({ errorRate: 0.0005, ttftP95Ms: 900, turnsExecuted: 100 });
    expect(ok.ok).toBe(true);

    const bad = certifyLoad({ errorRate: 0.02, ttftP95Ms: 1500, turnsExecuted: 100 });
    expect(bad.ok).toBe(false);
    expect(bad.reasons).toHaveLength(2);
    expect(bad.reasons[0]).toContain('ERROR_RATE_BREACH');
    expect(bad.reasons[1]).toContain('TTFT_P95_BREACH');

    expect(certifyLoad({ errorRate: 0, ttftP95Ms: 10, turnsExecuted: 0 }).reasons).toEqual([
      'NO_TURNS_EXECUTED'
    ]);
  });

  it('constructor-level option validation', async () => {
    await expect(
      runLoadSim({
        concurrentSessions: 0,
        turnsPerSession: 1,
        seed: 1,
        thinkTimeMeanMs: 1,
        executor: async () => ({ ttftMs: 1 })
      })
    ).rejects.toThrow('positive integer');
  });
});
