import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S7-T5 — Forward-only migration policy verifier (Doc 07 TASK 5.2.2).
 *
 * Blue-green cutover requires every applied migration to stay compatible
 * with BOTH green and blue app versions during the soak window. Regression
 * DDL (drops, type changes, renames) breaks that contract — this static
 * checker makes such edits fail CI before they reach the deploy pipeline.
 *
 * Allowed patterns are explicitly whitelisted (e.g. `DROP TABLE IF EXISTS`
 * inside bootstrap scratch tables is still disallowed — migrations folder is
 * append-only by policy).
 */

export interface MigrationViolation {
  file: string;
  line: number;
  snippet: string;
  rule: string;
}

interface Rule {
  name: string;
  pattern: RegExp;
}

const FORBIDDEN_RULES: Rule[] = [
  { name: 'DROP_TABLE', pattern: /\bdrop\s+table\b/i },
  { name: 'DROP_COLUMN', pattern: /\bdrop\s+column\b/i },
  { name: 'DROP_SCHEMA', pattern: /\bdrop\s+schema\b/i },
  { name: 'ALTER_COLUMN_TYPE', pattern: /\balter\s+column\s+\S+\s+type\b/i },
  { name: 'ALTER_COLUMN_USING', pattern: /alter\s+column[\s\S]{0,80}\busing\b/i },
  { name: 'RENAME', pattern: /\brename\s+(column|table|to)\b/i },
  { name: 'SET_NOT_NULL_BACKFILL_RISK', pattern: /\bset\s+not\s+null\b/i },
  { name: 'DROP_CONSTRAINT', pattern: /\bdrop\s+constraint\b/i },
  { name: 'DROP_INDEX', pattern: /\bdrop\s+index\b/i }
];

/** Scan one SQL string; returns all violations with line numbers. */
export function findForwardOnlyViolations(sql: string, file = '<inline>'): MigrationViolation[] {
  const out: MigrationViolation[] = [];
  const lines = sql.split(/\r?\n/);
  for (const rule of FORBIDDEN_RULES) {
    // Line-oriented scan for readability in reports; multi-line USING guard
    // falls back to whole-file match attributed to its first line.
    if (rule.name === 'ALTER_COLUMN_USING') {
      const m = sql.match(rule.pattern);
      if (m) {
        const upto = sql.slice(0, m.index ?? 0);
        out.push({
          file,
          line: upto.split('\n').length,
          snippet: m[0].slice(0, 120),
          rule: rule.name
        });
      }
      continue;
    }
    lines.forEach((line, i) => {
      if (rule.pattern.test(line)) {
        out.push({ file, line: i + 1, snippet: line.trim().slice(0, 120), rule: rule.name });
      }
    });
  }
  return out;
}

/** Scan every `*.sql` under the given directory. */
export function scanMigrationsDir(dir: string): MigrationViolation[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const violations: MigrationViolation[] = [];
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    violations.push(...findForwardOnlyViolations(sql, f));
  }
  return violations;
}
