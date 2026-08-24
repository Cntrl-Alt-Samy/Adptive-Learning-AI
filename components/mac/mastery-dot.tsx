'use client';

import { bandFor } from '@/src/pedagogy/decay-math.js';
import type { MasteryBand } from '@/src/pedagogy/decay-math.js';
import { BAND_COLOR } from './progress-ring';

interface MasteryDotProps {
  /** 0–100 mastery score; band color per §4.1 fixed mapping. */
  score: number;
}

/** Source-list mastery dot (§4.5 sidebar). */
export function MasteryDot({ score }: MasteryDotProps) {
  const color = BAND_COLOR[bandFor(score)];
  return (
    <span
      role="img"
      aria-label={`Mastery ${bandFor(score).toLowerCase().replace('_', ' ')}`}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
