import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

/**
 * cli-e2e.spec — Sprint 0 gate (dry run):
 *   * fixture curricula for 3 subjects validate (exit 0)
 *   * malformed fixture exits non-zero with a human-readable error report
 */
const require = createRequire(import.meta.url);
const tsxCli = join(require.resolve('tsx/package.json'), '..', 'dist', 'cli.mjs');
const ROOT = process.cwd();

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [tsxCli, join(ROOT, 'scripts', 'ingest-curriculum.ts'), ...args], {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      timeout: 60_000
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const reportPaths: string[] = [];

afterAll(() => {
  for (const p of reportPaths) {
    if (existsSync(p)) rmSync(p);
  }
});

describe('cli-e2e — valid fixtures validate (exit 0)', () => {
  it.each(['gcse_maths_edexcel.json', 'python_programming.json', 'gcse_economics_aqa.json'])(
    '%s exits 0 with VALID verdict',
    (file) => {
      const report = join(ROOT, `ingest-report.${file}.e2e.json`);
      reportPaths.push(report);
      const run = runCli([
        `--file=${join(ROOT, 'curricula', file)}`,
        '--validate-dag',
        `--report=${report}`
      ]);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('RESULT: VALID');
    }
  );
});

describe('cli-e2e — malformed fixtures fail loudly (exit 1 + readable diagnostics)', () => {
  it.each([
    ['curricula.cycle.json', ['CYCLE', '->']],
    ['curricula.duplicate_ids.json', ['DUPLICATE_ID']],
    ['curricula.dangling_ref.json', ['DANGLING_REF']],
    ['curricula.self_loop.json', ['SELF_LOOP']],
    ['curricula.cross_subject.json', ['CROSS_SUBJECT_EDGE']]
  ])('%s exits 1 reporting %s', (fixture, needles) => {
    const run = runCli(['--file=' + join(ROOT, 'tests', 'fixtures', fixture), '--validate-dag']);
    expect(run.status).toBe(1);
    const output = `${run.stderr}\n${run.stdout}`;
    for (const needle of needles) {
      expect(output).toContain(needle);
    }
  });

  it('schema-invalid JSON exits 1 with human-readable schema errors', () => {
    const run = runCli(['--file=' + join(ROOT, 'tests', 'fixtures', 'curricula.schema_invalid.json')]);
    expect(run.status).toBe(1);
    expect(`${run.stderr}${run.stdout}`).toMatch(/SCHEMA|Invalid JSON|Schema violation/);
  });

  it('usage errors exit with code 3', () => {
    const run = runCli([]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('--file');
  });
});

describe('cli-e2e — machine-readable output mode', () => {
  it('--json emits structured validation result', () => {
    const run = runCli([
      `--file=${join(ROOT, 'curricula', 'python_programming.json')}`,
      '--json'
    ]);
    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout) as { subject: string; valid: boolean };
    expect(payload.valid).toBe(true);
    expect(payload.subject).toBe('python_programming');
  });
});

describe('cli-e2e — dry-by-default safety', () => {
  it('no --index flag means nothing is indexed even when PINECONE_API_KEY is absent', () => {
    const run = runCli([`--file=${join(ROOT, 'curricula', 'gcse_maths_edexcel.json')}`]);
    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain('INDEXED');
    // No stray reports written when --report omitted (harness-owned ones excluded)
    const strays = readdirSync(ROOT)
      .filter((f) => f.startsWith('ingest-report.') && f.endsWith('.json'))
      .filter((f) => !reportPaths.includes(join(ROOT, f)));
    expect(strays).toEqual([]);
  });
});
