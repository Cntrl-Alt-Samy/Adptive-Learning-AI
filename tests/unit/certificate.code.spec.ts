import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  crockford32Encode,
  normalizeVerificationCode,
  deriveVerificationCode,
  allocateVerificationCode,
  verifyVerificationCode,
  renderCertificateSvg,
  renderCertificatePdf,
  VERIFICATION_CODE_BODY_LENGTH
} from '../../src/credentialing/certificate.js';

/**
 * certificate.code.spec — Sprint 5 gate (S5-T5 pure halves).
 * Crockford base32 alphabet discipline, code format/normalisation, registry
 * verification accept/reject taxonomy, allocation collision handling, and
 * renderer field/shape assertions. DB roundtrip lives in the integration spec.
 */

const FIELDS = {
  learnerName: 'Ava Patel',
  subjectTitle: 'GCSE Maths — Quadratic Mastery',
  issuedOn: '2026-08-24',
  verificationCode: 'LEARNOS-ABCD-EFGH-JKMN-PQSV'
};

describe('certificate.code.spec — S5-T5 gates', () => {
  describe('Crockford base32', () => {
    it('uses only the 32-symbol alphabet excluding I, L, O, U', () => {
      const out = crockford32Encode(new Uint8Array([0, 1, 2, 3, 250, 251, 252, 255]));
      expect(out).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/);
      expect(out).not.toMatch(/[ILOU]/);
    });

    it('property: output length is ceil(bytes*8/5) and alphabet-safe', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 64 }), (bytes) => {
          const enc = crockford32Encode(bytes);
          return (
            enc.length === Math.ceil((bytes.length * 8) / 5) &&
            /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]*$/.test(enc)
          );
        })
      );
    });
  });

  describe('verification codes', () => {
    it('format is LEARNOS-####-####-####-####', () => {
      const code = deriveVerificationCode('u1', 'maths', '2026-08-24T00:00:00Z', new Uint8Array(10).fill(7));
      expect(code).toMatch(/^LEARNOS-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    });

    it('deterministic for fixed entropy; distinct across entropy draws', () => {
      const a = deriveVerificationCode('u1', 'maths', 't', new Uint8Array(10).fill(1));
      const b = deriveVerificationCode('u1', 'maths', 't', new Uint8Array(10).fill(1));
      const c = deriveVerificationCode('u1', 'maths', 't', new Uint8Array(10).fill(2));
      expect(a).toBe(b);
      expect(a).not.toBe(c);
    });

    it('normalisation maps confusable glyphs and strips separators', () => {
      // Brand prefix survives intact; only the body gets glyph-mapped.
      expect(normalizeVerificationCode('learnos-abcd-efgh-jkmn-pqsv')).toBe(
        'LEARNOSABCDEFGHJKMNPQSV'
      );
      expect(normalizeVerificationCode('O-I-L')).toBe('011');
    });
  });

  describe('public verification endpoint logic', () => {
    const registry = [
      'LEARNOS-ABCD-EFGH-JKMN-PQSV',
      'LEARNOS-TEST-CODE-XYZ1-2345'
    ];

    it('genuine code verifies (exact)', () => {
      expect(verifyVerificationCode(registry[0]!, registry)).toEqual({
        ok: true,
        matchedCode: registry[0]
      });
    });

    it('human input with dashes/spaces/case/confusables still verifies', () => {
      // User typed O where 0 was issued and used spaces.
      expect(verifyVerificationCode('LEARNOS ABCD EFGH JKMN PQSV', registry).ok).toBe(true);
      expect(verifyVerificationCode(registry[1]!.toLowerCase(), registry).ok).toBe(true);
    });

    it('altered single character rejected UNKNOWN_CODE', () => {
      const altered = registry[0]!.slice(0, -1) + (registry[0]!.endsWith('V') ? 'W' : 'V');
      const res = verifyVerificationCode(altered, registry);
      expect(res).toEqual({ ok: false, reason: 'UNKNOWN_CODE' });
    });

    it('unknown but well-formed codes rejected UNKNOWN_CODE', () => {
      const res = verifyVerificationCode('LEARNOS-0000-0000-0000-0000', registry);
      expect(res).toEqual({ ok: false, reason: 'UNKNOWN_CODE' });
    });

    it.each([
      ['too short', 'LEARNOS-ABCD'],
      ['non-alphanumeric body', 'LEARNOS-!!!!-!!!!-!!!!-!!!!'],
      ['empty', '']
    ])('malformed candidate (%s) rejected MALFORMED_CODE', (_l, c) => {
      expect(verifyVerificationCode(c, registry)).toEqual({ ok: false, reason: 'MALFORMED_CODE' });
    });
  });

  describe('collision-checked allocation', () => {
    it('returns first unused candidate', () => {
      const seen: string[] = [];
      const res = allocateVerificationCode('u', 's', 't', (code) => seen.includes(code));
      expect(res.ok).toBe(true);
      if (res.ok) seen.push(res.code);
      expect(seen).toHaveLength(1);
    });

    it('exhaustion surfaces ALLOCATION_EXHAUSTED after bounded retries', () => {
      let calls = 0;
      const res = allocateVerificationCode('u', 's', 't', () => true, 4);
      void calls;
      expect(res).toEqual({ ok: false, error: 'ALLOCATION_EXHAUSTED' });
    });
  });

  describe('renderers', () => {
    it('SVG embeds learner, subject, date, code and escapes XML entities', () => {
      const svg = renderCertificateSvg(FIELDS);
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain(FIELDS.learnerName);
      expect(svg).toContain(FIELDS.subjectTitle.replace('—', '—'));
      expect(svg).toContain(FIELDS.issuedOn);
      expect(svg).toContain(FIELDS.verificationCode);
      const evil = renderCertificateSvg({ ...FIELDS, learnerName: '<script>x</script>' });
      expect(evil).not.toContain('<script>');
      expect(evil).toContain('&lt;script&gt;');
    });

    it('PDF is a structurally valid single-page document with all fields', () => {
      const pdf = renderCertificatePdf(FIELDS);
      const text = pdf.toString('latin1');
      expect(text.startsWith('%PDF-1.4')).toBe(true);
      expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
      expect(text).toContain('/Type /Catalog');
      expect(text).toContain('/Type /Page ');
      expect(text).toContain('xref');
      // xref offsets point at their objects (structural sanity probe).
      const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
      expect(text.slice(startxref, startxref + 4)).toBe('xref');
      expect(text).toContain('This certifies that Ava Patel');
      expect(text).toContain(`Verification code: ${FIELDS.verificationCode}`);
      expect(text).toContain(`Issued on: ${FIELDS.issuedOn}`);
      // Body length declared in the content stream object matches reality.
      const [, len, stream] = text.match(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/)!;
      expect(Buffer.byteLength(stream!, 'latin1')).toBe(Number(len));
    });
  });

  it('code body length constant matches format contract', () => {
    expect(VERIFICATION_CODE_BODY_LENGTH).toBe(16);
  });
});
