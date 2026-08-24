/**
 * S5-T5 — Verifiable certificate engine, F10 (Doc 07 TASK 4.1.2).
 *
 *  - Verification codes: Crockford base32 (alphabet excludes I, L, O, U)
 *    derived from SHA-256 over the issuance tuple; grouped for readability.
 *  - Collision-checked allocation: `allocateVerificationCode` retries with a
 *    fresh random suffix until the injected existence check passes.
 *  - Renderers: deterministic SVG and a minimal standards-compliant PDF 1.4
 *    (hand-rolled writer — no external dependency) embedding learner name,
 *    subject title, issue date and the verification code.
 *  - Public verification: `verifyVerificationCode` normalises human-confusable
 *    glyphs (O→0, I/L→1) then compares against the issued registry.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // excludes I, L, O, U

export function crockford32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Human-input normalisation. Order matters: separators are stripped and the
 * literal LEARNOS brand prefix is split off BEFORE confusable-glyph mapping
 * (the prefix itself contains an O that must never become a zero).
 */
export function normalizeVerificationCode(input: string): string {
  const stripped = (input ?? '').toUpperCase().replace(/[\s-]/g, '');
  const hasBrandPrefix = /^LEARNOS/.test(stripped);
  const body = hasBrandPrefix ? stripped.slice('LEARNOS'.length) : stripped;
  const mapped = body.replace(/O/g, '0').replace(/[IL]/g, '1');
  return hasBrandPrefix ? `LEARNOS${mapped}` : mapped;
}

/** Comparable form for registry matching: brand prefix removed entirely. */
function comparableBody(input: string): string {
  const stripped = input.toUpperCase().replace(/[\s-]/g, '');
  const body = /^LEARNOS/.test(stripped) ? stripped.slice('LEARNOS'.length) : stripped;
  return body.replace(/O/g, '0').replace(/[IL]/g, '1');
}

export interface CertificateFields {
  learnerName: string;
  subjectTitle: string;
  /** yyyy-mm-dd */
  issuedOn: string;
  verificationCode: string;
}

export const VERIFICATION_CODE_BODY_LENGTH = 16;

/**
 * Deterministic code derivation from the issuance tuple plus entropy bytes
 * (10 bytes → 16 chars). Format: LEARNOS-XXXX-XXXX-XXXX-XXXX.
 */
export function deriveVerificationCode(
  userId: string,
  subjectId: string,
  issuedAtIso: string,
  entropy: Uint8Array = randomBytes(10)
): string {
  const digest = createHash('sha256')
    .update(`${userId}|${subjectId}|${issuedAtIso}`)
    .update(Buffer.from(entropy))
    .digest();
  const body = crockford32Encode(digest.subarray(0, 10)).slice(0, VERIFICATION_CODE_BODY_LENGTH);
  return ['LEARNOS', body.slice(0, 4), body.slice(4, 8), body.slice(8, 12), body.slice(12)].join('-');
}

export type CodeAllocationError = 'ALLOCATION_EXHAUSTED';

/**
 * Collision-checked allocation: derive candidates until `exists` reports the
 * code unused, bounded by attempts to surface pathological registry states.
 */
export function allocateVerificationCode(
  userId: string,
  subjectId: string,
  issuedAtIso: string,
  exists: (code: string) => boolean,
  maxAttempts = 8
): { ok: true; code: string } | { ok: false; error: CodeAllocationError } {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = deriveVerificationCode(userId, subjectId, issuedAtIso, randomBytes(10));
    if (!exists(candidate)) return { ok: true, code: candidate };
  }
  return { ok: false, error: 'ALLOCATION_EXHAUSTED' };
}

