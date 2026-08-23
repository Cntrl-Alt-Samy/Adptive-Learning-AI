/**
 * S2-T5 — Deterministic learner-state serializer (Doc 03 §6).
 * Produces the compact DETERMINISTIC_LEARNER_STATE JSON injected each turn.
 * Pure + byte-stable: identical inputs always serialize identically.
 */

export interface DnaMasteryEntry {
  conceptId: string;
  masteryScore: number;
  status: 'SOLID' | 'PARTIAL' | 'NEEDS_WORK';
  lastReviewedAt?: string;
}

export interface LearnerDnaSnapshot {
  userId: string;
  subjectId: string;
  mastery: DnaMasteryEntry[];
}

export interface SerializedLearnerState {
  v: 1;
  subject: string;
  matrix: Array<[string, number, string]>;
  due: Array<{ c: string; d: number }>;
}

export function serializeLearnerState(
  snapshot: LearnerDnaSnapshot,
  dueQueue: Array<{ conceptId: string; dueAtMs: number }> = []
): string {
  const matrix: Array<[string, number, string]> = [...snapshot.mastery]
    .sort((a, b) => (a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0))
    .map((m) => [m.conceptId, Math.round(m.masteryScore * 100) / 100, m.status]);

  const due = [...dueQueue]
    .sort((a, b) => a.dueAtMs - b.dueAtMs || (a.conceptId < b.conceptId ? -1 : 1))
    .slice(0, 20)
    .map((d) => ({ c: d.conceptId, d: d.dueAtMs }));

  return JSON.stringify({
    v: 1 as const,
    subject: snapshot.subjectId,
    matrix,
    due
  } satisfies SerializedLearnerState);
}
