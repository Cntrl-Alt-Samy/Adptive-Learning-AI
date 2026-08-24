'use client';

import { useEffect, useMemo, useState } from 'react';

import { ChatBubble, KaTeXBlock, PushButton } from '@/components/mac';
import { useTutorStream } from '@/hooks/use-tutor-stream';
import { SOCRATIC_STAGES, SocraticLoop } from '@/src/pedagogy/socratic.js';
import type { SocraticVerdict } from '@/src/pedagogy/socratic.js';

const STAGE_QUESTION: Record<string, string> = {
  OWN_WORDS: 'Explain this concept in your own words — no jargon allowed.',
  APPLICATION: 'Apply it to a fresh situation of your choosing. Where does it bite?',
  DEVILS_ADVOCATE: 'Argue the opposite: when would relying on this idea fail you?',
  CONNECTION_BRIDGE: 'Bridge it to something you already know well. What rhymes?'
};

export interface SocraticRailProps {
  sessionId: string;
  conceptId: string;
  onDone: (score: number) => void;
}

/**
 * S8A-T6 (F6) — stage rail from SOCRATIC_STAGES; verdict chips
 * SOLID/PARTIAL/NEEDS_WORK feed SocraticLoop; scaffold-depth indicator and
 * escalation state render from the engine result (never invented client-side).
 */
export function SocraticRail({ sessionId, conceptId, onDone }: SocraticRailProps) {
  const loop = useMemo(() => new SocraticLoop(), []);
  const [stageIndex, setStageIndex] = useState(0);
  const [scaffoldDepth, setScaffoldDepth] = useState(0);
  const [escalated, setEscalated] = useState(false);
  const [verdicts, setVerdicts] = useState<Array<{ stage: string; verdict: SocraticVerdict }>>([]);
  const [awaitingVerdict, setAwaitingVerdict] = useState(false);
  const [draft, setDraft] = useState('');
  const stream = useTutorStream(sessionId);

  async function askStage(stage: string | undefined): Promise<void> {
    if (stage === undefined) return;
    await stream.send(`Concept ${conceptId}, Socratic stage ${stage}: ${STAGE_QUESTION[stage] ?? ''}`, {
      mode: 'SOCRATIC_COACH',
      step: 5
    });
    setAwaitingVerdict(true);
  }

  useEffect(() => {
    void askStage(SOCRATIC_STAGES[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (verdict: SocraticVerdict): Promise<void> => {
    const stage = SOCRATIC_STAGES[stageIndex];
    if (stage !== undefined) setVerdicts((v) => [...v, { stage, verdict }]);
    const result = loop.recordResponse(verdict);
    setScaffoldDepth(result.scaffoldDepth);
    setEscalated(result.tier1);
    setDraft('');
    if (result.loopComplete) {
      onDone(verdictScore(verdict));
      return;
    }
    setStageIndex(result.stageIndex);
    setAwaitingVerdict(false);
    await askStage(SOCRATIC_STAGES[result.stageIndex]);
  };

  return (
    <section aria-label="Socratic loop" className="rounded-card border border-separator bg-text-background p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-title-2">Socratic loop</h2>
        {escalated && (
          <span className="rounded-full bg-sys-purple/15 px-2 py-0.5 text-caption-1 text-sys-purple">
            Tier-1 escalated
          </span>
        )}
      </header>

      {/* Stage rail */}
      <ol className="mt-3 flex flex-wrap gap-1" aria-label="Socratic stages">
        {SOCRATIC_STAGES.map((s, i) => (
          <li
            key={s}
            aria-current={i === stageIndex ? 'step' : undefined}
            className={`rounded-control px-2 py-0.5 text-caption-1 ${
              i < stageIndex
                ? 'bg-sys-green/15 text-sys-green'
                : i === stageIndex
                  ? 'bg-sys-purple/15 text-label'
                  : 'bg-gray5 text-tertiary-label'
            }`}
          >
            {i + 1}. {s.replace('_', ' ').toLowerCase()}
          </li>
        ))}
      </ol>

      {/* Scaffold depth indicator — 0 open … 3 maximal */}
      <p className="mt-2 text-caption-1 text-secondary-label">
        Scaffold depth:{' '}
        <span role="img" aria-label={`Scaffold depth ${scaffoldDepth} of 3`}>
          {'▮'.repeat(scaffoldDepth)}
          {'▯'.repeat(3 - scaffoldDepth)}
        </span>
      </p>

      <div className="mt-3 space-y-2" aria-live="polite">
        {stream.messages.map((m, i) => (
          <ChatBubble key={i} variant={m.role === 'user' ? 'sent' : 'received'}>
            {m.role === 'assistant' ? <KaTeXBlock content={m.content} /> : m.content}
          </ChatBubble>
        ))}
      </div>

      {awaitingVerdict && !stream.streaming && (
        <div className="mt-3">
          <label htmlFor="socratic-draft" className="text-callout text-secondary-label">
            Your answer (optional before self-verdict)
          </label>
          <textarea
            id="socratic-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="focus-halo mt-1 w-full rounded-control border border-separator bg-text-background p-2 text-body"
          />
          <div className="mt-2 flex gap-2">
            <PushButton variant="primary" onClick={() => void submit('SOLID')}>
              SOLID
            </PushButton>
            <PushButton variant="secondary" onClick={() => void submit('PARTIAL')}>
              PARTIAL
            </PushButton>
            <PushButton variant="destructive" onClick={() => void submit('NEEDS_WORK')}>
              NEEDS_WORK
            </PushButton>
          </div>
        </div>
      )}
    </section>
  );
}

function verdictScore(last: SocraticVerdict): number {
  switch (last) {
    case 'SOLID':
      return 90;
    case 'PARTIAL':
      return 72;
    default:
      return 55;
  }
}
