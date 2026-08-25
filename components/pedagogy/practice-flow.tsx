'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PushButton } from '@/components/mac';
import { StrikeSheet } from './strike-sheet';
import { api } from '@/lib/api';
import { useSession } from '@/hooks/session-store';
import { useLedger } from '@/hooks/learner-store';
import { StrikeBreaker } from '@/src/pedagogy/strike-breaker.js';
import type { StrikeIntervention } from '@/src/pedagogy/strike-breaker.js';
import type { PracticeQuestion } from '@/src/pedagogy/practice.js';

const TIER_BADGE: Record<PracticeQuestion['tier'], string> = {
  RECALL: 'bg-sys-mint/15 text-sys-green',
  APPLICATION: 'bg-sys-blue/10 text-sys-blue',
  SYNTHESIS: 'bg-sys-purple/15 text-sys-purple'
};

export interface PracticeFlowProps {
  conceptId: string;
  onDone: (score: number) => void;
}

/**
 * S8A-T6 (F7) — tier-badged practice via generateUniqueQuestions (server
 * registry); wrong answers feed the S4 StrikeBreaker → intervention Sheet.
 */
export function PracticeFlow({ conceptId, onDone }: PracticeFlowProps) {
  const { recordStrike } = useSession();
  const ledger = useLedger();
  const [questions, setQuestions] = useState<PracticeQuestion[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [intervention, setIntervention] = useState<StrikeIntervention | null>(null);
  const breakerRef = useRef(new StrikeBreaker());

  const load = useCallback(async () => {
    try {
      const res = await api.practice(conceptId, 3);
      if ('error' in res) {
        setNotice(res.message); // 30-day uniqueness notice (F7.1)
        return;
      }
      setQuestions(res.questions);
    } catch {
      setNotice('Practice generation failed. Try again shortly.');
    }
  }, [conceptId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (questions === null) {
    return (
      <section aria-label="Practice" className="rounded-card border border-separator bg-text-background p-4">
        <p className="text-body">{notice ?? 'Generating tier-badged questions…'}</p>
        {notice !== null && (
          <PushButton variant="secondary" className="mt-2" onClick={() => void load()}>
            Retry
          </PushButton>
        )}
      </section>
    );
  }

  const q = questions[index];
  if (q === undefined) {
    return (
      <section aria-label="Practice" className="rounded-card border border-separator bg-text-background p-4">
        <p className="text-body text-tertiary-label">No questions available.</p>
      </section>
    );
  }

  const grade = (correct: boolean): void => {
    ledger.recordPracticeAttempt(conceptId, correct);
    if (!correct) {
      const { intervention: next } = breakerRef.current.recordFailure(conceptId);
      recordStrike(conceptId);
      setIntervention(next);
    } else {
      setCorrectCount((c) => c + 1);
    }
    setDraft('');
    if (index + 1 >= questions.length) {
      onDone(Math.round(((correctCount + (correct ? 1 : 0)) / questions.length) * 100));
      return;
    }
    setIndex((i) => i + 1);
  };

  return (
    <section aria-label="Practice" className="rounded-card border border-separator bg-text-background p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-title-2">Practice</h2>
        <span className={`rounded-full px-2 py-0.5 text-caption-1 font-semibold ${TIER_BADGE[q.tier]}`}>
          {q.tier}
        </span>
      </header>
      <p className="mt-2 text-chat-body">{q.prompt}</p>
      <textarea
        aria-label="Your answer"
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="focus-halo mt-2 w-full rounded-control border border-separator bg-text-background p-2 text-body"
      />
      <div className="mt-2 flex items-center gap-2">
        <PushButton variant="primary" onClick={() => grade(true)}>
          I got it right
        </PushButton>
        <PushButton variant="destructive" onClick={() => grade(false)}>
          I missed it
        </PushButton>
        <span className="ml-auto text-caption-1 text-secondary-label">
          {index + 1}/{questions.length}
        </span>
      </div>

      <StrikeSheet intervention={intervention} onAcknowledge={() => setIntervention(null)} />
    </section>
  );
}
