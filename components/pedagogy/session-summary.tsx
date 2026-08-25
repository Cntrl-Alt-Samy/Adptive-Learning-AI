'use client';

import { useRouter } from 'next/navigation';

import { ProgressRing, PushButton } from '@/components/mac';
import type { ConceptProgress } from '@/hooks/session-store';

interface SessionSummaryProps {
  progress: ConceptProgress[];
  budgetMinutes: number;
  usedMinutes: number;
  onBackToPlan: () => void;
}

/**
 * S8A-T6, updated S8B-T2 — session-complete summary. Reviews now land in
 * the /review inbox (scheduled client-side at phase entry); this card is
 * the hand-off point.
 */
export function SessionSummary({ progress, budgetMinutes, usedMinutes, onBackToPlan }: SessionSummaryProps) {
  const router = useRouter();
  const avg = progress.length > 0 ? Math.round(progress.reduce((s, c) => s + c.masteryScore, 0) / progress.length) : 0;
  return (
    <section aria-label="Session summary" className="rounded-card border border-separator bg-text-background p-6 text-center">
      <h2 className="text-large-title">Session complete</h2>
      <p className="mt-1 text-callout text-secondary-label">
        {usedMinutes}/{budgetMinutes} min planned · spaced reviews queued to your inbox
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
      <div className="mt-5 flex items-center justify-center gap-2">
        <PushButton variant="secondary" size="prominent" onClick={() => router.push('/review')}>
          Review inbox →
        </PushButton>
        <PushButton variant="primary" size="prominent" onClick={onBackToPlan}>
          Back to plan
        </PushButton>
      </div>
    </section>
  );
}
