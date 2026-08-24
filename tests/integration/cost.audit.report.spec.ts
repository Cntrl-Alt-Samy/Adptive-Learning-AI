import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { PgAuditSink } from '../../src/ai/cost-audit.js';
import { buildCostReport, meetsCostGate, MAX_SESSION_COST_GBP, CACHE_HIT_RATE_MIN } from '../../src/evals/cost-report.js';

/**
 * cost.audit.report.spec â€” Sprint-6 G7 gate against REAL Postgres.
 * Seeds representative sessions through PgAuditSink (true pricing math),
 * replays the audit rows through the cost report, and asserts the Doc 03
 * Â§14 unit-economics gates plus anomaly itemization.
 */
const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL;
const MIGRATION = join(process.cwd(), 'db', 'migrations', '20260822_learnos_initial_schema.sql');

async function canConnect(url: string): Promise<boolean> {
  try {
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

const suite = TEST_URL && (await canConnect(TEST_URL)) ? describe : describe.skip;

suite('cost.audit.report.spec â€” S6-T3 gate', () => {
  let admin: pg.Client;
  const sessionIds: string[] = [];

  beforeAll(async () => {
    if (!TEST_URL) throw new Error('unreachable');
    admin = new pg.Client({ connectionString: TEST_URL });
    await admin.connect();
    await admin.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO current_user;
      GRANT ALL ON SCHEMA public TO public;
    `);
    await admin.query(readFileSync(MIGRATION, 'utf8'));
    await admin.query(`GRANT app_learner, app_instructor, app_admin, app_aggregator TO current_user`);
    await admin.query(`INSERT INTO subjects (id, title, category) VALUES ('s1', 'Cost Drill Subject', 'test')`);
    await admin.query(`INSERT INTO tenants (name, tier_type) VALUES ('Cost Replay Ltd', 'ENTERPRISE_C')`);
    const tenantId = (await admin.query(`SELECT id FROM tenants LIMIT 1`)).rows[0]!.id as string;

    const sink = new PgAuditSink(admin);
    for (let u = 0; u < 3; u++) {
      const userRes = await admin.query(
        `INSERT INTO users (tenant_id, clerk_id, email) VALUES ($1,$2,$3) RETURNING id`,
        [tenantId, `clerk_cost_${u}`, `cost${u}@replay.test`]
      );
      const sessRes = await admin.query(
        `INSERT INTO sessions (user_id, subject_id, target_duration_min) VALUES ($1,'s1',60) RETURNING id`,
        [userRes.rows[0]!.id]
      );
      sessionIds.push(sessRes.rows[0]!.id as string);
    }

    // Sessions 0â€“1: lean gpt-4o-mini traffic (~Â£0.0004/turn), 90% cache hits.
    // Session 2: a Tier-1 whale that blows the per-session cap.
    for (let i = 0; i < 35; i++) {
      await sink.writeAiExecutionAudit({
        sessionId: sessionIds[0]!,
        modelUsed: 'gpt-4o-mini',
        promptCacheHit: i !== 0,
        inputTokens: 2000,
        outputTokens: 400,
        latencyMs: 420
      });
      await sink.writeAiExecutionAudit({
        sessionId: sessionIds[1]!,
        modelUsed: 'gpt-4o-mini',
        promptCacheHit: i !== 0,
        inputTokens: 2000,
        outputTokens: 400,
        latencyMs: 430
      });
    }
    await sink.writeAiExecutionAudit({
      sessionId: sessionIds[2]!,
      modelUsed: 'gpt-4o',
      promptCacheHit: false,
      inputTokens: 12000,
      outputTokens: 1500,
      latencyMs: 900
    });
    for (let i = 0; i < 2; i++) {
      await sink.writeAiExecutionAudit({
        sessionId: sessionIds[2]!,
        modelUsed: 'gpt-4o',
        promptCacheHit: true,
        inputTokens: 12000,
        outputTokens: 1500,
        latencyMs: 850
      });
    }
  });

  afterAll(async () => {
    if (admin) await admin.end();
  });

  it('replays audit rows into the gated cost report', async () => {
    const sink = new PgAuditSink(admin);
    const rows = await sink.listAudits();
    expect(rows.length).toBe(73); // 35 + 35 lean + 3 whale

    const report = buildCostReport(rows);
    expect(report.sessions).toBe(3);
    expect(report.totalCalls).toBe(73);

    // Lean sessions dominate the blend: well under the Â£0.05 cap.
    expect(report.blendedCostPerSessionGbp).toBeLessThan(MAX_SESSION_COST_GBP);
    expect(report.cacheHitRate).toBeGreaterThanOrEqual(CACHE_HIT_RATE_MIN);

    // The whale session is itemized as the sole anomaly.
    expect(report.anomalies).toHaveLength(1);
    expect(report.anomalies[0]!.sessionId).toBe(sessionIds[2]);
    expect(report.anomalies[0]!.limitGbp).toBe(MAX_SESSION_COST_GBP);
    expect(report.anomalies[0]!.overByGbp).toBeGreaterThan(0);

    // Per-model economics rank the expensive Tier-1 lever first.
    expect(report.perModel[0]!.model).toBe('gpt-4o');
    expect(report.perModel.map((m) => m.model)).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('lean sessions individually clear the cap while the whale breaches it', async () => {
    const sink = new PgAuditSink(admin);
    const lean = buildCostReport(await sink.listAudits(sessionIds[0]));
    expect(lean.blendedCostPerSessionGbp).toBeLessThan(0.02);
    expect(lean.anomalies).toHaveLength(0);

    const whale = buildCostReport(await sink.listAudits(sessionIds[2]));
    expect(whale.blendedCostPerSessionGbp).toBeGreaterThan(MAX_SESSION_COST_GBP);
  });

  it('gate verdict reflects the seeded corpus honestly', async () => {
    const sink = new PgAuditSink(admin);
    const all = buildCostReport(await sink.listAudits());
    const gate = meetsCostGate(all);
    // Blended + cache pass; anomalies are present and must be named.
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.startsWith('SESSION_ANOMALIES_PRESENT'))).toBe(true);
    expect(gate.reasons.some((r) => r.startsWith('BLENDED_COST_ABOVE_LIMIT'))).toBe(false);
    expect(gate.reasons.some((r) => r.startsWith('CACHE_HIT_RATE_BELOW_MIN'))).toBe(false);
  });

  it('roundtrips cache flags and models through double precision without loss', async () => {
    const res = await admin.query<{ prompt_cache_hit: boolean; model_used: string; cost_gbp: number }>(
      `SELECT prompt_cache_hit, model_used, cost_gbp FROM ai_execution_audits ORDER BY created_at LIMIT 1`
    );
    expect(res.rows[0]!.prompt_cache_hit).toBe(false);
    expect(res.rows[0]!.model_used).toBe('gpt-4o-mini');
    expect(res.rows[0]!.cost_gbp).toBeGreaterThan(0);
  });
});
