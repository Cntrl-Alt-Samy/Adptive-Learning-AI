#!/usr/bin/env tsx
/**
 * Forward-only migration applier (S0-T1).
 * Applies db/migrations/*.sql in filename order over DIRECT_URL (or
 * TEST_DATABASE_URL). Idempotent-safe by construction; no downgrades ever.
 *
 * Usage: npx tsx scripts/db-migrate.ts [--file=<specific.sql>]
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = 'db/migrations';

async function main(): Promise<number> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) {
    console.error('DIRECT_URL (or TEST_DATABASE_URL) is not configured — cannot migrate');
    return 2;
  }
  const fileArg = process.argv.find((a) => a.startsWith('--file='))?.slice('--file='.length);
  const files = (
    fileArg ? [fileArg] : readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  ).map((f) => (f.includes('/') || fileArg ? f : join(MIGRATIONS_DIR, f)));

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of files) {
      const sql = readFileSync(file, 'utf8');
      // Single transaction per migration — forward-only, all-or-nothing.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`✓ applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    return 0;
  } finally {
    await client.end();
  }
}

process.exitCode = await main().catch((err) => {
  console.error(`Migration failed: ${(err as Error).message}`);
  return 1;
});
