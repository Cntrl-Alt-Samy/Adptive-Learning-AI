import {
  CatEngine,
  type CatItem,
  type CatResult
} from '../pedagogy/cat.js';
import { planRoadmap, type PlannerNode, type RoadmapPlan, type TimeBudget } from '../pedagogy/roadmap.js';
import { DeliveryGate, type DeliveryState, type CheckInVerdict } from '../pedagogy/delivery-gate.js';
import { SocraticLoop, type SocraticTurnResult, type SocraticVerdict } from '../pedagogy/socratic.js';
import { StrikeBreaker, type StrikeTelemetryEvent } from '../pedagogy/strike-breaker.js';
import {
  buildProgressMatrix,
  scheduleReviewOffsets,
  enqueueScheduledReviews,
  reviewerStarterPrompt,
  type ProgressMatrix
} from '../pedagogy/progress.js';
import {
  generateUniqueQuestions,
  type PracticeQuestion,
  type UniquenessRegistry
} from '../pedagogy/practice.js';
import type { ZsetLike } from '../tools/spaced-rep.js';
import type { AiModeName } from '../state/transition-table.js';

/**
 * S6-T1 — Full-journey E2E harness (Doc 03 §12; Sprint-06 gate
 * `journey.e2e.regression`).
 *
 * Composes every shipped engine into the canonical 10-step journey:
 *   INTAKE → PROFILE_READY → CALIBRATED → ROADMAP_READY → CONCEPT_DELIVERED →
 *   SOCRATIC_LOOP → ASSESSMENT_GRADED → REVIEW_COMPLETE → SPACED_REP_SCHEDULED
 *
 * The harness is a deterministic orchestrator over the REAL engines (no
 * re-implemented pedagogy): scripted verdicts drive happy AND struggle paths
 * (confused reteach rotations, Socratic Tier-1 escalation, 3-strike breaker
 * trips). Identical script + seed ⇒ identical trace, which is what makes
 * reconnect-replay regression checks possible.
 */

