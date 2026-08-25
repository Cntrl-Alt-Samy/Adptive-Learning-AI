'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { PushButton, SegmentedControl, TextField } from '@/components/mac';

type Role = 'LEARNER' | 'INSTRUCTOR' | 'ADMIN';

const ROLE_OPTIONS = [
  { value: 'LEARNER', label: 'Learner' },
  { value: 'INSTRUCTOR', label: 'Instructor' },
  { value: 'ADMIN', label: 'Admin' }
] as const;

const ROLE_COPY: Record<Role, string> = {
  LEARNER: 'Full learner workspace — /educator is gated with a friendly alert.',
  INSTRUCTOR: 'Everything a learner has, plus the educator portal (roster, heatmap, locks, transcripts).',
  ADMIN: 'Instructor-level access; operator actions land here in later sprints.'
};

/**
 * S8B-T1 — sign-in. Clerk mounts here once keys exist (flag-flip); until
 * then this mints the signed demo-tenant cookie with an explicit role so
 * the RBAC gates and educator portal are fully exercisable.
 */
function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/today';
  const [role, setRole] = useState<Role>('LEARNER');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Prefill a friendly demo name per role.
    setDisplayName(role === 'LEARNER' ? 'Sam the Learner' : role === 'INSTRUCTOR' ? 'Coach Dana' : 'Ops Admin');
  }, [role]);

  const signIn = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role, displayName })
      });
      if (res.ok) router.replace(next);
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center">
      <h1 className="text-large-title">Sign in to LearnOS</h1>
      <p className="mt-2 text-body text-secondary-label">
        Demo tenant — pick the role to explore. Production swaps this card for Clerk sign-in without
        touching any gate downstream.
      </p>

      <section aria-label="Role" className="mt-5 rounded-card border border-separator bg-text-background p-4">
        <p className="mb-2 text-headline text-secondary-label">Sign in as</p>
        <SegmentedControl options={[...ROLE_OPTIONS]} value={role} onChange={setRole} ariaLabel="Role" />
        <p className="mt-2 text-caption-1 text-tertiary-label">{ROLE_COPY[role]}</p>

        <div className="mt-3">
          <TextField label="Display name" value={displayName} onChange={setDisplayName} required validate={(v) => (v.trim().length >= 2 ? null : 'At least 2 characters')} />
        </div>

        <PushButton variant="primary" size="prominent" className="mt-4 w-full!" disabled={busy || displayName.trim().length < 2} onClick={() => void signIn()}>
          {busy ? 'Signing in…' : `Continue as ${role.toLowerCase()}`}
        </PushButton>
      </section>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
