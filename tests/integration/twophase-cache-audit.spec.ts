import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../../src/config/env.js';
import { PgCheckpointStore } from '../../src/state/checkpoint-store.js';
import { PgAuditSink, computeCacheHitRate } from '../../src/ai/cost-audit.js';
import { runTurn } from '../../src/api/sse/turn-route.js';
import { createScriptedTransport, textTurn } from '../../src/ai/mock-transport.js';
import { CircuitBreaker } from '../../src/ai/breaker.js';

const MIGRATION = join(process.cwd(), 'db', 'migrations', '20260822_learnos_initial_schema.sql');

/**
 * twophase + cache.audit integration gates — REAL Postgres via the migration
 * schema. Skips automatically when the database is unreachable (no Docker),
 * exactly like the Sprint 0 integration suites.
 *
 * Run with Docker:  docker compose up -d postgres && npx vitest run tests/integration
 */

const env = loadEnv();
const connectionString = env.TEST_DATABASE_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

let pool: pg.Pool | null = null;
const RUN_ID = randomUUID().slice(0, 8);

async function canConnect(): Promise<boolean> {
  if (!connectionString) return false;
  try {
    const p = new pg.Pool({ connectionString, max: 1 });
    await p.query('SELECT 1');
    pool = p;
    return true;
  } catch {
    return false;
  }
}

const reachable = await canConnect();

