/**
 * S5-T6 — Educator portal analytics core, F11 (Doc 03 §10 / Doc 07 TASK 4.3.1).
 *
 * Pure aggregation layer between the DB and the educator console:
 *  - Cohort misconception matrix: % failed per concept over attempt records.
 *  - k-anonymity floor: cells backed by fewer than K distinct learners
 *    (default 5) are SUPPRESSED — tiny cohorts must not be re-identifiable.
 *  - Syllabus topic locks: educator writes cohort bounds consumed by the S4
 *    roadmap planner (locked concepts are excluded from every plan).
 *  - Roster shaping: alias-only view; no row-level transcript data ever
 *    crosses this boundary for locked cohorts.
 */

export interface AttemptRecord {
  userId: string;
  conceptId: string;
  correct: boolean;
}

export const DEFAULT_K_ANONYMITY_FLOOR = 5;

export interface MisconceptionCell {
  conceptId: string;
  failedPct: number;
  learnerCount: number;
}

export interface MisconceptionMatrix {
  cells: MisconceptionCell[];
  /** Concepts omitted because their backing cohort was below the floor. */
  suppressedConceptIds: string[];
}

export function buildMisconceptionMatrix(
  attempts: readonly AttemptRecord[],
  options: { kAnonymityFloor?: number } = {}
): MisconceptionMatrix {
  const floor = options.kAnonymityFloor ?? DEFAULT_K_ANONYMITY_FLOOR;
  const byConcept = new Map<string, Map<string, boolean>>();
  for (const a of attempts) {
    let learners = byConcept.get(a.conceptId);
    if (!learners) {
      learners = new Map();
      byConcept.set(a.conceptId, learners);
    }
    // Latest attempt per (learner, concept): last write wins.
    learners.set(a.userId, a.correct);
  }

  const cells: MisconceptionCell[] = [];
  const suppressedConceptIds: string[] = [];
  for (const [conceptId, learners] of byConcept) {
    if (learners.size < floor) {
      suppressedConceptIds.push(conceptId);
      continue;
    }
    let failed = 0;
    for (const correct of learners.values()) if (!correct) failed++;
    cells.push({
      conceptId,
      failedPct: Math.round((failed / learners.size) * 100),
      learnerCount: learners.size
    });
  }
  cells.sort((a, b) => b.failedPct - a.failedPct || a.conceptId.localeCompare(b.conceptId));
  suppressedConceptIds.sort();
  return { cells, suppressedConceptIds };
}

// ---------------------------------------------------------------------------
// Topic locking → roadmap planner bounds
// ---------------------------------------------------------------------------

export interface TopicLock {
  tenantId: string;
  conceptId: string;
  reason?: string;
}

/**
 * Resolve the locked-concept id set for one cohort/tenant. Input rows are
 * tenant-scoped upstream; the filter here is defense against accidental
 * cross-tenant leakage through a shared cache.
 */
export function resolveLockedConcepts(
  locks: readonly TopicLock[],
  tenantId: string
): Set<string> {
  return new Set(locks.filter((l) => l.tenantId === tenantId).map((l) => l.conceptId));
}

// ---------------------------------------------------------------------------
// Roster view (alias-only)
// ---------------------------------------------------------------------------

export interface RosterEntryInput {
  userId: string;
  aliasSeed: string;
  status: MasteryStatusish;
}

/** Local re-declaration to avoid coupling to src/pedagogy types. */
type MasteryStatusish = 'NEEDS_WORK' | 'PARTIAL' | 'SOLID';

export interface RosterRow {
  alias: string;
  overallStatus: MasteryStatusish;
}

/**
 * Deterministic pseudonymous alias derived from a server-side seed. The raw
 * userId NEVER appears in roster output.
 */
export function buildRoster(entries: readonly RosterEntryInput[]): RosterRow[] {
  return entries.map((e) => ({
    alias: `learner-${hashAlias(e.aliasSeed)}`,
    overallStatus: e.status
  }));
}

function hashAlias(seed: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}
