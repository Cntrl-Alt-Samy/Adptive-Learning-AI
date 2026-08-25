'use client';

import type { MisconceptionMatrix } from '@/src/educator/aggregation.js';

/**
 * S8B-T6 — misconception heatmap. Cells arrive already suppressed
 * server-side (k ≥ 5); this component renders the aggregate honestly and
 * lists suppressed concept ids as "cohort too small" rows.
 */

export interface MisconceptionHeatmapProps {
  matrix: MisconceptionMatrix;
  titles: Record<string, string>;
}

function shade(failedPct: number): string {
  if (failedPct >= 60) return 'bg-sys-red text-white';
  if (failedPct >= 40) return 'bg-sys-orange text-white';
  if (failedPct >= 20) return 'bg-sys-yellow/80 text-label';
  return 'bg-sys-green/20 text-label';
}

export function MisconceptionHeatmap({ matrix, titles }: MisconceptionHeatmapProps) {
  const max = Math.max(1, ...matrix.cells.map((c) => c.learnerCount));
  return (
    <section aria-label="Misconception heatmap" className="space-y-3">
      {matrix.cells.length === 0 && matrix.suppressedConceptIds.length === 0 ? (
        <p className="rounded-card border border-separator p-4 text-callout text-secondary-label">
          No attempt data yet — run a session to populate the cohort view.
        </p>
      ) : null}

      <ul className="space-y-2">
        {matrix.cells.map((cell) => (
          <li key={cell.conceptId} className="rounded-card border border-separator bg-text-background p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-body">{titles[cell.conceptId] ?? cell.conceptId}</span>
              <span className="shrink-0 text-caption-1 tabular-nums text-secondary-label">
                {cell.failedPct}% struggle · n={cell.learnerCount}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray5">
              <div className={`h-full rounded-full ${shade(cell.failedPct)}`} style={{ width: `${Math.min(100, cell.failedPct)}%` }} />
            </div>
            <span aria-hidden className="mt-1 block text-caption-1 text-tertiary-label">
              cohort share {Math.round((cell.learnerCount / max) * 100)}%
            </span>
          </li>
        ))}
      </ul>

      {matrix.suppressedConceptIds.length > 0 && (
        <aside className="rounded-card border border-separator bg-gray6 p-3" aria-label="Suppressed concepts">
          <h3 className="text-caption-1 font-medium uppercase tracking-wide text-tertiary-label">k-anonymity suppression</h3>
          <ul className="mt-1 space-y-0.5">
            {matrix.suppressedConceptIds.map((id) => (
              <li key={id} className="text-caption-1 text-secondary-label">
                {titles[id] ?? id} · fewer than five learners — hidden to protect privacy
              </li>
            ))}
          </ul>
        </aside>
      )}
    </section>
  );
}