describe.skipIf(!reachable)('twophase + cache.audit gates (Postgres)', () => {
  let tenantId!: string;
  let userId!: string;
  let subjectId!: string;
  let sessionId!: string;
  let store!: PgCheckpointStore;
  let audit!: PgAuditSink;

  beforeAll(async () => {
    // Apply the migration if this is the first spec to run (or if another spec
    // left the schema reset). This makes the suite self-sufficient regardless
    // of test file execution order.
    const setupClient = await pool!.connect();
    try {
      const exists = await setupClient.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants'`
      );
      if (exists.rowCount === 0) {
        await setupClient.query(readFileSync(MIGRATION, 'utf8'));
      }
    } finally {
      setupClient.release();
    }

    const client = await pool!.connect();
    try {
      tenantId = randomUUID();
      userId = randomUUID();
      subjectId = `test-sub-${RUN_ID}`;
      sessionId = randomUUID();
      await client.query(`INSERT INTO tenants (id, name) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`, [tenantId, tenantId]);
      await client.query(
        `INSERT INTO users (id, tenant_id, clerk_id, email) VALUES ($1, $2, $3, $4)`,
        [userId, tenantId, `clerk-${RUN_ID}`, `${RUN_ID}@test.local`]
      );
      await client.query(
        `INSERT INTO subjects (id, title, category) VALUES ($1, $2, 'test') ON CONFLICT (id) DO NOTHING`,
        [subjectId, `Test Subject ${RUN_ID}`]
      );
      await client.query(
        `INSERT INTO sessions (id, user_id, subject_id, target_duration_min) VALUES ($1, $2, $3, 25)`,
        [sessionId, userId, subjectId]
      );
    } finally {
      client.release();
    }
    store = new PgCheckpointStore(pool!);
    audit = new PgAuditSink(pool!);
  });

  afterAll(async () => {
    if (pool) {
      // Cascade cleanup of this run's rows.
      await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]).catch(() => undefined);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => undefined);
      await pool.query(`DELETE FROM subjects WHERE id = $1`, [subjectId]).catch(() => undefined);
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]).catch(() => undefined);
      await pool.end();
    }
  });

  it('Phase 1 commits atomically to session_checkpoints + session_turns; Phase 2 confirms', async () => {
    const deps = {
      transports: {
        openai: createScriptedTransport([
          textTurn('Calibration complete.', { checkpoint: { step: 3, status: 'calibrated' } })
        ]),
        anthropic: createScriptedTransport([textTurn('unused')])
      },
      breaker: new CircuitBreaker(),
      checkpointStore: store,
      auditSink: audit
    };
    const events = [];
    for await (const e of runTurn(
      { sessionId, userId, mode: 'TUTOR', step: 3, userMessage: 'Teach me quadratics' },
      deps
    )) {
      events.push(e);
    }
    const confirmed = events.find((e) => e.type === 'checkpoint_confirmed');
    expect(confirmed).toBeDefined();
    void confirmed;

    const latest = await store.getLatestCheckpoint(sessionId);
    expect(latest?.stepNumber).toBe(3);

    const turns = await pool!.query<{ turn_index: number; assistant_response: string }>(
      `SELECT turn_index, assistant_response FROM session_turns WHERE session_id = $1 ORDER BY turn_index`,
      [sessionId]
    );
    expect(turns.rows).toHaveLength(1);
    expect(turns.rows[0]?.assistant_response).toContain('Calibration complete.');
  }, 20_000);

  it('duplicate commit replays without a second row (B-01 idempotency)', async () => {
    const depsFactory = () => ({
      transports: {
        openai: createScriptedTransport([
          textTurn('Retry payload.', { checkpoint: { step: 3, status: 'calibrated' } })
        ]),
        anthropic: createScriptedTransport([textTurn('unused')])
      },
      breaker: new CircuitBreaker(),
      checkpointStore: store,
      auditSink: audit
    });
    for (let i = 0; i < 2; i++) {
      for await (const _e of runTurn(
        { sessionId, userId, mode: 'TUTOR', step: 3, userMessage: 'retry' },
        depsFactory()
      )) {
        void _e;
      }
    }
    const rows = await pool!.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM session_checkpoints WHERE session_id = $1 AND step_number = 3`,
      [sessionId]
    );
    expect(rows.rows[0]?.n).toBe('1');
  }, 20_000);

  it('kill mid-stream AFTER checkpoint block -> state survives (disconnect safety)', async () => {
    const deps = {
      transports: {
        openai: createScriptedTransport([
          textTurn('Long explanation begins.', { checkpoint: { step: 4, status: 'roadmap_ready' } }),
          { chunks: Array.from({ length: 40 }, () => ({ type: 'token' as const, text: ' more' })) }
        ]),
        anthropic: createScriptedTransport([textTurn('unused')])
      },
      breaker: new CircuitBreaker(),
      checkpointStore: store,
      auditSink: audit
    };
    let sawConfirm = false;
    for await (const e of runTurn(
      { sessionId, userId, mode: 'TUTOR', step: 4, userMessage: 'plan my roadmap' },
      deps
    )) {
      if (e.type === 'checkpoint_confirmed') {
        sawConfirm = true;
        break; // simulate client disconnect right here
      }
    }
    expect(sawConfirm).toBe(true);
    const latest = await store.getLatestCheckpoint(sessionId);
    expect(latest?.stepNumber).toBe(4); // durable despite aborted stream
  }, 20_000);

  it('cache.audit: second identical turn reports prompt_cache_hit and audit rows persist £cost', async () => {
    // Scripted transport simulates provider prefix caching: hit on repeat calls.
    // Scripts are matched by callIndex — chunks arrays are static per script, so
    // a conditional spread would be evaluated once and lose the per-call flag.
    const cachingTransport = createScriptedTransport([
      {
        when: (_req, callIndex) => callIndex > 0,
        chunks: [
          { type: 'token', text: 'answer ' },
          { type: 'usage', inputTokens: 1100, outputTokens: 100, cacheHit: true }
        ]
      },
      {
        chunks: [
          { type: 'token', text: 'answer ' },
          { type: 'usage', inputTokens: 1100, outputTokens: 100, cacheHit: false }
        ]
      }
    ]);
    const deps = () => ({
      transports: { openai: cachingTransport, anthropic: createScriptedTransport([textTurn('x')]) },
      breaker: new CircuitBreaker(),
      checkpointStore: store,
      auditSink: audit
    });
    const mkTurn = (msg: string) =>
      runTurn({ sessionId, userId, mode: 'ASSESSOR', step: 5, userMessage: msg }, deps());

    for await (const _e of mkTurn('grade me')) void _e;
    for await (const _e of mkTurn('grade me')) void _e;

    const rows = await audit.listAudits(sessionId);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.costGbp >= 0)).toBe(true);
    // At least one audit row carries the cache-hit flag (the repeated turn).
    expect(rows.some((r) => r.promptCacheHit)).toBe(true);
    expect(computeCacheHitRate(rows)).toBeGreaterThan(0);
  }, 30_000);
});
