import { getCertificate, issueCertificate, listCertificates, verifyCode } from '@/lib/server/certificates';
import { verifySignedSession, type AppSession } from '@/lib/auth/session';

/**
 * S8B-T4 — certificate issue + public verify. Identity comes from the
 * signed session cookie (server-derived), never from client input.
 */

function sessionFromCookie(cookieHeader: string | null): AppSession | null {
  const token = /(?:^|;\s*)learnos_session=([^;]+)/.exec(cookieHeader ?? '')?.[1];
  return token === undefined ? null : verifySignedSession(decodeURIComponent(token));
}

export async function POST(req: Request): Promise<Response> {
  const session = sessionFromCookie(req.headers.get('cookie'));
  if (session === null) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let body: { subjectId?: unknown; subjectTitle?: unknown; learnerName?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  if (typeof body.subjectId !== 'string' || typeof body.subjectTitle !== 'string') {
    return Response.json({ error: 'SUBJECT_REQUIRED' }, { status: 400 });
  }

  const result = issueCertificate(
    session.userId,
    body.subjectId,
    body.subjectTitle,
    typeof body.learnerName === 'string' && body.learnerName.trim().length > 0 ? body.learnerName.trim() : session.displayName
  );
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ certificate: result.certificate });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Public verifier — no auth required by design (T4 acceptance).
  const codeParam = url.searchParams.get('code');
  if (codeParam !== null && codeParam.length > 0) {
    const cert = getCertificate(codeParam);
    if (cert !== null) {
      return Response.json({
        ok: true,
        matchedCode: cert.verificationCode,
        subjectTitle: cert.subjectTitle,
        issuedOn: cert.issuedOn
      });
    }
    return Response.json(verifyCode(codeParam));
  }

  // No code → list the caller's own certificates.
  const session = sessionFromCookie(req.headers.get('cookie'));
  if (session === null) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  return Response.json({
    certificates: listCertificates(session.userId).map((c) => ({
      verificationCode: c.verificationCode,
      subjectId: c.subjectId,
      subjectTitle: c.subjectTitle,
      issuedOn: c.issuedOn,
      learnerName: c.learnerName
    }))
  });
}
