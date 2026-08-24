import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { scrubPii, containsPii, type PiiFindingType } from '../../src/privacy/pii-scrubber.js';

/**
 * pii.redteam.spec — Sprint 5 gate (S5-T1 / Doc 07 TASK 4.2.1).
 *
 * Checked-in adversarial corpus: 500+ synthetic PII variants across the four
 * families, including obfuscation styles ("name dot surname at"). Pass
 * conditions:
 *   - ≥99% recall over the corpus
 *   - zero subject-vocabulary false positives (allowlist dictionary active)
 *   - property test: output NEVER contains any corpus secret verbatim
 */

interface CorpusEntry {
  id: string;
  text: string;
  /** Verbatim secrets that must not survive scrubbing. */
  secrets: string[];
  family: PiiFindingType;
}

// Deterministic PRNG so the corpus is stable across runs.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260824);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

const FIRST_NAMES = ['Ava', 'Zara', 'Maya', 'James', 'Sam', 'Priya', 'Omar', 'Linda', 'Ben', 'Freya'] as const;
const LAST_NAMES = ['Patel', 'Jones', 'Smith', 'Okafor', 'Novak', 'Garcia', 'Chen', 'Ahmed'] as const;
const LOCALS = ['sam.smith', 'zara_p', 'james99', 'maya.jones', 'omar.a', 'priya12'] as const;
const DOMAINS = ['gmail.com', 'school.org', 'outlook.co.uk', 'mail.ac.uk', 'learnos.dev'] as const;
const PREFIXES = ['reach me at', 'email me:', 'contact:', 'my address is', 'send it to'] as const;

function buildCorpus(): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const add = (family: PiiFindingType, text: string, secrets: string[]): void => {
    entries.push({ id: `${family}-${entries.length}`, text, secrets, family });
  };

  // ---- EMAIL family (plain + obfuscated) ---------------------------------
  for (let i = 0; i < 100; i++) {
    const local = pick(LOCALS);
    const domain = pick(DOMAINS);
    const email = `${local}@${domain}`;
    add('EMAIL', `${pick(PREFIXES)} ${email}.`, [email]);
  }
  for (let i = 0; i < 80; i++) {
    const first = pick(FIRST_NAMES).toLowerCase();
    const last = pick(LAST_NAMES).toLowerCase();
    const domainWords = pick(['gmail dot com', 'school dot org', 'outlook dot co dot uk']);
    const style = i % 4;
    const phrase =
      style === 0
        ? `${first} dot ${last} at ${domainWords}`
        : style === 1
          ? `${first}[dot]${last}[at]${domainWords.replace(/ dot /g, '[dot]')}`
          : style === 2
            ? `${first}(dot)${last}(at)${domainWords.replace(/ dot /g, '(dot)')}`
            : `${first} DOT ${last} AT ${domainWords.toUpperCase()}`;
    add('EMAIL', `You can ping ${phrase} if stuck.`, [`${first}`, phrase, phrase.toLowerCase()]);
  }
  for (let i = 0; i < 60; i++) {
    const local = pick(LOCALS);
    const domain = pick(DOMAINS);
    const bracketed = `${local.replace(/[._]/g, (m) => (m === '.' ? '[dot]' : '_'))}@${domain}`;
    add('EMAIL', `Contact ${bracketed} tomorrow.`, [bracketed]);
  }

  // ---- PHONE family -------------------------------------------------------
  const ukIntl = ['+44 7700 900123', '+447700900123', '+44 7700 900123'.replace(' ', '-')];
  const ukMob = ['07700900123', '07700 900123'];
  const nanp = ['(555) 123-4567', '555-123-4567', '555.123.4567', '(555) 867-5309'];
  const generic = ['+34 912 345 678', '+1 415 555 2671', '+91 98765 43210'];
  for (const list of [ukIntl, ukMob, nanp, generic]) {
    for (const phone of list) {
      add('PHONE', `Text ${phone} before class.`, [phone]);
      add('PHONE', `Guardian number: ${phone}.`, [phone]);
      add('PHONE', `Emergency contact is ${phone}, ring anytime.`, [phone]);
    }
  }
  for (let i = 0; i < 24; i++) {
    const phone = pick([...ukIntl, ...ukMob, ...nanp, ...generic]);
    add('PHONE', `Ring ${phone} after 4pm please`, [phone]);
  }

  // ---- POSTCODE family ----------------------------------------------------
  const ukPostcodes = ['SW1A 1AA', 'M1 1AE', 'B33 8TH', 'EC1A 1BB', 'CR2 6XH', 'DN55 1PT', 'W1N 4DJ', 'EH12 9PB'];
  const zips = ['ZIP 94105', 'zip code 10001-2345', 'postal code 90210', 'postcode 20001'];
  for (const pc of ukPostcodes) {
    add('POSTCODE', `I live near ${pc}.`, [pc]);
    add('POSTCODE', `Ship to ${pc.replace(' ', '')}, thanks.`, [pc]);
    add('POSTCODE', `Our tutor covers the ${pc} district.`, [pc]);
  }
  for (const z of zips) {
    const digits = z.split(/\s/).slice(1).join(' ');
    add('POSTCODE', `My area: ${z}.`, [digits]);
  }
  for (let i = 0; i < 24; i++) {
    const pc = pick(ukPostcodes);
    add('POSTCODE', `The cohort meetup is somewhere around ${pc}.`, [pc]);
  }

  // ---- NAME family (cues, lexicon, signature lines) ------------------------
  for (let i = 0; i < 70; i++) {
    const name = pick([...FIRST_NAMES, ...LAST_NAMES.map((l) => `${pick(FIRST_NAMES)} ${l}`)]);
    const cueFn = pick([
      (n: string) => `my name is ${n}`,
      (n: string) => `call me ${n} please`,
      (n: string) => `i'm ${n} and I need help`,
      (n: string) => `name: ${n}`,
      (n: string) => `my mum ${n} signed the form`,
      (n: string) => `her name is ${n}`
    ]);
    const cue = cueFn(name);
    add('NAME', `${cue.charAt(0).toUpperCase()}${cue.slice(1)}.`, [name]);
  }
  for (let i = 0; i < 60; i++) {
    const name = pick(FIRST_NAMES);
    add('NAME', `Yesterday ${name} explained factoring to me.`, [name]);
  }
  for (let i = 0; i < 40; i++) {
    const full = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    add('NAME', `Great session today!\n--\n${full}`, [full]);
  }

  return entries;
}

