/**
 * S0-T3 — Tenant precedence resolver (pure module, no I/O).
 *
 * Encodes the Tenant Enclave Precedence Matrix (Doc 04 §7, B-03):
 *   Tier B (COPPA minor sandbox) > Tier A (consumer adult) > Tier C (educator scoping).
 *
 * Contract:
 *   - Learners may always read their own transcripts; never another user's.
 *   - INSTRUCTOR/ADMIN within the same tenant get raw access to adult
 *     transcripts and to minors WITH verified parental consent.
 *   - Minors without verified consent are visible to educators only as
 *     aggregate/anonymised data (ALLOW_AGGREGATE_ONLY).
 *   - Cross-tenant access is DENY for every role.
 *   - Unknown roles/tiers FAIL CLOSED (DENY).
 */

export type Role = 'LEARNER' | 'INSTRUCTOR' | 'ADMIN';

export type AccessDecision =
  | 'ALLOW_RAW'
  | 'ALLOW_AGGREGATE_ONLY'
  | 'DENY';

export interface Requester {
  userId: string;
  tenantId: string;
  role: Role | string | undefined | null;
}

export interface TargetUser {
  userId: string;
  tenantId: string;
  isMinor: boolean;
  parentalConsentVerified: boolean;
}

const KNOWN_ROLES: ReadonlySet<string> = new Set(['LEARNER', 'INSTRUCTOR', 'ADMIN']);

export function resolveAccess(requester: Requester, targetUser: TargetUser): AccessDecision {
  // Fail closed on unknown/absent roles or malformed identities.
  if (
    typeof requester?.role !== 'string' ||
    !KNOWN_ROLES.has(requester.role) ||
    typeof requester.userId !== 'string' ||
    requester.userId.length === 0 ||
    typeof requester.tenantId !== 'string' ||
    requester.tenantId.length === 0 ||
    typeof targetUser?.userId !== 'string' ||
    targetUser.userId.length === 0 ||
    typeof targetUser.tenantId !== 'string' ||
    targetUser.tenantId.length === 0
  ) {
    return 'DENY';
  }

  // Self-access always wins (learner reviewing own session transcripts).
  if (requester.userId === targetUser.userId) return 'ALLOW_RAW';

  // Tenant enclave boundary — cross-tenant is never permitted.
  if (requester.tenantId !== targetUser.tenantId) return 'DENY';

  // Learners can only ever see their own rows.
  if (requester.role === 'LEARNER') return 'DENY';

  // Remaining validated roles are INSTRUCTOR/ADMIN: privileged cohort view.
  // Tier B override: minor transcripts locked unless parental consent verified.
  return targetUser.isMinor && !targetUser.parentalConsentVerified
    ? 'ALLOW_AGGREGATE_ONLY'
    : 'ALLOW_RAW';
}
