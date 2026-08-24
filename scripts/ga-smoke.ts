import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runJourney, type JourneyScript, type LearnerProfile } from '../src/journey/full-journey.js';
import type { CatItem } from '../src/pedagogy/cat.js';
import type { PlannerNode, TimeBudget } from '../src/pedagogy/roadmap.js';
import { buildGoldenCorpus, runGoldenEvals, referenceResponder } from '../src/evals/golden-evals.js';
import { scanMigrationsDir } from '../src/deploy/migration-policy.js';

/**
 * S7-T5 — GA smoke suite (Sprint-07 gate: "Full journey set green against
 * green environment pre-cutover and post-cutover").
 *
 * Deterministic core (journey set + golden evals + migration forward-only
 * policy) always runs; exits non-zero listing failed panels so the cutover
 * operator sees one-shot evidence in the deploy log.
 */

function fail(msg: string): never {
  console.error(`SMOKE FAIL — ${msg}`);
  process.exit(1);
}

// --- Panel 1: journey set ------------------------------------------------

const PROFILE: LearnerProfile = {
  userId: 'smoke-user-0001',
  subjectId: 'gcse-maths',
  intakeSummary: 'GA smoke learner.'
};

const CAT_BANK: CatItem[] = [
  { itemId: 'i1', conceptId: 'c1', difficulty: 2 },
  { itemId: 'i2', conceptId: 'c2', difficulty: 3.5 },
  { itemId: 'i3', conceptId: 'c3', difficulty: 5 },
  { itemId: 'i4', conceptId: 'c4', difficulty: 6.5 },
  { itemId: 'i5', conceptId: 'c5', difficulty: 8 }
];

const NODES: PlannerNode[] = [
  { id: 'c1', difficultyLevel: 1, estimatedMinutes: 8, prerequisiteIds: [] },
  { id: 'c2', difficultyLevel: 2, estimatedMinutes: 9, prerequisiteIds: ['c1'] },
  { id: 'c3', difficultyLevel: 3, estimatedMinutes: 10, prerequisiteIds: ['c2'] },
  { id: 'c4', difficultyLevel: 4, estimatedMinutes: 8, prerequisiteIds: [] },
  { id: 'c5', difficultyLevel: 5, estimatedMinutes: 9, prerequisiteIds: [] }
];

const JOURNEY_SCRIPTS: Array<[string, Partial<JourneyScript>]> = [
  ['happy-path', {}],
  ['struggle-reteach', { concepts: { c1: { delivery: ['CONFUSED', 'PASS'] } } }],
  ['struggle-breaker', { concepts: { c2: { practiceCorrect: [false, false, false] } } }]
];

async function journeyPanel(): Promise<void> {
  for (const [name, overrides] of JOURNEY_SCRIPTS) {
    const trace = await runJourney({
      seed: 7,
      budgetMinutes: 45 satisfies TimeBudget,
      profile: PROFILE,
      catBank: CAT_BANK,
      plannerNodes: NODES,
      concepts: {},
      ...overrides
    });
    if (!trace.completed) fail(`journey ${name} did not complete`);
    if (name === 'happy-path' && trace.matrix.aggregate.knowledgeGainPct < 35) {
      fail(`journey happy-path gain ${trace.matrix.aggregate.knowledgeGainPct}% < 35%`);
    }
    console.log(`journey:${name} OK (planned=${trace.roadmap.planned.length}, gain=${trace.matrix.aggregate.knowledgeGainPct}%)`);
  }
}

// --- Panel 2: golden evals -----------------------------------------------

function evalsPanel(): void {
  const report = runGoldenEvals(buildGoldenCorpus(), referenceResponder);
  if (!report.meetsGates) {
    fail(`golden evals gate red: pass=${report.passRate} factual=${report.factualAccuracy} calibration=${report.calibrationAgreement}`);
  }
  console.log(
    `golden-evals OK (n=${report.totalDialogues}, pass=${(report.passRate * 100).toFixed(1)}%)`
  );
}

// --- Panel 3: migration forward-only policy ------------------------------

function migrationsPanel(): void {
  const violations = scanMigrationsDir(join(process.cwd(), 'db', 'migrations'));
  if (violations.length > 0) {
    for (const v of violations) console.error(`  ${v.file}:${v.line} ${v.rule} — ${v.snippet}`);
    fail(`forward-only policy violations: ${violations.length}`);
  }
  console.log('migrations OK (forward-only policy clean)');
}

mkdirSync('reports', { recursive: true });
await journeyPanel();
evalsPanel();
migrationsPanel();

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(join('reports', `ga-smoke-${stamp}.json`), JSON.stringify({ at: new Date().toISOString(), result: 'GREEN' }, null, 2));
console.log('GA SMOKE GREEN');
