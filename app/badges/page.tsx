'use client';

import { Shell } from '@/components/workspace/shell';
import { BadgeShelf } from '@/components/badges/badge-shelf';
import { CertificateWallet } from '@/components/badges/certificate-wallet';
import { useSession } from '@/hooks/session-store';

/**
 * S8B-T3/T4 — award shelf, streak counter and credential wallet with the
 * public verifier. Evaluation runs against the S5 decision-table engine.
 */
export default function BadgesPage() {
  const session = useSession();
  return (
    <Shell mode="SESSION_REVIEWER" confirmedStep={session.confirmedStep}>
      <div className="mx-auto max-w-2xl space-y-8">
        <h1 className="text-large-title">Badges</h1>
        <BadgeShelf />
        <CertificateWallet />
      </div>
    </Shell>
  );
}
