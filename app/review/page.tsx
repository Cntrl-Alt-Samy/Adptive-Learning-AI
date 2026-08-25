'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { Shell } from '@/components/workspace/shell';
import { ReviewInbox } from '@/components/pedagogy/review-inbox';
import { ProgressMatrixCard } from '@/components/pedagogy/progress-matrix-card';
import { useLedger } from '@/hooks/learner-store';
import { useSession } from '@/hooks/session-store';
import { buildMatrixView, buildPreScores } from '@/lib/progress-view';

/**
 * S8B-T2 — review inbox destination. Buckets mirror the engine's
 * REVIEW_OFFSET_HOURS; overdue items surface first; matrix + portable
 * resume prompt derive from the S4 progress engine via lib/progress-view.
 */
export default function ReviewPage() {
  const session = useSession();
  const ledger = useLedger();

  const titles = useMemo(
    () => Object.fromEntries(session.conceptProgress.map((c) => [c.conceptId, c.title])),
    [session.conceptProgress]
  );

  const plannedIds = useMemo(() => session.plan?.planned.map((p) => p.conceptId) ?? [], [session.plan]);
  const preScores = useMemo(
    () =>
      buildPreScores(
        plannedIds,
        session.catResult?.gapMap ?? [],
        session.catResult?.strengthMap ?? []
      ),
    [plannedIds, session.catResult]
  );
  const matrix = useMemo(
    () =>
      plannedIds.length === 0 || session.conceptProgress.length === 0
        ? null
        : buildMatrixView(session.conceptProgress, preScores),
    [plannedIds.length, session.conceptProgress, preScores]
  );

  const reviewOffsets = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const r of ledger.reviews) {
      const list = map[r.conceptId] ?? [];
      if (!list.includes(r.offsetHours)) list.push(r.offsetHours);
      map[r.conceptId] = list.sort((a, b) => a - b);
    }
    return map;
  }, [ledger.reviews]);

  const subjectTitle = session.persona?.subjectTitle ?? 'your subject';

  return (
    <Shell mode="SESSION_REVIEWER" confirmedStep={session.confirmedStep}>
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-baseline justify-between gap-3">
          <h1 className="text-large-title">Review</h1>
          <Link href="/today" className="focus-halo rounded-control text-callout text-sys-blue hover:underline">
            Back to session →
          </Link>
        </header>

        {matrix !== null && <ProgressMatrixCard matrix={matrix} reviewOffsets={reviewOffsets} />}

        <ReviewInbox reviews={ledger.reviews} matrix={matrix} sessionSubject={subjectTitle} titles={titles} />
      </div>
    </Shell>
  );
}
