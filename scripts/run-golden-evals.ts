import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGoldenCorpus, runGoldenEvals, referenceResponder } from '../src/evals/golden-evals.js';

/**
 * Weekly golden-evals run (Doc 03 §12; Sprint-06 gate `golden-evals`).
 * Writes a timestamped JSON report into reports/ and exits non-zero when
 * any Doc 03 §13 KPI gate is red — wire this into the CI dashboard.
 */

const seedArg = process.argv.find((a) => a.startsWith('--seed='));
const seed = seedArg ? Number(seedArg.split('=')[1]) : undefined;

const corpus = buildGoldenCorpus(seed);
const report = runGoldenEvals(corpus, referenceResponder);

mkdirSync('reports', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join('reports', `golden-evals-${stamp}.json`);
writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), seed: seed ?? null, report }, null, 2));

console.log(`dialogues=${report.totalDialogues} passed=${report.passed}`);
console.log(
  `passRate=${(report.passRate * 100).toFixed(2)}% factualAccuracy=${(report.factualAccuracy * 100).toFixed(2)}% calibrationAgreement=${(report.calibrationAgreement * 100).toFixed(2)}%`
);
console.log(report.meetsGates ? 'GATE GREEN' : 'GATE RED');
console.log(`report → ${file}`);

if (!report.meetsGates) process.exit(1);
