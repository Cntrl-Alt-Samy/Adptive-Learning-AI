import { describe, it, expect } from 'vitest';
import {
  generateUniqueQuestions,
  hashQuestion,
  validateRemediation,
  type UniquenessRegistry
} from '../../src/pedagogy/practice.js';

/**
 * practice.generator.spec — S4-T6 unit gate (Redis-backed uniqueness window
 * lives in the integration suite).
 */

function memoryRegistry(): UniquenessRegistry & { hashes: Set<string> } {
  const hashes = new Set<string>();
  return {
    hashes,
    async has(h) {
      return hashes.has(h);
    },
    async add(h) {
      hashes.add(h);
    }
  };
}

describe('tiered practice generator', () => {
  it('produces deterministic output for a fixed seed', async () => {
    const a = await generateUniqueQuestions(memoryRegistry(), { conceptId: 'c1', count: 2 }, 1234);
    const b = await generateUniqueQuestions(memoryRegistry(), { conceptId: 'c1', count: 2 }, 1234);
    expect(a.map((q) => q.prompt)).toEqual(b.map((q) => q.prompt));
  });

  it('round-robins tiers and never repeats a hash within one call', async () => {
    const out = await generateUniqueQuestions(memoryRegistry(), { conceptId: 'c2', count: 3 }, 7);
    const hashes = new Set(out.map((q) => q.contentHash));
    expect(hashes.size).toBe(out.length);
    expect(out.map((q) => q.tier)).toEqual(['RECALL', 'APPLICATION', 'SYNTHESIS']);
  });

  it('refuses candidates already present in the rolling-window registry', async () => {
    const reg = memoryRegistry();
    const [first] = await generateUniqueQuestions(reg, { conceptId: 'c3' }, 5);
    // Re-seed identical generation against the same registry → must not
    // return the same hash; engine keeps searching or throws.
    await expect(generateUniqueQuestions(reg, { conceptId: 'c3', maxCandidatesPerQuestion: 1 }, 5)).rejects.toThrow(
      /uniqueness exhausted/i
    );
    void first;
  });

  it('hashes are insensitive to cosmetic drift but sensitive to content', () => {
    const base = hashQuestion('c4', 'RECALL', 'Define   c4 precisely.');
    expect(hashQuestion('c4', 'RECALL', 'define c4 PRECISELY.')).toBe(base); // whitespace/case fold
    expect(hashQuestion('c5', 'RECALL', 'Define c4 precisely.')).not.toBe(base); // concept differs
    expect(hashQuestion('c4', 'APPLICATION', 'Define c4 precisely.')).not.toBe(base); // tier differs
  });
});

describe('remediation contract (F7.2)', () => {
  it('requires a substantive Why and ≥1 step', () => {
    expect(() =>
      validateRemediation({ conceptId: 'x', tier: 'RECALL', why: 'short', remediationSteps: ['step'] })
    ).toThrow(/substantive/i);
    expect(() =>
      validateRemediation({ conceptId: 'x', tier: 'RECALL', why: 'confused coefficient sign rules', remediationSteps: [] })
    ).toThrow(/at least one/i);
    expect(() =>
      validateRemediation({
        conceptId: 'x',
        tier: 'RECALL',
        why: 'sign flipped when factoring negative leading term',
        remediationSteps: ['re-expand to check', 'factor out -1 first']
      })
    ).not.toThrow();
  });
});
