'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PushButton, TextField } from '@/components/mac';
import { api } from '@/lib/api';
import { CONSENT_STORAGE_KEY } from '@/hooks/session-store';

/**
 * S8A-T7 — consent gate (F1 prerequisite). Issues/verifies the signed
 * Ed25519 token via /api/consent; blocks the workspace until verified.
 */
export default function ConsentGatePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [guardianRef, setGuardianRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === null) {
      setChecking(false);
      return;
    }
    void api
      .consentVerify(stored)
      .then((res) => {
        if (res.ok) router.replace('/onboarding');
        else {
          window.localStorage.removeItem(CONSENT_STORAGE_KEY);
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  const accept = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const issued = await api.consentIssue(guardianRef);
      const verify = await api.consentVerify(issued.token);
      if (!verify.ok) {
        setError(`Verification failed: ${verify.reason}`);
        return;
      }
      window.localStorage.setItem(CONSENT_STORAGE_KEY, issued.token);
      router.push('/onboarding');
    } catch {
      setError('Consent service unavailable. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (checking) return <p className="p-8 text-body text-secondary-label">Checking consent…</p>;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center">
      <section aria-label="Parental consent" className="w-full rounded-card border border-separator bg-text-background p-6 shadow-popover">
        <h1 className="text-title-1">Before we start</h1>
        <p className="mt-2 text-body text-secondary-label">
          LearnOS stores your learning session transcripts and progress to personalise teaching. For learners
          under the age of digital consent, a guardian grants permission via a signed consent token. You can
          revoke at any time in Settings → Privacy.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-callout text-secondary-label">
          <li>Transcripts are locked by default; educators see aggregates only (k-anonymity ≥ 5).</li>
          <li>Raw transcript access requires a verified consent token.</li>
        </ul>

        <div className="mt-4">
          <TextField
            label="Guardian reference (e.g. parent email or case ID)"
            value={guardianRef}
            onChange={setGuardianRef}
            validate={(v) => (v.trim().length >= 3 ? null : 'Enter at least 3 characters')}
          />
        </div>

        {error !== null && (
          <p role="alert" className="mt-2 text-caption-1 text-sys-red">
            {error}
          </p>
        )}

        <PushButton variant="primary" size="prominent" className="mt-4 w-full" disabled={busy} onClick={() => void accept()}>
          {busy ? 'Signing…' : 'I consent — continue'}
        </PushButton>
      </section>
    </main>
  );
}
