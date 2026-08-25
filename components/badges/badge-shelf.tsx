'use client';

import { useEffect, useMemo } from 'react';

import { PushButton } from '@/components/mac';
import { useLedger } from '@/hooks/learner-store';
import { useSession } from '@/hooks/session-store';
import {
  computeStreak,
  decideAwards,
  foldAwards,
  revokeAward,
  type BadgeAwardRecord,
  type LearnerMasterySnapshot,
  type MasteryStatus
} from '@/src/credentialing/badges.js';
import { buildCatalog, type CatalogBadge } from '@/lib/badge-catalog';

/**
 * S8B-T3 — award shelf + streak counter over the S5 decision-table engine.
 * Earned / locked / revoked states render from the ledger; evaluation is
 * idempotent (decideAwards skips badges already holding a live award).
 */

function statusFor(score: number): MasteryStatus {
  return score >= 85 ? 'SOLID' : score >= 60 ? 'PARTIAL' : 'NEEDS_WORK';
}

export function useBadgeSnapshot(): LearnerMasterySnapshot {
  const session = useSession();
  const ledger = useLedger();
  return useMemo(
    () => ({
      dna: session.conceptProgress.map((c) => ({
        conceptId: c.conceptId,
        masteryScore: c.masteryScore,
        status: statusFor(c.masteryScore)
      })),
      sessionDays: ledger.sessionDays,
      practiceCounts: ledger.practiceCounts
    }),
    [session.conceptProgress, ledger.sessionDays, ledger.practiceCounts]
  );
}

export function BadgeShelf() {
  const session = useSession();
  const ledger = useLedger();
  const snapshot = useBadgeSnapshot();

  const catalog: CatalogBadge[] = useMemo(
    () =>
      buildCatalog(
        session.persona?.subjectTitle ?? null,
        session.plan?.planned.map((p) => p.conceptId) ?? []
      ),
    [session.persona?.subjectTitle, session.plan?.planned]
  );

  // Persist newly-earned awards once per snapshot/catalog change.
  useEffect(() => {
    if (snapshot.dna.length === 0) return;
    const outcome = decideAwards(catalog, snapshot, ledger.awards);
    if (outcome.newlyAwarded.length === 0) return;
    const records: BadgeAwardRecord[] = foldAwards(ledger.awards, outcome.newlyAwarded, new Date().toISOString())
      .slice(ledger.awards.length)
      .map((r) => ({ ...r, userId: session.sessionId }));
    ledger.appendAwards(records);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, snapshot]);

  const streak = computeStreak(ledger.sessionDays);
  const liveByBadge = new Map<string, boolean>();
  for (const a of ledger.awards) liveByBadge.set(a.badgeId, (liveByBadge.get(a.badgeId) ?? false) || a.revokedAt === undefined);
  const revokedBadges = new Set(ledger.awards.filter((a) => a.revokedAt !== undefined).map((a) => a.badgeId));

  return (
    <section aria-label="Badges" className="space-y-4">
      <header className="flex items-center justify-between rounded-card border border-separator bg-text-background px-4 py-3">
        <div>
          <h2 className="text-title-1">Streak</h2>
          <p className="text-caption-1 text-secondary-label">Consecutive UTC learning days</p>
        </div>
        <p className="text-large-title tabular-nums" aria-label={`${streak} day streak`}>
          {streak > 0 ? `${'🔥'.repeat(Math.min(streak, 5))} ${streak}` : '—'}
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {catalog.map((badge) => {
          const earned = liveByBadge.get(badge.id) === true;
          const revoked = !earned && revokedBadges.has(badge.id);
          return (
            <li
              key={badge.id}
              aria-label={`${badge.title}: ${earned ? 'earned' : revoked ? 'revoked' : 'locked'}`}
              className={`rounded-card border p-3 text-center ${
                earned
                  ? 'border-sys-green/40 bg-sys-green/10'
                  : revoked
                    ? 'border-sys-red/30 bg-gray6 opacity-70'
                    : 'border-separator bg-text-background'
              }`}
            >
              <span aria-hidden className={earned || revoked ? '' : 'grayscale opacity-50'}>
                {badge.glyph}
              </span>
              <p className="mt-1 text-headline">{badge.title}</p>
              <p className="mt-0.5 text-caption-1 text-secondary-label">{badge.description}</p>
              <p className={`mt-2 inline-block rounded-full px-2 py-0.5 text-caption-1 ${
                earned ? 'bg-sys-green/20 text-sys-green' : revoked ? 'bg-sys-red/15 text-sys-red' : 'bg-gray5 text-tertiary-label'
              }`}>
                {earned ? 'Earned' : revoked ? 'Revoked' : 'Locked'}
              </p>
              {earned && (
                <PushButton
                  variant="secondary"
                  className="mt-2"
                  aria-label={`Revoke ${badge.title}`}
                  onClick={() => ledger.revokeBadge(badge.id, new Date().toISOString())}
                >
                  Revoke
                </PushButton>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
