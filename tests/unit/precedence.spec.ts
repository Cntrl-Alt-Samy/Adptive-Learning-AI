import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolveAccess, type Requester, type TargetUser } from '../../src/access/precedence.js';

const ROLES = ['LEARNER', 'INSTRUCTOR', 'ADMIN'] as const;

function requester(role: string, tenantId: string, userId: string): Requester {
  return { role, tenantId, userId };
}

function target(tenantId: string, userId: string, isMinor: boolean, consent: boolean): TargetUser {
  return { tenantId, userId, isMinor, parentalConsentVerified: consent };
}

describe('S0-T3 precedence resolver — exhaustive tier matrix', () => {
  const T1 = 'tenant-1';
  const T2 = 'tenant-2';

  it('self access is always ALLOW_RAW for every role × profile', () => {
    for (const role of ROLES) {
      for (const minor of [false, true]) {
        for (const consent of [false, true]) {
          const u = target(T1, 'u1', minor, consent);
          expect(resolveAccess(requester(role, T1, 'u1'), u)).toBe('ALLOW_RAW');
        }
      }
    }
  });

  it('learners can never view another user in the same tenant', () => {
    for (const minor of [false, true]) {
      for (const consent of [false, true]) {
        expect(resolveAccess(requester('LEARNER', T1, 'u1'), target(T1, 'u2', minor, consent))).toBe('DENY');
      }
    }
  });

  it('educator/admin see adult cohort raw; minors only with verified consent (B-03)', () => {
    for (const role of ['INSTRUCTOR', 'ADMIN'] as const) {
      expect(resolveAccess(requester(role, T1, 'u1'), target(T1, 'u2', false, false))).toBe('ALLOW_RAW');
      expect(resolveAccess(requester(role, T1, 'u1'), target(T1, 'u2', true, true))).toBe('ALLOW_RAW');
      // Tier B strict override: locked without consent → aggregates only
      expect(resolveAccess(requester(role, T1, 'u1'), target(T1, 'u2', true, false))).toBe('ALLOW_AGGREGATE_ONLY');
    }
  });

  it('cross-tenant access is DENY for every role × profile combination', () => {
    for (const role of ROLES) {
      expect(resolveAccess(requester(role, T1, 'u1'), target(T2, 'u2', false, false))).toBe('DENY');
      expect(resolveAccess(requester(role, T1, 'u1'), target(T2, 'u2', true, true))).toBe('DENY');
    }
  });

  it('fails closed on unknown tiers/roles and malformed identities', () => {
    const adult = target(T1, 'u2', false, false);
    expect(resolveAccess(requester('SUPERUSER', T1, 'u1'), adult)).toBe('DENY');
    expect(resolveAccess(requester('', T1, 'u1'), adult)).toBe('DENY');
    expect(resolveAccess({ ...requester('ADMIN', T1, ''), }, adult)).toBe('DENY');
    expect(resolveAccess(requester('ADMIN', '', 'u1'), adult)).toBe('DENY');
    expect(resolveAccess(requester('ADMIN', T1, 'u1'), { ...adult, userId: '' })).toBe('DENY');
    expect(resolveAccess(undefined as unknown as Requester, adult)).toBe('DENY');
  });
});

describe('S0-T3 property-based invariants', () => {
  const roleArb = fc.constantFrom(...ROLES);
  const tenantArb = fc.constantFrom('tA', 'tB');
  const idArb = fc.stringMatching(/^u[0-9]{2}$/);

  it('monotonicity: consent never reduces access', () => {
    fc.assert(
      fc.property(
        roleArb, tenantArb, idArb, idArb,
        fc.boolean(), fc.boolean(),
        (role, tenant, rid, tid, sameTenantBool, minor) => {
          const targetTenant = sameTenantBool ? tenant : 'other-tenant';
          const req = requester(role, tenant, rid);
          const tgtNoConsent = target(targetTenant, tid, minor, false);
          const tgtConsent = { ...tgtNoConsent, parentalConsentVerified: true };
          const rank = (d: string) => (d === 'ALLOW_RAW' ? 2 : d === 'ALLOW_AGGREGATE_ONLY' ? 1 : 0);
          return rank(resolveAccess(req, tgtConsent)) >= rank(resolveAccess(req, tgtNoConsent));
        }
      ),
      { numRuns: 500 }
    );
  });

  it('cross-tenant is always DENY regardless of everything else', () => {
    fc.assert(
      fc.property(
        roleArb, idArb, idArb, fc.boolean(), fc.boolean(),
        (role, rid, tid, minor, consent) => {
          fc.pre(rid !== tid); // self-access legitimately wins over tenant boundary
          const decision = resolveAccess(
            requester(role, 'tenant-A', rid),
            target('tenant-B', tid, minor, consent)
          );
          return decision === 'DENY';
        }
      ),
      { numRuns: 300 }
    );
  });

  it('unknown roles always fail closed', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !['LEARNER', 'INSTRUCTOR', 'ADMIN'].includes(s)),
        idArb, idArb, fc.boolean(), fc.boolean(),
        (badRole, rid, tid, minor, consent) => {
          return (
            resolveAccess(requester(badRole, 'tA', rid), target('tA', tid, minor, consent)) === 'DENY'
          );
        }
      ),
      { numRuns: 300 }
    );
  });
});
