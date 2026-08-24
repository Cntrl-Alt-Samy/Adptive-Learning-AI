'use client';

import { ProgressDots } from '@/components/mac';
import { ModeBadge } from './mode-badge';
import { STEP_SEQUENCE } from '@/src/state/transition-table.js';
import type { AiModeName } from '@/src/state/transition-table.js';

interface InspectorHudProps {
  mode: AiModeName;
  confirmedStep: number;
  latencyMs: number | null;
  minutesRemaining: number | null;
}

/** Doc 06 §14 inspector HUD — dots, mode badge, latency pill, time remaining. */
export function InspectorHud({ mode, confirmedStep, latencyMs, minutesRemaining }: InspectorHudProps) {
  const stepName = STEP_SEQUENCE[Math.min(confirmedStep, STEP_SEQUENCE.length - 1)];
  return (
    <aside aria-label="Session inspector" className="material-hud flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <p className="text-caption-1 uppercase tracking-wide text-tertiary-label">Checkpoint</p>
        <ProgressDots confirmedStep={confirmedStep} />
        <p className="mt-1 text-callout text-secondary-label">
          {stepName} · {confirmedStep}/{STEP_SEQUENCE.length - 1}
        </p>
      </div>
      <div>
        <p className="text-caption-1 uppercase tracking-wide text-tertiary-label">Mode</p>
        <div className="mt-1">
          <ModeBadge mode={mode} />
        </div>
      </div>
      <div>
        <p className="text-caption-1 uppercase tracking-wide text-tertiary-label">Latency</p>
        {/* Latency pill fed by SSE timing (TTFB of last turn). */}
        <span
          role="status"
          aria-label={`First token in ${latencyMs ?? '—'} milliseconds`}
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-caption-1 tabular-nums ${
            latencyMs === null
              ? 'bg-gray5 text-secondary-label'
              : latencyMs < 1200
                ? 'bg-sys-green/20 text-sys-green'
                : latencyMs < 3000
                  ? 'bg-sys-orange/20 text-sys-orange'
                  : 'bg-sys-red/20 text-sys-red'
          }`}
        >
          {latencyMs === null ? '— ms' : `${latencyMs} ms`}
        </span>
      </div>
      {minutesRemaining !== null && (
        <div>
          <p className="text-caption-1 uppercase tracking-wide text-tertiary-label">Time remaining</p>
          <p aria-live="polite" className="mt-0.5 text-title-2 tabular-nums">
            {minutesRemaining >= 0 ? `${minutesRemaining} min` : 'Budget spent'}
          </p>
        </div>
      )}
    </aside>
  );
}
