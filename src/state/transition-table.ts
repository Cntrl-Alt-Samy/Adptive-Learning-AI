/**
 * S2-T1 — Deterministic mode state machine (Doc 03 §1).
 * Data-driven transition table over steps 0–8 × 6 modes.
 * The DB-guaranteed next state never depends on LLM whimsy.
 */

export type AiModeName =
  | 'PROFILER'
  | 'DIAGNOSTICIAN'
  | 'TUTOR'
  | 'SOCRATIC_COACH'
  | 'ASSESSOR'
  | 'SESSION_REVIEWER';

export const STEP_SEQUENCE = [
  'INTAKE',
  'PROFILE_READY',
  'CALIBRATED',
  'ROADMAP_READY',
  'CONCEPT_DELIVERED',
  'SOCRATIC_LOOP',
  'ASSESSMENT_GRADED',
  'REVIEW_COMPLETE',
  'SPACED_REP_SCHEDULED'
] as const;

/** mode -> legal step numbers it owns, in canonical order. */
export const TRANSITION_TABLE: Record<AiModeName, number[]> = {
  PROFILER: [0, 1],
  DIAGNOSTICIAN: [1, 2],
  TUTOR: [2, 3, 4],
  SOCRATIC_COACH: [4, 5],
  ASSESSOR: [5, 6],
  SESSION_REVIEWER: [7, 8]
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly mode: AiModeName,
    public readonly currentStep: number,
    public readonly attemptedStep?: number
  ) {
    super(
      `Illegal transition: mode ${mode} cannot own step ${currentStep}` +
        (attemptedStep !== undefined ? ` -> ${attemptedStep}` : '')
    );
    this.name = 'IllegalTransitionError';
  }
}

/** Legal steps a mode may emit checkpoints for. */
export function legalSteps(mode: AiModeName | string): number[] {
  return TRANSITION_TABLE[mode as AiModeName] ?? [];
}

/**
 * Advance within a mode's owned step chain.
 * Throws IllegalTransitionError when the mode doesn't own `currentStep`
 * or the mode is already at its final step (caller switches modes instead).
 */
export function advance(mode: AiModeName | string, currentStep: number): number {
  const steps = legalSteps(mode);
  const idx = steps.indexOf(currentStep);
  if (idx === -1) {
    throw new IllegalTransitionError(mode as AiModeName, currentStep);
  }
  if (idx === steps.length - 1) {
    throw new IllegalTransitionError(mode as AiModeName, currentStep, currentStep);
  }
  return steps[idx + 1]!;
}

/** Validate an emitted checkpoint against the table BEFORE any write (S2-T4). */
export function validateCheckpointStep(mode: AiModeName | string, emittedStep: number): void {
  if (!legalSteps(mode).includes(emittedStep)) {
    throw new IllegalTransitionError(mode as AiModeName, emittedStep);
  }
}
