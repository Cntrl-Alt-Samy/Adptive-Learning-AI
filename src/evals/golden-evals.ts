import { hash32 } from '../pedagogy/rng.js';
import type { CalibratedLevel } from '../pedagogy/cat.js';

/**
 * S6-T2 — Golden evaluation framework (Doc 03 §12–13; Sprint-06 gate
 * `golden-evals` G6).
 *
 * A deterministic harness over a 200-dialogue benchmark corpus (subject ×
 * persona × struggle-profile). The model-under-test is a pluggable responder:
 * production wires a recorded-transcript replay or live judge adapter in; CI
 * uses the reference responder plus deliberate defect injectors to prove the
 * rubric is sensitive (not vacuous) without any network dependency.
 *
 * Rubric dimensions (Doc 03 §12):
 *  - GROUNDING: every taught segment cites syllabus chunks ([S#] refs)
 *  - PEDAGOGY_ORDER: the 5-part standard appears in canonical order
 *  - SOCRATIC_FORM: probes are questions — never answer dumps
 *  - VERDICT_ACCURACY: predicted calibrated level equals teacher assessment
 *  - FACTUAL_ACCURACY: every assertion exists in the syllabus claim registry
 *  - CALIBRATION: |predicted θ − teacher θ| ≤ tolerance
 *
 * Gates (Doc 03 §13): pass rate ≥ 95%, factual accuracy ≥ 99.2%,
 * calibration agreement ≥ 82%.
 */

export const EVAL_PASS_RATE_MIN = 0.95;
export const EVAL_FACTUAL_ACCURACY_MIN = 0.992;
export const EVAL_CALIBRATION_AGREEMENT_MIN = 0.82;
/** θ tolerance for human-calibration agreement. */
export const CALIBRATION_TOLERANCE_THETA = 0.75;

export type StruggleProfile = 'NONE' | 'MILD' | 'SEVERE' | 'ANXIETY' | 'PREREQ_GAP';

export interface GoldenTurn {
  role: 'tutor' | 'learner';
  text: string;
  /** [S#]-style syllabus chunk citations for taught content. */
  citations?: string[];
  /** Pedagogical standard marker carried by tutor turns. */
  standardTag?:
    | 'BIG_PICTURE'
    | 'CORE_PRINCIPLE'
    | 'TAILORED_EXAMPLE'
    | 'COMMON_PITFALL'
    | 'CHECK_IN'
    | 'SOCRATIC_QUESTION';
}

export interface GoldenDialogue {
  id: string;
  subjectId: string;
  personaId: string;
  struggleProfile: StruggleProfile;
  turns: GoldenTurn[];
  teacherGroundTruth: {
    /** Teacher-assessed ability on the same θ scale as CAT. */
    abilityTheta: number;
    band: CalibratedLevel;
    /** Verified syllabus facts this dialogue may legitimately assert. */
    claimRegistry: string[];
  };
}

/** What the model-under-test produced for one dialogue. */
export interface TutorArtifact {
  predictedBand: CalibratedLevel;
  predictedTheta: number;
  /** Claims the tutor asserted during the dialogue. */
  assertedClaims: string[];
}

const CANONICAL_ORDER = [
  'BIG_PICTURE',
  'CORE_PRINCIPLE',
  'TAILORED_EXAMPLE',
  'COMMON_PITFALL',
  'CHECK_IN'
] as const;

export type RubricDimension =
  | 'GROUNDING'
  | 'PEDAGOGY_ORDER'
  | 'SOCRATIC_FORM'
  | 'VERDICT_ACCURACY'
  | 'FACTUAL_ACCURACY'
  | 'CALIBRATION';

export interface DialogueScore {
  dialogueId: string;
  passed: boolean;
  failedDimensions: RubricDimension[];
  /** Claims asserted during the dialogue. */
  totalClaims: number;
  /** Assertions absent from the syllabus registry (fabrications). */
  badClaims: number;
  /** Whether numeric calibration landed within teacher tolerance. */
  calibrated: boolean;
}

export interface EvalReport {
  totalDialogues: number;
  passed: number;
  passRate: number;
  /** Share of tutor assertions grounded in syllabus registries. */
  factualAccuracy: number;
  /** Share of dialogues whose predicted θ lands within teacher tolerance. */
  calibrationAgreement: number;
  failures: Array<{ dialogueId: string; dimensions: RubricDimension[] }>;
  meetsGates: boolean;
}

function bandOf(ability: number): CalibratedLevel {
  if (ability < 3) return 'confirmed_beginner';
  if (ability < 5.5) return 'low_intermediate';
  if (ability < 8) return 'high_intermediate';
  return 'near_advanced';
}

