/**
 * S1-T2 — Edge Prompt-Injection Sanitizer (Doc 04 §14.1).
 *
 * Layered, pure filter applied to every learner message before it enters an
 * LLM context:
 *   ① blocklist regex families — instruction-leak attempts & jailbreak roleplay
 *   ② LaTeX delimiter / KaTeX command neutralization (anti-XSS)
 *   ③ control-char & zero-width stripper
 *   ④ size clamp
 *
 * Design rule from the sprint doc: flags are RETURNED and logged upstream,
 * never silently dropped, so false positives can be tuned against the
 * benign-corpus suite.
 */

export type SanitizerFlag =
  | 'instruction_leak'
  | 'jailbreak_roleplay'
  | 'latex_injection'
  | 'control_chars'
  | 'size_clamped';

export interface SanitizeResult {
  clean: string;
  flags: SanitizerFlag[];
}

export const MAX_INPUT_CHARS = 8_000;

/** ① Instruction-leak attempts: trying to surface system prompt or override rules. */
const INSTRUCTION_LEAK_PATTERNS: RegExp[] = [
  /repeat\s+(the\s+)?(above|prior|previous)\s+(instructions?|prompt|system)/i,
  /(reveal|show|print|output|display)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules)/i,
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|rules?|guardrails?)/i,
  /\b(system\s+prompt|initial\s+instructions?)\s*(is|was|are)?\s*:?\s*you\b/i,
  /what\s+(are|is)\s+your\s+(original|initial|hidden|secret)\s+(instructions?|prompt|directives?)/i
];

/** ① Jailbreak roleplay families: DAN, developer mode, restriction-lifting personas. */
const JAILBREAK_PATTERNS: RegExp[] = [
  /\bDAN\s*(mode|jailbreak)?\b/i,
  /developer\s+mode/i,
  /\bact\s+as\s+(an?\s+)?(unrestricted|uncensored|unfiltered|jailbroken)\b/i,
  /(without|ignore|no)\s+(any\s+)?(restrictions?|filters?|guardrails?|content\s+policy)/i,
  /\byou\s+can\s+do\s+anything\s+now\b/i,
  /\bpretend\s+(you\s+)?(are|to\s+be)\s+(not\s+bound|free\s+from)\b/i
];

/** ② Dangerous LaTeX/KaTeX constructs: link injection, file ops, category-code tricks. */
const LATEX_DANGEROUS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\\href\s*\[[^\]]*\]\s*\{[^}]*\}/gi, replacement: '\\text{[link removed]}' },
  { pattern: /\\href\s*\{/gi, replacement: '\\hrefSAFE{' },
  { pattern: /\\url\s*\{/gi, replacement: '\\urlSAFE{' },
  { pattern: /\\(input|include|write18|write|openout|catcode|read)\b/gi, replacement: '\\$1DISABLED' },
  { pattern: /\\includegraphics\b/gi, replacement: '\\includegraphicsDISABLED' }
];

/** HTML/XSS payloads riding inside markdown/LaTeX content. */
const XSS_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, replacement: '[removed]' },
  { pattern: /<\s*(iframe|object|embed|link|meta)[^>]*>/gi, replacement: '[removed]' },
  { pattern: /\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, replacement: '' },
  { pattern: /javascript\s*:/gi, replacement: 'javascriptBLOCKED:' },
  { pattern: /data\s*:\s*text\/html/gi, replacement: 'dataBlocked:text/html' }
];

/** ③ Zero-width / bidi control characters used for invisible smuggling. */
const CONTROL_AND_INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * S7-T4 pen-test remediation — novel bypass families surfaced by the GA
 * red-team audit. These run against a FOLDED copy of the input (unicode
 * NFKD + diacritic strip + confusables remap + lowercase) so homoglyph and
 * accent tricks cannot slip the ASCII blocklists. Flags are additive: the
 * original text still flows through the legacy defanging passes untouched.
 */

/** Latin lookalikes from Cyrillic/Greek that NFKD does not transliterate. */
const CONFUSABLES: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y',
  і: 'i', ѕ: 's', ј: 'j', ԁ: 'd', ɡ: 'g', ν: 'v', ο: 'o', α: 'a',
  ε: 'e', ι: 'i', κ: 'k', τ: 't', υ: 'u', 'Ｉ': 'i'
};

export function foldForDetection(text: string): string {
  const decomposed = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  let out = '';
  for (const ch of decomposed) out += CONFUSABLES[ch] ?? ch;
  return out;
}

/** Builds a regex matching `word` with junk separators between every letter. */
function spacedWord(word: string): string {
  return word
    .split('')
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s._\\-*]*');
}

