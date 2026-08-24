import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

/**
 * rls-truth-table.spec — Sprint 0 gate (S0-T2 / B-03).
 * Truth table: {learner, instructor, admin} × {adult, minor+consent,
 * minor−consent} × {own, cohort, cross-tenant} over session_turns.
 * All probes run under non-superuser app roles so FORCE RLS is exercised.
 */
const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL;
const MIGRATION = join(process.cwd(), 'db', 'migrations', '20260822_learnos_initial_schema.sql');

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

interface ProbeUser {
  id: string;
  tenantId: string;
  role: 'LEARNER' | 'INSTRUCTOR' | 'ADMIN';
}

suite('rls-truth-table.spec — S0-T2 gate', () => {
  let adminClient: pg.Client;
  const users = new Map<string, ProbeUser>();

  beforeAll(async () => {
    if (!TEST_URL) throw new Error('unreachable');
    adminClient = new pg.Client({ connectionString: TEST_URL });
    await adminClient.connect();

    await adminClient.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO current_user;
      GRANT ALL ON SCHEMA public TO public;
    `);
    await adminClient.query(readFileSync(MIGRATION, 'utf8'));
    // Seed the shared FK target used by every seeded session below.
    await adminClient.query(
      `INSERT INTO subjects (id, title, category) VALUES ('s1', 'Truth Table Subject', 'test') ON CONFLICT (id) DO NOTHING`
    );
    // Let the test connection assume the NOLOGIN app roles.
    await adminClient.query(`GRANT app_learner, app_instructor, app_admin, app_aggregator TO current_user`);

    const tenantIds: Record<string, string> = {};
    for (const key of ['T1', 'T2'] as const) {
      const res = await adminClient.query(
        `INSERT INTO tenants (name, tier_type) VALUES ($1, 'ENTERPRISE_C') RETURNING id`,
        [key === 'T1' ? 'Cohort One Ltd' : 'Other Org']
      );
      tenantIds[key] = res.rows[0].id as string;
    }

    async function seedUser(label: string, tenantKey: string, role: ProbeUser['role'], opts?: { isMinor?: boolean; consent?: boolean }): Promise<void> {
      const res = await adminClient.query(
        `INSERT INTO users (tenant_id, clerk_id, email, is_minor, parental_consent_verified)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          tenantIds[tenantKey],
          `clerk_${label}`,
          `${label}@learnos.test`,
          opts?.isMinor ?? false,
          opts?.consent ?? false
        ]
      );
      const userId = res.rows[0].id as string;
      users.set(label, { id: userId, tenantId: tenantIds[tenantKey]!, role });

      const sess = await adminClient.query(
        `INSERT INTO sessions (user_id, subject_id, target_duration_min)
         VALUES ($1, 's1', 45) RETURNING id`,
        [userId]
      );
      await adminClient.query(
        `INSERT INTO session_turns (session_id, turn_index, user_message, assistant_response, latency_ms)
         VALUES ($1, 0, 'q', 'a', 42)`,
        [(sess.rows[0] as { id: string }).id]
      );
    }

    await seedUser('learner_adult', 'T1', 'LEARNER');
    await seedUser('learner_minor_consent', 'T1', 'LEARNER', { isMinor: true, consent: true });
    await seedUser('learner_minor_no_consent', 'T1', 'LEARNER', { isMinor: true, consent: false });
    await seedUser('instructor_t1', 'T1', 'INSTRUCTOR');
    await seedUser('admin_t1', 'T1', 'ADMIN');
    await seedUser('learner_t2', 'T2', 'LEARNER');
  }, 60_000);

  afterAll(async () => {
    await adminClient?.end();
  });

  /** Rows of a given session-owner visible to the probe identity under RLS. */
  async function visibleTurnsOwnedBy(probe: ProbeUser, ownerUserId: string): Promise<number> {
    const pgRole =
      probe.role === 'LEARNER' ? 'app_learner' : probe.role === 'INSTRUCTOR' ? 'app_instructor' : 'app_admin';
    await adminClient.query('BEGIN');
    try {
      await adminClient.query(`SET LOCAL ROLE ${pgRole}`);
      await adminClient.query(
        `SELECT set_config('app.current_user_id', $1, true),
                set_config('app.current_user_role', $2, true),
                set_config('app.current_tenant_id', $3, true)`,
        [probe.id, probe.role, probe.tenantId]
      );
      const res = await adminClient.query(
        `SELECT count(*)::int AS n
           FROM session_turns t
           JOIN sessions s ON s.id = t.session_id
          WHERE s.user_id = $1`,
        [ownerUserId]
      );
      return (res.rows[0] as { n: number }).n;
    } finally {
      await adminClient.query('ROLLBACK');
    }
  }

  it('27-cell truth table passes exactly per the Tier B > A > C contract', async () => {
    const profiles: Array<{ label: string; educatorVisible: boolean }> = [
      { label: 'learner_adult', educatorVisible: true },
      { label: 'learner_minor_consent', educatorVisible: true },
      { label: 'learner_minor_no_consent', educatorVisible: false }
    ];
    const probes: Array<{ label: string; role: ProbeUser['role'] }> = [
      { label: 'learner_adult', role: 'LEARNER' },
      { label: 'instructor_t1', role: 'INSTRUCTOR' },
      { label: 'admin_t1', role: 'ADMIN' }
    ];

    const failures: string[] = [];
    for (const p of probes) {
      const probe = users.get(p.label)!;
      const isEducator = p.role !== 'LEARNER';

      for (const profile of profiles) {
        const target = users.get(profile.label)!;

        // OWN scope — every identity sees its own transcript.
        const ownCount = await visibleTurnsOwnedBy(probe, probe.id);
        if (ownCount !== 1) failures.push(`${p.label}/own expected 1 got ${ownCount}`);

        // COHORT scope — educators raw iff adult or consented minor (B-03);
        // learners never see another user's rows. Self rows are always visible
        // (same query as the OWN assertion above must stay consistent).
        const cohortCount = await visibleTurnsOwnedBy(probe, target.id);
        const expectedCohort =
          probe.id === target.id ? 1 : !isEducator ? 0 : profile.educatorVisible ? 1 : 0;
        if (cohortCount !== expectedCohort) {
          failures.push(
            `${p.label}/cohort:${profile.label} expected ${expectedCohort} got ${cohortCount}` +
              (!isEducator || profile.educatorVisible ? '' : ' — B-03 MINOR LOCK VIOLATED')
          );
        }

        // CROSS-TENANT scope — nobody sees across tenants, even admins.
        const crossTarget = users.get('learner_t2')!;
        const crossCount = await visibleTurnsOwnedBy(probe, crossTarget.id);
        if (crossCount !== 0) failures.push(`${p.label}/cross-tenant expected 0 got ${crossCount}`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  }, 60_000);

  /**
   * S5 regression cells: the aggregation service role must NEVER read raw
   * transcript rows for any profile — blocked either by zero visibility
   * (policy) or explicit permission denial (missing grant, code 42501).
   */
  /** Aggregator probe returns ZERO, DENIED, or LEAK (visibility failure). */
  async function aggregatorProbe(ownerUserId: string): Promise<'ZERO' | 'DENIED' | 'LEAK'> {
    await adminClient.query('BEGIN');
    try {
      await adminClient.query(`SET LOCAL ROLE app_aggregator`);
      const res = await adminClient.query(
        `SELECT count(*)::int AS n
           FROM session_turns t
           JOIN sessions s ON s.id = t.session_id
          WHERE s.user_id = $1`,
        [ownerUserId]
      );
      return (res.rows[0] as { n: number }).n === 0 ? 'ZERO' : 'LEAK';
    } catch (err) {
      expect((err as { code?: string }).code, 'expected permission denied').toBe('42501');
      return 'DENIED';
    } finally {
      await adminClient.query('ROLLBACK');
    }
  }

  it('S5 regression: app_aggregator blocked from raw transcripts across all profiles', async () => {
    const owners = ['learner_adult', 'learner_minor_consent', 'learner_minor_no_consent'];
    for (const label of owners) {
      const probe = users.get(label)!;
      expect(await aggregatorProbe(probe.id), `aggregator/${label}`).not.toBe('LEAK');
    }
  }, 60_000);
});
