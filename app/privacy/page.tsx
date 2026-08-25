'use client';

import { Shell } from '@/components/workspace/shell';
import { PrivacyCenter } from '@/components/privacy/privacy-center';
import { useSession } from '@/hooks/session-store';

/**
 * S8B-T5 — full Privacy Center destination (granular prefs, audit trail,
 * export/erase, transcript-access status).
 */
export default function PrivacyPage() {
  const session = useSession();
  return (
    <Shell mode="SESSION_REVIEWER" confirmedStep={session.confirmedStep}>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-large-title">Privacy Center</h1>
        <PrivacyCenter />
      </div>
    </Shell>
  );
}
