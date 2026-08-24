import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drainDecayBacklog } from '../../src/pedagogy/decay-worker.js';
import { decayedScore, bandFor } from '../../src/pedagogy/decay-math.js';
import { PgCheckpointStore } from '../../src/state/checkpoint-store.js';

/**
 * decay.under.load.integration.spec — Sprint 7 gate S7-T2 (G9).
 *
 * The nightly decay drain must run alongside live checkpoint traffic without
 * ever taking blocking locks (sampled via pg_stat_activity), within a
 * throughput budget, and with structural exactly-once semantics.
 */
const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL;
const MIGRATION = join(process.cwd(), 'db', 'migrations', '20260822_learnos_initial_schema.sql');

async function canConnect(url: string): Promise<boolean> {
  try {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

const suite = TEST_URL && (await canConnect(TEST_URL)) ? describe : describe.skip;

suite('decay under load — real Postgres (S7-T2 / G9)', () => {
  const RUN = randomUUID().slice(0, 8);
  let pool!: pg.Pool;

  const USERS = 24;
  const CONCEPTS = 60; // → 1440 stale dna rows
  const DNA_ROWS = USERS * CONCEPTS;
  /** Pre-decay snapshot captured after seeding, keyed by dna id. */
  let preDecay!: Map<string, { m: number; r: number; t: number }>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_URL, max: 30 });
    const setup = await pool.connect();
    try {
      await setup.query(
        `DROP SCHEMA public CASCADE;
         CREATE SCHEMA public;
         GRANT ALL ON SCHEMA public TO current_user;
         GRANT ALL ON SCHEMA public TO public;`
      );
      await setup.query(readFileSync(MIGRATION, 'utf8'));

      await setup.query(`INSERT INTO tenants (name) VALUES ($1)`, [`load-tenant-${RUN}`]);
      const tenantId = (await setup.query(`SELECT id FROM tenants LIMIT 1`)).rows[0]!.id as string;

      await setup.query(
        `INSERT INTO users (tenant_id, clerk_id, email)
         SELECT $1::uuid, 'clerk-' || g || '-${RUN}', 'u' || g || '-${RUN}@load.test'
         FROM generate_series(0, ${USERS - 1}) g`,
        [tenantId]
      );
      const subjectId = `load_sub_${RUN}`;
      await setup.query(`INSERT INTO subjects (id, title, category) VALUES ($1, 'Load Subject', 'test')`, [subjectId]);
      await setup.query(
        `INSERT INTO concept_nodes (id, subject_id, title)
         SELECT 'lc_' || g, $1, 'Concept ' || g FROM generate_series(0, ${CONCEPTS - 1}) g`,
        [subjectId]
      );
      await setup.query(
        `INSERT INTO learning_dna (user_id, concept_id, mastery_score, decay_rate, status, last_reviewed_at)
         SELECT u.id,
               'lc_' || c,
               25 + ((u.rn * ${CONCEPTS} + c) * 41 % 700) / 10.0,
               0.01 + (((u.rn * ${CONCEPTS} + c) * 7) % 20) / 200.0,
               'PARTIAL',
               now() - interval '40 days' - ((u.rn + c) % 9) * interval '1 day'
         FROM (SELECT id, (row_number() OVER (ORDER BY id) - 1)::int AS rn FROM users) u
         CROSS JOIN generate_series(0, ${CONCEPTS - 1}) c`
      );

      // Sessions for concurrent checkpoint traffic (live-load stand-in).
      await setup.query(
        `INSERT INTO sessions (user_id, subject_id, target_duration_min, started_at)
         SELECT id, $1::varchar, 25, now() FROM users`,
        [subjectId]
      );
      const n = await setup.query<{ n: number }>(`SELECT count(*)::int AS n FROM learning_dna`);
      expect(n.rows[0]!.n).toBe(DNA_ROWS);
      const snap = await setup.query<{ id: string; mastery_score: string; decay_rate: string; last_reviewed_at: Date }>(
        `SELECT id, mastery_score, decay_rate, last_reviewed_at FROM learning_dna`
      );
      preDecay = new Map(
        snap.rows.map((r) => [
          r.id,
          { m: Number(r.mastery_score), r: Number(r.decay_rate), t: new Date(r.last_reviewed_at).getTime() }
        ])
      );
    } finally {
      setup.release();
    }
  }, 90_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('drains the backlog concurrently with checkpoint traffic — zero blocking locks observed', async () => {
    // --- background live traffic: 12 sessions × 8 turns via PgCheckpointStore,
    // 8-way concurrency, racing against the drain below.
    const store = new PgCheckpointStore(pool);
    const sessionIds = (
      await pool.query<{ id: string }>(`SELECT id FROM sessions ORDER BY id LIMIT 12`)
    ).rows.map((r) => r.id);
    const userIds = (
      await pool.query<{ user_id: string }>(`SELECT user_id FROM sessions ORDER BY id LIMIT 12`)
    ).rows.map((r) => r.user_id);

    let lockWaitsSeen = 0;
    let samplerStopped = false;
    const lockSampler = (async () => {
      while (!samplerStopped) {
        try {
          const res = await pool.query<{ n: number }>(
            `SELECT count(*)::int AS n
               FROM pg_stat_activity
              WHERE datname = current_database()
                AND state = 'active'
                AND pid <> pg_backend_pid()
                AND wait_event_type = 'Lock'
                AND query ILIKE '%learning_dna%'`
          );
          lockWaitsSeen += res.rows[0]!.n;
        } catch {
          /* pool saturated mid-sample — skip this tick */
        }
        await new Promise((r) => setTimeout(r, 15));
      }
    })();

    const traffic = Promise.all(
      sessionIds.map(async (sid, i) => {
        for (let step = 0; step < 8; step++) {
          await store.commitCheckpoint({
            sessionId: sid,
            userId: userIds[i]!,
            stepNumber: step,
            activeMode: 'TUTOR',
            statePayload: { step },
            userMessage: `q-${step}`,
            assistantResponse: `a-${step}`,
            latencyMs: 20 + step
          });
        }
      })
    );

    // --- the drain itself, under that load, inside a throughput budget.
    const t0 = Date.now();
    const drained = await drainDecayBacklog(pool, 300);
    const drainMs = Date.now() - t0;

    await traffic;
    samplerStopped = true;
    await lockSampler;

    expect(drained.processed).toBe(DNA_ROWS);
    // drainDecayBacklog counts the terminal probe as a chunk: 5 work + 1 probe.
    expect(drained.chunks).toBe(Math.ceil(DNA_ROWS / 300) + 1);
    expect(lockWaitsSeen).toBe(0);
    expect(drainMs).toBeLessThan(20_000); // throughput SLO headroom (local CI)
  }, 120_000);

  it('concurrent checkpoint traffic committed exactly-once during the drain', async () => {
    const res = await pool.query<{ sid: string; checkpoints: number; turns: number }>(
      `SELECT s.id AS sid,
              (SELECT count(*)::int FROM session_checkpoints cp WHERE cp.session_id = s.id) AS checkpoints,
              (SELECT count(*)::int FROM session_turns t WHERE t.session_id = s.id) AS turns
         FROM sessions s ORDER BY s.id LIMIT 12`
    );
    for (const row of res.rows) {
      expect(row.checkpoints).toBe(8);
      expect(row.turns).toBe(8);
    }
  });

  it('immediate re-drain processes zero rows (structural exactly-once)', async () => {
    const again = await drainDecayBacklog(pool, 300);
    expect(again.processed).toBe(0);
  });

  it('decayed scores match the exact formula and re-banded statuses', async () => {
    const rows = (
      await pool.query<{ id: string; mastery_score: string; status: string }>(
        `SELECT id, mastery_score, status FROM learning_dna`
      )
    ).rows;
    expect(rows).toHaveLength(DNA_ROWS);
    for (const r of rows) {
      const pre = preDecay.get(r.id);
      expect(pre).toBeDefined();
      const days = Math.max(0, (Date.now() - pre!.t) / 86_400_000);
      const expected = decayedScore(pre!.m, pre!.r, days);
      // Tolerance absorbs the seconds-level clock drift between the drain
      // pass and this assertion; the formula itself is exact to 1e-6.
      expect(Math.abs(Number(r.mastery_score) - expected)).toBeLessThan(0.05);
      expect(r.status).toBe(bandFor(Number(r.mastery_score)));
    }
  });
});
