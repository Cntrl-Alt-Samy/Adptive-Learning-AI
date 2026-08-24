/**
 * S4-T4 — Socratic inquiry loop with dynamic model escalation (PRD F6.1–F6.2,
 * Doc 04 §10.1, M-01).
 *
 * 4-stage sequence: OWN_WORDS → APPLICATION → DEVILS_ADVOCATE → CONNECTION_BRIDGE.
 * Per-response classification drives scaffold depth; the escalation FSM flips
 * routing to a Tier-1 model when the learner struggles:
 *   escalate on: 1× NEEDS_WORK or 2 consecutive PARTIAL turns
 *   de-escalate: only after a SOLID streak of 2 (hysteresis prevents cost
 *                spikes from tier flapping — Sprint risk mitigation).
 */

export const SOCRATIC_STAGES = [
  'OWN_WORDS',
  'APPLICATION',
  'DEVILS_ADVOCATE',
  'CONNECTION_BRIDGE'
] as const;

export type SocraticStage = (typeof SOCRATIC_STAGES)[number];
export type SocraticVerdict = 'SOLID' | 'PARTIAL' | 'NEEDS_WORK';

export interface SocraticTurnResult {
  stage: SocraticStage;
  /** Stage index after this turn (equal to before when repeating). */
  stageIndex: number;
  /** True when the router must serve this turn's next request on Tier 1. */
  tier1: boolean;
  /** 0 = open question … 3 = maximal scaffolding (sub-step decomposition). */
  scaffoldDepth: number;
  loopComplete: boolean;
}

export class SocraticLoop {
  private stageIndex = 0;
  private solidStreak = 0;
  private partialStreak = 0;
  private escalated = false;
  private depth = 0;
  private complete = false;

  get currentStage(): SocraticStage {
    return SOCRATIC_STAGES[this.stageIndex]!;
  }

  get isEscalated(): boolean {
    return this.escalated;
  }

  /**
   * Record a graded response for the current stage.
   * SOLID advances (and may de-escalate per hysteresis); PARTIAL advances but
   * deepens scaffolding; NEEDS_WORK repeats the stage with deeper scaffolding.
   */
  recordResponse(verdict: SocraticVerdict): SocraticTurnResult {
    if (this.complete) {
      throw new Error('Socratic loop already complete');
    }
    const stage = this.currentStage;
    let advanced = false;

    if (verdict === 'SOLID') {
      this.solidStreak++;
      this.partialStreak = 0;
      this.depth = Math.max(0, this.depth - 1);
      if (this.solidStreak >= 2) this.escalated = false; // de-escalate only after SOLID ×2
      advanced = true;
    } else if (verdict === 'PARTIAL') {
      this.solidStreak = 0;
      this.partialStreak++;
      this.depth = Math.min(3, this.depth + 1);
      if (this.partialStreak >= 2) this.escalated = true;
      advanced = true;
    } else {
      // NEEDS_WORK: immediate escalation + stage repeat at max depth.
      this.solidStreak = 0;
      this.partialStreak = 0;
      this.escalated = true;
      this.depth = Math.min(3, Math.max(this.depth + 1, 2));
    }

    if (advanced) {
      if (this.stageIndex === SOCRATIC_STAGES.length - 1) {
        this.complete = true;
      } else {
        this.stageIndex++;
      }
    }

    return {
      stage,
      stageIndex: this.stageIndex,
      tier1: this.escalated,
      scaffoldDepth: this.depth,
      loopComplete: this.complete
    };
  }
}
