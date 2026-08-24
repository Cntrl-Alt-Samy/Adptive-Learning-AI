import { describe, it, expect } from 'vitest';
import {
  runJourney,
  traceFingerprint,
  type JourneyScript,
  type LearnerProfile
} from '../../src/journey/full-journey.js';
import type { CatItem } from '../../src/pedagogy/cat.js';
import type { PlannerNode } from '../../src/pedagogy/roadmap.js';

/**
 * S6-T1 gate `journey.e2e.regression`: the canonical 10-step journey across
 * the REAL engines — happy path, struggle path (reteach rotation, Socratic
 * Tier-1 escalation, 3-strike breaker trip) and reconnect-replay
 * determinism.
 */

const PROFILE: LearnerProfile = {
  userId: '11111111-1111-4111-8111-111111111111',
  subjectId: 'gcse-maths',
  intakeSummary: 'Year 10 student, wants to feel confident with algebra before mocks.'
};

const CAT_BANK: CatItem[] = [
  { itemId: 'i1', conceptId: 'c1', difficulty: 2 },
  { itemId: 'i2', conceptId: 'c2', difficulty: 3.5 },
  { itemId: 'i3', conceptId: 'c3', difficulty: 5 },
  { itemId: 'i4', conceptId: 'c4', difficulty: 6.5 },
  { itemId: 'i5', conceptId: 'c5', difficulty: 8 },
  { itemId: 'i6', conceptId: 'c6', difficulty: 4 }
];

const NODES: PlannerNode[] = [
  { id: 'c1', difficultyLevel: 1, estimatedMinutes: 8, prerequisiteIds: [] },
  { id: 'c2', difficultyLevel: 2, estimatedMinutes: 9, prerequisiteIds: ['c1'] },
  { id: 'c3', difficultyLevel: 3, estimatedMinutes: 10, prerequisiteIds: ['c2'] },
  { id: 'c4', difficultyLevel: 4, estimatedMinutes: 8, prerequisiteIds: [] },
  { id: 'c5', difficultyLevel: 5, estimatedMinutes: 9, prerequisiteIds: [] },
  { id: 'c6', difficultyLevel: 6, estimatedMinutes: 12, prerequisiteIds: ['c4'] }
];

function baseScript(overrides: Partial<JourneyScript> = {}): JourneyScript {
  return {
    seed: 42,
    budgetMinutes: 45,
    profile: PROFILE,
    catBank: CAT_BANK,
    plannerNodes: NODES,
    concepts: {},
    ...overrides
  };
}

/** A concept guaranteed to be taught, derived from the real planner output. */
async function firstPlannedConcept(): Promise<string> {
  const probe = await runJourney(baseScript());
  return probe.roadmap.planned[0]!.conceptId;
}

