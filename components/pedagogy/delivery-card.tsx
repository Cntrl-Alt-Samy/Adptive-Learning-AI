'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ChatBubble, KaTeXBlock, ProgressBar, PushButton } from '@/components/mac';
import { useTutorStream } from '@/hooks/use-tutor-stream';
import { DELIVERY_PARTS, DeliveryGate } from '@/src/pedagogy/delivery-gate.js';
import type { DeliveryPart } from '@/src/pedagogy/delivery-gate.js';

const PART_PROMPT: Record<DeliveryPart, string> = {
  BIG_PICTURE: 'Give the big-picture framing for this concept.',
  CORE_PRINCIPLE: 'Teach the core principle step by step.',
  TAILORED_EXAMPLE: 'Work a tailored example grounded in the curriculum.',
  COMMON_PITFALL: 'Name the common pitfall and how to avoid it.',
  CHECK_IN: 'Pose a one-line check-in question.'
};

const PART_LABEL: Record<DeliveryPart, string> = {
  BIG_PICTURE: 'Big picture',
  CORE_PRINCIPLE: 'Core principle',
  TAILORED_EXAMPLE: 'Tailored example',
  COMMON_PITFALL: 'Common pitfall',
  CHECK_IN: 'Check-in'
};

const DEFAULT_ANALOGIES = [
  'a water tank filling at a steady rate',
  'earning interest in a savings account',
  'miles driven at constant speed'
];

export interface DeliveryCardProps {
  conceptId: string;
  title: string;
  sessionId: string;
  onComplete: (masteryScore: number) => void;
}

/**
 * S8A-T6 (F5) — 5-part ConceptDeliveryCard ordered by DELIVERY_PARTS,
 * gated by the S4 DeliveryGate engine. CONFUSED flips the card orange and
 * auto-reteaches from CORE_PRINCIPLE with a rotated analogy. The gate is a
 * render-stable instance (useMemo); all part state flows through `snapshot`.
 */
export function DeliveryCard({ conceptId, title, sessionId, onComplete }: DeliveryCardProps) {
  const analogies = useMemo(() => [...DEFAULT_ANALOGIES], []);
  const gate = useMemo(() => new DeliveryGate(analogies), [analogies]);
  const [snapshot, setSnapshot] = useState(() => gate.snapshot());
  const [reteachBanner, setReteachBanner] = useState<string | null>(null);
  const [confusedFlash, setConfusedFlash] = useState(false);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const stream = useTutorStream(sessionId);
  const startedRef = useRef(false);

  // All render-time reads come from state; refs are only touched in effects/handlers.
  const currentPart: DeliveryPart = DELIVERY_PARTS[snapshot.partIndex] ?? 'BIG_PICTURE';

  async function streamPart(): Promise<void> {
    await stream.send(`Concept "${title}" (${conceptId}). ${PART_PROMPT[currentPart]}`, { mode: 'TUTOR', step: 4 });
    gate.markDelivered(gate.currentPart, { grounded: true });
    setDeliveredCount((c) => c + 1);
    setSnapshot(gate.snapshot());
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void streamPart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function checkIn(verdict: 'PASS' | 'CONFUSED'): void {
    const result = gate.submitCheckIn(verdict);
    setSnapshot(gate.snapshot());
    if (result.canProgress) {
      const penalty = gate.snapshot().reteachCount * 12;
      onComplete(Math.max(50, 92 - penalty));
      return;
    }
    if (result.reteach !== undefined) {
      setConfusedFlash(true);
      window.setTimeout(() => setConfusedFlash(false), 900);
      setReteachBanner(`Let’s re-angle it — think of it like ${result.reteach.analogy}. (attempt ${result.reteach.attempt})`);
      void streamPart();
    }
  }

  return (
    <section
      aria-label={`Concept delivery: ${title}`}
      className={`rounded-card border p-4 transition-colors duration-300 ${
        confusedFlash ? 'border-sys-orange bg-sys-orange/10' : 'border-separator bg-text-background'
      }`}
    >
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-title-1">{title}</h2>
        <span className="text-caption-1 text-secondary-label">
          Part {snapshot.partIndex + 1}/{DELIVERY_PARTS.length} · {PART_LABEL[currentPart]}
        </span>
      </header>

      <ol aria-label="Delivery progress" className="mb-3">
        <ProgressBar value={(deliveredCount / DELIVERY_PARTS.length) * 100} label="Delivery parts" />
      </ol>

      {reteachBanner !== null && (
        <p role="status" className="mb-2 rounded-control bg-sys-orange/15 px-3 py-1.5 text-callout text-sys-orange">
          {reteachBanner}
        </p>
      )}

      <div className="space-y-2" aria-live="polite">
        {stream.messages.map((m, i) => (
          <ChatBubble key={i} variant={m.role === 'user' ? 'sent' : 'received'}>
            {m.role === 'assistant' ? <KaTeXBlock content={m.content} /> : m.content}
          </ChatBubble>
        ))}
        {stream.streaming && <p className="text-callout text-tertiary-label">Streaming…</p>}
      </div>

      {!stream.streaming && currentPart !== 'CHECK_IN' && (
        <PushButton variant="primary" className="mt-3" onClick={() => void streamPart()}>
          Continue to {PART_LABEL[currentPart]}
        </PushButton>
      )}

      {currentPart === 'CHECK_IN' && !stream.streaming && (
        <div className="mt-4 rounded-control border border-separator bg-window p-3">
          <p className="text-headline">Did that land?</p>
          <div className="mt-2 flex gap-2">
            <PushButton variant="primary" onClick={() => checkIn('PASS')}>
              ✓ It clicked (PASS)
            </PushButton>
            <PushButton variant="destructive" onClick={() => checkIn('CONFUSED')}>
              Still confused
            </PushButton>
          </div>
          <p className="mt-2 text-caption-1 text-tertiary-label">
            PASS unlocks the Socratic loop · CONFUSED triggers an automatic reteach.
          </p>
        </div>
      )}
    </section>
  );
}
