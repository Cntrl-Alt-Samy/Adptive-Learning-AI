import { createHash } from 'node:crypto';
import { mulberry32, hash32 } from './rng.js';

/**
 * S4-T6 — Tiered practice generator with 30-day uniqueness windows
 * (PRD F7.1–F7.2).
 *
 * Three tiers — RECALL / APPLICATION / SYNTHESIS — generated deterministically
 * from a seed. Uniqueness is enforced through a content-hash registry backed
 * by Redis (`SET NX EX` semantics): the same learner can never receive an
 * identical question hash within the rolling window. Every wrong answer must
 * carry a structured remediation payload ('Why' + concrete steps).
 */

export type PracticeTier = 'RECALL' | 'APPLICATION' | 'SYNTHESIS';

export interface PracticeQuestion {
  conceptId: string;
  tier: PracticeTier;
  prompt: string;
  /** sha256 of the canonicalised question content — the uniqueness key. */
  contentHash: string;
}

export interface RemediationPayload {
  conceptId: string;
  tier: PracticeTier;
  /** Structured 'Why' explaining the underlying error. */
  why: string;
  /** Ordered pedagogical remediation steps. */
  remediationSteps: string[];
}

/** Registry of recently served question hashes (rolling window). */
export interface UniquenessRegistry {
  has(hash: string): Promise<boolean>;
  add(hash: string, ttlSeconds: number): Promise<void>;
}

const TIERS: PracticeTier[] = ['RECALL', 'APPLICATION', 'SYNTHESIS'];

/** Canonicalise then hash question content so cosmetic drift cannot dodge the registry. */
export function hashQuestion(conceptId: string, tier: PracticeTier, prompt: string): string {
  const canonical = `${conceptId}|${tier}|${prompt.trim().replace(/\s+/g, ' ').toLowerCase()}`;
  return createHash('sha256').update(canonical).digest('hex');
}

interface Template {
  render(conceptId: string, r: () => number): string;
}

/** Deterministic template banks per tier; seeded slots guarantee variation. */
const TEMPLATES: Record<PracticeTier, Template[]> = {
  RECALL: [
    { render: (c, r) => `Define ${c} in one sentence, then name its key property ${pick(r, ['precisely', 'formally', 'informally'])}.` },
    { render: (c, r) => `State the canonical form of ${c} and list ${2 + Math.floor(r() * 3)} defining features.` },
    { render: (c) => `Which condition distinguishes ${c} from its nearest neighbour concept? Answer without notes.` }
  ],
  APPLICATION: [
    { render: (c, r) => `Apply ${c} to a fresh scenario: value n = ${3 + Math.floor(r() * 15)}. Show each step.` },
    { render: (c, r) => `A dataset of ${10 + Math.floor(r() * 90)} points violates one assumption of ${c}; identify it and fix the approach.` },
    { render: (c, r) => `Given x = ${2 + Math.floor(r() * 9)}, use ${c} to predict the outcome and justify the method choice.` }
  ],
  SYNTHESIS: [
    { render: (c, r) => `Combine ${c} with ${['rate of change', 'constraint satisfaction', 'proof by counterexample'][Math.floor(r() * 3)]} to solve a two-step novel problem.` },
    { render: (c) => `Construct your own exam-style question testing ${c}, then provide a full mark-scheme.` },
    { render: (c, r) => `Critique this flawed solution using ${c}: step 2 assumes ${['linearity', 'independence', 'monotonicity'][Math.floor(r() * 3)]}.` }
  ]
};

function pick(r: () => number, arr: readonly string[]): string {
  return arr[Math.floor(r() * arr.length)]!;
}

function makeCandidate(conceptId: string, tier: PracticeTier, seed: number): PracticeQuestion {
  const bank = TEMPLATES[tier];
  const r = mulberry32(seed);
  const prompt = bank[Math.floor(r() * bank.length)]!.render(conceptId, r);
  return { conceptId, tier, prompt, contentHash: hashQuestion(conceptId, tier, prompt) };
}

export interface UniqueGenerationOptions {
  conceptId: string;
  tiers?: PracticeTier[];
  count?: number;
  /** Rolling uniqueness window in seconds (default 30 days per F7.1). */
  windowSeconds?: number;
  maxCandidatesPerQuestion?: number;
}

/**
 * Generate `count` unique questions across the requested tiers. Throws when
 * the template space cannot satisfy the registry within the attempt budget —
 * a loud failure beats silent duplication.
 */
export async function generateUniqueQuestions(
  registry: UniquenessRegistry,
  opts: UniqueGenerationOptions,
  seed: number
): Promise<PracticeQuestion[]> {
  const count = opts.count ?? 1;
  const tiers = opts.tiers ?? TIERS;
  const window = opts.windowSeconds ?? 30 * 24 * 3600;
  const budget = opts.maxCandidatesPerQuestion ?? 32;

  const out: PracticeQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const tier = tiers[i % tiers.length]!;
    let placed = false;
    for (let attempt = 0; attempt < budget && !placed; attempt++) {
      const candidateSeed = (hash32(`${opts.conceptId}:${tier}`) ^ hash32(String(seed + i * 1000 + attempt))) >>> 0;
      const candidate = makeCandidate(opts.conceptId, tier, candidateSeed);
      if (out.some((q) => q.contentHash === candidate.contentHash)) continue;
      if (await registry.has(candidate.contentHash)) continue;
      await registry.add(candidate.contentHash, window);
      out.push(candidate);
      placed = true;
    }
    if (!placed) {
      throw new Error(`Uniqueness exhausted for ${opts.conceptId}/${tier} after ${budget} candidates`);
    }
  }
  return out;
}

/** Validate F7.2's structured-remediation contract for a wrong answer. */
export function validateRemediation(payload: RemediationPayload): void {
  if (!payload.why || payload.why.trim().length < 8) {
    throw new Error('Remediation requires a substantive Why');
  }
  if (!Array.isArray(payload.remediationSteps) || payload.remediationSteps.length < 1) {
    throw new Error('Remediation requires at least one step');
  }
}
