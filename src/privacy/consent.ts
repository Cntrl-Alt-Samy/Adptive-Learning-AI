/**
 * S5-T2 — Parental consent token flow (Doc 04 §7.1 / Doc 07 TASK 4.2).
 *
 * Compact Ed25519-signed envelope:
 *   base64url(headerJson) . base64url(payloadJson) . base64url(signature)
 *
 * Lifecycle: issue → verify → persist `parental_consent_verified` on the
 * learner row. Verification unlocks raw transcript access ONLY through the
 * precedence resolver ALLOW_RAW branch (S5-T3) — never by itself.
 *
 * Rejection paths are DISTINCT typed reasons so callers can log and react
 * differently:
 *   MALFORMED    — structure/JSON/version/field violations
 *   TAMPERED     — well-formed envelope whose bytes fail every known key
 *   WRONG_KEY    — fails under the presented key but validates under another
 *                  key in the trusted ring (misrouted issuer)
 *   EXPIRED      — exp <= now
 *   NOT_YET_VALID— iat > now (+60s clock skew)
 *   REPLAYED     — jti already consumed via the injected judge
 *
 * Replay detection is pluggable (ReplayJudge); the default no-op judge suits
 * contexts where replay is handled at rest (consent_events.jti UNIQUE).
 */

import {
  createPublicKey,
  createPrivateKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject
} from 'node:crypto';

const TOKEN_VERSION = 'LC1'; // LearnOS Consent v1
export const DEFAULT_CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
const MAX_CLOCK_SKEW_MS = 60_000;
const ED25519_SIG_BYTES = 64;

export interface ConsentPayload {
  /** Learner (minor) user id the consent covers. */
  sub: string;
  /** Guardian identifier reference (opaque; never PII). */
  guardianRef: string;
  /** Issued-at epoch ms. */
  iat: number;
  /** Expiry epoch ms. */
  exp: number;
  /** Unique token id for replay tracking. */
  jti: string;
}

export interface ConsentKeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

export type ConsentRejectionReason =
  | 'MALFORMED'
  | 'TAMPERED'
  | 'WRONG_KEY'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'REPLAYED';

export type VerifyResult =
  | { ok: true; payload: ConsentPayload }
  | { ok: false; reason: ConsentRejectionReason };

/** Replay judge contract — returns true when `jti` was already consumed. */
export interface ReplayJudge {
  seenAndConsume(jti: string): boolean;
}

/** In-memory judge (unit tests / single-process). Not shared-state safe. */
export class InMemoryReplayJudge implements ReplayJudge {
  private readonly seen = new Set<string>();

  seenAndConsume(jti: string): boolean {
    if (this.seen.has(jti)) return true;
    this.seen.add(jti);
    return false;
  }
}

/** No-op judge for contexts handling replay at rest (consent_events uq). */
export class AllowAllReplayJudge implements ReplayJudge {
  seenAndConsume(): boolean {
    return false;
  }
}

export function generateConsentKeyPair(): ConsentKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKey, privateKey };
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export interface IssueOptions {
  issuedAt?: number;
  ttlMs?: number;
  jti?: string;
}

/**
 * Issue a signed consent token. `crypto.randomUUID` supplies the default
 * jti; tests inject deterministic ids.
 */
export function issueConsentToken(
  payload: Pick<ConsentPayload, 'sub' | 'guardianRef'>,
  privateKey: KeyObject,
  options: IssueOptions = {}
): string {
  const iat = options.issuedAt ?? Date.now();
  const exp = iat + (options.ttlMs ?? DEFAULT_CONSENT_TTL_MS);
  const full: ConsentPayload = {
    sub: payload.sub,
    guardianRef: payload.guardianRef,
    iat,
    exp,
    jti: options.jti ?? crypto.randomUUID()
  };
  const head = b64url(Buffer.from(JSON.stringify({ v: TOKEN_VERSION, alg: 'EdDSA' }), 'utf8'));
  const body = b64url(Buffer.from(JSON.stringify(full), 'utf8'));
  const sig = cryptoSign(null, Buffer.from(`${head}.${body}`, 'utf8'), privateKey);
  return `${head}.${body}.${b64url(sig)}`;
}

