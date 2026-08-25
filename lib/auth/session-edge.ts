import type { Role } from './session';

/**
 * Edge twin of lib/auth/session.ts — Web Crypto instead of node:crypto so
 * `middleware.ts` can verify the signed session cookie. Same HMAC-SHA256
 * scheme, same fail-closed parsing.
 */

export const SESSION_COOKIE = 'learnos_session';

export interface EdgeSession {
  userId: string;
  tenantId: string;
  role: Role;
  displayName: string;
  expiresAt: number;
}

const ROLES: ReadonlySet<string> = new Set(['LEARNER', 'INSTRUCTOR', 'ADMIN']);

function secretBytes(): Uint8Array {
  const s = process.env.LEARNOS_SESSION_SECRET ?? 'learnos-dev-secret-do-not-use-in-prod';
  return new TextEncoder().encode(s);
}

function b64urlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', secretBytes() as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
}

function constTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifySignedSessionEdge(token: string | undefined | null): Promise<EdgeSession | null> {
  if (typeof token !== 'string' || token.length === 0) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  let expected: Uint8Array;
  try {
    expected = await hmac(body);
  } catch {
    return null;
  }
  let actual: Uint8Array;
  try {
    actual = b64urlToBytes(mac);
  } catch {
    return null;
  }
  if (!constTimeEqual(actual, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
  } catch {
    return null;
  }
  const s = parsed as Partial<EdgeSession>;
  if (
    typeof s.userId !== 'string' || s.userId.length === 0 ||
    typeof s.tenantId !== 'string' || s.tenantId.length === 0 ||
    typeof s.role !== 'string' || !ROLES.has(s.role) ||
    typeof s.expiresAt !== 'number' || s.expiresAt < Date.now()
  ) {
    return null;
  }
  return {
    userId: s.userId,
    tenantId: s.tenantId,
    role: s.role as Role,
    displayName: typeof s.displayName === 'string' ? s.displayName : 'Learner',
    expiresAt: s.expiresAt
  };
}
