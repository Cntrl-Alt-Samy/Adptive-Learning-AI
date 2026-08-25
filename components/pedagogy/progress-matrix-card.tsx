'use client';

import { ProgressRing } from '@/components/mac';
import type { ProgressMatrixView } from '@/lib/progress-view';

/**
 * S8B-T2 — progress matrix card: aggregate gain gauge (Δ%) plus per-concept
 * mastery chips with due-in pills mirroring REVIEW_OFFSET_HOURS.
 */

const PILL_LABEL: Record<number, string> = {
  24: '24h',
  72: '3d',
  168: '7d',
  336: '14d'
};

export function DuePill({ offsetHours }: { offsetHours: number }) {
  const label = PILL_LABEL[offsetHours] ?? `${offsetHours}h`;
  return (
    <span className="inline-block rounded-full bg-sys-blue/10 px-2 py-0.5 text-caption-1 tabular-nums text-sys-blue">
      {label}
    </span>
  );
}

export interface ProgressMatrixCardProps {
  matrix: ProgressMatrixView;
  /** Review offsets per concept (subset of REVIEW_OFFSET_HOURS) or none. */
  reviewOffsets?: Record<string, number[]>;
}

export function ProgressMatrixCard({ matrix, reviewOffsets = {} }: ProgressMatrixCardProps) {
  const gain = matrix.aggregate.knowledgeGainPct;
  return (
    <section aria-label="Progress matrix" className="rounded-card border border-separator bg-text-background p-5">
      <header className="flex items-center gap-4">
        <ProgressRing value={Math.max(0, Math.min(100, gain))} size={64} strokeWidth={6} ariaLabel={`Knowledge gain ${gain}%`} />
        <div>
          <h2 className="text-title-1">Knowledge gain</h2>
          <p className="text-callout text-secondary-label">
            Δ {gain >= 0 ? '+' : ''}
            {gain}% average · pre {matrix.aggregate.preScore} → post {matrix.aggregate.postScore}
          </p>
        </div>
      </header>

      <ul className="mt-4 space-y-2">
        {matrix.rows.map((r) => {
          const offsets = reviewOffsets[r.conceptId] ?? [];
          return (
            <li key={r.conceptId} className="flex items-center justify-between gap-3 rounded-control bg-gray6 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-body">{r.title}</span>
              <span aria-hidden className="text-caption-1 tabular-nums text-tertiary-label">
                {r.preScore} →
              </span>
              <strong className="text-callout tabular-nums" aria-label={`${r.title}: ${r.postScore} out of 100, up ${r.delta} points`}>
                {r.postScore}
              </strong>
              <span
                className={`rounded-full px-2 py-0.5 text-caption-1 tabular-nums ${
                  r.delta > 0 ? 'bg-sys-green/15 text-sys-green' : 'bg-gray5 text-secondary-label'
                }`}
              >
                {r.delta > 0 ? `+${r.delta}` : r.delta}
              </span>
              {offsets.length > 0 && (
                <span className="flex gap-1" aria-label={`Reviews scheduled at ${offsets.join(', ')} hours`}>
                  {offsets.map((h) => (
                    <DuePill key={h} offsetHours={h} />
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
