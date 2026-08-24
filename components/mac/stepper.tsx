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
    <div className="inline-flex flex-col overflow-hidden rounded-control border border-separator">
      <PushButton
        variant="secondary"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className="h-6! w-7! rounded-none border-0 px-0 text-caption-1 leading-none"
      >
        −
      </PushButton>
      <span
        aria-live="polite"
        aria-label={`${label}: ${value}`}
        className="min-w-7 border-t border-separator bg-window py-0.5 text-center text-caption-1 tabular-nums"
      >
        {value}
        {suffix ?? ''}
      </span>
      <PushButton
        variant="secondary"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className="h-6! w-7! rounded-none border-0 border-t! border-separator! px-0 text-caption-1 leading-none"
      >
        +
      </PushButton>
    </div>
  );
}
