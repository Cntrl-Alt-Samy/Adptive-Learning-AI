'use client';

import { PushButton } from './push-button';

interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  label: string;
}

/** §4.5 stepper — decrement/increase pair with numeric readout. */
export function Stepper({ value, min = 0, max = 99, step = 1, suffix, onChange, label }: StepperProps) {
  return (
    <div className="inline-flex flex-col overflow-hidden rounded-[10px] bg-gray6 dark:bg-gray5">
      <PushButton
        variant="secondary"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className="h-8! w-9! rounded-none bg-transparent! px-0 text-body leading-none shadow-none!"
      >
        −
      </PushButton>
      <span
        aria-live="polite"
        aria-label={`${label}: ${value}`}
        className="min-w-7 border-t border-separator bg-text-background py-0.5 text-center text-callout tabular-nums"
      >
        {value}
        {suffix ?? ''}
      </span>
      <PushButton
        variant="secondary"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className="h-8! w-9! rounded-none bg-transparent! border-t! border-separator! px-0 text-body leading-none shadow-none!"
      >
        +
      </PushButton>
    </div>
  );
}
