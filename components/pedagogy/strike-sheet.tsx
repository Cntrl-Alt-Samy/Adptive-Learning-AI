'use client';

import { PushButton, Sheet } from '@/components/mac';
import type { StrikeIntervention } from '@/src/pedagogy/strike-breaker.js';

const COPY: Record<StrikeIntervention['kind'], { title: string; body: string }> = {
  HINT_AND_ANALOGY: {
    title: 'Quick hint',
    body: 'Try a hint and an everyday analogy before the next attempt — you have got this.'
  },
  DECOMPOSE_SUBSTEPS: {
    title: 'Let’s decompose it',
    body: 'Break the problem into sub-steps and solve them one at a time. Which piece feels shaky?'
  },
  BREAKER_TRIP: {
    title: 'Time to pivot',
    body: 'This one is tagged for revisit. We will pivot to its prerequisite (or take a 5-minute breather) and come back stronger.'
  },
  NONE: { title: '', body: '' }
};

interface StrikeSheetProps {
  intervention: StrikeIntervention | null;
  onAcknowledge: () => void;
}

/** S8A-T6 — strike-breaker Sheet, non-dismissible until acknowledged. */
export function StrikeSheet({ intervention, onAcknowledge }: StrikeSheetProps) {
  const open = intervention !== null && intervention.kind !== 'NONE';
  return (
    <Sheet open={open} locked onClose={onAcknowledge} title={open ? COPY[intervention.kind].title : ''}>
      <p className="text-body">{open ? COPY[intervention.kind].body : ''}</p>
      <PushButton variant="primary" className="mt-3" onClick={onAcknowledge}>
        Got it
      </PushButton>
    </Sheet>
  );
}
