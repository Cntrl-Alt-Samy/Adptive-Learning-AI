'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

import { MasteryDot, PushButton, SegmentedControl } from '@/components/mac';
import { Shell } from '@/components/workspace/shell';
import { api } from '@/lib/api';
import type { ExclusionReason } from '@/lib/api';
import { useSession } from '@/hooks/session-store';
import { TIME_BUDGETS } from '@/src/pedagogy/roadmap.js';

const REASON_COPY: Record<ExclusionReason, string> = {
  BUDGET_EXCEEDED: 'outside today’s budget',
  PREREQ_EXCLUDED: 'prerequisite not met yet',
  TOPIC_LOCKED: 'locked topic'
};

/**
 * /plan — roadmap preview (S8A-T6 F3). Budget segmented control re-plans via
 * planRoadmap on the server; excluded nodes render with typed reason chips.
 * Gain gauge / due-in pills are Sprint 8b.
 */
export default function PlanPage() {
  const router = useRouter();
  const session = useSession();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (session.persona === null) router.replace('/onboarding');
    else if ((window.localStorage.getItem('learnos-consent-token') ?? '') === '') router.replace('/onboarding/consent');
  }, [mounted, session.persona, router]);

  if (!mounted || session.persona === null) return null;

  const persona = session.persona;

  const replan = async (budget: number): Promise<void> => {
    setBusy(true);
    try {
      const plan = await api.plan(persona.subjectId, budget);
      session.setPlan(plan);
    } catch {
      /* keep previous plan on failure */
    } finally {
      setBusy(false);
    }
  };

  const plan = session.plan;

  return (
    <Shell mode="SESSION_REVIEWER" confirmedStep={session.confirmedStep}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-large-title">Your roadmap</h1>
        <p className="text-body text-secondary-label">
          {persona.subjectTitle} · goal: {persona.goal}
        </p>

        <div>
          <p className="mb-1 text-headline text-secondary-label">Daily budget</p>
          <SegmentedControl
            ariaLabel="Daily time budget in minutes"
            options={TIME_BUDGETS.map((m) => ({ value: String(m), label: `${m} min` }))}
            value={String(plan?.budget ?? persona.timeMinutes)}
            onChange={(v) => void replan(Number(v))}
          />
        </div>

        {plan === null ? (
          <p className="text-body text-tertiary-label">{busy ? 'Planning…' : 'No plan yet — finish calibration first.'}</p>
        ) : (
          <>
            <section aria-label="Planned concepts" className="rounded-card border border-separator bg-text-background p-4">
              <h2 className="text-title-2">Today · {plan.totalMinutes} min</h2>
              <ol className="mt-2 space-y-2">
                {plan.planned.map((c, i) => {
                  const prog = session.conceptProgress.find((p) => p.conceptId === c.conceptId);
                  return (
                    <li key={c.conceptId} className="flex items-center gap-2">
                      <span className="w-5 text-right text-caption-1 tabular-nums text-tertiary-label">{i + 1}.</span>
                      <MasteryDot score={prog?.masteryScore ?? 0} />
                      <span className="min-w-0 flex-1 truncate text-body">{c.title}</span>
                      <span className="text-caption-1 tabular-nums text-secondary-label">{c.estimatedMinutes} min</span>
                    </li>
                  );
                })}
              </ol>
              <PushButton variant="primary" className="mt-3" onClick={() => router.push('/today')}>
                Start session →
              </PushButton>
            </section>

            {plan.excluded.length > 0 && (
              <section aria-label="Excluded concepts" className="rounded-card border border-separator p-4">
                <h2 className="text-title-2 text-secondary-label">Not scheduled</h2>
                <ul className="mt-2 space-y-1.5">
                  {plan.excluded.map((c) => (
                    <li key={c.conceptId} className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-callout text-secondary-label">{c.title}</span>
                      <span className="shrink-0 rounded-full bg-gray5 px-2 py-0.5 text-caption-1 text-tertiary-label">
                        {REASON_COPY[c.reason]}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-caption-1 text-tertiary-label">
              Need a different subject?{' '}
              <Link href="/settings" className="focus-halo underline underline-offset-2">
                Reset in Settings
              </Link>
            </p>
          </>
        )}
      </div>
    </Shell>
  );
}
