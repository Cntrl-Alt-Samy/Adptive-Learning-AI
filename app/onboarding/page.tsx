'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { PushButton } from '@/components/mac';
import { useSession } from '@/hooks/session-store';

/** S8A-T6 (F1.1) — intake path choice: rapid form vs conversational discovery. */
export default function OnboardingPage() {
  const router = useRouter();
  const { persona } = useSession();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center">
      <h1 className="text-large-title">How do you want to set up?</h1>
      <p className="mt-2 text-body text-secondary-label">
        Both paths converge to the same learner profile — pick what feels right.
      </p>
      <div className="mt-6 space-y-3">
        <PushButton variant="primary" size="prominent" className="w-full!" onClick={() => router.push('/onboarding/rapid')}>
          Option A · Rapid setup (&lt;60s)
        </PushButton>
        <PushButton variant="secondary" size="prominent" className="w-full!" onClick={() => router.push('/onboarding/conversational')}>
          Option B · Chat with your profiler
        </PushButton>
      </div>
      {persona !== null && (
        <p className="mt-4 text-callout text-secondary-label">
          Existing profile for <strong>{persona.subjectTitle}</strong> —{' '}
          <Link href="/today" className="focus-halo underline underline-offset-2">
            skip to Today
          </Link>
        </p>
      )}
    </main>
  );
}
