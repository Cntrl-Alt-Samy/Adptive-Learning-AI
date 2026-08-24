/**
 * S5-T3 — Transcript lock enforcement (B-03 defense in depth).
 *
 * Educator console queries MUST pass through this gate BEFORE any DB call:
 *   1. precedence resolver decides ALLOW_RAW / ALLOW_AGGREGATE_ONLY / DENY
 *   2. raw fetches under a non-raw decision raise typed TranscriptLockedError
 *      (code `TRANSCRIPT_LOCKED`) instead of silently returning rows
 *   3. aggregates-only callers receive the k-anonymised API shape produced by
 *      the educator aggregation service (src/educator/aggregation.ts)
 *
 * The RLS policy on session_turns is the independent second layer; both are
 * asserted separately in tests/integration/lock.enforcement.spec.ts.
 */

import { resolveAccess, type AccessDecision, type Requester, type TargetUser } from '../access/precedence.js';

/** Typed error surfaced to the educator console API layer. */
export class TranscriptLockedError extends Error {
  readonly code = 'TRANSCRIPT_LOCKED' as const;
  /** The underlying precedence decision that caused the lock. */
  readonly decision: Exclude<AccessDecision, 'ALLOW_RAW'>;

  constructor(decision: Exclude<AccessDecision, 'ALLOW_RAW'>) {
    super(
      decision === 'DENY'
        ? 'Cross-tenant or unauthorized transcript access denied'
        : 'Raw transcript locked: minor without verified parental consent (aggregates only)'
    );
    this.name = 'TranscriptLockedError';
    this.decision = decision;
  }
}

export interface LearnerProfileSnapshot extends TargetUser {
  displayAlias: string;
}

export interface RawTranscriptRequest {
  requester: Requester;
  target: TargetUser;
}

export interface TranscriptAccessGrant {
  decision: AccessDecision;
  /** Present only when raw rows may be fetched. */
  raw?: { allowed: true };
}

/**
 * Resolve access WITHOUT side effects. Returns the grant for allowed paths.
 */
export function resolveTranscriptAccess(request: RawTranscriptRequest): TranscriptAccessGrant {
  const decision = resolveAccess(request.requester, request.target);
  if (decision === 'ALLOW_RAW') return { decision, raw: { allowed: true } };
  return { decision };
}

/**
 * Guard a RAW transcript fetch. Throws TranscriptLockedError unless the
 * precedence resolver returned ALLOW_RAW. This is the app-layer half of the
 * defense-in-depth pair; the session_turns RLS policy is the other half and
 * must never be relied upon alone.
 */
export function requireRawTranscript(request: RawTranscriptRequest): void {
  const decision = resolveAccess(request.requester, request.target);
  if (decision !== 'ALLOW_RAW') throw new TranscriptLockedError(decision);
}

/**
 * Aggregates-only API shape for locked cohorts. Never carries row-level data:
 * conceptId + failedPct + learnerCount with the k-anonymity floor applied by
 * the aggregation service before rows reach here.
 */
export interface AggregateCohortRow {
  conceptId: string;
  failedPct: number;
  learnerCount: number;
}

export function buildAggregatesOnlyPayload(rows: AggregateCohortRow[]): {
  mode: 'AGGREGATES_ONLY';
  rows: AggregateCohortRow[];
} {
  return { mode: 'AGGREGATES_ONLY', rows };
}
