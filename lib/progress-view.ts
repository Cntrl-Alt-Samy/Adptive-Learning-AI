import { buildProgressMatrix, type MatrixRow, type ProgressMatrix } from '@/src/pedagogy/progress.js';

/**
 * S8B-T2 — view mapping over the pure progress engine. The engine stays
 * fixture-authoritative; this module only attaches display titles and the
 * CAT-derived pre-score prior used before real pre-assessment writes exist.
 */

export interface MatrixRowView extends MatrixRow {
  title: string;
}

export interface ProgressMatrixView extends ProgressMatrix {
  rows: MatrixRowView[];
}

/**
 * Diagnostic prior per concept from the CAT result: gap-map concepts start
 * at 30, strength-map at 75, unmeasured at 50. Documented heuristic until
 * step-1 pre-scores persist server-side.
 */
export function buildPreScores(
  plannedConceptIds: string[],
  gapMap: readonly string[],
  strengthMap: readonly string[]
): Record<string, number> {
  const gaps = new Set(gapMap);
  const strengths = new Set(strengthMap);
  const out: Record<string, number> = {};
  for (const id of plannedConceptIds) {
    out[id] = strengths.has(id) ? 75 : gaps.has(id) ? 30 : 50;
  }
  return out;
}

export function buildMatrixView(
  conceptProgress: Array<{ conceptId: string; title: string; masteryScore: number }>,
  preScores: Record<string, number>
): ProgressMatrixView {
  const view = buildProgressMatrix(
    conceptProgress.map((c) => ({
      conceptId: c.conceptId,
      preScore: preScores[c.conceptId] ?? 50,
      postScore: c.masteryScore
    }))
  );
  return {
    ...view,
    rows: view.rows.map((r) => ({
      ...r,
      title: conceptProgress.find((c) => c.conceptId === r.conceptId)?.title ?? r.conceptId
    }))
  };
}
