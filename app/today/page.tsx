'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AlertModal } from '@/components/mac';
import { Shell } from '@/components/workspace/shell';
import { DeliveryCard } from '@/components/pedagogy/delivery-card';
import { PracticeFlow } from '@/components/pedagogy/practice-flow';
import { SocraticRail } from '@/components/pedagogy/socratic-rail';
import { SessionSummary } from '@/components/pedagogy/session-summary';
import { useSession } from '@/hooks/session-store';
import { useTutorStream } from '@/hooks/use-tutor-stream';

type Phase = 'DELIVERY' | 'SOCRATIC' | 'PRACTICE' | 'SUMMARY';

/**
 * /today — learner workspace orchestrator (S8A-T5/T6).
 * Server checkpoints drive the HUD; DeliveryGate/SocraticLoop/StrikeBreaker
 * engines run client-side (pure modules) while streaming rides /api/turn.
 */
export default function TodayPage() {
  const router = useRouter();
  const session = useSession();
  const [phase, setPhase] = useState<Phase>('DELIVERY');
  const [conceptIndex, setConceptIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (session.persona === null || session.plan === null) router.replace('/onboarding');
    else if ((window.localStorage.getItem('learnos-consent-token') ?? '') === '') router.replace('/onboarding/consent');
  }, [mounted, session.persona, session.plan, router]);

  const stream = useTutorStream(session.sessionId);
  if (!mounted || session.persona === null || session.plan === null) return null;

  const plan = session.plan;
  const concept = plan.planned[conceptIndex];

  if (concept === undefined) {
    const used = plan.planned.reduce((s, p) => s + p.estimatedMinutes, 0);
    return (
      <Shell mode="SESSION_REVIEWER" confirmedStep={session.confirmedStep} roadmap={plan.planned} progress={session.conceptProgress}>
        <SessionSummary
          progress={session.conceptProgress}
          budgetMinutes={plan.budget}
          usedMinutes={used}
          onBackToPlan={() => router.push('/plan')}
        />
      </Shell>
    );
  }

  const usedMinutes = plan.planned.slice(0, conceptIndex).reduce((s, p) => s + p.estimatedMinutes, 0);
  const minutesRemaining = Math.max(-1, plan.budget - usedMinutes - concept.estimatedMinutes);

  const onConceptDone = (masteryScore: number): void => {
    session.recordConceptDone(concept.conceptId, concept.title, masteryScore);
    if (conceptIndex + 1 >= plan.planned.length) setPhase('SUMMARY');
    else {
      setConceptIndex((i) => i + 1);
      setPhase('DELIVERY');
    }
  };

  return (
    <Shell
      mode="TUTOR"
      confirmedStep={session.confirmedStep}
      latencyMs={stream.lastLatencyMs}
      minutesRemaining={minutesRemaining}
      roadmap={plan.planned}
      progress={session.conceptProgress}
      activeConceptId={concept.conceptId}
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <nav aria-label="Breadcrumb" className="text-caption-1 text-secondary-label">
          <Link href="/plan" className="focus-halo rounded-control underline-offset-2 hover:underline">
            Plan
          </Link>{' '}
          / Today · concept {conceptIndex + 1} of {plan.planned.length}
        </nav>

        {phase === 'DELIVERY' && (
          <DeliveryCard
            key={concept.conceptId}
            conceptId={concept.conceptId}
            title={concept.title}
            sessionId={session.sessionId}
            onComplete={(score) => {
              session.recordConceptDone(concept.conceptId, concept.title, score);
              setPhase('SOCRATIC');
            }}
          />
        )}

        {phase === 'SOCRATIC' && (
          <SocraticRail
            sessionId={session.sessionId}
            conceptId={concept.conceptId}
            onDone={() => setPhase('PRACTICE')}
          />
        )}

        {phase === 'PRACTICE' && <PracticeFlow conceptId={concept.conceptId} onDone={onConceptDone} />}

        {phase === 'SUMMARY' && (
          <SessionSummary
            progress={session.conceptProgress}
            budgetMinutes={plan.budget}
            usedMinutes={usedMinutes + concept.estimatedMinutes}
            onBackToPlan={() => router.push('/plan')}
          />
        )}
      </div>

      <AlertModal error={stream.error} onRetry={stream.dismissError} onDismiss={stream.dismissError} />
    </Shell>
  );
}
