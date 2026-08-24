import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { processDecayChunk, drainDecayBacklog } from '../../src/pedagogy/decay-worker.js';
import { decayedScore, bandFor } from '../../src/pedagogy/decay-math.js';

/**
 * decay.worker.integration.spec — Sprint 4 gate S4-T8 (real PG).
 * 5k synthetic rows processed in ≤500-row chunks; zero lock contention
 * (pg_stat_activity / pg_locks assertions); kill mid-chunk ⇒ rollback leaves
 * zero partial writes and replay applies decay exactly once (structural via
 * the last_decayed_at guard).
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

suite('decay worker — real Postgres (S4-T8 gate)', () => {
  const RUN = randomUUID().slice(0, 8);
  let pool!: pg.Pool;
  let tenantId!: string;
  let userId!: string;

  async function snapshotScores(limit = 100): Promise<number[]> {
    const res = await pool.query<{ scores: string[] }>(
      `SELECT array_agg(mastery_score ORDER BY id) AS scores FROM (SELECT id, mastery_score FROM learning_dna ORDER BY id LIMIT $1) t`,
      [limit]
    );
    return res.rows[0]!.scores.map(Number);
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_URL, max: 4 });
    const setup = await pool.connect();
    try {
      // Fresh schema for this run.
      await setup.query(
        `DROP SCHEMA public CASCADE;
         CREATE SCHEMA public;
         GRANT ALL ON SCHEMA public TO current_user;
         GRANT ALL ON SCHEMA public TO public;`
      );
      await setup.query(readFileSync(MIGRATION, 'utf8'));

      await setup.query(`INSERT INTO tenants (name) VALUES ($1)`, [`decay-tenant-${RUN}`]);
      tenantId = (await setup.query(`SELECT id FROM tenants LIMIT 1`)).rows[0]!.id as string;
      // 50 learners × 100 concepts = 5000 dna rows (unique per user+concept).
      await setup.query(
        `INSERT INTO users (tenant_id, clerk_id, email)
         SELECT $1::uuid, 'clerk-' || g || '-${RUN}', 'u' || g || '-${RUN}@decay.test'
         FROM generate_series(0, 49) g`,
        [tenantId]
      );
      userId = (await setup.query(`SELECT id FROM users LIMIT 1`)).rows[0]!.id as string;

      const subjectId = `decay_sub_${RUN}`;
      await setup.query(`INSERT INTO subjects (id, title, category) VALUES ($1, 'Decay Subject', 'test')`, [subjectId]);
      // 100 concepts × 50 dna rows each = 5000 stale rows.
      await setup.query(
        `INSERT INTO concept_nodes (id, subject_id, title)
         SELECT 'dc_' || g, $1, 'Concept ' || g FROM generate_series(0, 99) g`,
        [subjectId]
      );
      await setup.query(
        `INSERT INTO learning_dna (user_id, concept_id, mastery_score, decay_rate, status, last_reviewed_at)
         SELECT u.id,
               'dc_' || c,
               20 + ((u.rn * 100 + c) * 37 % 800) / 10.0,
               0.01 + (((u.rn * 100 + c) * 13) % 20) / 200.0,
               'PARTIAL',
               now() - interval '30 days' - ((u.rn + c) % 7) * interval '1 day'
         FROM (SELECT id, (row_number() OVER (ORDER BY id) - 1)::int AS rn FROM users) u
         CROSS JOIN generate_series(0, 99) c`
      );
      const count = await setup.query<{ n: number }>(`SELECT count(*)::int AS n FROM learning_dna`);
      expect(count.rows[0]!.n).toBe(5000);
    } finally {
      setup.release();
    }
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('processes the backlog strictly in ≤500-row chunks', async () => {
    let cursor: string | null = null;
    let total = 0;
    let chunks = 0;
    for (;;) {
      const res = await processDecayChunk(pool, cursor, 500);
      if (res.finished) break; // terminal probe — not a work chunk
      chunks++;
      expect(res.processed).toBeLessThanOrEqual(500);
      total += res.processed;
      cursor = res.nextCursorId;
    }
    expect(total).toBe(5000);
    expect(chunks).toBe(10);
  }, 60_000);

  it('applies the exact formula and re-bands statuses on a controlled row', async () => {
    // Plant one deterministic row that has never been decayed.
    await pool.query(
      `UPDATE learning_dna
          SET mastery_score = 90, decay_rate = 0.05,
              last_reviewed_at = now() - interval '10 days',
              last_decayed_at = NULL
        WHERE concept_id = 'dc_7' AND mastery_score < 100`
    );
    const target = (
      await pool.query<{ id: string }>(
        `SELECT id FROM learning_dna WHERE concept_id = 'dc_7' AND decay_rate = 0.05 AND mastery_score = 90 LIMIT 1`
      )
    ).rows[0]!;

    const res = await processDecayChunk(pool, null, 500);
    expect(res.processed).toBeGreaterThan(0);

    const row = (
      await pool.query<{ mastery_score: string; status: string; last_reviewed_at: Date }>(
        `SELECT mastery_score, status, last_reviewed_at FROM learning_dna WHERE id = $1::uuid`,
        [target!.id]
      )
    )!.rows[0]!;
    const deltaDays = Math.max(0, (Date.now() - new Date(row.last_reviewed_at).getTime()) / 86_400_000);
    // Δ was ~10d at write time; the stored score must equal the formula applied
    // to 90 with the SAME Δ window (±1s tolerance on the timestamp read-back).
    const lowerBound = Math.max(10, 90 * Math.exp(-0.05 * (deltaDays + 0.001)));
    const upperBound = Math.max(10, 90 * Math.exp(-0.05 * Math.max(0, deltaDays - 0.001)));
    const stored = parseFloat(row.mastery_score);
    expect(stored).toBeGreaterThanOrEqual(lowerBound - 1e-4);
    expect(stored).toBeLessThanOrEqual(upperBound + 1e-4);
    expect(row.status).toBe(bandFor(stored));
  }, 30_000);

  it('zero lock contention while chunks process', async () => {
    // Re-stale every row so there is real work to observe.
    await pool.query(
      `UPDATE learning_dna SET last_decayed_at = NULL, last_reviewed_at = now() - interval '3 days'`
    );

    let blockedObserved = 0;
    const sampler = setInterval(() => {
      void pool
        .query<{ blocked: number }>(
          `SELECT count(*)::int AS blocked FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()`
        )
        .then((r) => {
          blockedObserved = Math.max(blockedObserved, r.rows[0]!.blocked);
        })
        .catch(() => undefined);
    }, 20);

    try {
      await drainDecayBacklog(pool, 500);
    } finally {
      clearInterval(sampler);
    }
    expect(blockedObserved).toBe(0);

    const locks = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted`);
    expect(locks.rows[0]!.n).toBe(0);
  }, 60_000);

  it('kill mid-chunk ⇒ rollback is atomic; resume decays exactly once; replay is a no-op', async () => {
    // Fresh never-decayed stale state for deterministic math.
    await pool.query(
      `UPDATE learning_dna SET last_decayed_at = NULL, last_reviewed_at = now() - interval '5 days'`
    );
    const before = await snapshotScores();

    // Simulate a crash INSIDE the chunk transaction.
    const client = await pool.connect();
    let killed = false;
    try {
      await client.query('BEGIN');
      const rows = (
        await client.query<{ id: string }>(
          `SELECT id FROM learning_dna
            WHERE last_reviewed_at < now() - interval '24 hours'
              AND (last_decayed_at IS NULL OR last_decayed_at <= now() - interval '24 hours')
            ORDER BY id ASC LIMIT $1`,
          [500]
        )
      ).rows;
      for (let i = 0; i < rows.length; i++) {
        await client.query(`UPDATE learning_dna SET mastery_score = mastery_score + 1 WHERE id = $1::uuid`, [rows[i]!.id]);
        if (i === Math.floor(rows.length / 2)) {
          killed = true;
          throw new Error('SIMULATED_CRASH');
        }
      }
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK'); // kill path
    } finally {
      client.release();
    }
    expect(killed).toBe(true);

    // Zero partial writes survived the crash.
    expect(await snapshotScores()).toEqual(before);

    // Resume: the full pass completes exactly once.
    const summary = await drainDecayBacklog(pool, 500);
    expect(summary.processed).toBe(5000);

    const after = await snapshotScores();
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBeLessThanOrEqual(before[i]!); // decay never increases
    }

    // Replay immediately — the 24h guard must make it a structural no-op.
    const replay = await drainDecayBacklog(pool, 500);
    expect(replay.processed).toBe(0);
    expect(await snapshotScores()).toEqual(after);
  }, 120_000);
});
