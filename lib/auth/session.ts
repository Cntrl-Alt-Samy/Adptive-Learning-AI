import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Requester } from '@/src/access/precedence.js';

/**
 * S8B-T1 — app session (server side, Node runtime).
 *
 * Signed-cookie identity: HMAC-SHA256 over a compact JSON payload. Clerk
 * mounts later behind the same AppSession shape (`clerkId` slot mirrors
 * schema `users.clerk_id`); until keys exist, /signin mints demo-tenant
 * sessions with an explicit role — the flag-off fallback this sprint's risk
 * table requires. Middleware enforces the same contract on the edge.
 */

export const SESSION_COOKIE = 'learnos_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Role = 'LEARNER' | 'INSTRUCTOR' | 'ADMIN';

export interface AppSession {
  userId: string;
  tenantId: string;
  role: Role;
  displayName: string;
  clerkId?: string;
  issuedAt: number;
  expiresAt: number;
}

const ROLES: ReadonlySet<string> = new Set<Role>(['LEARNER', 'INSTRUCTOR', 'ADMIN']);

function secret(): string {
  return process.env.LEARNOS_SESSION_SECRET ?? 'learnos-dev-secret-do-not-use-in-prod';
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signSession(session: AppSession): string {
  const body = b64url(JSON.stringify(session));
  const mac = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifySignedSession(token: string | undefined | null): AppSession | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(body).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(mac, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const s = parsed as Partial<AppSession>;
  if (
    typeof s.userId !== 'string' || s.userId.length === 0 ||
    typeof s.tenantId !== 'string' || s.tenantId.length === 0 ||
    typeof s.role !== 'string' || !ROLES.has(s.role) ||
    typeof s.displayName !== 'string' ||
    typeof s.issuedAt !== 'number' ||
    typeof s.expiresAt !== 'number' || s.expiresAt < Date.now()
  ) {
    return null;
  }
  return { ...s, role: s.role as Role } as AppSession;
}

export function mintDemoSession(role: Role, displayName: string): AppSession {
  const now = Date.now();
  const slug = displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || role.toLowerCase();
  return {
    userId: `demo:${slug}`,
    tenantId: 'demo',
    role,
    displayName: displayName.trim() === '' ? role : displayName.trim(),
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS
  };
}

/** Adapter view for the pure precedence engine. */
export function toRequester(s: AppSession): Requester {
  return { userId: s.userId, tenantId: s.tenantId, role: s.role };
}
