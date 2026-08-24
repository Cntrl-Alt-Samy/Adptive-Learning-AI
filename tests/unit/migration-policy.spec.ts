import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { findForwardOnlyViolations, scanMigrationsDir } from '../../src/deploy/migration-policy.js';

/**
 * S7-T5 — forward-only migration policy gate (blue-green compatibility).
 */

describe('migration.policy — forward-only verifier', () => {
  it('flags every regression-DDL family with line attribution', () => {
    const sql = [
      'CREATE TABLE t1 (id int);', // fine
      'DROP TABLE users;', // L2
      'ALTER TABLE users DROP COLUMN email;', // L3
      'ALTER TABLE users ALTER COLUMN email TYPE text;', // L4
      'ALTER TABLE users RENAME COLUMN email TO mail;', // L5
      'ALTER TABLE users DROP CONSTRAINT uq_email;', // L6
      'DROP INDEX idx_email;' // L7
    ].join('\n');

    const v = findForwardOnlyViolations(sql, 'bad.sql');
    const rules = new Set(v.map((x) => x.rule));
    expect(rules).toEqual(
      new Set(['DROP_TABLE', 'DROP_COLUMN', 'ALTER_COLUMN_TYPE', 'RENAME', 'DROP_CONSTRAINT', 'DROP_INDEX'])
    );
    expect(v.find((x) => x.rule === 'DROP_TABLE')!.line).toBe(2);
    expect(v.every((x) => x.file === 'bad.sql')).toBe(true);
  });

  it('catches SET NOT NULL backfill risk and multi-line USING casts', () => {
    const sql = `
      ALTER TABLE t ADD COLUMN c int;
      ALTER TABLE t ALTER COLUMN c SET NOT NULL;
      ALTER TABLE t ALTER COLUMN c TYPE bigint
        USING c::bigint;
    `;
    const rules = new Set(findForwardOnlyViolations(sql).map((v) => v.rule));
    expect(rules.has('SET_NOT_NULL_BACKFILL_RISK')).toBe(true);
    expect(rules.has('ALTER_COLUMN_USING')).toBe(true);
  });

  it('clean forward-only DDL produces zero violations', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS cohort_topic_locks (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE UNIQUE INDEX IF NOT EXISTS ctl_uq ON cohort_topic_locks (tenant_id, concept_id);
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS resumed_count int NOT NULL DEFAULT 0;
      CREATE POLICY p ON t USING (true);
    `;
    expect(findForwardOnlyViolations(sql)).toEqual([]);
  });

  it('the shipped migration tree is forward-only clean (repo gate)', () => {
    const violations = scanMigrationsDir(join(process.cwd(), 'db', 'migrations'));
    expect(violations).toEqual([]);
  });
});
