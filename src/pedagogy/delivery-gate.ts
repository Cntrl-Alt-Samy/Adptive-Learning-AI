/**
 * S4-T3 — 5-part delivery gating + check-in verdict gate (PRD F5.1–F5.3).
 *
 * Pure FSM enforcing Doc 01's 5-Part Pedagogical Standard:
 *   BIG_PICTURE → CORE_PRINCIPLE → TAILORED_EXAMPLE → COMMON_PITFALL → CHECK_IN
 *
 * Invariants:
 *  - Parts unlock strictly in order; skipping throws.
 *  - Content parts must be marked grounded (T01 RAG injection only — F5.2).
 *  - Progression beyond the concept is blocked until a check-in PASS (F5.3).
 *  - CONFUSED ⇒ auto-reteach from CORE_PRINCIPLE with a rotated analogy that
 *    never immediately repeats; BIG_PICTURE is not re-streamed.
 */

export const DELIVERY_PARTS = [
  'BIG_PICTURE',
  'CORE_PRINCIPLE',
  'TAILORED_EXAMPLE',
  'COMMON_PITFALL',
  'CHECK_IN'
] as const;

export type DeliveryPart = (typeof DELIVERY_PARTS)[number];
export type CheckInVerdict = 'PASS' | 'CONFUSED';

export interface DeliveryState {
  partIndex: number;
  part: DeliveryPart;
  deliveredParts: DeliveryPart[];
  passedCheckIn: boolean;
  reteachCount: number;
  lastAnalogy: string | null;
}

export class IllegalDeliveryTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalDeliveryTransitionError';
  }
}

const CONTENT_PARTS: readonly DeliveryPart[] = ['BIG_PICTURE', 'CORE_PRINCIPLE', 'TAILORED_EXAMPLE', 'COMMON_PITFALL'];

export class DeliveryGate {
  private readonly analogyBank: string[];
  private partIndex = 0;
  private readonly delivered = new Set<DeliveryPart>();
  private passed = false;
  private reteachCount = 0;
  private lastAnalogy: string | null = null;

  constructor(analogyBank: string[] = []) {
    if (new Set(analogyBank).size !== analogyBank.length) {
      throw new IllegalDeliveryTransitionError('Analogy bank entries must be unique for rotation');
    }
    if (analogyBank.length === 1) {
      throw new IllegalDeliveryTransitionError('Analogy bank needs ≥ 2 entries to rotate without repeats');
    }
    this.analogyBank = analogyBank;
  }

  get currentPart(): DeliveryPart {
    return DELIVERY_PARTS[this.partIndex]!;
  }

  /** Whether the route layer may stream `part` right now. */
  canDeliver(part: DeliveryPart): boolean {
    return part === DELIVERY_PARTS[this.partIndex];
  }

  /**
   * Mark a content part as fully streamed. Grounding is mandatory for every
   * taught segment — ungrounded delivery is rejected before it can commit.
   */
  markDelivered(part: DeliveryPart, opts: { grounded: boolean }): void {
    if (part !== this.currentPart) {
      throw new IllegalDeliveryTransitionError(
        `Out-of-order delivery: expected ${this.currentPart}, got ${part}`
      );
    }
    if (CONTENT_PARTS.includes(part) && !opts.grounded) {
      throw new IllegalDeliveryTransitionError(`${part} must be grounded in T01 RAG context`);
    }
    this.delivered.add(part);
    if (this.partIndex < DELIVERY_PARTS.length - 1) this.partIndex++;
  }

  /**
   * Submit the check-in verdict. PASS opens progression to the next stage of
   * the session. CONFUSED triggers auto-reteach: rotate to the next analogy
   * in the bank (never an immediate repeat) and rewind to CORE_PRINCIPLE.
   */
  submitCheckIn(verdict: CheckInVerdict): { canProgress: boolean; reteach?: { analogy: string; attempt: number } } {
    if (this.currentPart !== 'CHECK_IN') {
      throw new IllegalDeliveryTransitionError(`Check-in submitted at wrong part: ${this.currentPart}`);
    }
    if (!this.delivered.has('CHECK_IN')) this.delivered.add('CHECK_IN');

    if (verdict === 'PASS') {
      this.passed = true;
      return { canProgress: true };
    }

    if (this.analogyBank.length === 0) {
      throw new IllegalDeliveryTransitionError('Confusion recorded but analogy bank is empty');
    }
    this.reteachCount++;
    const idx = this.analogyBank.indexOf(this.lastAnalogy ?? '');
    const next = this.analogyBank[(idx + 1 + this.analogyBank.length) % this.analogyBank.length]!;
    this.lastAnalogy = next;
    // Rewind to CORE_PRINCIPLE for the reteach pass (index 1); the big
    // picture is already established and is never re-streamed.
    this.partIndex = 1;
    return { canProgress: false, reteach: { analogy: next, attempt: this.reteachCount } };
  }

  snapshot(): DeliveryState {
    return {
      partIndex: this.partIndex,
      part: this.currentPart,
      deliveredParts: [...this.delivered],
      passedCheckIn: this.passed,
      reteachCount: this.reteachCount,
      lastAnalogy: this.lastAnalogy
    };
  }
}