/** Rubric scoring of one dialogue against its artifact. */
export function scoreDialogue(dialogue: GoldenDialogue, artifact: TutorArtifact): DialogueScore {
  const failed = new Set<RubricDimension>();
  const gt = dialogue.teacherGroundTruth;

  // GROUNDING — every taught segment must cite at least one chunk ref.
  for (const turn of dialogue.turns) {
    if (turn.role === 'tutor' && turn.standardTag && turn.standardTag !== 'SOCRATIC_QUESTION') {
      const cited = (turn.citations ?? []).some((c) => /^S\d+/.test(c));
      if (!cited) failed.add('GROUNDING');
    }
  }

  // PEDAGOGY_ORDER — canonical 5-part sequence as an ordered subsequence.
  let orderIdx = 0;
  for (const tag of dialogue.turns.map((t) => t.standardTag)) {
    if (!tag || tag === 'SOCRATIC_QUESTION') continue;
    if (tag === CANONICAL_ORDER[orderIdx]) orderIdx++;
  }
  if (orderIdx < CANONICAL_ORDER.length) failed.add('PEDAGOGY_ORDER');

  // SOCRATIC_FORM — probes are questions, never answer dumps.
  for (const turn of dialogue.turns) {
    if (
      turn.role === 'tutor' &&
      turn.standardTag === 'SOCRATIC_QUESTION' &&
      !turn.text.trim().endsWith('?')
    ) {
      failed.add('SOCRATIC_FORM');
    }
  }

  // VERDICT_ACCURACY — predicted band matches teacher assessment.
  if (artifact.predictedBand !== gt.band) failed.add('VERDICT_ACCURACY');

  // FACTUAL_ACCURACY — every assertion must exist in the syllabus registry.
  const badClaims = artifact.assertedClaims.filter((c) => !gt.claimRegistry.includes(c)).length;
  if (badClaims > 0) failed.add('FACTUAL_ACCURACY');

  // CALIBRATION — numeric agreement within tolerance.
  const calibrated = Math.abs(artifact.predictedTheta - gt.abilityTheta) <= CALIBRATION_TOLERANCE_THETA;
  if (!calibrated) failed.add('CALIBRATION');

  return {
    dialogueId: dialogue.id,
    passed: failed.size === 0,
    failedDimensions: [...failed],
    totalClaims: artifact.assertedClaims.length,
    badClaims,
    calibrated
  };
}

export function meetsGates(
  report: Pick<EvalReport, 'passRate' | 'factualAccuracy' | 'calibrationAgreement'>
): boolean {
  return (
    report.passRate >= EVAL_PASS_RATE_MIN &&
    report.factualAccuracy >= EVAL_FACTUAL_ACCURACY_MIN &&
    report.calibrationAgreement >= EVAL_CALIBRATION_AGREEMENT_MIN
  );
}

/** Aggregate per-dialogue scores into the gated report shape. */
export function buildReport(scores: DialogueScore[]): EvalReport {
  const n = scores.length;
  const passed = scores.filter((s) => s.passed).length;
  const passRate = n === 0 ? 0 : passed / n;

  const totalClaims = scores.reduce((s, x) => s + x.totalClaims, 0);
  const badClaims = scores.reduce((s, x) => s + x.badClaims, 0);
  const factualAccuracy = totalClaims === 0 ? 1 : (totalClaims - badClaims) / totalClaims;

  const calibrated = scores.filter((s) => s.calibrated).length;
  const calibrationAgreement = n === 0 ? 0 : calibrated / n;

  const failures = scores
    .filter((s) => !s.passed)
    .map((s) => ({ dialogueId: s.dialogueId, dimensions: s.failedDimensions }));

  const partial = { totalDialogues: n, passed, passRate, factualAccuracy, calibrationAgreement, failures };
  return { ...partial, meetsGates: meetsGates(partial) };
}

/**
 * Run the full eval suite. `responder` produces the artifact under test for
 * each dialogue (recorded replay, live judge adapter, or reference tutor).
 */
export function runGoldenEvals(
  corpus: GoldenDialogue[],
  responder: (d: GoldenDialogue) => TutorArtifact
): EvalReport {
  return buildReport(corpus.map((d) => scoreDialogue(d, responder(d))));
}

// ---------------------------------------------------------------------------
// Benchmark corpus construction — deterministic, exactly 200 dialogues.
// ---------------------------------------------------------------------------

