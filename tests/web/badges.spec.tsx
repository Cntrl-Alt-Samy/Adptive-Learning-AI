// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => '/badges'
}));

import { SessionProvider } from '@/hooks/session-store';
import { LearnerLedgerProvider } from '@/hooks/learner-store';
import { BadgeShelf } from '@/components/badges/badge-shelf';
import { CertificateWallet } from '@/components/badges/certificate-wallet';

/**
 * S8B-T3/T4 — badge shelf + certificate wallet render gates with fresh
 * providers (locked shelf, empty wallet, verifier form present).
 */

afterEach(cleanup);

function Providers({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <SessionProvider>
      <LearnerLedgerProvider>{children}</LearnerLedgerProvider>
    </SessionProvider>
  );
}

describe('BadgeShelf', () => {
  it('renders the streak header and locked catalog without progress', () => {
    render(
      <Providers>
        <BadgeShelf />
      </Providers>
    );
    expect(screen.getByText('Streak')).toBeTruthy();
    expect(screen.getByText('First Steps')).toBeTruthy();
    expect(screen.getByText('Deliberate Practitioner')).toBeTruthy();
    expect(screen.getAllByText('Locked').length).toBeGreaterThanOrEqual(4);
  });
});

describe('CertificateWallet', () => {
  it('shows the empty state and a disabled issue button until mastery', () => {
    render(
      <Providers>
        <CertificateWallet />
      </Providers>
    );
    expect(screen.getByText(/No certificates yet/)).toBeTruthy();
    const issue = screen.getByRole('button', { name: /Earn 75%/ }) as HTMLButtonElement;
    expect(issue.disabled).toBe(true);
  });

  it('exposes the public verifier form', () => {
    render(
      <Providers>
        <CertificateWallet />
      </Providers>
    );
    expect(screen.getByText('Public verifier')).toBeTruthy();
    expect(screen.getByLabelText('Verification code')).toBeTruthy();
  });
});
