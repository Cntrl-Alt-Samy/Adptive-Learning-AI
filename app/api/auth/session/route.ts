import { NextResponse } from 'next/server';

import { SESSION_COOKIE, mintDemoSession, signSession, verifySignedSession } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/session';

/**
 * S8B-T1 — session mint/inspect/clear. The role picker here is the
 * flag-off cookie fallback; when Clerk keys land, this handler delegates to
 * the Clerk verification path and keeps the same AppSession cookie shape.
 */

const ROLES: ReadonlySet<string> = new Set(['LEARNER', 'INSTRUCTOR', 'ADMIN']);

export async function GET(): Promise<Response> {
  // Read cookie through the Web-standard API available in Route Handlers.
  const store = await import('next/headers').then((m) => m.cookies());
  const session = verifySignedSession(store.get(SESSION_COOKIE)?.value);
  if (session === null) return Response.json({ authenticated: false });
  return Response.json({
    authenticated: true,
    userId: session.userId,
    role: session.role,
    displayName: session.displayName,
    tenantId: session.tenantId
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: { role?: unknown; displayName?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const role = body.role;
  const displayName = typeof body.displayName === 'string' ? body.displayName : '';
  if (typeof role !== 'string' || !ROLES.has(role)) {
    return Response.json({ error: 'ROLE_REQUIRED' }, { status: 400 });
  }
  const session = mintDemoSession(role as Role, displayName);
  const res = NextResponse.json({ ok: true, role: session.role, userId: session.userId });
  res.cookies.set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60
  });
  return res;
}

export async function DELETE(): Promise<Response> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