export const GOLDEN_SUBJECTS = ['gcse-maths', 'gcse-biology', 'alevel-maths', 'gcse-physics'] as const;
export const GOLDEN_PERSONAS = [
  'ZARA_14_VISUAL',
  'AMARA_16_FAST_PACED',
  'DEV_9_FOUNDATION',
  'PRIYA_17_EXAM_DRILL',
  'TOM_15_ANXIOUS',
  'LEAH_16_STEADY',
  'KAI_15_SPORTY',
  'SOFIA_16_CURIOUS',
  'JAYDEN_14_GAP_PRONE',
  'RUTH_17_PERFECTIONIST'
] as const;
export const GOLDEN_STRUGGLES: StruggleProfile[] = ['NONE', 'MILD', 'SEVERE', 'ANXIETY', 'PREREQ_GAP'];

export const CORPUS_SIZE = 200;

const CLAIM_BANK: Record<string, string[]> = {
  'gcse-maths': [
    'The quadratic formula solves ax²+bx+c=0 when a≠0.',
    'The discriminant b²−4ac determines the number of real roots.',
    'Factorising pairs numbers whose product is ac and sum is b.',
    'Completing the square rewrites a quadratic in vertex form.'
  ],
  'gcse-biology': [
    'Mitochondria are the site of aerobic respiration.',
    'Enzymes are proteins that catalyse reactions at body temperature.',
    'Diffusion moves particles down a concentration gradient.',
    'Stomata control gas exchange in leaves.'
  ],
  'alevel-maths': [
    'The chain rule states dy/dx = dy/du · du/dx.',
    'Integration by parts follows from the product rule.',
    'A geometric series converges when |r| < 1.',
    'The binomial expansion is valid for |x| < 1.'
  ],
  'gcse-physics': [
    'Newton’s second law gives F = ma.',
    'Momentum is conserved in closed systems.',
    'Ohm’s law relates V = IR for ohmic conductors.',
    'Waves transfer energy without transferring matter.'
  ]
};

const TOPIC_BANK: Record<string, string> = {
  'gcse-maths': 'quadratic equations',
  'gcse-biology': 'cell respiration',
  'alevel-maths': 'differentiation techniques',
  'gcse-physics': 'forces and motion'
};

const STRUGGLE_THETA_ADJUSTMENT: Record<StruggleProfile, number> = {
  NONE: 1.2,
  MILD: 0.4,
  SEVERE: -1.4,
  ANXIETY: -0.3,
  PREREQ_GAP: -0.8
};

/** Persona baselines on the θ scale (index-aligned with GOLDEN_PERSONAS). */
const BASE_THETA_BY_PERSONA_INDEX = [4.2, 7.4, 2.1, 8.2, 3.4, 5.6, 4.9, 6.8, 3.0, 7.9];

function clampTheta(t: number): number {
  return Math.round(Math.min(9.5, Math.max(0.5, t)) * 100) / 100;
}

/**
 * Deterministic 200-dialogue corpus: 4 subjects × 10 personas × 5 struggle
 * profiles. Stable across runs and machines (seeded hashing only).
 */
