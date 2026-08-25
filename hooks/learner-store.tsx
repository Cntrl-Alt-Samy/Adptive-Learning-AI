'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { BadgeAwardRecord } from '@/src/credentialing/badges.js';
import type { Role } from '@/lib/auth/session';

/**
 * S8B-T2/T3/T5 — client-side learner ledger. Everything the trust surfaces
 * need between sessions: session days (streaks), practice counts, badge
 * award ledger, scheduled review items, granular consent prefs + lifecycle
 * audit trail, cached certificates and the authenticated role. Persisted to
 * localStorage; the server remains authoritative for identity/RBAC.
 */

export const LEDGER_STORAGE_KEY = 'learnos-ledger';

export type ConsentPrefKey = 'analytics' | 'transcriptResearch' | 'educatorAggregates' | 'productEmails';

export interface ConsentEvent {
  at: string;
  action: 'ISSUED' | 'VERIFIED' | 'PREF_CHANGED' | 'REVOKED';
  detail?: string;
}

export interface ScheduledReviewItem {
  conceptId: string;
  subjectId: string;
  offsetHours: number;
  dueAtMs: number;
}

export interface CachedCertificate {
  verificationCode: string;
  subjectId: string;
  subjectTitle: string;
  issuedOn: string;
  learnerName: string;
}

interface LedgerState {
  role: Role | null;
  displayName: string | null;
  sessionDays: string[];
  practiceCounts: Record<string, number>;
  awards: BadgeAwardRecord[];
  reviews: ScheduledReviewItem[];
  consentPrefs: Record<ConsentPrefKey, boolean>;
  consentEvents: ConsentEvent[];
  certificates: CachedCertificate[];
}

const DEFAULT_PREFS: Record<ConsentPrefKey, boolean> = {
  analytics: true,
  transcriptResearch: false,
  educatorAggregates: true,
  productEmails: false
};

type LedgerContextValue = LedgerState & {
  setIdentity: (role: Role, displayName: string) => void;
  recordSessionDay: (isoDay: string) => void;
  recordPracticeAttempt: (conceptId: string, correct: boolean) => void;
  scheduleReviews: (items: ScheduledReviewItem[]) => void;
  appendAwards: (awards: BadgeAwardRecord[]) => void;
  revokeBadge: (badgeId: string, revokedAtIso: string) => void;
  setConsentPref: (key: ConsentPrefKey, value: boolean) => void;
  appendConsentEvent: (event: ConsentEvent) => void;
  cacheCertificate: (cert: CachedCertificate) => void;
  clearLedger: () => void;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

function load(): LedgerState {
  const fallback: LedgerState = {
    role: null,
    displayName: null,
    sessionDays: [],
    practiceCounts: {},
    awards: [],
    reviews: [],
    consentPrefs: { ...DEFAULT_PREFS },
    consentEvents: [],
    certificates: []
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(LEDGER_STORAGE_KEY);
    if (raw === null) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<LedgerState>) };
  } catch {
    return fallback;
  }
}

export function LearnerLedgerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LedgerState>(load);

  useEffect(() => {
    // Hydrate identity from the signed cookie session (server-authoritative).
    void fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data: { authenticated: boolean; role?: Role; displayName?: string }) => {
        if (data.authenticated && data.role !== undefined) {
          setState((s) => ({ ...s, role: data.role ?? null, displayName: data.displayName ?? null }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* private mode */
    }
  }, [state]);

  const setIdentity = useCallback((role: Role, displayName: string) => {
    setState((s) => ({ ...s, role, displayName }));
  }, []);

  const recordSessionDay = useCallback((isoDay: string) => {
    setState((s) =>
      s.sessionDays.includes(isoDay) ? s : { ...s, sessionDays: [...s.sessionDays, isoDay] }
    );
  }, []);

  const recordPracticeAttempt = useCallback((conceptId: string, _correct: boolean) => {
    void _correct;
    setState((s) => ({
      ...s,
      practiceCounts: { ...s.practiceCounts, [conceptId]: (s.practiceCounts[conceptId] ?? 0) + 1 }
    }));
  }, []);

  const scheduleReviews = useCallback((items: ScheduledReviewItem[]) => {
    setState((s) => {
      const seen = new Set(s.reviews.map((r) => `${r.conceptId}:${r.offsetHours}`));
      const fresh = items.filter((i) => !seen.has(`${i.conceptId}:${i.offsetHours}`));
      return fresh.length === 0 ? s : { ...s, reviews: [...s.reviews, ...fresh] };
    });
  }, []);

  const appendAwards = useCallback((awards: BadgeAwardRecord[]) => {
    setState((s) => ({ ...s, awards: [...s.awards, ...awards] }));
  }, []);

  const revokeBadge = useCallback((badgeId: string, revokedAtIso: string) => {
    setState((s) => ({
      ...s,
      awards: s.awards.map((a) => (a.badgeId === badgeId && a.revokedAt === undefined ? { ...a, revokedAt: revokedAtIso } : a))
    }));
  }, []);

  const setConsentPref = useCallback((key: ConsentPrefKey, value: boolean) => {
    setState((s) => ({
      ...s,
      consentPrefs: { ...s.consentPrefs, [key]: value },
      consentEvents: [
        ...s.consentEvents,
        { at: new Date().toISOString(), action: 'PREF_CHANGED', detail: `${key}=${String(value)}` }
      ]
    }));
  }, []);

  const appendConsentEvent = useCallback((event: ConsentEvent) => {
    setState((s) => ({ ...s, consentEvents: [...s.consentEvents, event] }));
  }, []);

  const cacheCertificate = useCallback((cert: CachedCertificate) => {
    setState((s) =>
      s.certificates.some((c) => c.verificationCode === cert.verificationCode)
        ? s
        : { ...s, certificates: [cert, ...s.certificates] }
    );
  }, []);

  const clearLedger = useCallback(() => {
    setState(load);
    try {
      window.localStorage.removeItem(LEDGER_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      setIdentity,
      recordSessionDay,
      recordPracticeAttempt,
      scheduleReviews,
      appendAwards,
      revokeBadge,
      setConsentPref,
      appendConsentEvent,
      cacheCertificate,
      clearLedger
    }),
    [state, setIdentity, recordSessionDay, recordPracticeAttempt, scheduleReviews, appendAwards, revokeBadge, setConsentPref, appendConsentEvent, cacheCertificate, clearLedger]
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error('useLedger must be used within LearnerLedgerProvider');
  return ctx;
}
