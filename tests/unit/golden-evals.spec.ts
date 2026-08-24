import { describe, it, expect } from 'vitest';
import {
  buildGoldenCorpus,
  referenceResponder,
  runGoldenEvals,
  scoreDialogue,
  mutateArtifact,
  mutateDialogue,
  CORPUS_SIZE,
  GOLDEN_SUBJECTS,
  GOLDEN_PERSONAS,
  GOLDEN_STRUGGLES,
  EVAL_PASS_RATE_MIN,
  EVAL_FACTUAL_ACCURACY_MIN,
  EVAL_CALIBRATION_AGREEMENT_MIN
} from '../../src/evals/golden-evals.js';

/**
 * S6-T2 gate `golden-evals`: 200 benchmark dialogues, rubric scoring, and
 * Doc 03 §13 KPI gates. Defect injectors prove the rubric is sensitive —
 * a rubric that cannot fail is not an eval.
 */

const corpus = buildGoldenCorpus();

describe('golden-evals — S6-T2 benchmark framework', () => {
  it('corpus has exactly 200 dialogues covering subject × persona × struggle', () => {
    expect(corpus).toHaveLength(CORPUS_SIZE);
    expect(GOLDEN_SUBJECTS.length * GOLDEN_PERSONAS.length * GOLDEN_STRUGGLES.length).toBe(CORPUS_SIZE);

    const ids = new Set(corpus.map((d) => d.id));
    expect(ids.size).toBe(CORPUS_SIZE);

    const combos = new Set(corpus.map((d) => `${d.subjectId}|${d.personaId}|${d.struggleProfile}`));
    expect(combos.size).toBe(CORPUS_SIZE);
  });

  it('corpus construction is deterministic across calls', () => {
    const again = buildGoldenCorpus();
    expect(again.map((d) => d.id)).toEqual(corpus.map((d) => d.id));
  });

  it('reference responder passes all gates at 100%', () => {
    const report = runGoldenEvals(corpus, referenceResponder);
    expect(report.totalDialogues).toBe(CORPUS_SIZE);
    expect(report.passed).toBe(CORPUS_SIZE);
    expect(report.passRate).toBeGreaterThanOrEqual(EVAL_PASS_RATE_MIN);
    expect(report.factualAccuracy).toBeGreaterThanOrEqual(EVAL_FACTUAL_ACCURACY_MIN);
    expect(report.calibrationAgreement).toBeGreaterThanOrEqual(EVAL_CALIBRATION_AGREEMENT_MIN);
    expect(report.meetsGates).toBe(true);
    expect(report.failures).toHaveLength(0);
  });

  it('rubric: ungrounded taught segments fail GROUNDING only for that dialogue', () => {
    const d = corpus[0]!;
    const stripped = mutateDialogue('DROP_CITATIONS', d);
    const score = scoreDialogue(stripped, referenceResponder(stripped));
    expect(score.passed).toBe(false);
    expect(score.failedDimensions).toEqual(['GROUNDING']);
  });

  it('rubric: swapped teaching order fails PEDAGOGY_ORDER', () => {
    const d = corpus[1]!;
    const shuffled = mutateDialogue('SHUFFLE_STANDARDS', d);
    const score = scoreDialogue(shuffled, referenceResponder(shuffled));
    expect(score.failedDimensions).toContain('PEDAGOGY_ORDER');
  });

  it('rubric: answer dumps fail SOCRATIC_FORM — probes must stay questions', () => {
    const d = corpus[2]!;
    const dumped = mutateDialogue('ANSWER_DUMP', d);
    const score = scoreDialogue(dumped, referenceResponder(dumped));
    expect(score.failedDimensions).toContain('SOCRATIC_FORM');
  });

  it.each([
    ['OFF_BY_ONE_VERDICT', ['VERDICT_ACCURACY']],
    ['CALIBRATION_DRIFT', ['CALIBRATION']]
  ] as const)('artifact defect %s trips %j and drags the aggregate below gates', (kind, dims) => {
    const report = runGoldenEvals(corpus, (d) =>
      mutateArtifact(kind, d, referenceResponder(d))
    );
    expect(report.meetsGates).toBe(false);
    expect(report.failures.length).toBeGreaterThan(0);
    expect(report.failures[0]!.dimensions.length).toBeGreaterThan(0);
    expect(dims.length).toBeGreaterThan(0);
  });

  it('fabricated claims drag factual accuracy far below the 99.2% floor', () => {
    const report = runGoldenEvals(corpus, (d) => mutateArtifact('FABRICATE_CLAIM', d, referenceResponder(d)));
    // One real + one fabricated claim per dialogue ⇒ exactly half grounded.
    expect(report.factualAccuracy).toBe(0.5);
    expect(report.meetsGates).toBe(false);
  });

  it('partial regression sits exactly on the 95% pass-rate boundary', () => {
    // Corrupt exactly 10 dialogues whose band actually shifts under
    // OFF_BY_ONE_VERDICT (clamping leaves near_advanced artifacts intact).
    const mutableIds: string[] = [];
    for (const d of corpus) {
      const mutated = mutateArtifact('OFF_BY_ONE_VERDICT', d, referenceResponder(d));
      if (mutated.predictedBand !== d.teacherGroundTruth.band) mutableIds.push(d.id);
      if (mutableIds.length === 10) break;
    }
    expect(mutableIds).toHaveLength(10);
    const corruptIds = new Set(mutableIds);

    const report = runGoldenEvals(corpus, (d) =>
      corruptIds.has(d.id)
        ? mutateArtifact('OFF_BY_ONE_VERDICT', d, referenceResponder(d))
        : referenceResponder(d)
    );
    expect(report.passed).toBe(190);
    expect(report.passRate).toBeCloseTo(EVAL_PASS_RATE_MIN, 10);
    // Verdict failures don't touch factual accuracy or calibration.
    expect(report.factualAccuracy).toBe(1);
    expect(report.calibrationAgreement).toBe(1);
    expect(report.meetsGates).toBe(true); // exactly on the boundary passes
  });

  it('scoreDialogue reports multi-dimension failures together', () => {
    const d = corpus[3]!;
    const broken = mutateDialogue('DROP_CITATIONS', mutateDialogue('ANSWER_DUMP', d));
    const artifact = mutateArtifact('FABRICATE_CLAIM', broken, referenceResponder(broken));
    const score = scoreDialogue(broken, artifact);
    expect(new Set(score.failedDimensions)).toEqual(
      new Set(['GROUNDING', 'SOCRATIC_FORM', 'FACTUAL_ACCURACY'])
    );
  });
});
