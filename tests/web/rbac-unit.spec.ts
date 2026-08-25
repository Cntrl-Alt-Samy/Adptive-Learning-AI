import { describe, expect, it } from 'vitest';

import { mintDemoSession, signSession, verifySignedSession } from '@/lib/auth/session';
import { resolveAccess } from '@/src/access/precedence.js';

/**
 * S8B-T1 — RBAC unit gate: signed-session roundtrip, tamper rejection,
 * expiry, and the tenant precedence matrix mapping.
 */

const OLD_SECRET = process.env.LEARNOS_SESSION_SECRET;

describe('signed session cookie', () => {
  it('roundtrips a minted demo session', async () => {
    const session = mintDemoSession('INSTRUCTOR', 'Sam');
    const token = await signSession(session);
    const verified = await verifySignedSession(token);
    expect(verified).not.toBeNull();
    expect(verified?.role).toBe('INSTRUCTOR');
    expect(verified?.userId).toBe(session.userId);
    expect(verified?.tenantId).toBe('demo');
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession(mintDemoSession('LEARNER', 'L'));
    const dot = token.lastIndexOf('.');
    const body = JSON.parse(Buffer.from(token.slice(0, dot), 'base64url').toString('utf8')) as { role: string };
    body.role = 'ADMIN';
    const forged = `${Buffer.from(JSON.stringify(body)).toString('base64url')}.${token.slice(dot + 1)}`;
    expect(await verifySignedSession(forged)).toBeNull();
  });

  it('rejects an expired session and garbage input', async () => {
    const session = { ...mintDemoSession('LEARNER', 'L'), expiresAt: Date.now() - 1000 };
    const token = await signSession(session);
    expect(await verifySignedSession(token)).toBeNull();
    expect(await verifySignedSession(null)).toBeNull();
    expect(await verifySignedSession('not-a-token')).toBeNull();
  });
});

describe('resolveAccess precedence matrix', () => {
  const learner = { userId: 'u1', tenantId: 't1', role: 'LEARNER' };
  const instructor = { userId: 'u2', tenantId: 't1', role: 'INSTRUCTOR' };

  it('self-access always wins', () => {
    expect(resolveAccess(learner, { userId: 'u1', tenantId: 't1', isMinor: true, parentalConsentVerified: false })).toBe('ALLOW_RAW');
  });

  it('cross-tenant fails closed even for admins', () => {
    const admin = { userId: 'u3', tenantId: 't2', role: 'ADMIN' };
    expect(resolveAccess(admin, { userId: 'u1', tenantId: 't1', isMinor: false, parentalConsentVerified: true })).toBe('DENY');
  });

  it('learners never see other learners; educators see adults raw and locked minors as aggregates', () => {
    const adult = { userId: 'u9', tenantId: 't1', isMinor: false, parentalConsentVerified: false };
    const lockedMinor = { userId: 'u8', tenantId: 't1', isMinor: true, parentalConsentVerified: false };
    const consentedMinor = { userId: 'u7', tenantId: 't1', isMinor: true, parentalConsentVerified: true };
    expect(resolveAccess({ ...learner, userId: 'other' }, adult)).toBe('DENY');
    expect(resolveAccess(instructor, adult)).toBe('ALLOW_RAW');
    expect(resolveAccess(instructor, lockedMinor)).toBe('ALLOW_AGGREGATE_ONLY');
    expect(resolveAccess(instructor, consentedMinor)).toBe('ALLOW_RAW');
  });

  it('unknown roles fail closed', () => {
    expect(resolveAccess({ userId: 'x', tenantId: 't1', role: 'SUPERUSER' }, { userId: 'u9', tenantId: 't1', isMinor: false, parentalConsentVerified: true })).toBe('DENY');
  });
});

if (OLD_SECRET === undefined) delete process.env.LEARNOS_SESSION_SECRET;
else process.env.LEARNOS_SESSION_SECRET = OLD_SECRET;
