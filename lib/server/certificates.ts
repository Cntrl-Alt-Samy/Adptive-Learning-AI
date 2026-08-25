import {
  allocateVerificationCode,
  renderCertificatePdf,
  renderCertificateSvg,
  verifyVerificationCode,
  type CertificateFields,
  type CodeVerificationResult
} from '@/src/credentialing/certificate.js';

/**
 * S8B-T4 — in-memory certificate registry (server-only module). Wraps the
 * S5 credential engines: collision-checked code allocation, deterministic
 * SVG/PDF rendering, constant-time public verification.
 */

export interface StoredCertificate extends CertificateFields {
  userId: string;
  subjectId: string;
  issuedAtIso: string;
}

const registry = new Map<string, StoredCertificate>();

export function issueCertificate(
  userId: string,
  subjectId: string,
  subjectTitle: string,
  learnerName: string
): { ok: true; certificate: StoredCertificate } | { ok: false; error: 'ALLOCATION_EXHAUSTED' } {
  const existing = [...registry.values()].find((c) => c.userId === userId && c.subjectId === subjectId);
  if (existing !== undefined) return { ok: true, certificate: existing };

  const issuedAtIso = new Date().toISOString();
  const allocation = allocateVerificationCode(userId, subjectId, issuedAtIso, (code) => registry.has(code));
  if (!allocation.ok) return allocation;

  const certificate: StoredCertificate = {
    userId,
    subjectId,
    learnerName,
    subjectTitle,
    issuedOn: issuedAtIso.slice(0, 10),
    verificationCode: allocation.code,
    issuedAtIso
  };
  registry.set(allocation.code, certificate);
  return { ok: true, certificate };
}

export function listCertificates(userId: string): StoredCertificate[] {
  return [...registry.values()].filter((c) => c.userId === userId);
}

export function getCertificate(code: string): StoredCertificate | null {
  const verdict = verifyVerificationCode(code, [...registry.keys()]);
  return verdict.ok ? registry.get(verdict.matchedCode) ?? null : null;
}

export function verifyCode(candidate: string): CodeVerificationResult {
  return verifyVerificationCode(candidate, [...registry.keys()]);
}

export function certificateSvg(code: string): string | null {
  const cert = getCertificate(code);
  return cert === null ? null : renderCertificateSvg(cert);
}

export function certificatePdf(code: string): Buffer | null {
  const cert = getCertificate(code);
  return cert === null ? null : renderCertificatePdf(cert);
}
