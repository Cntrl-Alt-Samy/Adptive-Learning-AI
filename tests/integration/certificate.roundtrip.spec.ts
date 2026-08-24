import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  allocateVerificationCode,
  deriveVerificationCode,
  verifyVerificationCode,
  renderCertificateSvg,
  renderCertificatePdf,
  normalizeVerificationCode
} from '../../src/credentialing/certificate.js';

/**
 * certificate.roundtrip.spec — Sprint 5 gate (S5-T5 / Doc 07 TASK 4.1.2).
 * Generate → persist against real PG (unique verification_code) → public
 * verification accepts the genuine code and rejects altered/unknown/malformed;
 * rendered PDF/SVG carry the correct fields.
 */
const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL;

async function canConnect(url: string): Promise<boolean> {
  try {
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

const suite = TEST_URL && (await canConnect(TEST_URL)) ? describe : describe.skip;

suite('certificate.roundtrip.spec — S5-T5 gate', () => {
  let pool: pg.Pool;
  const RUN = randomUUID().slice(0, 8);
  let userId = '';
  let subjectId = `subj_${RUN}`;

  beforeAll(async () => {
    if (!TEST_URL) throw new Error('unreachable');
    pool = new pg.Pool({ connectionString: TEST_URL });
    await pool.query(`INSERT INTO tenants (name) VALUES ($1)`, [`cert-${RUN}`]);
    await pool.query(
      `INSERT INTO subjects (id, title, category) VALUES ($1, $2, 'test')`,
      [subjectId, 'Roundtrip Subject']
    );
    const u = await pool.query(
      `INSERT INTO users (tenant_id, clerk_id, email)
       VALUES ((SELECT id FROM tenants LIMIT 1), $1, $2) RETURNING id`,
      [`clerk-cert-${RUN}`, `cert-${RUN}@learnos.test`]
    );
    userId = u.rows[0]!.id as string;
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('generate → persist → public verify accepts the genuine code only', async () => {
    // Collision-checked allocation against the live registry snapshot.
    const registryNow = async (): Promise<string[]> =>
      (
        await pool.query(`SELECT verification_code AS code FROM certificates WHERE subject_id = $1`, [
          subjectId
        ])
      ).rows.map((r) => r.code as string);

    const known = await registryNow();
    const allocation = allocateVerificationCode(userId, subjectId, '2026-08-24T09:00:00Z', (candidate) =>
      known.includes(candidate)
    );
    expect(allocation.ok).toBe(true);
    const code = allocation.ok ? allocation.code : '';

    await pool.query(
      `INSERT INTO certificates (user_id, subject_id, verification_code, certificate_url)
       VALUES ($1, $2, $3, $4)`,
      [userId, subjectId, code, `https://assets.learnos.test/certs/${RUN}.pdf`]
    );

    // Registry read mirrors the public verification endpoint's lookup.
    const registry = (
      await pool.query(`SELECT verification_code AS code FROM certificates WHERE user_id = $1`, [userId])
    ).rows.map((r) => r.code as string);
    expect(registry).toEqual([code]);

    // Genuine — including human-mangled input.
    expect(verifyVerificationCode(code, registry)).toEqual({ ok: true, matchedCode: code });
    expect(verifyVerificationCode(code.toLowerCase().replace(/-/g, ' '), registry).ok).toBe(true);

    // Altered final glyph → unknown.
    const altered =
      code.slice(0, -1) +
      ('WXYZ'.includes(code.slice(-1)) ? 'Q' : 'W');
    expect(verifyVerificationCode(altered, registry)).toEqual({ ok: false, reason: 'UNKNOWN_CODE' });

    // Unknown well-formed → unknown.
    const stranger = deriveVerificationCode('nobody', 'nothing', 'never', new Uint8Array(10).fill(9));
    if (normalizeVerificationCode(stranger) !== normalizeVerificationCode(code)) {
      expect(verifyVerificationCode(stranger, registry)).toEqual({
        ok: false,
        reason: 'UNKNOWN_CODE'
      });
    }

    // Malformed shapes rejected before registry probing.
    expect(verifyVerificationCode('NOT-A-CERT', registry)).toEqual({
      ok: false,
      reason: 'MALFORMED_CODE'
    });
  });

  it('rendered assets open with the correct fields (PDF structural + SVG)', () => {
    const fields = {
      learnerName: 'Ava Patel',
      subjectTitle: 'Roundtrip Subject',
      issuedOn: '2026-08-24',
      verificationCode: 'LEARNOS-RT00-TEST-CODE-XXXX'
    };
    const svg = renderCertificateSvg(fields);
    expect(svg).toContain('Ava Patel');
    expect(svg).toContain('Roundtrip Subject');
    expect(svg).toContain(fields.verificationCode);

    const pdf = renderCertificatePdf(fields);
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('Ava Patel');
    expect(text).toContain(`Verification code: ${fields.verificationCode}`);
  });

  it('verification_code UNIQUE constraint blocks duplicate registration', async () => {
    const dup = deriveVerificationCode('dup', 'dup', 'dup', new Uint8Array(10).fill(5));
    await pool.query(
      `INSERT INTO certificates (user_id, subject_id, verification_code, certificate_url)
       VALUES ($1, $2, $3, $4)`,
      [userId, subjectId, dup, 'u1']
    );
    await expect(
      pool.query(
        `INSERT INTO certificates (user_id, subject_id, verification_code, certificate_url)
         VALUES ($1, $2, $3, $4)`,
        [userId, subjectId, dup, 'u2']
      )
    ).rejects.toThrowError(/duplicate key|unique/i);
  });
});
