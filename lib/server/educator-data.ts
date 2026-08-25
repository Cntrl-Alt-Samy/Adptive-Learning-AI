import {
  buildMisconceptionMatrix,
  buildRoster,
  resolveLockedConcepts,
  type AttemptRecord,
  type MisconceptionMatrix,
  type RosterRow,
  type TopicLock
} from '@/src/educator/aggregation.js';
import { TranscriptLockedError, resolveTranscriptAccess, requireRawTranscript } from '@/src/privacy/transcript-lock.js';
import type { AccessDecision } from '@/src/access/precedence.js';
import type { Requester } from '@/src/access/precedence.js';

import { DEMO_ATTEMPTS, DEMO_LEARNERS, DEMO_TENANT, type DemoLearner } from './demo-cohort';

/**
 * S8B-T6 — educator data service. All suppression (k≥5) and access gating
 * happen HERE, server-side; the client never receives raw sub-floor cells.
 */

export interface UnlockRequest {
  conceptId: string;
  requestedBy: string;
  requestedAt: string;
  status: 'PENDING' | 'GRANTED';
}

const topicLocks: TopicLock[] = [
  { tenantId: DEMO_TENANT, conceptId: 'eco_market_failure', reason: 'Held back until the mock exam window closes.' }
];

const unlockRequests: UnlockRequest[] = [];

export function getRoster(): RosterRow[] {
  return buildRoster(
    DEMO_LEARNERS.map((l) => ({ userId: l.userId, aliasSeed: l.aliasSeed, status: l.overallStatus }))
  );
}

export function getMisconceptionMatrix(): MisconceptionMatrix {
  // Suppression is enforced inside this builder — server-side only.
  return buildMisconceptionMatrix(DEMO_ATTEMPTS as readonly AttemptRecord[]);
}

export function getLocks(): { locked: string[]; requests: UnlockRequest[] } {
  return {
    locked: [...resolveLockedConcepts(topicLocks, DEMO_TENANT)],
    requests: [...unlockRequests]
  };
}

export function addUnlockRequest(conceptId: string, requestedBy: string): UnlockRequest {
  const existing = unlockRequests.find((r) => r.conceptId === conceptId && r.status === 'PENDING');
  if (existing !== undefined) return existing;
  const req: UnlockRequest = { conceptId, requestedBy, requestedAt: new Date().toISOString(), status: 'PENDING' };
  unlockRequests.push(req);
  return req;
}

// ---------------------------------------------------------------------------
// Raw transcript gate — typed lock, aggregates-only fallback
// ---------------------------------------------------------------------------

export interface TranscriptViewResult {
  targetId: string;
  decision: AccessDecision;
  raw?: { turns: Array<{ role: 'user' | 'assistant'; excerpt: string }> };
  aggregatesOnly?: { rows: Array<{ conceptId: string; failedPct: number; learnerCount: number }> };
}

/** Fabricated raw rows for demo targets that pass the precedence gate. */
function fakeRawTurns(_learner: DemoLearner): Array<{ role: 'user' | 'assistant'; excerpt: string }> {
  return [
    { role: 'user', excerpt: 'Can you explain opportunity cost again?' },
    { role: 'assistant', excerpt: 'Of course — think of it as the value of the next-best thing you gave up.' },
    { role: 'user', excerpt: 'Got it. So if I choose cinema over revision, revision is my opportunity cost?' },
    { role: 'assistant', excerpt: 'Exactly — that is the framing.' }
  ];
}

/**
 * Resolve a transcript view for one target under the S5 gate. Raw fetches
 * under a non-ALLOW_RAW decision raise TranscriptLockedError internally and
 * degrade to the aggregates-only payload here.
 */
export function requestTranscript(requester: Requester, targetId: string): TranscriptViewResult {
  const target = DEMO_LEARNERS.find((l) => l.userId === targetId);
  if (target === undefined) {
    // Unknown target → DENY path of the same gate.
    throw new TranscriptLockedError('DENY');
  }
  const grant = resolveTranscriptAccess({ requester, target });
  if (grant.raw !== undefined) {
    try {
      requireRawTranscript({ requester, target });
      return { targetId, decision: grant.decision, raw: { turns: fakeRawTurns(target) } };
    } catch {
      /* unreachable when grant.raw exists — kept for symmetry with the engine contract */
    }
  }
  const matrix = getMisconceptionMatrix();
  return {
    targetId,
    decision: grant.decision,
    aggregatesOnly: {
      rows: matrix.cells.map((c) => ({ conceptId: c.conceptId, failedPct: c.failedPct, learnerCount: c.learnerCount }))
    }
  };
}
