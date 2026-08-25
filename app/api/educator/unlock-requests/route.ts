import { verifySignedSession } from '@/lib/auth/session';
import { addUnlockRequest } from '@/lib/server/educator-data';

/**
 * S8B-T6 — educator unlock requests. Middleware already 401s anonymous
 * callers; this route additionally enforces the INSTRUCTOR/ADMIN role
 * server-side (defense in depth per Sprint-08b risk table).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const cookie = req.headers.get('cookie') ?? '';
  const token = /(?:^|;\s*)learnos_session=([^;]+)/.exec(cookie)?.[1];
  const session = token === undefined ? null : verifySignedSession(decodeURIComponent(token));
  if (session === null) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'INSTRUCTOR' && session.role !== 'ADMIN') {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  let body: { conceptId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  if (typeof body.conceptId !== 'string' || body.conceptId.length === 0) {
    return Response.json({ error: 'CONCEPT_REQUIRED' }, { status: 400 });
  }

  const request = addUnlockRequest(body.conceptId, session.displayName);
  return Response.json({ request });
}
