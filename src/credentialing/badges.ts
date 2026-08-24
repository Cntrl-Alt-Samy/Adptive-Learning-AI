/**
 * S5-T4 — Badge unlock evaluator, F10 (Doc 05 §4 badges / Doc 07 TASK 4.1.1).
 *
 * Pure decision-table module. The engine consumes learner mastery snapshots
 * (emitted by S4 mastery writes) and badge `criteria` JSON, deciding which
 * badges unlock. Awarding itself is idempotent via the user_badges
 * UNIQUE(user_id, badge_id) constraint — the ledger helpers below model that
 * contract so duplicate event replays are no-ops.
 *
 * Revocation semantics (documented per the sprint gate): awards are
 * append-only. A revoked award is recorded with revokedAt and NEVER
 * re-evaluated automatically; a re-grant is an explicit operator action that
 * appends a fresh award row. Evaluation treats revoked awards as absent so
 * a legitimately re-earned badge can be granted again.
 */

export type MasteryStatus = 'NEEDS_WORK' | 'PARTIAL' | 'SOLID';

export type BadgeCriteria =
  | {
      kind: 'MASTERY_THRESHOLD';
      /** All listed concepts must sit at or above `threshold` (0–100). */
      conceptIds: string[];
      threshold: number;
    }
  | {
      kind: 'CONCEPT_COUNT';
      /** Number of concepts at/above `atOrAbove` status (default SOLID). */
      minCount: number;
      atOrAbove?: MasteryStatus;
    }
  | {
      kind: 'SESSION_STREAK';
      /** Consecutive calendar days (UTC) ending at the latest session day. */
      minDays: number;
    }
  | {
      kind: 'PRACTICE_COUNT';
      /** Optional concept scope; otherwise totals across all concepts. */
      conceptId?: string;
      minCount: number;
    };

export interface LearnerMasterySnapshot {
  dna: Array<{ conceptId: string; masteryScore: number; status: MasteryStatus }>;
  /** ISO yyyy-mm-dd UTC session days, unsorted, with repeats collapsed. */
  sessionDays: string[];
  practiceCounts: Record<string, number>;
}

const STATUS_RANK: Record<MasteryStatus, number> = { NEEDS_WORK: 0, PARTIAL: 1, SOLID: 2 };

/** Evaluate one criteria shape against a snapshot (pure, total). */
export function evaluateBadge(criteria: BadgeCriteria, snapshot: LearnerMasterySnapshot): boolean {
  switch (criteria.kind) {
    case 'MASTERY_THRESHOLD': {
      if (criteria.conceptIds.length === 0) return false;
      const byId = new Map(snapshot.dna.map((d) => [d.conceptId, d.masteryScore]));
      return criteria.conceptIds.every((id) => (byId.get(id) ?? -Infinity) >= criteria.threshold);
    }
    case 'CONCEPT_COUNT': {
      const floor = STATUS_RANK[criteria.atOrAbove ?? 'SOLID'];
      return snapshot.dna.filter((d) => STATUS_RANK[d.status] >= floor).length >= criteria.minCount;
    }
    case 'SESSION_STREAK': {
      return computeStreak(snapshot.sessionDays) >= criteria.minDays;
    }
    case 'PRACTICE_COUNT': {
      if (criteria.conceptId !== undefined) {
        return (snapshot.practiceCounts[criteria.conceptId] ?? 0) >= criteria.minCount;
      }
      const total = Object.values(snapshot.practiceCounts).reduce((a, b) => a + b, 0);
      return total >= criteria.minCount;
    }
    default: {
      // Unknown criteria shapes fail closed.
      return false;
    }
  }
}

/** Longest run of consecutive UTC days ending on the latest day present. */
export function computeStreak(sessionDays: string[]): number {
  const unique = [...new Set(sessionDays)].sort();
  if (unique.length === 0) return 0;
  const toUtcMidnight = (day: string): number => Date.parse(`${day}T00:00:00Z`);
  const DAY_MS = 86_400_000;
  let streak = 1;
  for (let i = unique.length - 1; i > 0; i--) {
    const gap = (toUtcMidnight(unique[i]!) - toUtcMidnight(unique[i - 1]!)) / DAY_MS;
    if (gap === 1) streak++;
    else break;
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Idempotent award ledger model
// ---------------------------------------------------------------------------

export interface BadgeAwardRecord {
  userId: string;
  badgeId: string;
  awardedAt: string;
  revokedAt?: string;
}

export interface BadgeDefinition {
  id: string;
  criteria: BadgeCriteria;
}

export interface AwardOutcome {
  /** Badges whose criteria pass AND which have no live award row. */
  newlyAwarded: BadgeDefinition[];
  /** Criteria-passing badges already holding a live (non-revoked) award. */
  alreadyHeld: BadgeDefinition[];
}

/**
 * Decide awards for a batch of badge definitions against one snapshot.
 * Deterministic: output preserves input definition order.
 */
export function decideAwards(
  definitions: readonly BadgeDefinition[],
  snapshot: LearnerMasterySnapshot,
  existingAwards: readonly BadgeAwardRecord[]
): AwardOutcome {
  const liveByBadge = new Map<string, boolean>();
  for (const a of existingAwards) {
    const live = !a.revokedAt;
    liveByBadge.set(a.badgeId, (liveByBadge.get(a.badgeId) ?? false) || live);
  }

  const newlyAwarded: BadgeDefinition[] = [];
  const alreadyHeld: BadgeDefinition[] = [];
  for (const def of definitions) {
    if (!evaluateBadge(def.criteria, snapshot)) continue;
    if (liveByBadge.get(def.id)) alreadyHeld.push(def);
    else newlyAwarded.push(def);
  }
  return { newlyAwarded, alreadyHeld };
}

/**
 * Replay-safe persistence contract: callers attempt INSERT ... ON CONFLICT
 * DO NOTHING into user_badges; this helper folds the attempted inserts plus
 * prior rows into the post-state ledger used by subsequent evaluations.
 */
export function foldAwards(
  prior: readonly BadgeAwardRecord[],
  inserted: readonly BadgeDefinition[],
  awardedAt: string
): BadgeAwardRecord[] {
  return [...prior, ...inserted.map((d) => ({ userId: '', badgeId: d.id, awardedAt }))];
}

/**
 * Explicit revocation — operator action only. Marks the LIVE award revoked;
 * no-op when none exists (idempotent).
 */
export function revokeAward(
  records: readonly BadgeAwardRecord[],
  userId: string,
  badgeId: string,
  revokedAt: string
): BadgeAwardRecord[] {
  return records.map((r) =>
    r.userId === userId && r.badgeId === badgeId && !r.revokedAt ? { ...r, revokedAt } : r
  );
}