interface DecodedToken {
  head: string;
  body: string;
  sig: Buffer;
  payload: ConsentPayload;
}

function decode(token: string): DecodedToken | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as {
      v?: string;
      alg?: string;
    };
    if (header?.v !== TOKEN_VERSION || header?.alg !== 'EdDSA') return null;
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf8')
    ) as Partial<ConsentPayload>;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.guardianRef !== 'string' ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp) ||
      typeof payload.jti !== 'string' ||
      payload.jti.length === 0
    ) {
      return null;
    }
    return {
      head: parts[0]!,
      body: parts[1]!,
      sig: Buffer.from(parts[2]!, 'base64url'),
      payload: { sub: payload.sub, guardianRef: payload.guardianRef, iat: payload.iat!, exp: payload.exp!, jti: payload.jti }
    };
  } catch {
    return null;
  }
}

function isUsablePublicKey(key: KeyObject): boolean {
  try {
    return key.asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}

/** Export helpers for storage/transport of the keypair. */
export function exportKeyPem(key: KeyObject): string {
  return key.export({ type: key.type === 'private' ? 'pkcs8' : 'spki', format: 'pem' }).toString();
}

export function importPublicKeyPem(pem: string): KeyObject {
  return createPublicKey(pem);
}

export function importPrivateKeyPem(pem: string): KeyObject {
  return createPrivateKey(pem);
}

export interface VerifyOptions {
  judge?: ReplayJudge;
  now?: number;
  /**
   * Additional keys whose issuers are trusted by this deployment. Enables
   * precise WRONG_KEY attribution: failure under the presented key that
   * validates under a ring member is a misrouted-issuer condition rather
   * than byte tampering.
   */
  trustedKeys?: readonly KeyObject[];
}

/**
 * Verify with the full rejection taxonomy. Temporal checks run only after
 * cryptographic integrity passes; replay consumption happens LAST so expired
 * tokens do not burn jti slots.
 */
export function verifyConsentToken(
  token: string,
  presentedKey: KeyObject,
  options: VerifyOptions = {}
): VerifyResult {
  const decoded = decode(token);
  if (!decoded) return { ok: false, reason: 'MALFORMED' };
  if (!isUsablePublicKey(presentedKey)) return { ok: false, reason: 'WRONG_KEY' };

  // Truncated/corrupt signature blobs are tampering, not key confusion.
  if (decoded.sig.length !== ED25519_SIG_BYTES) return { ok: false, reason: 'TAMPERED' };

  const message = Buffer.from(`${decoded.head}.${decoded.body}`, 'utf8');
  let valid = false;
  try {
    valid = cryptoVerify(null, message, presentedKey, decoded.sig);
  } catch {
    return { ok: false, reason: 'TAMPERED' };
  }

  if (!valid) {
    const ring = options.trustedKeys ?? [];
    const validatedByRing = ring.some((k) => {
      try {
        return isUsablePublicKey(k) && cryptoVerify(null, message, k, decoded.sig);
      } catch {
        return false;
      }
    });
    return { ok: false, reason: validatedByRing ? 'WRONG_KEY' : 'TAMPERED' };
  }

  const now = options.now ?? Date.now();
  if (decoded.payload.exp <= now) return { ok: false, reason: 'EXPIRED' };
  if (decoded.payload.iat > now + MAX_CLOCK_SKEW_MS) return { ok: false, reason: 'NOT_YET_VALID' };

  const judge = options.judge ?? new AllowAllReplayJudge();
  if (judge.seenAndConsume(decoded.payload.jti)) return { ok: false, reason: 'REPLAYED' };

  return { ok: true, payload: decoded.payload };
}
