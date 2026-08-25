'use client';

import { useState } from 'react';

import { PushButton } from '@/components/mac';
import type { MisconceptionMatrix, TopicLock } from '@/src/educator/aggregation.js';
import type { UnlockRequest as StoredUnlockRequest } from '@/lib/server/educator-data';

/**
 * S8B-T6 — syllabus topic locks with unlock-request affordance. Requests
 * POST to /api/educator/unlock-requests and optimistically appear pending.
 */

export interface LocksPanelProps {
  locks: TopicLock[];
  requests: StoredUnlockRequest[];
  matrix: MisconceptionMatrix;
  titles: Record<string, string>;
}

export function LocksPanel({ locks, requests, matrix, titles }: LocksPanelProps) {
  const [pending, setPending] = useState<StoredUnlockRequest[]>(requests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestUnlock = async (conceptId: string): Promise<void> => {
    setBusyId(conceptId);
    setNotice(null);
    try {
      const res = await fetch('/api/educator/unlock-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conceptId })
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { request: StoredUnlockRequest };
      setPending((p) => (p.some((r) => r.conceptId === conceptId && r.status === 'PENDING') ? p : [...p, data.request]));
      setNotice(`Unlock requested for ${titles[conceptId] ?? conceptId}.`);
    } catch {
      setNotice('Request failed — check your role session.');
    } finally {
      setBusyId(null);
    }
  };

  if (locks.length === 0) {
    return (
      <section aria-label="Topic locks" className="rounded-card border border-separator p-4 text-callout text-secondary-label">
        No topics are locked. Locked syllabus items appear here with an unlock-request affordance.
      </section>
    );
  }

  const struggleRate = new Map(matrix.cells.map((c) => [c.conceptId, c]));

  return (
    <section aria-label="Topic locks" className="space-y-3">
      {notice !== null && (
        <p role="status" className="text-caption-1 text-sys-green">
          {notice}
        </p>
      )}
      <ul className="space-y-2">
        {locks.map((lock) => {
          const hasPending = pending.some((r) => r.conceptId === lock.conceptId && r.status === 'PENDING');
          const cell = struggleRate.get(lock.conceptId);
          return (
            <li key={lock.conceptId} className="rounded-card border border-separator bg-text-background p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-headline">{titles[lock.conceptId] ?? lock.conceptId}</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-sys-orange/15 px-2 py-0.5 text-caption-1 text-sys-orange">
                  🔒 Locked
                </span>
              </div>
              <p className="mt-1 text-callout text-secondary-label">{lock.reason}</p>
              {cell !== undefined && (
                <p className="mt-0.5 text-caption-1 tabular-nums text-tertiary-label">
                  cohort signal: {cell.failedPct}% struggle · n={cell.learnerCount}
                </p>
              )}
              <div className="mt-2">
                <PushButton
                  variant="secondary"
                  disabled={hasPending || busyId === lock.conceptId}
                  onClick={() => void requestUnlock(lock.conceptId)}
                  aria-label={`Request unlock for ${titles[lock.conceptId] ?? lock.conceptId}`}
                >
                  {hasPending ? 'Requested ✓' : busyId === lock.conceptId ? 'Requesting…' : 'Request unlock'}
                </PushButton>
              </div>
            </li>
          );
        })}
      </ul>

      {pending.filter((r) => r.status === 'PENDING').length > 0 && (
        <aside className="rounded-card border border-separator bg-gray6 p-3" aria-label="Pending unlock requests">
          <h3 className="text-caption-1 font-medium uppercase tracking-wide text-tertiary-label">Pending requests</h3>
          <ul className="mt-1 space-y-0.5">
            {pending
              .filter((r) => r.status === 'PENDING')
              .map((r) => (
                <li key={`${r.conceptId}:${r.requestedAt}`} className="text-caption-1 text-secondary-label">
                  {titles[r.conceptId] ?? r.conceptId} · by {r.requestedBy} ·{' '}
                  {new Date(r.requestedAt).toLocaleString()}
                </li>
              ))}
          </ul>
        </aside>
      )}
    </section>
  );
}