const CORPUS = buildCorpus();

/** Subject vocabulary that must survive untouched (allowlist dictionary). */
const SUBJECT_VOCAB = [
  'newton', 'photosynthesis', 'chloroplast', 'mitochondria', 'quadratic',
  'factorising', 'trigonometry', 'pythagoras', 'electromagnetic', 'photosystem',
  'stoichiometry', 'macbeth', 'shakespeare'
] as const;
const SUBJECT_ALLOWLIST = new Set<string>(SUBJECT_VOCAB);

describe('pii.redteam.spec — S5-T1 gate', () => {
  it('corpus contains 500+ adversarial variants across all four families', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(500);
    for (const f of ['EMAIL', 'PHONE', 'POSTCODE', 'NAME'] as const) {
      expect(CORPUS.filter((e) => e.family === f).length, `family ${f}`).toBeGreaterThan(50);
    }
  });

  it('recall ≥ 99% over the checked-in corpus', () => {
    let caught = 0;
    const misses: string[] = [];
    for (const entry of CORPUS) {
      const { clean } = scrubPii(entry.text);
      const survived = entry.secrets.filter((s) => clean.includes(s));
      if (survived.length === 0) caught++;
      else misses.push(`${entry.id}: leaked ${survived.join(' | ')}`);
    }
    const recall = caught / CORPUS.length;
    expect(recall, `misses:\n${misses.join('\n')}`).toBeGreaterThanOrEqual(0.99);
  });

  it('zero false positives on subject vocabulary with allowlist active', () => {
    const sentences = [
      'Newton formalised calculus and optics.',
      'Photosynthesis occurs in the chloroplast.',
      'Factorising quadratic expressions needs practice.',
      'Pythagoras theorem relates side lengths.',
      'Macbeth is a Shakespeare tragedy about ambition.',
      'The mitochondria is the powerhouse of the cell.',
      'Stoichiometry problems balance chemical equations.',
      'Electromagnetic waves travel at light speed.'
    ];
    for (const s of sentences) {
      const { clean, findings } = scrubPii(s, { allowlist: SUBJECT_ALLOWLIST });
      expect(findings, s).toEqual([]);
      expect(clean, s).toBe(s);
    }
  });

  it('property: output never contains any corpus secret verbatim', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CORPUS), (entry) => {
        const { clean } = scrubPii(entry.text);
        return entry.secrets.every((s) => !clean.includes(s));
      })
    );
  });

  it('replacement tokens preserve message shape (spacing/punctuation)', () => {
    const { clean, findings } = scrubPii('Email sam.smith@gmail.com now!');
    expect(clean).toBe('Email [EMAIL] now!');
    expect(findings[0]).toMatchObject({ type: 'EMAIL', index: 6 });
  });

  it('overlap resolution: an email is never partially re-detected as a NAME', () => {
    const { clean } = scrubPii("my name is James and my email james.patel@gmail.com works");
    expect(clean).not.toContain('@');
    expect(clean).toContain('[EMAIL]');
  });

  it('allowlist vetoes lexicon collisions (subject term matching a first name)', () => {
    // "Sam" is in the first-name lexicon but also subject vocabulary here.
    const allowlist = new Set(['sam']);
    const { clean } = scrubPii('We asked Sam to define osmosis.', { allowlist });
    expect(clean).toBe('We asked Sam to define osmosis.');
    expect(containsPii('We asked Sam to define osmosis.', { allowlist })).toBe(false);
  });

  it('containsPii probe mirrors scrub findings', () => {
    expect(containsPii('plain sentence about algebra')).toBe(false);
    expect(containsPii('ring 07700 900123 today')).toBe(true);
  });

  it('sentence-initial capitals are not treated as names (precision guard)', () => {
    const { findings } = scrubPii('James Watt improved the steam engine. Photosynthesis matters.');
    // "James" IS a lexicon hit mid-text? It starts the sentence → skipped.
    expect(findings).toEqual([]);
  });
});