// ---------------------------------------------------------------------------
// Renderers (deterministic given fields)
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderCertificateSvg(fields: CertificateFields): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="744" viewBox="0 0 1050 744">',
    '  <rect width="1050" height="744" fill="#ffffff"/>',
    '  <rect x="18" y="18" width="1014" height="708" fill="none" stroke="#4F46E5" stroke-width="6"/>',
    '  <text x="525" y="120" text-anchor="middle" font-family="Inter, sans-serif" font-size="42" fill="#312E81">Certificate of Completion</text>',
    `  <text x="525" y="220" text-anchor="middle" font-family="Inter, sans-serif" font-size="30" fill="#111827">${escapeXml(fields.learnerName)}</text>`,
    '  <text x="525" y="268" text-anchor="middle" font-family="Inter, sans-serif" font-size="16" fill="#6B7280">has successfully completed</text>',
    `  <text x="525" y="330" text-anchor="middle" font-family="Inter, sans-serif" font-size="26" font-weight="600" fill="#111827">${escapeXml(fields.subjectTitle)}</text>`,
    `  <text x="525" y="420" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" fill="#6B7280">Issued on ${escapeXml(fields.issuedOn)}</text>`,
    `  <text x="525" y="500" text-anchor="middle" font-family="ui-monospace, monospace" font-size="18" fill="#4F46E5">Verification code: ${escapeXml(fields.verificationCode)}</text>`,
    '</svg>'
  ].join('\n');
}

// Minimal PDF 1.4 writer -----------------------------------------------------

interface PdfObject {
  id: number;
  body: string;
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Build a single-page PDF whose content stream prints the given lines. */
function buildSinglePagePdf(lines: string[]): Buffer {
  const objects: PdfObject[] = [];
  let nextObjectId = 1;
  const add = (body: string): number => {
    const id = nextObjectId++;
    objects.push({ id, body });
    return id;
  };

  // Object ids are assigned in dependency order but written in numeric order.
  const catalogId = nextObjectId;
  add('');
  const pagesId = nextObjectId;
  add('');
  const pageId = nextObjectId;
  add('');
  const contentId = nextObjectId;
  add('');
  const fontId = nextObjectId;
  add('');

  objects[catalogId - 1]!.body = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1]!.body = `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`;
  objects[pageId - 1]!.body =
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 1050 744] ` +
    `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
  const stream = lines.map((l, i) => `${i === 0 ? '' : 'T* '}(${l}) Tj`).join('\n');
  const streamBody = `BT /F1 11 Tf 14 TL 60 700 Td\n${stream}\nET`;
  objects[contentId - 1]!.body =
    `<< /Length ${Buffer.byteLength(streamBody, 'latin1')} >>\nstream\n${streamBody}\nendstream`;
  objects[fontId - 1]!.body = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  objects.sort((a, b) => a.id - b.id);
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets[obj.id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/** Multi-line certificate PDF; each array element is one output line. */
export function renderCertificatePdf(fields: CertificateFields): Buffer {
  const lines = [
    'LEARNOS CERTIFICATE OF COMPLETION',
    '',
    `This certifies that ${fields.learnerName}`,
    'has successfully completed',
    fields.subjectTitle,
    '',
    `Issued on: ${fields.issuedOn}`,
    `Verification code: ${fields.verificationCode}`,
    '',
    'Verify at /verify/:code'
  ].map((l) => pdfEscape(l));
  return buildSinglePagePdf(lines);
}

// ---------------------------------------------------------------------------
// Public verification endpoint logic
// ---------------------------------------------------------------------------

export type CodeVerificationFailure =
  | { ok: false; reason: 'MALFORMED_CODE' }
  | { ok: false; reason: 'UNKNOWN_CODE' };

export type CodeVerificationResult =
  | { ok: true; matchedCode: string }
  | CodeVerificationFailure;

/**
 * Registry-backed lookup. Both sides are reduced to comparable bodies
 * (brand prefix removed, confusables mapped, separators stripped) before an
 * exact constant-time comparison.
 */
export function verifyVerificationCode(
  candidate: string,
  issuedCodes: readonly string[]
): CodeVerificationResult {
  const candidateBody = comparableBody(candidate ?? '');
  if (candidateBody.length !== VERIFICATION_CODE_BODY_LENGTH || !/^[0-9A-Z]+$/.test(candidateBody)) {
    return { ok: false, reason: 'MALFORMED_CODE' };
  }

  const a = Buffer.from(candidateBody, 'utf8');
  for (const issued of issuedCodes) {
    const b = Buffer.from(comparableBody(issued), 'utf8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { ok: true, matchedCode: issued };
    }
  }
  return { ok: false, reason: 'UNKNOWN_CODE' };
}
