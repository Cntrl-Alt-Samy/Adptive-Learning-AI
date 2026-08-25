'use client';

import { useState } from 'react';

import { PushButton, TextField } from '@/components/mac';
import { useLedger } from '@/hooks/learner-store';
import { useSession } from '@/hooks/session-store';

/**
 * S8B-T4 — certificate wallet + public verifier. Issuance, SVG/PDF
 * downloads and code verification all ride the /api/certificates routes
 * backed by the S5 credential engines (server-side node:crypto).
 */

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'valid'; matchedCode: string }
  | { kind: 'invalid'; reason: string };

export function CertificateWallet() {
  const session = useSession();
  const ledger = useLedger();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [candidate, setCandidate] = useState('');
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' });

  const planned = session.plan?.planned.map((p) => p.conceptId) ?? [];
  const eligible =
    planned.length > 0 &&
    planned.every((id) => {
      const prog = session.conceptProgress.find((c) => c.conceptId === id);
      return (prog?.masteryScore ?? 0) >= 75;
    });

  const issue = async (): Promise<void> => {
    if (session.persona === null || !eligible) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subjectId: session.persona.subjectId,
          subjectTitle: session.persona.subjectTitle,
          learnerName: ledger.displayName ?? 'Learner'
        })
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { certificate: { verificationCode: string; subjectId: string; subjectTitle: string; issuedOn: string; learnerName: string } };
      ledger.cacheCertificate(data.certificate);
      setNotice('Certificate issued — download it below.');
    } catch {
      setNotice('Issuance failed. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  const runVerify = async (): Promise<void> => {
    if (candidate.trim().length === 0) return;
    setVerify({ kind: 'idle' });
    try {
      const res = await fetch(`/api/certificates?code=${encodeURIComponent(candidate.trim())}`);
      const data = (await res.json()) as { ok: boolean; reason?: string; matchedCode?: string };
      if (data.ok && data.matchedCode !== undefined) setVerify({ kind: 'valid', matchedCode: data.matchedCode });
      else setVerify({ kind: 'invalid', reason: data.reason ?? 'UNKNOWN_CODE' });
    } catch {
      setVerify({ kind: 'invalid', reason: 'NETWORK' });
    }
  };

  return (
    <section aria-label="Certificate wallet" className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-title-1">Certificates</h2>
        <PushButton variant="primary" disabled={!eligible || busy} onClick={() => void issue()}>
          {busy ? 'Issuing…' : eligible ? 'Issue certificate' : 'Earn 75%+ on all concepts'}
        </PushButton>
      </header>
      {notice !== null && (
        <p role="status" className="text-caption-1 text-sys-green">
          {notice}
        </p>
      )}

      {ledger.certificates.length === 0 ? (
        <p className="rounded-card border border-separator p-4 text-callout text-secondary-label">
          No certificates yet. Complete your roadmap to mastery and issue a verifiable credential here.
        </p>
      ) : (
        <ul className="space-y-2">
          {ledger.certificates.map((cert) => (
            <li key={cert.verificationCode} className="rounded-card border border-separator bg-text-background p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-headline">{cert.subjectTitle}</h3>
                  <p className="text-caption-1 text-secondary-label">
                    {cert.learnerName} · issued {cert.issuedOn}
                  </p>
                </div>
                <code className="rounded-control bg-gray5 px-2 py-1 font-mono text-caption-1" aria-label={`Verification code ${cert.verificationCode}`}>
                  {cert.verificationCode}
                </code>
              </div>
              <div className="mt-2 flex gap-2">
                <PushButton
                  variant="secondary"
                  onClick={() => void navigator.clipboard.writeText(cert.verificationCode).catch(() => {})}
                >
                  Copy code
                </PushButton>
                <a
                  role="button"
                  tabIndex={0}
                  className="focus-halo inline-flex h-[var(--control-height)] items-center rounded-control border border-separator bg-gray5 px-3 font-headline text-label hover:brightness-95 dark:bg-gray4"
                  href={`/api/certificates/render?type=svg&code=${encodeURIComponent(cert.verificationCode)}`}
                  download={`learnos-certificate-${cert.subjectId}.svg`}
                >
                  Download SVG
                </a>
                <a
                  role="button"
                  tabIndex={0}
                  className="focus-halo inline-flex h-[var(--control-height)] items-center rounded-control border border-separator bg-gray5 px-3 font-headline text-label hover:brightness-95 dark:bg-gray4"
                  href={`/api/certificates/render?type=pdf&code=${encodeURIComponent(cert.verificationCode)}`}
                  download={`learnos-certificate-${cert.subjectId}.pdf`}
                >
                  Download PDF
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-card border border-separator p-4">
        <h3 className="text-title-2">Public verifier</h3>
        <p className="mt-0.5 mb-2 text-caption-1 text-secondary-label">
          Anyone can check a LearnOS credential — no account needed.
        </p>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runVerify();
          }}
        >
          <div className="min-w-0 flex-1">
            <TextField label="Verification code" value={candidate} onChange={setCandidate} placeholder="LEARNOS-XXXX-XXXX-XXXX-XXXX" />
          </div>
          <PushButton variant="primary" type="submit">
            Verify
          </PushButton>
        </form>
        {verify.kind === 'valid' && (
          <p role="status" className="mt-2 text-body text-sys-green">
            ✓ Valid credential — matches issued code {verify.matchedCode}.
          </p>
        )}
        {verify.kind === 'invalid' && (
          <p role="alert" className="mt-2 text-body text-sys-red">
            ✗ Not recognised ({verify.reason}). Check for typos — O/0 and I/L are auto-corrected.
          </p>
        )}
      </div>
    </section>
  );
}
