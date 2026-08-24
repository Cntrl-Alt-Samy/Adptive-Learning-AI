/**
 * S5-T1 — Tier B PII scrubber pipeline (Doc 07 TASK 4.2.1).
 *
 * Layered, pure filter applied to outbound logs/transcripts/analytics BEFORE
 * any persistence or telemetry write:
 *   ① regex families      — emails (plain + obfuscated), phones, postcodes
 *   ② name-entity pass    — lightweight NER: context cues + first-name lexicon
 *                           + signature-line shapes
 *   ③ allowlist dictionary— subject vocabulary is NEVER scrubbed
 *   ④ replacement tokens  — shape-preserving ([EMAIL], [PHONE], [POSTCODE],
 *                           [NAME]) keeping punctuation & spacing readable
 *
 * Detection runs on the ORIGINAL string as span candidates; overlaps are
 * resolved by priority EMAIL > PHONE > POSTCODE > NAME (an email address must
 * never leak its local part through a later NAME pass).
 */

export type PiiFindingType = 'EMAIL' | 'PHONE' | 'POSTCODE' | 'NAME';

export interface PiiFinding {
  type: PiiFindingType;
  /** Original substring removed (for audit sampling, never re-emitted downstream). */
  token: string;
  /** Match offset within the ORIGINAL input. */
  index: number;
}

export interface ScrubOptions {
  /**
   * ③ Allowlist dictionary — case-insensitive. Any candidate whose full text
   * is a member survives untouched (subject vocabulary like "Newton").
   */
  allowlist?: ReadonlySet<string>;
}

export interface ScrubResult {
  clean: string;
  findings: PiiFinding[];
}

interface Candidate {
  start: number;
  end: number;
  type: PiiFindingType;
}

const PRIORITY: Record<PiiFindingType, number> = { EMAIL: 0, PHONE: 1, POSTCODE: 2, NAME: 3 };

/** Replacement tokens keyed by finding type (④ shape-preserving). */
export const REPLACEMENT_TOKEN: Record<PiiFindingType, string> = {
  EMAIL: '[EMAIL]',
  PHONE: '[PHONE]',
  POSTCODE: '[POSTCODE]',
  NAME: '[NAME]'
};

/** ① Plain email addresses. */
const EMAIL_PLAIN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/**
 * ① Obfuscated emails: "sam dot smith at gmail dot com",
 * "sam[dot]smith[at]school[dot]org", "sam(dot)smith(at)school(dot)com",
 * "sam[dot]smith@gmail.com". Requires an @/at hop AND a tld-ish tail. The
 * local side may itself carry dot separators in any notation so the FULL
 * address is replaced (never just its tail).
 */
const EMAIL_SEP_SRC = String.raw`(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\bdot\b|\(\s*at\s*\)|\[\s*at\s*\])`;
const DOT_SEP_SRC = String.raw`(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\bdot\b)`;
const LOCAL_PART = new RegExp(
  String.raw`[A-Za-z0-9._%+-]+(?:\s*${DOT_SEP_SRC}\s*[A-Za-z0-9._%+-]+)*`
);
const EMAIL_OBFUSCATED = new RegExp(
  String.raw`\b${LOCAL_PART.source}\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\bat\b)\s*[A-Za-z0-9-]+(?:\s*${EMAIL_SEP_SRC}\s*[A-Za-z0-9-]+)*\s*${EMAIL_SEP_SRC}\s*(?:com|org|net|edu|gov|mil|int|io|dev|co|uk|us|ca|fr|de|es|it|nl|in|ie|eu|info|ac)\b(?:\s*${EMAIL_SEP_SRC}\s*(?:uk|au|nz|za|jp|br|mx)\b)?`,
  'gi'
);

