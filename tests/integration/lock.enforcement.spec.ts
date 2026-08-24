import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import {
  resolveTranscriptAccess,
  requireRawTranscript,
  TranscriptLockedError,
  buildAggregatesOnlyPayload
} from '../../src/privacy/transcript-lock.js';
import type { Requester, TargetUser } from '../../src/access/precedence.js';

/**
 * lock.enforcement.spec — Sprint 5 gate (S5-T3 / B-03 defense in depth).
 * Educator on a minor−consent cohort: the APP layer returns aggregates-only
 * and throws TRANSCRIPT_LOCKED on raw fetches; the RLS layer independently
 * blocks raw rows. Consent grant unlocks BOTH layers; revocation re-locks.
 * The app_aggregator role is denied raw transcript reads at the grant level.
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

suite('lock.enforcement.spec — S5-T3 gate', () => {
  let admin: pg.Client;
  const userIds = new Map<string, string>();
  const tenantIdOf = new Map<string, string>();

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
    await admin.query(
      `INSERT INTO subjects (id, title, category) VALUES ('s1', 'Lock Drill Subject', 'test')`
    );
    await admin.query(`INSERT INTO tenants (name, tier_type) VALUES ('Drill Cohort Ltd', 'ENTERPRISE_C')`);
    const tenantId = (await admin.query(`SELECT id FROM tenants LIMIT 1`)).rows[0]!.id as string;
    tenantIdOf.set('T1', tenantId);

    async function seedUser(label: string, opts?: { isMinor?: boolean; consent?: boolean }): Promise<void> {
      const res = await admin!.query(
        `INSERT INTO users (tenant_id, clerk_id, email, is_minor, parental_consent_verified)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          tenantId,
          `clerk_${label}`,
          `${label}@lock.test`,
          opts?.isMinor ?? false,
          opts?.consent ?? false
        ]
      );
      const uid = res.rows[0]!.id as string;
      userIds.set(label, uid);
      const sess = await admin!.query(
        `INSERT INTO sessions (user_id, subject_id, target_duration_min) VALUES ($1,'s1',45) RETURNING id`,
        [uid]
      );
      await admin!.query(
        `INSERT INTO session_turns (session_id, turn_index, user_message, assistant_response, latency_ms)
         VALUES ($1, 0, 'q', 'a', 5)`,
        [(sess.rows[0] as { id: string }).id]
      );
    }

    await seedUser('educator');
    await seedUser('adult');
    await seedUser('minor_consent', { isMinor: true, consent: true });
    await seedUser('minor_no_consent', { isMinor: true, consent: false });
  }, 60_000);

  afterAll(async () => {
    await admin?.end();
  });

  const educatorRequester = (): Requester => ({
    userId: userIds.get('educator')!,
    tenantId: tenantIdOf.get('T1')!,
    role: 'INSTRUCTOR'
  });

  function targetSnapshot(label: string): TargetUser {
    switch (label) {
      case 'adult':
        return { userId: userIds.get('adult')!, tenantId: tenantIdOf.get('T1')!, isMinor: false, parentalConsentVerified: false };
      case 'minor_consent':
        return { userId: userIds.get('minor_consent')!, tenantId: tenantIdOf.get('T1')!, isMinor: true, parentalConsentVerified: true };
      default:
        return { userId: userIds.get('minor_no_consent')!, tenantId: tenantIdOf.get('T1')!, isMinor: true, parentalConsentVerified: false };
    }
  }

  /** RLS probe: turns owned by ownerLabel visible to the given PG role. */
  async function rlsVisibleTurns(pgRole: string, ownerLabel: string): Promise<number> {
    await admin.query('BEGIN');
    try {
      await admin.query(`SET LOCAL ROLE ${pgRole}`);
      await admin.query(
        `SELECT set_config('app.current_user_id', $1, true),
                set_config('app.current_user_role', $2, true),
                set_config('app.current_tenant_id', $3, true)`,
        [userIds.get('educator')!, 'INSTRUCTOR', tenantIdOf.get('T1')!]
      );
      const res = await admin.query(
        `SELECT count(*)::int AS n FROM session_turns t
          JOIN sessions s ON s.id = t.session_id
          WHERE s.user_id = $1`,
        [userIds.get(ownerLabel)!]
      );
      return (res.rows[0] as { n: number }).n;
    } finally {
      await admin.query('ROLLBACK');
    }
  }

  /** Aggregator probe returns either zero rows or an explicit denial. */
  async function aggregatorProbe(ownerLabel: string): Promise<'ZERO' | 'DENIED'> {
    await admin.query('BEGIN');
    try {
      await admin.query(`SET LOCAL ROLE app_aggregator`);
      const res = await admin.query(
        `SELECT count(*)::int AS n FROM session_turns t
          JOIN sessions s ON s.id = t.session_id
          WHERE s.user_id = $1`,
        [userIds.get(ownerLabel)!]
      );
      void res;
      return 'ZERO';
    } catch (err) {
      expect((err as { code?: string }).code).toBe('42501'); // permission denied
      return 'DENIED';
    } finally {
      await admin.query('ROLLBACK');
    }
  }

  it('APP LAYER: minor without consent gets aggregates-only shape + typed raw lock', () => {
    // Adult and consented-minor cohorts are raw-visible to the educator.
    expect(resolveTranscriptAccess({ requester: educatorRequester(), target: targetSnapshot('adult') })).toEqual({
      decision: 'ALLOW_RAW',
      raw: { allowed: true }
    });
    expect(resolveTranscriptAccess({ requester: educatorRequester(), target: targetSnapshot('minor_consent') })).toEqual({
      decision: 'ALLOW_RAW',
      raw: { allowed: true }
    });

    // Locked cohort: resolver says AGGREGATE_ONLY; raw fetch raises typed error.
    const locked = resolveTranscriptAccess({
      requester: educatorRequester(),
      target: targetSnapshot('minor_no_consent')
    });
    expect(locked.decision).toBe('ALLOW_AGGREGATE_ONLY');
    expect(() => requireRawTranscript({ requester: educatorRequester(), target: targetSnapshot('minor_no_consent') }))
      .toThrowError(TranscriptLockedError);

    let caught: unknown;
    try {
      requireRawTranscript({ requester: educatorRequester(), target: targetSnapshot('minor_no_consent') });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TranscriptLockedError);
    expect((caught as TranscriptLockedError).code).toBe('TRANSCRIPT_LOCKED');
    expect((caught as TranscriptLockedError).decision).toBe('ALLOW_AGGREGATE_ONLY');

    // The API payload for locked cohorts never carries row-level data.
    const payload = buildAggregatesOnlyPayload([
      { conceptId: 'quadratic', failedPct: 60, learnerCount: 12 }
    ]);
    expect(payload.mode).toBe('AGGREGATES_ONLY');
    expect(JSON.stringify(payload)).not.toContain(userIds.get('minor_no_consent')!);
  });

  it('RLS LAYER: educator sees adult/consented rows but ZERO locked-minor rows', async () => {
    expect(await rlsVisibleTurns('app_instructor', 'adult')).toBe(1);
    expect(await rlsVisibleTurns('app_instructor', 'minor_consent')).toBe(1);
    expect(await rlsVisibleTurns('app_instructor', 'minor_no_consent')).toBe(0);
  });

  it('AGGREGATOR ROLE: raw transcript reads blocked at the grant level for every profile', async () => {
    for (const label of ['adult', 'minor_consent', 'minor_no_consent']) {
      expect(await aggregatorProbe(label)).toBe('DENIED');
    }
  });

  it('END-TO-END DRILL: consent grants unlock both layers; revocation re-locks', async () => {
    const minorId = userIds.get('minor_no_consent')!;

    // --- grant ---
    await admin.query(`UPDATE users SET parental_consent_verified = TRUE WHERE id = $1`, [minorId]);
    const grantedTarget = { ...targetSnapshot('minor_no_consent'), parentalConsentVerified: true };
    expect(resolveAccessDecision(grantedTarget)).toBe('ALLOW_RAW');
    expect(requireRawNoThrow(grantedTarget)).toBe(true);
    expect(await rlsVisibleTurns('app_instructor', 'minor_no_consent')).toBe(1);

    // --- revoke ---
    await admin.query(`UPDATE users SET parental_consent_verified = FALSE WHERE id = $1`, [minorId]);
    const revokedTarget = targetSnapshot('minor_no_consent');
    expect(resolveAccessDecision(revokedTarget)).toBe('ALLOW_AGGREGATE_ONLY');
    expect(requireRawNoThrow(revokedTarget)).toBe(false);
    expect(await rlsVisibleTurns('app_instructor', 'minor_no_consent')).toBe(0);
  });

  /** Helpers keeping the drill readable. */
  function resolveAccessDecision(target: TargetUser): string {
    return resolveTranscriptAccess({ requester: educatorRequester(), target }).decision;
  }

  function requireRawNoThrow(target: TargetUser): boolean {
    try {
      requireRawTranscript({ requester: educatorRequester(), target });
      return true;
    } catch (e) {
      expect(e).toBeInstanceOf(TranscriptLockedError);
      return false;
    }
  }
});
