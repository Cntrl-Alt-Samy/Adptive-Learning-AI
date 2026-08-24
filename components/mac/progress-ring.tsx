'use client';

import { bandFor } from '@/src/pedagogy/decay-math.js';
import type { MasteryBand } from '@/src/pedagogy/decay-math.js';

/** §4.1 mastery mapping — fixed across the product. */
export const BAND_COLOR: Record<MasteryBand, string> = {
  SOLID: 'var(--sys-green)',
  PARTIAL: 'var(--sys-orange)',
  NEEDS_WORK: 'var(--sys-red)'
};

interface ProgressRingProps {
  /** 0–100. */
  value: number;
  size?: number;
  strokeWidth?: number;
  ariaLabel: string;
}

/** §4.5 progress ring — mastery rings use full radius + band color. */
export function ProgressRing({ value, size = 28, strokeWidth = 3, ariaLabel }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const color = BAND_COLOR[bandFor(clamped)];
  return (
    <svg width={size} height={size} role="img" aria-label={`${ariaLabel}: ${clamped}%`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sys-gray5)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (clamped / 100) * c}
        style={{ transition: 'stroke-dashoffset var(--dur-step) var(--ease-default)' }}
      />
    </svg>
  );
}

interface ProgressBarProps {
  /** 0–100. */
  value: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${clamped}% complete`}
      className="h-1.5 w-full overflow-hidden rounded-full bg-gray5"
    >
      <div
        className="h-full rounded-full bg-sys-blue"
        style={{ width: `${clamped}%`, transition: 'width var(--dur-step) var(--ease-default)' }}
      />
    </div>
  );
}
