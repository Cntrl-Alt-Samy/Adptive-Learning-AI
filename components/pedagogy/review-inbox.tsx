'use client';

import { useMemo, useState } from 'react';

import { CodeBlock, PushButton } from '@/components/mac';
import { reviewerStarterPrompt } from '@/src/pedagogy/progress.js';
import { REVIEW_OFFSET_HOURS } from '@/src/pedagogy/progress.js';
import type { ProgressMatrixView } from '@/lib/progress-view';
import type { ScheduledReviewItem } from '@/hooks/learner-store';

/**
 * S8B-T2 — spaced review inbox. Buckets mirror REVIEW_OFFSET_HOURS
 * (24h / 3d / 7d / 14d) exactly; overdue items render in their own section.
 * The reviewer starter prompt is the engine's verbatim portable text.
 */

export interface ReviewInboxProps {
  reviews: ScheduledReviewItem[];
  matrix: ProgressMatrixView | null;
  sessionSubject: string;
  titles: Record<string, string>;
  nowMs?: number;
}

interface Bucket {
  offsetHours: number;
  label: string;
  items: ScheduledReviewItem[];
}

const HOUR = 3_600_000;

function labelFor(offsetHours: number): string {
  if (offsetHours === 24) return '24h';
  if (offsetHours === 72) return '3d';
  if (offsetHours === 168) return '7d';
  if (offsetHours === 336) return '14d';
  return `${offsetHours}h`;
}

export function bucketReviews(reviews: ScheduledReviewItem[], nowMs: number): { overdue: ScheduledReviewItem[]; buckets: Bucket[] } {
  const overdue = reviews.filter((r) => r.dueAtMs <= nowMs);
  const buckets = REVIEW_OFFSET_HOURS.map((hours) => ({
    offsetHours: hours,
    label: labelFor(hours),
    items: reviews.filter((r) => r.offsetHours === hours && r.dueAtMs > nowMs)
  })).filter((b) => b.items.length > 0);
  return { overdue, buckets };
}

export function ReviewInbox({ reviews, matrix, sessionSubject, titles, nowMs }: ReviewInboxProps) {
  const [copied, setCopied] = useState(false);
  // Capture "now" once per mount so renders stay pure and countdowns are stable.
  const [now] = useState<number>(() => nowMs ?? Date.now());
  const { overdue, buckets } = useMemo(() => bucketReviews(reviews, now), [reviews, now]);
  const prompt = useMemo(
    () => (matrix === null ? null : reviewerStarterPrompt(matrix, sessionSubject)),
    [matrix, sessionSubject]
  );

  const copyPrompt = async (): Promise<void> => {
    if (prompt === null) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (reviews.length === 0) {
    return (
      <section aria-label="Review inbox" className="rounded-card border border-separator bg-text-background p-5 text-center">
        <h1 className="text-title-1">Nothing due</h1>
        <p className="mt-1 text-body text-secondary-label">
          Complete a session and reviews land here at 24h, 3d, 7d and 14d — spaced so concepts stick.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Review inbox" className="space-y-4">
      {overdue.length > 0 && (
        <div className="rounded-card border border-sys-red/40 bg-sys-red/10 p-4" role="status">
          <h2 className="text-title-2 text-sys-red">Overdue · {overdue.length}</h2>
          <ul className="mt-2 space-y-1">
            {overdue.map((r) => (
              <li key={`${r.conceptId}:${r.offsetHours}`} className="text-callout">
                {titles[r.conceptId] ?? r.conceptId}{' '}
                <span className="text-caption-1 text-secondary-label">· was due {labelFor(r.offsetHours)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {buckets.map((b) => (
        <div key={b.offsetHours} className="rounded-card border border-separator bg-text-background p-4">
          <h2 className="text-title-2">
            Due in {b.label}{' '}
            <span className="text-caption-1 font-normal text-tertiary-label">({b.items.length})</span>
          </h2>
          <ul className="mt-2 space-y-1.5">
            {b.items.map((r) => (
              <li key={`${r.conceptId}:${r.offsetHours}`} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-body">{titles[r.conceptId] ?? r.conceptId}</span>
                <span className="shrink-0 text-caption-1 tabular-nums text-tertiary-label">
                  {Math.max(1, Math.round((r.dueAtMs - now) / HOUR))}h left
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {prompt !== null && (
        <div className="rounded-card border border-separator p-4">
          <header className="flex items-center justify-between gap-2">
            <h2 className="text-title-2">Portable resume prompt</h2>
            <PushButton variant="secondary" onClick={() => void copyPrompt()}>
              {copied ? 'Copied ✓' : 'Copy'}
            </PushButton>
          </header>
          <p className="mt-1 mb-2 text-caption-1 text-tertiary-label">
            Paste anywhere — it restarts your weakest concepts outside LearnOS.
          </p>
          <CodeBlock code={prompt} language="" />
        </div>
      )}
    </section>
  );
}
