'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AlertModal, PushButton, SegmentedControl } from '@/components/mac';
import { Shell } from '@/components/workspace/shell';
import { useSession, CONSENT_STORAGE_KEY } from '@/hooks/session-store';

type ThemeChoice = 'auto' | 'light' | 'dark';

/**
 * /settings — appearance tri-state (Doc 06 §13), consent status + revoke,
 * profile reset. Educator/privacy-center links are Sprint 8b stubs.
 */
export default function SettingsPage() {
  const router = useRouter();
  const session = useSession();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>('auto');
  const [consentOk, setConsentOk] = useState<boolean | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = window.localStorage.getItem('learnos-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'auto') setTheme(stored);
    const token = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (token === null) {
      setConsentOk(false);
      return;
    }
    void import('@/lib/api').then(({ api }) =>
      api
        .consentVerify(token)
        .then((r) => setConsentOk(r.ok))
        .catch(() => setConsentOk(false))
    );
  }, []);

  const applyTheme = (t: ThemeChoice): void => {
    setTheme(t);
    window.localStorage.setItem('learnos-theme', t);
    window.dispatchEvent(new CustomEvent('learnos-theme-change', { detail: t }));
  };

  const revokeConsent = (): void => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    session.reset();
    router.push('/onboarding/consent');
  };

  return (
    <Shell mode="SESSION_REVIEWER" confirmedStep={session.confirmedStep}>
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-large-title">Settings</h1>

        <section aria-label="Appearance" className="rounded-card border border-separator bg-text-background p-4">
          <h2 className="text-title-2">Appearance</h2>
          <div className="mt-2">
            <SegmentedControl
              ariaLabel="Theme"
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' }
              ]}
              value={mounted ? theme : 'auto'}
              onChange={applyTheme}
            />
          </div>
        </section>

        <section aria-label="Privacy and consent" className="rounded-card border border-separator bg-text-background p-4">
          <h2 className="text-title-2">Privacy</h2>
          <p className="mt-1 text-callout text-secondary-label" role="status">
            Consent token:{' '}
            {consentOk === null ? 'checking…' : consentOk ? (
              <span className="text-sys-green">verified</span>
            ) : (
              <span className="text-sys-red">missing / invalid</span>
            )}
          </p>
          <p className="mt-1 text-caption-1 text-tertiary-label">
            Granular preferences, export and the audit trail live in the{' '}
            <Link href="/privacy" className="focus-halo rounded-control text-sys-blue underline-offset-2 hover:underline">
              Privacy Center
            </Link>
            . Revoking here signs you out and clears local progress.
          </p>
          <PushButton variant="destructive" className="mt-2" onClick={revokeConsent} disabled={!consentOk}>
            Revoke consent
          </PushButton>
        </section>

        {session.persona !== null && (
          <section aria-label="Profile" className="rounded-card border border-separator bg-text-background p-4">
            <h2 className="text-title-2">Profile</h2>
            <ul className="mt-1 list-disc pl-5 text-callout text-secondary-label">
              <li>Subject: {session.persona.subjectTitle}</li>
              <li>Goal: {session.persona.goal}</li>
              <li>Time: {session.persona.timeMinutes} min/day · Style: {session.persona.modality}</li>
              {session.catResult !== null && <li>Calibrated level: {session.catResult.calibratedLevel}</li>}
            </ul>
            <PushButton variant="secondary" className="mt-2" onClick={() => setConfirmReset(true)}>
              Reset profile…
            </PushButton>
          </section>
        )}

        <AlertModal
          error={
            confirmReset
              ? { code: 'RESET_PROFILE', message: 'Reset your profile and start onboarding again?', retryable: false }
              : null
          }
          onRetry={() => {
            setConfirmReset(false);
            session.reset();
            router.push('/onboarding');
          }}
          onDismiss={() => setConfirmReset(false)}
        />
      </div>
    </Shell>
  );
}
