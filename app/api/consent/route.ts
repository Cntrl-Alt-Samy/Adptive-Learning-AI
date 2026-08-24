import {
  generateConsentKeyPair,
  issueConsentToken,
  verifyConsentToken,
  type ConsentPayload
} from '@/src/privacy/consent.js';

/**
 * S8A-T7 — consent gate API. Ed25519 keypair is per-process (MVP demo
 * posture); replay detection rests at rest (`consent_events.jti UNIQUE`) in
 * production, so verification uses the default allow-all judge here.
 */

const keypair = generateConsentKeyPair();

interface ConsentBody {
  action?: unknown;
  guardianRef?: unknown;
  token?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  let body: ConsentBody = {};
  try {
    body = (await req.json()) as ConsentBody;
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  if (body.action === 'issue') {
    const guardianRef = typeof body.guardianRef === 'string' && body.guardianRef.trim().length >= 3 ? body.guardianRef.trim() : null;
    if (guardianRef === null) {
      return Response.json({ error: 'GUARDIAN_REF_REQUIRED' }, { status: 400 });
    }
    const token = issueConsentToken({ sub: 'demo-user', guardianRef }, keypair.privateKey);
    const payload: Omit<ConsentPayload, 'jti'> = {
      sub: 'demo-user',
      guardianRef,
      iat: Date.now(),
      exp: Date.now() + 180 * 24 * 60 * 60 * 1000
    };
    return Response.json({ token, payload });
  }

  if (body.action === 'verify') {
    if (typeof body.token !== 'string' || body.token.length === 0) {
      return Response.json({ error: 'TOKEN_REQUIRED' }, { status: 400 });
    }
    const result = verifyConsentToken(body.token, keypair.publicKey);
    return Response.json(result);
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
