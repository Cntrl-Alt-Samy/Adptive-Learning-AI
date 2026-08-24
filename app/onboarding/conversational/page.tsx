'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ChatBubble, KaTeXBlock, PushButton } from '@/components/mac';
import { useTutorStream } from '@/hooks/use-tutor-stream';
import { api } from '@/lib/api';
import type { SubjectSummary } from '@/lib/api';
import { useSession } from '@/hooks/session-store';
import type { LearnerPersona } from '@/hooks/session-store';
import { classifyIntent, REFUSAL_SCAFFOLD_TEMPLATE } from '@/src/integrity/classifier.js';

/**
 * S8A-T6 (F2.1) — conversational intake: one PROFILER step-0 turn, then a
 * confirmation card the learner edits until it matches. classifyIntent runs
 * client-side so out-of-scope requests get the refusal scaffold instantly.
 */
export default function ConversationalOnboardingPage() {
  const router = useRouter();
  const session = useSession();
  const [sessionId] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${Date.now()}`));
  const stream = useTutorStream(sessionId);
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pickedSubject, setPickedSubject] = useState<string | null>(null);

  useEffect(() => {
    void api.subjects().then((r) => setSubjects(r.subjects)).catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    void stream.send(
      'You are the profiler. Ask me up to three short questions to learn: which subject I want to study, my current level, my goal, how much time I have per day, and the teaching style I prefer. Then summarise my profile as a compact list.',
      { mode: 'PROFILER', step: 0 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (): Promise<void> => {
    const text = draft.trim();
    if (text.length === 0) return;
    setDraft('');
    const intent = classifyIntent(text);
    if (intent.verdict === 'CHEATING') {
      await stream.send(REFUSAL_SCAFFOLD_TEMPLATE, { mode: 'PROFILER', step: 0 });
      return;
    }
    await stream.send(text, { mode: 'PROFILER', step: 0 });
    setConfirming(true);
  };

  const confirm = (): void => {
    if (pickedSubject === null) return;
    const subject = subjects.find((s) => s.id === pickedSubject);
    const persona: LearnerPersona = {
      subjectId: pickedSubject,
      subjectTitle: subject?.title ?? pickedSubject,
      selfLevel: 'beginner',
      goal: 'Set during conversational intake',
      timeMinutes: 30,
      modality: 'stepwise'
    };
    session.setPersona(persona);
    router.push('/onboarding/calibration');
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center">
      <h1 className="text-large-title">Let’s chat</h1>
      <div className="mt-4 space-y-2" aria-live="polite">
        {stream.messages.map((m, i) => (
          <ChatBubble key={i} variant={m.role === 'user' ? 'sent' : 'received'}>
            {m.role === 'assistant' ? <KaTeXBlock content={m.content} /> : m.content}
          </ChatBubble>
        ))}
        {stream.streaming && <p className="text-callout text-tertiary-label">Profiler is typing…</p>}
      </div>

      {!confirming ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Message the profiler"
            placeholder="e.g. I want GCSE Economics basics, 30 min on weekdays"
            className="focus-halo h-9 flex-1 rounded-control border border-separator bg-text-background px-3 text-body"
          />
          <PushButton variant="primary" type="submit" disabled={stream.streaming}>
            Send
          </PushButton>
        </form>
      ) : (
        <section aria-label="Confirm your profile" className="mt-4 rounded-card border border-separator bg-text-background p-4">
          <h2 className="text-title-2">Does this match you?</h2>
          <p className="mt-2 text-callout text-secondary-label">Pick your subject to confirm:</p>
          <div role="radiogroup" aria-label="Subject" className="mt-1 flex flex-wrap gap-2">
            {subjects.map((s) => (
              <PushButton key={s.id} variant={pickedSubject === s.id ? 'primary' : 'secondary'} onClick={() => setPickedSubject(s.id)}>
                {s.title}
              </PushButton>
            ))}
          </div>
          <p className="mt-2 text-caption-1 text-tertiary-label">
            Level: beginner · Time: 30 min/day · Style: stepwise (edit later in Settings)
          </p>
          <div className="mt-3 flex gap-2">
            <PushButton variant="primary" onClick={confirm} disabled={pickedSubject === null}>
              Yes — calibrate me
            </PushButton>
            <PushButton variant="secondary" onClick={() => setConfirming(false)}>
              Not quite — keep chatting
            </PushButton>
          </div>
        </section>
      )}
    </main>
  );
}
