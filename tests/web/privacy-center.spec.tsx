// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => '/privacy'
}));

vi.mock('@/lib/api', () => ({
  api: {
    consentVerify: vi.fn().mockResolvedValue({ ok: true, reason: 'OK' })
  }
}));

import { SessionProvider, CONSENT_STORAGE_KEY } from '@/hooks/session-store';
import { LearnerLedgerProvider } from '@/hooks/learner-store';
import { PrivacyCenter } from '@/components/privacy/privacy-center';

/**
 * S8B-T5 — Privacy Center gate: granular toggles persist to the ledger,
 * the audit trail records pref changes, and self-access shows ALLOW_RAW.
 */

afterEach(cleanup);

function mount(): void {
  render(
    <SessionProvider>
      <LearnerLedgerProvider>
        <PrivacyCenter />
      </LearnerLedgerProvider>
    </SessionProvider>
  );
}

describe('PrivacyCenter', () => {
  it('renders all granular preferences defaulting to safe values', () => {
    mount();
    expect(screen.getByText('Product analytics')).toBeTruthy();
    expect(screen.getByText('Research use of transcripts')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Product analytics' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Research use of transcripts' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('switch', { name: 'Product emails' }).getAttribute('aria-checked')).toBe('false');
  });

  it('records a PREF_CHANGED audit event when a toggle flips', () => {
    mount();
    expect(screen.getByText(/No consent activity recorded yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Product emails' }));
    expect(screen.getAllByText(/productEmails=true/).length).toBeGreaterThan(0);
  });

  it('shows the live transcript-access decision for self-access', async () => {
    mount();
    await vi.waitFor(() => expect(screen.getAllByText(/ALLOW_RAW/).length).toBeGreaterThan(0));
  });

  it('revoke clears the consent token when consent is verified', async () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, 'tok');
    mount();
    const revoke = (await screen.findByRole('button', { name: /Revoke consent & start over/ })) as HTMLButtonElement;
    await vi.waitFor(() => expect(revoke.disabled).toBe(false));
    revoke.click();
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });
});