export function buildGoldenCorpus(seed = 20261124): GoldenDialogue[] {
  const out: GoldenDialogue[] = [];
  for (const subjectId of GOLDEN_SUBJECTS) {
    for (let p = 0; p < GOLDEN_PERSONAS.length; p++) {
      for (let s = 0; s < GOLDEN_STRUGGLES.length; s++) {
        const personaId = GOLDEN_PERSONAS[p]!;
        const struggle = GOLDEN_STRUGGLES[s]!;
        const id = `GD-${hash32(`${subjectId}|${personaId}|${struggle}|${seed}`)
          .toString(16)
          .toUpperCase()
          .padStart(8, '0')}`;
        const topic = TOPIC_BANK[subjectId]!;
        const theta = clampTheta(BASE_THETA_BY_PERSONA_INDEX[p]! + STRUGGLE_THETA_ADJUSTMENT[struggle]);
        const claims = CLAIM_BANK[subjectId]!;
        const scaffoldDepth = s;

        out.push({
          id,
          subjectId,
          personaId,
          struggleProfile: struggle,
          turns: [
            {
              role: 'learner',
              text:
                struggle === 'NONE'
                  ? `I think I get ${topic} but want to check my understanding.`
                  : `I keep getting stuck on ${topic} (support level: ${struggle.toLowerCase()}).`
            },
            {
              role: 'tutor',
              standardTag: 'BIG_PICTURE',
              citations: ['S1'],
              text: `${topic} sits early in this week's roadmap because examiners weight it heavily.`
            },
            { role: 'tutor', standardTag: 'CORE_PRINCIPLE', citations: ['S2'], text: claims[0] ?? '' },
            {
              role: 'tutor',
              standardTag: 'TAILORED_EXAMPLE',
              citations: ['S3'],
              text: `${personaId.split('_').slice(1).join(' ').toLowerCase()}-style worked example on ${topic}.`
            },
            {
              role: 'tutor',
              standardTag: 'COMMON_PITFALL',
              citations: ['S4'],
              text: 'Learners often drop the sign when rearranging — watch step two.'
            },
            {
              role: 'tutor',
              standardTag: 'CHECK_IN',
              citations: ['S4'],
              text: `Quick check-in: try one yourself — I'll scaffold ${scaffoldDepth} step(s) if you wobble.`
            },
            {
              role: 'tutor',
              standardTag: 'SOCRATIC_QUESTION',
              text: 'What happens to your answer if the leading coefficient doubles?'
            },
            {
              role: 'learner',
              text: scaffoldDepth >= 2 ? 'Not sure — can you break it into sub-steps?' : 'Let me try… got it.'
            },
            {
              role: 'tutor',
              text: 'Nice work — log what felt shaky and we revisit it after the spaced-rep nudge.'
            }
          ],
          teacherGroundTruth: { abilityTheta: theta, band: bandOf(theta), claimRegistry: claims }
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reference responder + defect injectors (rubric sensitivity proof tools).
// ---------------------------------------------------------------------------

/** Perfect-compliance responder derived from teacher ground truth. */
export function referenceResponder(d: GoldenDialogue): TutorArtifact {
  return {
    predictedBand: d.teacherGroundTruth.band,
    predictedTheta: d.teacherGroundTruth.abilityTheta,
    assertedClaims: d.turns
      .filter((t) => t.role === 'tutor' && t.standardTag === 'CORE_PRINCIPLE')
      .map((t) => t.text)
  };
}

export type ArtifactDefectKind =
  | 'OFF_BY_ONE_VERDICT'
  | 'FABRICATE_CLAIM'
  | 'CALIBRATION_DRIFT';

/** Mutate an artifact with one systematic regression (rubric sensitivity). */
export function mutateArtifact(
  kind: ArtifactDefectKind,
  _d: GoldenDialogue,
  artifact: TutorArtifact
): TutorArtifact {
  switch (kind) {
    case 'OFF_BY_ONE_VERDICT': {
      const bands: CalibratedLevel[] = [
        'confirmed_beginner',
        'low_intermediate',
        'high_intermediate',
        'near_advanced'
      ];
      const idx = bands.indexOf(artifact.predictedBand);
      return { ...artifact, predictedBand: bands[Math.min(bands.length - 1, idx + 1)]! };
    }
    case 'FABRICATE_CLAIM':
      return {
        ...artifact,
        assertedClaims: [...artifact.assertedClaims, 'The Mitochondrion Theory was proven in 1851 by Lord Kelvin.']
      };
    case 'CALIBRATION_DRIFT':
      return { ...artifact, predictedTheta: Math.min(10, artifact.predictedTheta + 2.5) };
  }
}

export type DialogueDefectKind =
  | 'DROP_CITATIONS'
  | 'SHUFFLE_STANDARDS'
  | 'ANSWER_DUMP';

/** Mutate a dialogue with one systematic delivery regression. */
export function mutateDialogue(kind: DialogueDefectKind, d: GoldenDialogue): GoldenDialogue {
  switch (kind) {
    case 'DROP_CITATIONS':
      return {
        ...d,
        turns: d.turns.map((t) =>
          t.role === 'tutor' && t.standardTag && t.standardTag !== 'SOCRATIC_QUESTION'
            ? { ...t, citations: [] }
            : t
        )
      };
    case 'SHUFFLE_STANDARDS': {
      const turns = [...d.turns];
      const cpIdx = turns.findIndex((t) => t.standardTag === 'CORE_PRINCIPLE');
      const teIdx = turns.findIndex((t) => t.standardTag === 'TAILORED_EXAMPLE');
      if (cpIdx >= 0 && teIdx >= 0) {
        const tmp = turns[cpIdx]!;
        turns[cpIdx] = turns[teIdx]!;
        turns[teIdx] = tmp;
      }
      return { ...d, turns };
    }
    case 'ANSWER_DUMP':
      return {
        ...d,
        turns: d.turns.map((t) =>
          t.role === 'tutor' && t.standardTag === 'SOCRATIC_QUESTION'
            ? { ...t, text: 'The final answer is x = 3, no questions needed.' }
            : t
        )
      };
  }
}
