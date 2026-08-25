'use client';

import { CodeBlock } from '@/components/mac';
import type { TranscriptViewResult } from '@/lib/server/educator-data';

/**
 * S8B-T6 — transcript view with the privacy fallback rendered honestly:
 * ALLOW_RAW shows the verbatim turns; anything else renders the
 * aggregates-only card (TranscriptLockedError path included upstream).
 */

export interface TranscriptViewProps {
  result: TranscriptViewResult;
  titles: Record<string, string>;
}

export function TranscriptView({ result, titles }: TranscriptViewProps) {
  const turns = result.raw?.turns;
  if (result.decision === 'ALLOW_RAW' && turns !== undefined) {
    return (
      <section aria-label="Raw transcript" className="space-y-2">
        <p className="text-caption-1 text-sys-green">✓ Raw access granted — showing the full exchange.</p>
        <CodeBlock code={turns.map((t) => `${t.role === 'user' ? 'Learner' : 'Tutor'}: ${t.excerpt}`).join('\n\n')} language="transcript" />
      </section>
    );
  }

  const rows = result.aggregatesOnly?.rows ?? [];
  return (
    <section aria-label="Aggregates only" className="space-y-3">
      <div className="rounded-card border border-sys-orange/40 bg-sys-orange/10 p-4">
        <h2 className="text-title-2 text-sys-orange">🔒 Transcript locked</h2>
        <p className="mt-1 text-callout text-secondary-label">
          {result.decision === 'DENY'
            ? 'This learner has not granted educator access. Aggregate signals only.'
            : 'Learner consent covers aggregate signals only — raw dialogue stays private.'}
        </p>
      </div>
      {rows.length > 0 ? (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.conceptId} className="flex items-baseline justify-between gap-2 rounded-control bg-gray6 px-3 py-1.5">
              <span className="truncate text-callout">{titles[r.conceptId] ?? r.conceptId}</span>
              <span className="shrink-0 text-caption-1 tabular-nums text-secondary-label">
                cohort struggle {r.failedPct}% · n={r.learnerCount}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-callout text-tertiary-label">No aggregate rows available.</p>
      )}
    </section>
  );
}
