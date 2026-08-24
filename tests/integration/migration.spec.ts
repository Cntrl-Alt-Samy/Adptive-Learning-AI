import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

/**
 * migration.spec — Sprint 0 gate (integration; real PG 16 container).
 * Requires TEST_DATABASE_URL pointing at an EPHEMERAL database (the suite
 * resets schema public). Skips cleanly when unset or unreachable.
 */
const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL;
const MIGRATION = join(process.cwd(), 'db', 'migrations', '20260822_learnos_initial_schema.sql');

const EXPECTED_TABLES: Record<string, string[]> = {
  tenants: ['id', 'name', 'tier_type', 'security_policy', 'created_at'],
  users: [
    'id', 'tenant_id', 'clerk_id', 'email', 'full_name',
    'is_minor', 'parental_consent_verified', 'created_at', 'last_active_at'
  ],
  learner_profiles: ['id', 'user_id', 'default_modality', 'goal_preferences', 'updated_at'],
  subjects: ['id', 'title', 'category', 'exam_board', 'total_concepts', 'created_at'],
  concept_nodes: ['id', 'subject_id', 'title', 'difficulty_level', 'canonical_definitions'],
  concept_prerequisites: ['concept_id', 'prerequisite_id'],
  learning_dna: ['id', 'user_id', 'concept_id', 'mastery_score', 'status', 'decay_rate', 'last_reviewed_at', 'last_decayed_at'],
  sessions: [
    'id', 'user_id', 'subject_id', 'target_duration_min', 'calibrated_level',
    'pre_knowledge_score', 'post_knowledge_score', 'status', 'started_at', 'completed_at'
  ],
  session_checkpoints: ['id', 'session_id', 'step_number', 'active_mode', 'state_payload', 'created_at'],
  session_turns: ['id', 'session_id', 'turn_index', 'user_message', 'assistant_response', 'latency_ms', 'created_at'],
  assessment_records: [
    'id', 'session_id', 'concept_id', 'tier_level', 'question', 'learner_answer', 'verdict', 'score_percent', 'created_at'
  ],
  spaced_rep_queue: [
    'id', 'user_id', 'concept_id', 'scheduled_for', 'review_interval_days', 'completed', 'created_at'
  ],
  badges: ['id', 'subject_id', 'title', 'description', 'icon_url', 'criteria', 'created_at'],
  user_badges: ['id', 'user_id', 'badge_id', 'awarded_at'],
  certificates: ['id', 'user_id', 'subject_id', 'verification_code', 'certificate_url', 'issued_at'],
  ai_execution_audits: [
    'id', 'session_id', 'model_used', 'prompt_cache_hit', 'input_tokens', 'output_tokens', 'cost_gbp', 'latency_ms', 'created_at'
  ],
  cohort_topic_locks: ['id', 'tenant_id', 'concept_id', 'locked_by', 'reason', 'locked_at'],
  consent_events: ['id', 'user_id', 'action', 'guardian_ref', 'jti', 'expires_at', 'created_at']
};

async function canConnect(url: string): Promise<boolean> {
  try {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

const suite = TEST_URL && (await canConnect(TEST_URL)) ? describe : describe.skip;

suite('migration.spec — S0-T1 gate', () => {
  let client: pg.Client;
  const migrationSql = readFileSync(MIGRATION, 'utf8');

  beforeAll(async () => {
    if (!TEST_URL) throw new Error('unreachable');
    client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();
    // Reset to a fresh database state for deterministic application.
    // Note: use current_user instead of hardcoded 'postgres' so this works
    // against both Supabase (postgres role) and the local Docker image (learnos).
    await client.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO current_user;
      GRANT ALL ON SCHEMA public TO public;
    `);
  }, 30_000);

  afterAll(async () => {
    await client?.end();
  });

  it('applies clean on a fresh database', async () => {
    await expect(client.query(migrationSql)).resolves.toBeDefined();
  }, 30_000);

  it('re-run is idempotent-safe (forward-only enforced)', async () => {
    await expect(client.query(migrationSql)).resolves.toBeDefined();
  }, 30_000);

  it('introspection matches the Prisma model manifest (18 tables, exact columns)', async () => {
    const tableNames = Object.keys(EXPECTED_TABLES);
    expect(tableNames).toHaveLength(18);

    for (const [table, expectedColumns] of Object.entries(EXPECTED_TABLES)) {
      const res = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table]
      );
      const actual = res.rows.map((r) => r.column_name as string).sort();
      expect(actual.sort(), `table ${table} columns`).toEqual([...expectedColumns].sort());
    }

    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const actualTables = tablesRes.rows.map((r) => r.table_name as string).sort();
    expect(actualTables).toEqual(tableNames.sort());
  });

  it('declares all required indexes incl. learning_dna(last_reviewed_at) decay cursor', async () => {
    const res = await client.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
    );
    const indexes = res.rows.map((r) => r.indexname as string);
    expect(indexes).toContain('learning_dna_last_reviewed_idx');
    expect(indexes).toContain('users_tenant_id_idx');
    expect(indexes).toContain('spaced_rep_queue_due_idx');
    expect(indexes).toContain('sessions_user_status_idx');
  });

  it('enforces self-loop CHECK on prereq edges at DB layer', async () => {
    await client.query(`INSERT INTO subjects (id,title,category) VALUES ('s1','S','test')`);
    await client.query(
      `INSERT INTO concept_nodes (id,subject_id,title) VALUES ('cA','s1','A'),('cB','s1','B')`
    );
    await expect(
      client.query(`INSERT INTO concept_prerequisites VALUES ('cA','cA')`)
    ).rejects.toThrow(/check/i);
    await expect(client.query(`INSERT INTO concept_prerequisites VALUES ('cA','cB')`)).resolves.toBeDefined();
  });

  it('two-phase commit idempotency: UNIQUE(session_id, step_number) rejects duplicates', async () => {
    // sessions.user_id is NOT NULL — seed a minimal tenant + user first.
    const tenantRes = await client.query(`INSERT INTO tenants (name) VALUES ('MigTest') RETURNING id`);
    const userRes = await client.query(
      `INSERT INTO users (tenant_id, clerk_id, email) VALUES ($1, 'mig-clerk', 'mig@test.local') RETURNING id`,
      [tenantRes.rows[0].id]
    );
    await client.query(`INSERT INTO sessions (user_id, subject_id, target_duration_min) VALUES ($1, 's1', 45)`, [
      userRes.rows[0].id
    ]);
    const sessionId = (await client.query(`SELECT id FROM sessions LIMIT 1`)).rows[0].id as string;
    await client.query(
      `INSERT INTO session_checkpoints (session_id,step_number,active_mode,state_payload) VALUES ($1,1,'TUTOR','{}'::jsonb)`,
      [sessionId]
    );
    await expect(
      client.query(
        `INSERT INTO session_checkpoints (session_id,step_number,active_mode,state_payload) VALUES ($1,1,'TUTOR','{}'::jsonb)`,
        [sessionId]
      )
    ).rejects.toThrow(/duplicate|unique/i);
  });
});
