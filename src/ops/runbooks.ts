/**
 * S7-T6 — Launch operations runbook library (Doc 04 §15; Sprint-07 T6).
 *
 * Runbooks are code-checked data: the coverage spec fails launch readiness
 * when an incident class has no runbook, and every entry must carry
 * triggers, ordered steps with owners, and a rollback/escape reference.
 * The on-call UI renders straight from this registry — no stale wiki.
 */

export type RunbookCode =
  | 'BREAKER_OPEN_STUCK'
  | 'QUEUE_DRAIN_STALLED'
  | 'FLAG_TOGGLE'
  | 'ROLLBACK_DEPLOY'
  | 'DECAY_LAG_BREACH'
  | 'POOL_EXHAUSTION'
  | 'TTFT_P95_BREACH'
  | 'STREAM_ERROR_RATE_BREACH';

export interface RunbookStep {
  /** Who executes: 'on-call' | 'secondary' | 'lead'. */
  owner: 'on-call' | 'secondary' | 'lead';
  action: string;
}

export interface Runbook {
  code: RunbookCode;
  title: string;
  triggers: string[];
  steps: RunbookStep[];
  /** Escape hatch / rollback reference (runbook code or doc pointer). */
  rollback: string;
}

export const RUNBOOKS: Record<RunbookCode, Runbook> = {
  BREAKER_OPEN_STUCK: {
    code: 'BREAKER_OPEN_STUCK',
    title: 'Circuit breaker stuck OPEN',
    triggers: ['breaker OPEN > cooldown ×3', 'HALF_OPEN flapping in dashboards'],
    steps: [
      { owner: 'on-call', action: 'Confirm provider status page; capture breaker event log.' },
      { owner: 'on-call', action: 'Force HALF_OPEN probe via feature flag `breaker_force_probe`.' },
      { owner: 'secondary', action: 'If provider degraded, shift traffic with router tier override flag.' }
    ],
    rollback: 'FLAG_TOGGLE'
  },
  QUEUE_DRAIN_STALLED: {
    code: 'QUEUE_DRAIN_STALLED',
    title: 'BullMQ decay queue stalled',
    triggers: ['decay chunk lag alert', 'queue depth rising 3 consecutive samples'],
    steps: [
      { owner: 'on-call', action: 'Check worker pod logs for repeated chunk rollback (kill-safety replay).' },
      { owner: 'on-call', action: 'Restart worker deployment; cursor keyset resumes at last committed chunk.' },
      { owner: 'secondary', action: 'Verify pg_stat_activity shows no blocking locks from drain.' }
    ],
    rollback: 'ROLLBACK_DEPLOY'
  },
  FLAG_TOGGLE: {
    code: 'FLAG_TOGGLE',
    title: 'Emergency feature-flag toggle',
    triggers: ['engine misbehaving behind flag', 'cost/latency drift beyond budget'],
    steps: [
      { owner: 'on-call', action: 'Flip target flag in config store; note ticket ID in change log.' },
      { owner: 'on-call', action: 'Watch SLO panel for two evaluation windows.' }
    ],
    rollback: 'Re-flip flag; flags are instant and forward-only safe.'
  },
  ROLLBACK_DEPLOY: {
    code: 'ROLLBACK_DEPLOY',
    title: 'Blue-green rollback drill',
    triggers: ['smoke suite red post-cutover', 'Sev-1 attributable to release'],
    steps: [
      { owner: 'lead', action: 'Announce rollback in incident channel; freeze migrations immediately.' },
      { owner: 'on-call', action: 'Shift DNS/target-group weight back to blue env (instant, no schema reversal).' },
      { owner: 'secondary', action: 'Run smoke suite against blue to confirm restore.' }
    ],
    rollback: 'Forward-only migrations mean blue stays compatible; re-deploy green after fix.'
  },
  DECAY_LAG_BREACH: {
    code: 'DECAY_LAG_BREACH',
    title: 'Nightly decay chunk lag over budget',
    triggers: ['decay lag alert >900s'],
    steps: [
      { owner: 'on-call', action: 'Check QUEUE_DRAIN_STALLED symptoms first.' },
      { owner: 'on-call', action: 'Temporarily raise concurrency to 4 via `decay_concurrency` flag if CPU flat.' }
    ],
    rollback: 'FLAG_TOGGLE'
  },
  POOL_EXHAUSTION: {
    code: 'POOL_EXHAUSTION',
    title: 'Connection-pool exhaustion (Supavisor cap)',
    triggers: ['POOL_EXHAUSTED errors', 'pool guard maxObserved at cap'],
    steps: [
      { owner: 'on-call', action: 'Scale app containers by one (caps are per-container).' },
      { owner: 'secondary', action: 'Inspect slow queries; kill any long FOR UPDATE holder.' }
    ],
    rollback: 'Scale back after saturation clears.'
  },
  TTFT_P95_BREACH: {
    code: 'TTFT_P95_BREACH',
    title: 'First-token latency P95 over 1200ms',
    triggers: ['TTFT_P95_BREACH page'],
    steps: [
      { owner: 'on-call', action: 'Check RAG prefetch cache hit rate; cold prefetch doubles TTFT.' },
      { owner: 'on-call', action: 'Confirm provider regional latency; engage router tier override if Tier-1 is degraded.' }
    ],
    rollback: 'FLAG_TOGGLE'
  },
  STREAM_ERROR_RATE_BREACH: {
    code: 'STREAM_ERROR_RATE_BREACH',
    title: 'Stream error rate above 1%',
    triggers: ['stream error page'],
    steps: [
      { owner: 'on-call', action: 'Correlate with deploy timestamp; if fresh, run ROLLBACK_DEPLOY.' },
      { owner: 'on-call', action: 'Sample typed SSE error payloads for upstream cause codes.' }
    ],
    rollback: 'ROLLBACK_DEPLOY'
  }
};

/** Incident classes that must have a runbook before GA. */
export const REQUIRED_RUNBOOK_CODES: RunbookCode[] = [
  'BREAKER_OPEN_STUCK',
  'QUEUE_DRAIN_STALLED',
  'FLAG_TOGGLE',
  'ROLLBACK_DEPLOY',
  'DECAY_LAG_BREACH',
  'POOL_EXHAUSTION',
  'TTFT_P95_BREACH',
  'STREAM_ERROR_RATE_BREACH'
];

export function getRunbook(code: RunbookCode): Runbook {
  const rb = RUNBOOKS[code];
  if (!rb) throw new Error(`Missing runbook: ${code}`);
  return rb;
}
