'use client';

import { ProgressRing, PushButton } from '@/components/mac';
import type { ConceptProgress } from '@/hooks/session-store';

interface SessionSummaryProps {
  progress: ConceptProgress[];
  budgetMinutes: number;
  usedMinutes: number;
  onBackToPlan: () => void;
}

/**
 * S8A-T6 — MVP session-complete summary card. The full progress matrix
 * (gain gauge, due-in pills) is Sprint 8b; spaced-rep enqueues happen
 * server-side at checkpoint 8 regardless.
 */
export function SessionSummary({ progress, budgetMinutes, usedMinutes, onBackToPlan }: SessionSummaryProps) {
  const avg = progress.length > 0 ? Math.round(progress.reduce((s, c) => s + c.masteryScore, 0) / progress.length) : 0;
  return (
    <section aria-label="Session summary" className="rounded-card border border-separator bg-text-background p-6 text-center">
      <h2 className="text-large-title">Session complete</h2>
      <p className="mt-1 text-callout text-secondary-label">
        {usedMinutes}/{budgetMinutes} min planned · reviews scheduled silently (inbox arrives in Sprint 8b)
      </p>
      <ul className="mx-auto mt-5 flex max-w-md flex-wrap items-center justify-center gap-4">
        {progress.map((c) => (
          <li key={c.conceptId} className="flex w-36 flex-col items-center gap-1">
            <ProgressRing value={c.masteryScore} size={44} strokeWidth={4} ariaLabel={`${c.title} mastery`} />
            <span className="truncate text-caption-1 text-secondary-label" title={c.title}>
              {c.title}
            </span>
          </li>
        ))}
      </ul>
      {progress.length > 0 && (
        <p className="mt-4 text-body">
          Average mastery <strong>{avg}%</strong> across {progress.length} concept{progress.length === 1 ? '' : 's'}.
        </p>
      )}
      <PushButton variant="primary" size="prominent" className="mt-5" onClick={onBackToPlan}>
        Back to plan
      </PushButton>
    </section>
  );
}
