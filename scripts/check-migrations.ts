import { scanMigrationsDir } from '../src/deploy/migration-policy.js';
import { join } from 'node:path';

/**
 * S7-T5 — CI gate: forward-only migration policy (blue-green compatibility).
 */
const violations = scanMigrationsDir(join(process.cwd(), 'db', 'migrations'));
if (violations.length > 0) {
  console.error(`FORWARD-ONLY POLICY VIOLATIONS (${violations.length}):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.rule}  ${v.snippet}`);
  }
  process.exit(1);
}
console.log('migrations forward-only policy: CLEAN');
