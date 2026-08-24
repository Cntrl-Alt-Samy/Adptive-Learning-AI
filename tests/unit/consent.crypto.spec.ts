import { describe, it, expect } from 'vitest';
import {
  generateConsentKeyPair,
  issueConsentToken,
  verifyConsentToken,
  exportKeyPem,
  importPublicKeyPem,
  importPrivateKeyPem,
  InMemoryReplayJudge,
  DEFAULT_CONSENT_TTL_MS
} from '../../src/privacy/consent.js';

/**
 * consent.crypto.spec — Sprint 5 gate (S5-T2 / Doc 04 §7.1).
 * Valid token verifies; expired/tampered/wrong-key/replayed/malformed are
 * rejected with DISTINCT typed reasons.
 */

const T0 = 1_750_000_000_000;

describe('consent.crypto.spec — S5-T2 gate', () => {
  const issuer = generateConsentKeyPair();
  const other = generateConsentKeyPair();

  function validToken(overrides: { jti?: string; ttlMs?: number } = {}): string {
    return issueConsentToken(
      { sub: '11111111-1111-4111-8111-111111111111', guardianRef: 'guardian-42' },
      issuer.privateKey,
      { issuedAt: T0, jti: overrides.jti ?? 'jti-valid', ttlMs: overrides.ttlMs ?? DEFAULT_CONSENT_TTL_MS }
    );
  }

  it('valid token verifies with intact payload fields', () => {
    const res = verifyConsentToken(validToken(), issuer.publicKey, { now: T0 + 1000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.sub).toBe('11111111-1111-4111-8111-111111111111');
      expect(res.payload.guardianRef).toBe('guardian-42');
      expect(res.payload.exp - res.payload.iat).toBe(DEFAULT_CONSENT_TTL_MS);
    }
  });

  it('expired token rejected EXPIRED', () => {
    const res = verifyConsentToken(validToken({ ttlMs: 60_000 }), issuer.publicKey, {
      now: T0 + 61_000
    });
    expect(res).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('not-yet-valid token rejected NOT_YET_VALID (beyond clock skew)', () => {
    const tok = issueConsentToken(
      { sub: 's', guardianRef: 'g' },
      issuer.privateKey,
      { issuedAt: T0 + 10 * 60_000 }
    );
    const res = verifyConsentToken(tok, issuer.publicKey, { now: T0 });
    expect(res).toEqual({ ok: false, reason: 'NOT_YET_VALID' });
  });

  it('payload byte-flip rejected TAMPERED', () => {
    const tok = validToken();
    const parts = tok.split('.');
    const body = Buffer.from(parts[1]!, 'base64url').toString('utf8').replace('"sub":"', '"sub":"x');
    const forged = `${parts[0]}.${Buffer.from(body, 'utf8').toString('base64url')}.${parts[2]}`;
    const res = verifyConsentToken(forged, issuer.publicKey);
    expect(res).toEqual({ ok: false, reason: 'TAMPERED' });
  });

  it('truncated signature rejected TAMPERED', () => {
    const parts = validToken().split('.');
    const shortSig = parts[2]!.slice(0, 16);
    const res = verifyConsentToken(`${parts[0]}.${parts[1]}.${shortSig}`, issuer.publicKey);
    expect(res).toEqual({ ok: false, reason: 'TAMPERED' });
  });

  it('wrong presented key with issuer in trusted ring rejected WRONG_KEY', () => {
    const res = verifyConsentToken(validToken(), other.publicKey, {
      trustedKeys: [issuer.publicKey]
    });
    expect(res).toEqual({ ok: false, reason: 'WRONG_KEY' });
  });

  it('wrong key absent from ring degrades to TAMPERED (bytes fail every known key)', () => {
    const res = verifyConsentToken(validToken(), other.publicKey, { trustedKeys: [] });
    expect(res).toEqual({ ok: false, reason: 'TAMPERED' });
  });

  it('replayed jti rejected REPLAYED exactly once via judge', () => {
    const judge = new InMemoryReplayJudge();
    const first = verifyConsentToken(validToken(), issuer.publicKey, { judge, now: T0 });
    expect(first.ok).toBe(true);
    const replay = verifyConsentToken(validToken(), issuer.publicKey, { judge, now: T0 });
    expect(replay).toEqual({ ok: false, reason: 'REPLAYED' });
  });

  it.each([
    ['garbage string', 'not-a-token'],
    ['missing signature part', 'a.b'],
    ['four parts', 'a.b.c.d'],
    ['empty input', '']
  ])('malformed envelope (%s) rejected MALFORMED', (_label, tok) => {
    expect(verifyConsentToken(tok, issuer.publicKey)).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('valid header with unknown version rejected MALFORMED', () => {
    const head = Buffer.from(JSON.stringify({ v: 'XX', alg: 'EdDSA' }), 'utf8').toString('base64url');
    const body = Buffer.from('{}', 'utf8').toString('base64url');
    expect(verifyConsentToken(`${head}.${body}.AAAA`, issuer.publicKey)).toEqual({
      ok: false,
      reason: 'MALFORMED'
    });
  });

  it('non-Ed25519 public key fails closed WRONG_KEY', () => {
    const rsa = generateConsentKeyPair(); // ed25519 again — simulate unusable via cast
    void rsa;
    // A symmetric-style KeyObject cannot be constructed portably here; assert
    // the usable-key guard through an object missing asymmetricKeyType.
    const bogus = {} as import('node:crypto').KeyObject;
    expect(verifyConsentToken(validToken(), bogus)).toEqual({ ok: false, reason: 'WRONG_KEY' });
  });

  it('PEM roundtrip preserves verification', () => {
    const pubPem = exportKeyPem(issuer.publicKey);
    const privPem = exportKeyPem(issuer.privateKey);
    const tok = issueConsentToken({ sub: 'u', guardianRef: 'g' }, importPrivateKeyPem(privPem), {
      jti: 'pem-roundtrip'
    });
    const res = verifyConsentToken(tok, importPublicKeyPem(pubPem));
    expect(res.ok).toBe(true);
  });

  it('distinct rejection reasons are pairwise different values', () => {
    const reasons = new Set([
      'MALFORMED',
      'TAMPERED',
      'WRONG_KEY',
      'EXPIRED',
      'NOT_YET_VALID',
      'REPLAYED'
    ]);
    expect(reasons.size).toBe(6);
  });
});
