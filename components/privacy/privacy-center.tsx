'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PushButton, ToggleSwitch } from '@/components/mac';
import { useLedger, type ConsentPrefKey } from '@/hooks/learner-store';
import { useSession, CONSENT_STORAGE_KEY } from '@/hooks/session-store';
import {
  resolveTranscriptAccess,
  type TranscriptAccessGrant
} from '@/src/privacy/transcript-lock.js';

/**
 * S8B-T5 — complete Privacy Center: granular consent toggles persisted to
 * the ledger with an append-only audit trail, live transcript-access
 * status (S6 precedence engine), export + erasure affordances. Revoking
 * the base consent keeps Sprint-8a semantics (token cleared → re-consent).
 */

const PREF_COPY: Array<{ key: ConsentPrefKey; label: string; detail: string }> = [
  {
    key: 'analytics',
    label: 'Product analytics',
    detail: 'Anonymous usage signals that shape difficulty tuning. Off = no events leave your device.'
  },
  {
    key: 'transcriptResearch',
    label: 'Research use of transcripts',
    detail: 'Allows anonymised study of tutoring dialogue. Educator raw access stays separate.'
  },
  {
    key: 'educatorAggregates',
    label: 'Educator aggregate signals',
    detail: 'Your instructor sees cohort-level mastery trends (never raw dialogue) for locked topics.'
  },
  {
    key: 'productEmails',
    label: 'Product emails',
    detail: 'Occasional notes about new features. Marketing is off by default and stays off.'
  }
];

export function PrivacyCenter() {
  const session = useSession();
  const ledger = useLedger();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [consentOk, setConsentOk] = useState<boolean | null>(null);
  const [grant, setGrant] = useState<TranscriptAccessGrant | null>(null);

  useEffect(() => {
    setMounted(true);
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

  // Live self-access check via the S6 precedence engine (learner → own data).
  useEffect(() => {
    if (!mounted || session.sessionId === '') return;
    const g = resolveTranscriptAccess({
      requester: { userId: session.sessionId, tenantId: 'demo', role: 'LEARNER' },
      target: { userId: session.sessionId, tenantId: 'demo', isMinor: false, parentalConsentVerified: true }
    });
    setGrant(g);
  }, [mounted, session.sessionId]);

  const revokeAll = (): void => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    ledger.appendConsentEvent({ at: new Date().toISOString(), action: 'REVOKED', detail: 'consent token cleared' });
    session.reset();
    router.push('/onboarding/consent');
  };

  const exportData = (): void => {
    const blob = new Blob([JSON.stringify({ ...ledger }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'learnos-data-export.json';
    a.click();
    URL.revokeObjectURL(url);
    ledger.appendConsentEvent({ at: new Date().toISOString(), action: 'VERIFIED', detail: 'data export downloaded' });
  };

  return (
    <section aria-label="Privacy center" className="space-y-4">
      <header className="rounded-card border border-separator bg-text-background p-4">
        <h2 className="text-title-1">Your data, your rules</h2>
        <p className="mt-1 text-callout text-secondary-label">
          Consent token:{' '}
          {consentOk === null ? (
            'checking…'
          ) : consentOk ? (
            <span className="text-sys-green">verified</span>
          ) : (
            <span className="text-sys-red">missing / invalid</span>
          )}
        </p>
      </header>

      <div className="rounded-card border border-separator bg-text-background p-4">
        <h3 className="text-title-2">Granular preferences</h3>
        <ul className="mt-3 space-y-4">
          {PREF_COPY.map(({ key, label, detail }) => (
            <li key={key} className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-body">{label}</span>
                <span className="mt-0.5 block text-caption-1 text-secondary-label">{detail}</span>
              </span>
              <ToggleSwitch
                label={label}
                checked={mounted && (ledger.consentPrefs[key] ?? false)}
                onChange={(v) => ledger.setConsentPref(key, v)}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-separator bg-text-background p-4">
        <h3 className="text-title-2">Transcript access</h3>
        {grant !== null ? (
          <p role="status" className="mt-1 text-callout">
            Decision for you viewing your own transcript:{' '}
            <strong className={grant.decision === 'ALLOW_RAW' ? 'text-sys-green' : 'text-sys-orange'}>{grant.decision}</strong>
            {grant.raw !== undefined && <span className="ml-1 text-caption-1 text-tertiary-label">(raw rows permitted)</span>}
          </p>
        ) : (
          <p className="mt-1 text-callout text-secondary-label">Checking access decision…</p>
        )}
        <p className="mt-1 text-caption-1 text-tertiary-label">
          Educators only ever see aggregates unless this learner explicitly grants raw access.
        </p>
      </div>

      <div className="rounded-card border border-separator bg-text-background p-4">
        <h3 className="text-title-2">Export & erase</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <PushButton variant="secondary" onClick={exportData}>
            Export my data (JSON)
          </PushButton>
          <PushButton variant="destructive" disabled={!consentOk} onClick={revokeAll}>
            Revoke consent & start over
          </PushButton>
        </div>
      </div>

      <div className="rounded-card border border-separator bg-text-background p-4">
        <h3 className="text-title-2">Audit trail</h3>
        {ledger.consentEvents.length === 0 ? (
          <p className="mt-1 text-caption-1 text-secondary-label">No consent activity recorded yet.</p>
        ) : (
          <ol className="mt-2 space-y-1" aria-label="Consent audit trail">
            {[...ledger.consentEvents].reverse().slice(0, 12).map((e, i) => (
              <li key={`${e.at}:${i}`} className="flex items-baseline justify-between gap-2 text-caption-1">
                <span className="font-mono uppercase tracking-wide">{e.action}</span>
                <span className="truncate text-secondary-label">{e.detail ?? ''}</span>
                <time dateTime={e.at} className="shrink-0 tabular-nums text-tertiary-label">
                  {new Date(e.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
