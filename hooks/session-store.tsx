'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { PlanResponse } from '@/lib/api';
import type { CatResult } from '@/src/pedagogy/cat.js';
import type { StateCheckpoint } from '@/src/state/checkpoint-contract.js';

/**
 * Client-side demo-tenant session (S8A). Server checkpoints remain the
 * source of truth for step state; this store carries the persona/plan
 * context between pages and survives reloads via sessionStorage.
 */

export const CONSENT_STORAGE_KEY = 'learnos-consent-token';

export interface LearnerPersona {
  subjectId: string;
  subjectTitle: string;
  selfLevel: 'beginner' | 'some_exposure' | 'intermediate' | 'advanced';
  goal: string;
  timeMinutes: number;
  modality: 'stepwise' | 'examples' | 'visual' | 'hands_on';
}

export interface ConceptProgress {
  conceptId: string;
  title: string;
  masteryScore: number;
  strikes: number;
}

interface SessionState {
  persona: LearnerPersona | null;
  catResult: CatResult | null;
  plan: PlanResponse | null;
  conceptProgress: ConceptProgress[];
  confirmedStep: number;
  sessionId: string;
}

interface SessionContextValue extends SessionState {
  setPersona: (p: LearnerPersona) => void;
  setCatResult: (r: CatResult) => void;
  setPlan: (p: PlanResponse) => void;
  recordConceptDone: (conceptId: string, title: string, masteryScore: number) => void;
  recordStrike: (conceptId: string) => void;
  confirmCheckpoint: (payload: StateCheckpoint | null) => void;
  reset: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEY = 'learnos-session';

function newSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${Date.now()}`;
}

function load(): SessionState {
  const fallback: SessionState = {
    persona: null,
    catResult: null,
    plan: null,
    conceptProgress: [],
    confirmedStep: 0,
    sessionId: newSessionId()
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<SessionState>) };
  } catch {
    return fallback;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>(load);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* private mode */
    }
  }, [state]);

  const setPersona = useCallback((persona: LearnerPersona) => setState((s) => ({ ...s, persona })), []);
  const setCatResult = useCallback((catResult: CatResult) => setState((s) => ({ ...s, catResult })), []);
  const setPlan = useCallback((plan: PlanResponse) => setState((s) => ({ ...s, plan })), []);

  const recordConceptDone = useCallback(
    (conceptId: string, title: string, masteryScore: number) =>
      setState((s) => ({
        ...s,
        conceptProgress: [
          ...s.conceptProgress.filter((c) => c.conceptId !== conceptId),
          { conceptId, title, masteryScore, strikes: s.conceptProgress.find((c) => c.conceptId === conceptId)?.strikes ?? 0 }
        ]
      })),
    []
  );

  const recordStrike = useCallback(
    (conceptId: string) =>
      setState((s) => ({
        ...s,
        conceptProgress: s.conceptProgress.map((c) =>
          c.conceptId === conceptId ? { ...c, strikes: c.strikes + 1 } : c
        )
      })),
    []
  );

  const confirmCheckpoint = useCallback(
    (payload: StateCheckpoint | null) =>
      setState((s) => {
        const next = payload?.step ?? s.confirmedStep + 1;
        return { ...s, confirmedStep: Math.max(s.confirmedStep, next) };
      }),
    []
  );

  const reset = useCallback(() => {
    setState(loadFresh);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, setPersona, setCatResult, setPlan, recordConceptDone, recordStrike, confirmCheckpoint, reset }),
    [state, setPersona, setCatResult, setPlan, recordConceptDone, recordStrike, confirmCheckpoint, reset]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function loadFresh(): SessionState {
  return {
    persona: null,
    catResult: null,
    plan: null,
    conceptProgress: [],
    confirmedStep: 0,
    sessionId: newSessionId()
  };
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