describe('journey.e2e.regression — S6-T1 full-journey harness', () => {
  it('happy path completes all ten steps with zero interventions', async () => {
    const trace = await runJourney(baseScript());

    expect(trace.completed).toBe(true);
    const names = trace.steps.map((s) => s.name);
    expect(names[0]).toBe('INTAKE');
    expect(names).toContain('CALIBRATED');
    expect(names).toContain('ROADMAP_READY');
    expect(names[names.length - 1]).toBe('SPACED_REP_SCHEDULED');

    // Mode attribution matches the deterministic transition table owners.
    expect(trace.steps.find((s) => s.name === 'INTAKE')!.mode).toBe('PROFILER');
    expect(trace.steps.find((s) => s.name === 'SOCRATIC_LOOP')!.mode).toBe('SOCRATIC_COACH');
    expect(trace.steps.find((s) => s.name === 'REVIEW_COMPLETE')!.mode).toBe('SESSION_REVIEWER');

    // Roadmap respects budget + prereqs (real planner guarantees).
    expect(trace.roadmap.totalMinutes).toBeLessThanOrEqual(45);
    const plannedIds = trace.roadmap.planned.map((p) => p.conceptId);
    expect(plannedIds.length).toBeGreaterThan(0);

    // Every delivered concept passed its check-in with no reteach needed.
    for (const id of plannedIds) {
      expect(trace.deliveries[id]!.passedCheckIn).toBe(true);
      expect(trace.deliveries[id]!.reteachCount).toBe(0);
      expect(trace.socratic[id]!.length).toBe(4);
    }

    expect(trace.strikes).toHaveLength(0);
    expect(trace.breakerTrips).toHaveLength(0);
    expect(trace.escalations).toHaveLength(0);

    // Knowledge-gain contract: aggregate ≥35% on the teaching path.
    expect(trace.matrix.aggregate.knowledgeGainPct).toBeGreaterThanOrEqual(35);

    // Spaced-rep golden offsets enqueued for exactly every planned concept.
    expect(trace.reviewsEnqueued).toBe(plannedIds.length * 4);
  });

  it('CAT terminal result stays hidden until diagnose() — no intermediate verdict fields on steps', async () => {
    const trace = await runJourney(baseScript());
    const calibratedStep = trace.steps.find((s) => s.name === 'CALIBRATED')!;
    expect(Object.keys(calibratedStep.detail)).not.toContain('correct');
    expect(calibratedStep.detail.itemsAdministered).toBeGreaterThanOrEqual(4);
    expect(calibratedStep.detail.itemsAdministered).toBeLessThanOrEqual(5);
  });

  it('struggle path: confused check-ins rotate analogies without immediate repeats', async () => {
    const conceptId = await firstPlannedConcept();
    const trace = await runJourney(
      baseScript({
        concepts: {
          [conceptId]: { delivery: ['CONFUSED', 'PASS'] }
        }
      })
    );
    const d = trace.deliveries[conceptId]!;
    expect(d.passedCheckIn).toBe(true);
    expect(d.reteachCount).toBe(1);
    // Rotation starts the bank from the top after a null last-analogy.
    expect(d.lastAnalogy).toBe('kitchen-recipes');
  });

  it('struggle path: NEEDS_WORK escalates Socratic routing to Tier-1 with deeper scaffolding', async () => {
    const conceptId = await firstPlannedConcept();
    const trace = await runJourney(
      baseScript({
        concepts: {
          [conceptId]: { socratic: ['NEEDS_WORK', 'SOLID'] }
        }
      })
    );
    const esc = trace.escalations.filter((e) => e.conceptId === conceptId);
    expect(esc.length).toBeGreaterThan(0);
    expect(esc.every((e) => e.tier1)).toBe(true);
    // NEEDS_WORK repeats its stage (no advance); completing all four stages
    // afterwards takes one SOLID per advance — 1 repeat + 4 advances = 5.
    expect(trace.socratic[conceptId]!.length).toBe(5);
  });

  it('struggle path: three consecutive fails trip the circuit breaker with telemetry + DNA tag', async () => {
    const conceptId = await firstPlannedConcept();
    const trace = await runJourney(
      baseScript({
        concepts: {
          [conceptId]: { practiceCorrect: [false, false, false] }
        }
      })
    );
    expect(trace.breakerTrips).toEqual([conceptId]);
    expect(trace.strikes.filter((s) => s.conceptId === conceptId).map((s) => s.state)).toEqual([
      'STRIKE_1',
      'STRIKE_2',
      'BREAKER_TRIPPED'
    ]);
    const events = trace.telemetryEvents.map((e) => e.event);
    expect(events).toContain('pedagogical_strike_1');
    expect(events).toContain('pedagogical_strike_2');
    expect(events).toContain('pedagogical_strike_3');
    expect(events).toContain('circuit_breaker_tripped');

    const trip = trace.telemetryEvents.find((e) => e.event === 'circuit_breaker_tripped')!;
    expect(trip.properties.dnaTag).toBe('NEEDS_REVISIT');
    expect(trip.properties.pivot).toBe('PREREQ_NODE');
  });

  it('reconnect replay: identical script + seed reproduce an identical trace fingerprint', async () => {
    const conceptId = await firstPlannedConcept();
    const script = baseScript({
      concepts: { [conceptId]: { socratic: ['PARTIAL', 'PARTIAL', 'SOLID'] } }
    });
    const a = await runJourney(script);
    const b = await runJourney(script);
    expect(traceFingerprint(a)).toBe(traceFingerprint(b));
    // Two PARTIAL turns flip Tier-1 escalation via hysteresis in both runs.
    expect(a.escalations.some((e) => e.conceptId === conceptId)).toBe(true);
  });

  it('practice questions are unique within the journey and carry content hashes', async () => {
    const trace = await runJourney(baseScript());
    const hashes = trace.practice.map((q) => q.contentHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(trace.practice.length).toBe(trace.roadmap.planned.length);
  });

  it('reviewer starter prompt names weakest concepts and overall gain', async () => {
    const trace = await runJourney(baseScript());
    expect(trace.starterPrompt).toContain('Resume plan — gcse-maths');
    expect(trace.starterPrompt).toContain(`Overall gain: ${trace.matrix.aggregate.knowledgeGainPct}%`);
  });
});