/** ① Phone families: UK (+44 / 07…), NANP, generic E.164-ish runs. */
const PHONE_PATTERNS: RegExp[] = [
  /\+44[\s-]?\d{3,4}[\s-]?\d{3}[\s-]?\d{3,4}/g,
  /\b07\d{3}\s?\d{6}\b/g,
  /\b0\d{3}\s\d{6}\b/g,
  /\b0\d{2}\s\d{4}\s\d{4}\b/g,
  /\(\d{3}\)\s?\d{3}[\s.-]\d{4}\b/g,
  /\b\d{3}[.-]\d{3}[.-]\d{4}\b/g,
  /\+\d{1,3}[\s-]?\d{3,5}(?:[\s-]\d{3,5}){1,3}\b/g
];

/**
 * ① Postcodes: UK outward+inward (SW1A 1AA, M1 1AE, B33 8TH, EC1A 1BB) and
 * explicitly-cued US ZIPs ("ZIP: 94105", "postal code 10001-2345"). Bare
 * 5-digit runs are deliberately NOT matched — they collide with scores,
 * years and counts in pedagogy text.
 */
const POSTCODE_PATTERNS: RegExp[] = [
  /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g,
  /\b(?:zip|zipcode|zip\s*code|postal\s*code|postcode)\s*:?\s*\d{5}(?:-\d{4})?\b/gi
];

/** ② Lightweight NER — explicit self-introduction / third-party cues. */
const NAME_CUE_PATTERNS: RegExp[] = [
  /\b(?:my name is|my name's|name:\s*|i am|i'm|im|call me)\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,2})/gi,
  /\b(?:my (?:mum|mom|dad|father|mother|teacher|brother|sister|guardian)|his name is|her name is|their name is)\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,2})/gi
];

/** ② Signature-block shapes: a line that is just a person name. */
const NAME_SIGNATURE_LINE = /^[ \t]*(?:—–-)?\s*[A-Z][a-z'’-]+\s+[A-Z][a-z'’-]+\s*$/gm;

/** ② Seeded first-name lexicon (extends cue-based detection). */
export const COMMON_FIRST_NAMES: ReadonlySet<string> = new Set([
  'ava', 'james', 'maya', 'zara', 'oliver', 'amelia', 'noah', 'emma', 'liam', 'olivia',
  'ethan', 'sophia', 'lucas', 'isabella', 'mason', 'mia', 'logan', 'charlotte', 'jack',
  'harper', 'jacob', 'evelyn', 'leo', 'abigail', 'henry', 'emily', 'owen', 'ella',
  'ryan', 'scarlett', 'nathan', 'grace', 'tom', 'chloe', 'sam', 'freya', 'ben', 'isla',
  'harry', 'poppy', 'george', 'sophie', 'oscar', 'ruby', 'archie', 'lily', 'charlie',
  'evie', 'dylan', 'gracie', 'joey', 'rosie', 'william', 'ivy', 'alexander', 'florence',
  'mohammed', 'amuhammad', 'arjun', 'priya', 'wei', 'ming', 'ana', 'maria', 'carlos',
  'diego', 'lucia', 'mateo', 'sofia', 'elena', 'ivan', 'anna', 'yuki', 'hiro', 'amara',
  'kwame', 'chioma', 'tariq', 'layla', 'omar', 'nadia', 'ali', 'fatima', 'hassan',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica',
  'sarah', 'karen', 'nancy', 'lisa', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly',
  'donna', 'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon',
  'laura', 'cynthia', 'kathleen', 'amy', 'angela', 'shirley', 'brenda', 'pamela', 'nicole',
  'david', 'michael', 'john', 'robert', 'richard', 'joseph', 'thomas', 'charles', 'christopher',
  'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'gary'
]);

function pushAll(candidates: Candidate[], pattern: RegExp, type: PiiFindingType, input: string): void {
  const re = new RegExp(pattern.source, pattern.flags);
  for (let m = re.exec(input); m !== null; m = re.exec(input)) {
    if (m[0].length === 0) break; // safety vs zero-width loops
    candidates.push({ start: m.index, end: m.index + m[0].length, type });
  }
}

