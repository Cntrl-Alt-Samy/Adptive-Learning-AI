'use client';

import { CHECKPOINT_STEPS } from '@/src/state/checkpoint-contract.js';

interface ProgressDotsProps {
  /** Highest confirmed checkpoint step (0 = nothing confirmed yet). */
  confirmedStep: number;
}

/** HUD progress dots — a direct render of CHECKPOINT_STEPS; never hardcoded. */
export function ProgressDots({ confirmedStep }: ProgressDotsProps) {
  return (
    <span
      role="status"
      aria-label={`Checkpoint ${confirmedStep} of ${CHECKPOINT_STEPS.length} confirmed`}
      className="inline-flex items-center gap-1"
    >
      {CHECKPOINT_STEPS.map((step) => (
        <span
          key={step}
          aria-hidden
          className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            step <= confirmedStep ? 'bg-sys-blue' : 'bg-gray4 dark:bg-gray3'
          }`}
        />
      ))}
    </span>
  );
}