const SPACED_IGNORE = new RegExp(`\\b(?:${spacedWord('ignore')}|${spacedWord('disregard')})\\b`, 'i');
const SPACED_TARGET = new RegExp(
  [
    spacedWord('instructions'),
    spacedWord('instruction'),
    spacedWord('rules'),
    spacedWord('rule'),
    spacedWord('prompts'),
    spacedWord('prompt'),
    spacedWord('guardrails'),
    spacedWord('guardrail')
  ].join('|'),
  'i'
);

/** Chat-template special tokens used to fake upstream turns. */
const CHAT_TEMPLATE_TOKEN_PROBE = /<\|\s*(?:im_start|im_end|endoftext|system|assistant|user)\s*\|>/i;
const CHAT_TEMPLATE_TOKENS_GLOBAL = /<\|\s*(?:im_start|im_end|endoftext|system|assistant|user)\s*\|>/gi;

/**
 * Role-prefix override lines: "system: you are now…" — only flagged when an
 * imperative follows, so CS homework that merely mentions "system:" survives.
 */
const ROLE_PREFIX_OVERRIDE = /^[ \t>]*(?:system|developer)[ \t]*:[ \t]*(?:you\s+are|act\s+as|new\s+rules|override|from\s+now\s+on|you\s+must)\b/im;

/** Multilingual instruction-leak variants from the red-team corpus. */
const MULTILINGUAL_LEAKS: RegExp[] = [
  /\bignora\s+(todas?\s+)?las?\s+instrucciones\s+(anteriores|previas)\b/i,
  /\bignorez?\s+toutes?\s+les?\s+instructions\s+(pr[ée]c[ée]dentes?|ant[ée]rieures?)\b/i,
  /\bignoriere\s+(alle\s+)?(vorherigen|bisherigen)\s+(anweisungen|instruktionen)\b/i,
  /\b無視して(ください)?.*(以前の|前の)(指示|プロンプト)/
];

export function sanitize(input: string): SanitizeResult {
  const flags: SanitizerFlag[] = [];
  let text = input ?? '';

  // ④ Size clamp first — bound all downstream work.
  if (text.length > MAX_INPUT_CHARS) {
    text = text.slice(0, MAX_INPUT_CHARS);
    flags.push('size_clamped');
  }

  // ③ Control-char / zero-width stripper.
  const stripped = text.replace(CONTROL_AND_INVISIBLE, '');
  if (stripped !== text) {
    flags.push('control_chars');
    text = stripped;
  }

  // ② XSS payloads embedded in content.
  for (const { pattern, replacement } of XSS_PATTERNS) {
    text = text.replace(pattern, () => {
      flags.push('latex_injection');
      return replacement;
    });
  }

  // ② Dangerous LaTeX commands.
  for (const { pattern, replacement } of LATEX_DANGEROUS) {
    text = text.replace(pattern, () => {
      flags.push('latex_injection');
      return replacement;
    });
  }

  // ① Blocklists — defang by removing the offending phrase, keep the rest so
  // pedagogical intent survives tuning review.
  for (const pattern of INSTRUCTION_LEAK_PATTERNS) {
    text = text.replace(pattern, () => {
      flags.push('instruction_leak');
      return '[filtered]';
    });
  }
  for (const pattern of JAILBREAK_PATTERNS) {
    text = text.replace(pattern, () => {
      flags.push('jailbreak_roleplay');
      return '[filtered]';
    });
  }

  // S7-T4 hardening pass — re-scan the legacy families against a unicode-
  // folded copy (homoglyph/accent immunity), then the novel bypass families.
  const folded = foldForDetection(text);
  if (!flags.includes('instruction_leak')) {
    for (const p of INSTRUCTION_LEAK_PATTERNS) {
      if (p.test(folded)) {
        flags.push('instruction_leak');
        break;
      }
    }
  }
  if (!flags.includes('jailbreak_roleplay')) {
    for (const p of JAILBREAK_PATTERNS) {
      if (p.test(folded)) {
        flags.push('jailbreak_roleplay');
        break;
      }
    }
  }
  if (SPACED_IGNORE.test(folded) && SPACED_TARGET.test(folded)) {
    flags.push('instruction_leak');
  }
  if (ROLE_PREFIX_OVERRIDE.test(folded)) {
    flags.push('instruction_leak');
  }
  for (const ml of MULTILINGUAL_LEAKS) {
    if (ml.test(folded)) {
      flags.push('instruction_leak');
      break;
    }
  }
  if (CHAT_TEMPLATE_TOKEN_PROBE.test(text)) {
    flags.push('instruction_leak');
    text = text.replace(CHAT_TEMPLATE_TOKENS_GLOBAL, '[filtered]');
  }

  return { clean: text, flags };
}
