'use client';

import type { AiModeName } from '@/src/state/transition-table.js';

/** §4.1 mode badge colors — Socratic purple, Assessor teal, Diagnostician indigo. */
export const MODE_BADGE_COLOR: Record<AiModeName, string> = {
  PROFILER: 'var(--sys-mint)',
  DIAGNOSTICIAN: 'var(--sys-indigo)',
  TUTOR: 'var(--sys-blue)',
  SOCRATIC_COACH: 'var(--sys-purple)',
  ASSESSOR: 'var(--sys-teal)',
  SESSION_REVIEWER: 'var(--sys-yellow)'
};

export function ModeBadge({ mode }: { mode: AiModeName }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-caption-1 font-semibold text-white"
      style={{ backgroundColor: MODE_BADGE_COLOR[mode] }}
    >
      {mode.replace('_', ' ')}
    </span>
  );
}