/** ② Name candidates from cues, lexicon hits, and signature lines. */
function collectNameCandidates(input: string): Candidate[] {
  const out: Candidate[] = [];

  for (const cue of NAME_CUE_PATTERNS) {
    const re = new RegExp(cue.source, cue.flags);
    for (let m = re.exec(input); m !== null; m = re.exec(input)) {
      const raw = m[1];
      if (!raw) continue;
      // Precision guard: the candidate must look like a proper noun —
      // capitalized in the original text OR a known first name. This keeps
      // ordinary speech after cues ("i am stuck") from being scrubbed.
      const firstWord = raw.split(/\s+/)[0]!;
      if (!/^[A-Z]/.test(firstWord) && !COMMON_FIRST_NAMES.has(firstWord.toLowerCase())) continue;
      const start = m.index + m[0].indexOf(raw);
      out.push({ start, end: start + raw.length, type: 'NAME' });
    }
  }

  const sigRe = new RegExp(NAME_SIGNATURE_LINE.source, NAME_SIGNATURE_LINE.flags);
  for (let m = sigRe.exec(input); m !== null; m = sigRe.exec(input)) {
    const stripped = m[0].replace(/^[ \t—–-]+/, '').replace(/[ \t]+$/, '');
    const start = m.index + m[0].indexOf(stripped);
    out.push({ start, end: start + stripped.length, type: 'NAME' });
  }

  // Lexicon pass: capitalized standalone tokens matching the lexicon, not at
  // sentence start (sentence-initial capitals are far too common otherwise).
  const wordRe = /[A-Z][a-z'’-]{1,20}/g;
  for (let m = wordRe.exec(input); m !== null; m = wordRe.exec(input)) {
    const lower = m[0].toLowerCase();
    if (!COMMON_FIRST_NAMES.has(lower)) continue;
    const prev = input.slice(Math.max(0, m.index - 2), m.index);
    if (m.index === 0 || /(^|[.!?]\s|\n)$/.test(prev)) continue; // sentence start
    out.push({ start: m.index, end: m.index + m[0].length, type: 'NAME' });
  }

  return out;
}

function overlaps(a: Candidate, b: Candidate): boolean {
  return a.start < b.end && b.start < a.end;
}

export function scrubPii(input: string, options: ScrubOptions = {}): ScrubResult {
  const text = input ?? '';
  const allowlist = options.allowlist;

  // ---- Detection over the ORIGINAL string ---------------------------------
  const candidates: Candidate[] = [];
  pushAll(candidates, EMAIL_PLAIN, 'EMAIL', text);
  pushAll(candidates, EMAIL_OBFUSCATED, 'EMAIL', text);
  for (const p of PHONE_PATTERNS) pushAll(candidates, p, 'PHONE', text);
  for (const p of POSTCODE_PATTERNS) pushAll(candidates, p, 'POSTCODE', text);
  candidates.push(...collectNameCandidates(text));

  // ---- Overlap resolution: highest priority (lowest ordinal) wins ---------
  candidates.sort(
    (a, b) => PRIORITY[a.type] - PRIORITY[b.type] || a.start - b.start || b.end - a.end
  );
  const accepted: Candidate[] = [];
  for (const c of candidates) {
    if (accepted.some((a) => overlaps(a, c))) continue;
    // ③ Allowlist veto — exact case-insensitive membership.
    if (allowlist && allowlist.has(text.slice(c.start, c.end).toLowerCase())) continue;
    accepted.push(c);
  }
  accepted.sort((a, b) => a.start - b.start);

  // ---- Rebuild with shape-preserving tokens (④) ---------------------------
  const findings: PiiFinding[] = [];
  let clean = '';
  let cursor = 0;
  for (const c of accepted) {
    clean += text.slice(cursor, c.start);
    clean += REPLACEMENT_TOKEN[c.type];
    cursor = c.end;
    findings.push({ type: c.type, token: text.slice(c.start, c.end), index: c.start });
  }
  clean += text.slice(cursor);

  return { clean, findings };
}

/** Convenience probe used by telemetry emitters before any outbound write. */
export function containsPii(text: string, options: ScrubOptions = {}): boolean {
  return scrubPii(text, options).findings.length > 0;
}