export const JOURNEY_STEP_SEQUENCE = [
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

export type JourneyStepName = (typeof JOURNEY_STEP_SEQUENCE)[number];

const STEP_MODES: Record<JourneyStepName, AiModeName> = {
  INTAKE: 'PROFILER',
  PROFILE_READY: 'PROFILER',
  CALIBRATED: 'DIAGNOSTICIAN',
  ROADMAP_READY: 'TUTOR',
  CONCEPT_DELIVERED: 'TUTOR',
  SOCRATIC_LOOP: 'SOCRATIC_COACH',
  ASSESSMENT_GRADED: 'ASSESSOR',
  REVIEW_COMPLETE: 'SESSION_REVIEWER',
  SPACED_REP_SCHEDULED: 'SESSION_REVIEWER'
};

export interface LearnerProfile {
  userId: string;
  subjectId: string;
  /** Free-text intake summary (already PII-scrubbed upstream in production). */
  intakeSummary: string;
}

export interface ConceptScript {
  /**
   * Delivery check-in verdicts consumed in order until a PASS is seen.
   * Default: single PASS. A leading CONFUSED exercises auto-reteach rotation.
   */
  delivery?: CheckInVerdict[];
  /** Analogy bank for reteach rotation (default: shared default bank). */
  analogies?: string[];
  /**
   * Socratic verdicts consumed per turn until loopComplete.
   * Default: SOLID ×4. NEEDS_WORK escalates to Tier-1 immediately;
   * two consecutive PARTIALs escalate via hysteresis.
   */
  socratic?: SocraticVerdict[];
  /** Practice attempt outcomes in order (default: [true]). */
  practiceCorrect?: boolean[];
  /** Post-session score 0–100 (default: pre + 40 clamped to ≤ 100). */
  postScore?: number;
}

export interface JourneyScript {
  seed: number;
  budgetMinutes: TimeBudget;
  profile: LearnerProfile;
  catBank: CatItem[];
  /** Correctness pattern for CAT items in selection order (default all true except index 3). */
  catAnswers?: boolean[];
  plannerNodes: PlannerNode[];
  concepts: Record<string, ConceptScript>;
  nowMs?: number;
}

export interface JourneyStepTrace {
  step: number;
  name: JourneyStepName;
  mode: AiModeName;
  detail: Record<string, unknown>;
  atMs: number;
}

export interface StrikeRecord {
  conceptId: string;
  state: string;
  intervention: string;
}

export interface EscalationRecord {
  conceptId: string;
  stage: string;
  tier1: boolean;
  scaffoldDepth: number;
}

export interface JourneyTrace {
  steps: JourneyStepTrace[];
  cat: CatResult;
  roadmap: RoadmapPlan;
  deliveries: Record<string, DeliveryState>;
  socratic: Record<string, SocraticTurnResult[]>;
  strikes: StrikeRecord[];
  breakerTrips: string[];
  telemetryEvents: StrikeTelemetryEvent[];
  escalations: EscalationRecord[];
  practice: PracticeQuestion[];
  matrix: ProgressMatrix;
  reviewsEnqueued: number;
  starterPrompt: string;
  completed: boolean;
}

const DEFAULT_ANALOGY_BANK = [
  'kitchen-recipes',
  'league-tables',
  'commute-routes'
];

/** In-memory uniqueness registry with SET-NX semantics (journey-local). */
class MemoryUniquenessRegistry implements UniquenessRegistry {
  private readonly seen = new Set<string>();

  async has(hash: string): Promise<boolean> {
    return this.seen.has(hash);
  }

  async add(hash: string): Promise<void> {
    this.seen.add(hash);
  }
}

class MemoryZset implements ZsetLike {
  private readonly entries = new Map<string, Map<string, number>>();

  async zadd(key: string, score: number, member: string): Promise<unknown> {
    let inner = this.entries.get(key);
    if (!inner) {
      inner = new Map();
      this.entries.set(key, inner);
    }
    inner.set(member, score);
    return 'OK';
  }

  size(key: string): number {
    return this.entries.get(key)?.size ?? 0;
  }
}

function verdictStream(scriptVerdicts: CheckInVerdict[] | undefined): {
  next: () => CheckInVerdict;
} {
  // Once a scripted sequence is exhausted it yields PASS so the journey stays
  // finite even for all-fail scripts.
  const seq = scriptVerdicts && scriptVerdicts.length > 0 ? [...scriptVerdicts] : ['PASS'];
  let i = 0;
  return {
    next: () => {
      const v = (i < seq.length ? seq[i] : 'PASS') as CheckInVerdict;
      i++;
      return v;
    }
  };
}

function socraticStream(scriptVerdicts: SocraticVerdict[] | undefined): { next: () => SocraticVerdict } {
  const seq: SocraticVerdict[] =
    scriptVerdicts && scriptVerdicts.length > 0
      ? [...scriptVerdicts]
      : ['SOLID', 'SOLID', 'SOLID', 'SOLID'];
  let i = 0;
  return {
    next: () => {
      const v = i < seq.length ? seq[i]! : 'SOLID';
      i++;
      return v;
    }
  };
}

/**
 * Run the full journey. Pure apart from the optional injected ZSET — pass a
 * real Redis adapter in production-shaped tests, omit for pure runs.
 */
export async function runJourney(
  script: JourneyScript,
  deps: { zset?: ZsetLike } = {}
): Promise<JourneyTrace> {
  const nowMs = script.nowMs ?? 1_760_000_000_000;
  let clock = nowMs;
  const steps: JourneyStepTrace[] = [];
  const telemetryEvents: StrikeTelemetryEvent[] = [];
  const strikes: StrikeRecord[] = [];
  const breakerTrips: string[] = [];
  const escalations: EscalationRecord[] = [];

  const emit = (name: JourneyStepName, detail: Record<string, unknown>): void => {
    steps.push({ step: steps.length, name, mode: STEP_MODES[name], detail, atMs: clock });
    clock += 1000; // deterministic simulated inter-step latency
  };

  // Step 0 — INTAKE
  emit('INTAKE', { userId: script.profile.userId, subjectId: script.profile.subjectId });

  // Step 1 — PROFILE_READY
  const words = script.profile.intakeSummary.trim().split(/\s+/).length;
  emit('PROFILE_READY', { personaWords: words });

  // Step 2 — CALIBRATED (real CAT engine)
  const answers = script.catAnswers ?? [true, true, true, false];
  const cat = new CatEngine(script.catBank, { seed: script.seed });
  for (;;) {
    const item = cat.selectNext();
    if (!item) break;
    const correct = answers[cat.administered - 1];
    cat.recordResponse(item.itemId, correct ?? false);
  }
  const catResult = cat.diagnose();
  emit('CALIBRATED', {
    calibratedLevel: catResult.calibratedLevel,
    abilityEstimate: catResult.abilityEstimate,
    itemsAdministered: catResult.itemsAdministered,
    gapMap: catResult.gapMap
  });

  // Step 3 — ROADMAP_READY (real planner, focused on the CAT gap map)
  const roadmap = planRoadmap(script.plannerNodes, catResult.gapMap, script.budgetMinutes, script.seed);
  emit('ROADMAP_READY', {
    planned: roadmap.planned.map((p) => p.conceptId),
    excluded: roadmap.excluded.map((e) => e.conceptId),
    totalMinutes: roadmap.totalMinutes
  });

  const strikeBreaker = new StrikeBreaker();
  const registry = new MemoryUniquenessRegistry();
  const zset = deps.zset ?? new MemoryZset();

  const deliveries: Record<string, DeliveryState> = {};
  const socratic: Record<string, SocraticTurnResult[]> = {};
  const practice: PracticeQuestion[] = [];
  const progressEntries: Array<{ conceptId: string; preScore: number; postScore: number }> = [];

  const preScoreFor = (conceptId: string): number => {
    // Baseline from CAT evidence when measured; else seeded neutral prior.
    const idx = catResult.gapMap.indexOf(conceptId);
    if (idx >= 0) {
      return Math.max(5, Math.round(catResult.abilityEstimate * 6) - idx);
    }
    return Math.max(10, Math.round(catResult.abilityEstimate * 8));
  };

  for (const planned of roadmap.planned) {
    const conceptId = planned.conceptId;
    const cs = script.concepts[conceptId] ?? {};

    // Step 4 — CONCEPT_DELIVERED (real DeliveryGate FSM)
    const bank = cs.analogies ?? DEFAULT_ANALOGY_BANK;
    const gate = new DeliveryGate(bank);
    for (let guard = 0; guard < 64; guard++) {
      const part = gate.currentPart;
      if (part === 'CHECK_IN') break;
      gate.markDelivered(part, { grounded: true });
    }
    const verdicts = verdictStream(cs.delivery);
    for (let guard = 0; guard < 64; guard++) {
      const verdict = verdicts.next();
      const res = gate.submitCheckIn(verdict);
      if (res.canProgress) break;
      // Reteach: re-stream CORE_PRINCIPLE..COMMON_PITFALL grounded, then the
      // rotated analogy is carried on the returned reteach payload.
      for (let g2 = 0; g2 < 64; g2++) {
        const part = gate.currentPart;
        if (part === 'CHECK_IN') break;
        gate.markDelivered(part, { grounded: true });
      }
    }
    deliveries[conceptId] = gate.snapshot();
    emit('CONCEPT_DELIVERED', {
      conceptId,
      passedCheckIn: gate.snapshot().passedCheckIn,
      reteachCount: gate.snapshot().reteachCount,
      lastAnalogy: gate.snapshot().lastAnalogy
    });

    // Step 5 — SOCRATIC_LOOP (real escalation FSM)
    const loop = new SocraticLoop();
    const stream = socraticStream(cs.socratic);
    const turns: SocraticTurnResult[] = [];
    for (let guard = 0; guard < 64; guard++) {
      const result = loop.recordResponse(stream.next());
      turns.push(result);
      if (result.tier1) {
        escalations.push({
          conceptId,
          stage: result.stage,
          tier1: true,
          scaffoldDepth: result.scaffoldDepth
        });
      }
      if (result.loopComplete) break;
    }
    socratic[conceptId] = turns;
    emit('SOCRATIC_LOOP', {
      conceptId,
      turnsCompleted: turns.length,
      loopComplete: turns[turns.length - 1]?.loopComplete ?? false,
      escalatedToTier1: escalations.some((e) => e.conceptId === conceptId)
    });

    // Step 6a — practice generation + graded attempts feeding the breaker
    const questions = await generateUniqueQuestions(registry, { conceptId, count: 1 }, script.seed);
    practice.push(...questions);
    const outcomes = cs.practiceCorrect ?? [true];
    for (let i = 0; i < outcomes.length; i++) {
      if (outcomes[i]) {
        strikeBreaker.recordPass(conceptId);
      } else {
        const fail = strikeBreaker.recordFailure(conceptId);
        strikes.push({ conceptId, state: fail.state, intervention: fail.intervention.kind });
        telemetryEvents.push(...fail.events);
        if (fail.state === 'BREAKER_TRIPPED') breakerTrips.push(conceptId);
      }
    }

    // Step 6b — ASSESSMENT_GRADED scores
    const pre = preScoreFor(conceptId);
    const post = cs.postScore ?? Math.min(100, pre + 40);
    progressEntries.push({ conceptId, preScore: pre, postScore: post });
    emit('ASSESSMENT_GRADED', {
      conceptId,
      preScore: pre,
      postScore: post,
      breakerTripped: breakerTrips.includes(conceptId)
    });
  }

  // Step 7 — REVIEW_COMPLETE (progress matrix + portable starter prompt)
  const matrix = buildProgressMatrix(progressEntries);
  const starterPrompt = reviewerStarterPrompt(matrix, script.profile.subjectId);
  emit('REVIEW_COMPLETE', {
    aggregateGainPct: matrix.aggregate.knowledgeGainPct,
    rows: matrix.rows.length
  });

  // Step 8 — SPACED_REP_SCHEDULED (24h/3d/7d/14d golden offsets)
  const reviews = scheduleReviewOffsets(
    roadmap.planned.map((p) => p.conceptId),
    clock
  );
  const reviewsEnqueued = await enqueueScheduledReviews(zset, script.profile.userId, reviews);
  emit('SPACED_REP_SCHEDULED', { enqueued: reviewsEnqueued });

  return {
    steps,
    cat: catResult,
    roadmap,
    deliveries,
    socratic,
    strikes,
    breakerTrips,
    telemetryEvents,
    escalations,
    practice,
    matrix,
    reviewsEnqueued,
    starterPrompt,
    completed: steps[steps.length - 1]!.name === 'SPACED_REP_SCHEDULED'
  };
}

/** Deterministic fingerprint of a trace for reconnect-replay equality checks. */
export function traceFingerprint(trace: JourneyTrace): string {
  return JSON.stringify({
    steps: trace.steps.map((s) => ({ n: s.name, d: s.detail })),
    cat: trace.cat,
    roadmap: trace.roadmap,
    deliveries: trace.deliveries,
    socratic: Object.fromEntries(Object.entries(trace.socratic).map(([k, v]) => [k, v.length])),
    strikes: trace.strikes,
    trips: trace.breakerTrips,
    matrix: trace.matrix,
    reviews: trace.reviewsEnqueued
  });
}
