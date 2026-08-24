/**
 * S4-T5 — 3-strike scaffolding circuit breaker (Doc 04 §13.1).
 *
 * Explicit per-concept FSM:
 *   CLEAR --fail--> STRIKE_1 (hint + everyday analogy)
 *         --fail--> STRIKE_2 (decompose into sub-steps)
 *         --fail--> BREAKER_TRIPPED (tag NEEDS_REVISIT in Learning DNA,
 *                                    pivot to prerequisite node or offer a
 *                                    5-minute breather; PostHog event emitted)
 *
 * The counter resets ONLY on an explicit mastery event — passes neither reset
 * nor advance it. Every transition emits a telemetry event object the API
 * layer forwards to PostHog.
 */

export type StrikeState = 'CLEAR' | 'STRIKE_1' | 'STRIKE_2' | 'BREAKER_TRIPPED';

export type StrikeIntervention =
  | { kind: 'HINT_AND_ANALOGY'; strike: 1 }
  | { kind: 'DECOMPOSE_SUBSTEPS'; strike: 2 }
  | {
      kind: 'BREAKER_TRIP';
      strike: 3;
      dnaTag: 'NEEDS_REVISIT';
      pivot: 'PREREQ_NODE' | 'BREATHER_OFFER';
    }
  | { kind: 'NONE'; strike: 0 };

export interface StrikeTelemetryEvent {
  event: string;
  conceptId: string;
  properties: Record<string, unknown>;
}

export class StrikeBreaker {
  private readonly strikes = new Map<string, number>();

  /** Current strike count for a concept (0–3). */
  count(conceptId: string): number {
    return this.strikes.get(conceptId) ?? 0;
  }

  state(conceptId: string): StrikeState {
    const n = this.count(conceptId);
    if (n === 0) return 'CLEAR';
    if (n === 3) return 'BREAKER_TRIPPED';
    if (n === 1) return 'STRIKE_1';
    return 'STRIKE_2';
  }

  /**
   * Record a failed check-in / practice attempt. Idempotent at the trip
   * point: further fails on a tripped concept keep returning the breaker
   * intervention without growing the counter past 3.
   */
  recordFailure(conceptId: string): { state: StrikeState; intervention: StrikeIntervention; events: StrikeTelemetryEvent[] } {
    const next = Math.min(3, this.count(conceptId) + 1);
    this.strikes.set(conceptId, next);
    const events: StrikeTelemetryEvent[] = [];

    let intervention: StrikeIntervention;
    let tripPivot: 'PREREQ_NODE' | 'BREATHER_OFFER' | null = null;
    switch (next) {
      case 1:
        intervention = { kind: 'HINT_AND_ANALOGY', strike: 1 };
        break;
      case 2:
        intervention = { kind: 'DECOMPOSE_SUBSTEPS', strike: 2 };
        break;
      default: {
        tripPivot = 'PREREQ_NODE';
        intervention = {
          kind: 'BREAKER_TRIP',
          strike: 3,
          dnaTag: 'NEEDS_REVISIT',
          pivot: tripPivot
        };
        break;
      }
    }

    events.push({
      event: `pedagogical_strike_${next}`,
      conceptId,
      properties: { state: `STRIKE_${next}`, intervention: intervention.kind }
    });
    if (tripPivot !== null) {
      // SME-review struggle signal (Doc 04 §15 PostHog contract).
      events.push({
        event: 'circuit_breaker_tripped',
        conceptId,
        properties: { dnaTag: 'NEEDS_REVISIT', pivot: tripPivot }
      });
    }

    const state = next === 3 ? 'BREAKER_TRIPPED' : (`STRIKE_${next}` as StrikeState);
    return { state, intervention, events };
  }

  /** Record a successful attempt. Never resets the counter (mastery does). */
  recordPass(conceptId: string): void {
    void conceptId;
  }

  /**
   * Mastery event — the only path back to CLEAR. Also clears the
   * NEEDS_REVISIT semantics implicitly (DNA writer consumes this signal).
   */
  recordMastery(conceptId: string): void {
    this.strikes.delete(conceptId);
  }
}
