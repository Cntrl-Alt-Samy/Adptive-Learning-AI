import { describe, expect, it } from 'vitest';

import { POST } from '@/app/api/consent/route';

/**
 * S8A §6 consent.spec — issue→verify roundtrip at the UI boundary
 * (Route Handler), tamper rejection, and input validation.
 */

function post(body: unknown): Promise<Response> {
  return POST(new Request('http://localhost/api/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }));
}

describe('consent gate boundary', () => {
  it('issues a signed token for a valid guardian ref', async () => {
    const res = await post({ action: 'issue', guardianRef: 'parent@example.com' });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; payload: { sub: string; guardianRef?: string; exp: number } };
    expect(data.token.length).toBeGreaterThan(0);
    expect(data.payload.sub).toBe('demo-user');
    expect(data.payload.exp).toBeGreaterThan(Date.now());
  });

  it('verifies an issued token', async () => {
    const issued = await post({ action: 'issue', guardianRef: 'case-42' });
    const { token } = (await issued.json()) as { token: string };
    const res = await post({ action: 'verify', token });
    expect(res.status).toBe(200);
    const verdict = (await res.json()) as { ok: boolean; reason?: string };
    expect(verdict.ok).toBe(true);
  });

  it('rejects a tampered token', async () => {
    const issued = await post({ action: 'issue', guardianRef: 'case-42' });
    const { token } = (await issued.json()) as { token: string };
    const parts = token.split('.');
    // Flip payload bits while keeping structure.
    const forged = `${parts[0]}.${Buffer.from('{"evil":true}').toString('base64url')}.${parts[2] ?? 'sig'}`;
    const res = await post({ action: 'verify', token: forged });
    const verdict = (await res.json()) as { ok: boolean; reason?: string };
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBeDefined();
  });

  it('400s on missing/short guardian ref and unknown actions', async () => {
    expect((await post({ action: 'issue', guardianRef: 'x' })).status).toBe(400);
    expect((await post({ action: 'issue' })).status).toBe(400);
    expect((await post({ action: 'verify' })).status).toBe(400);
    expect((await post({ action: 'nonsense' })).status).toBe(400);
    expect((await post('not-json')).status).toBeGreaterThanOrEqual(400);
  });
});
