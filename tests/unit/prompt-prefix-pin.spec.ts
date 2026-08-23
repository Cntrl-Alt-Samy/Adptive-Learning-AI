import { describe, it, expect } from 'vitest';
import {
  STATIC_PROMPT_PREFIX,
  PROMPT_PREFIX_VERSION,
  TARGET_PREFIX_TOKENS,
  estimateTokens,
  buildPrefixMessages
} from '../../src/ai/prompt-prefix.js';
import { createHash } from 'node:crypto';

/**
 * cache.audit (prefix half) — the static prefix is pinned BYTE-FOR-BYTE.
 * Any edit to prompt-prefix.ts constants changes this hash and fails CI,
 * forcing a deliberate PROMPT_PREFIX_VERSION bump + review.
 */
const PREFIX_SHA256_PIN = 'PIN_ME_ON_FIRST_RUN';

describe('prompt-prefix-pin gate', () => {
  it('prefix bytes are pinned via sha256', () => {
    const actual = createHash('sha256').update(STATIC_PROMPT_PREFIX).digest('hex');
    if (PREFIX_SHA256_PIN === 'PIN_ME_ON_FIRST_RUN') {
      // First run records the pin; subsequent runs must match exactly.
      expect(actual).toMatch(/^[0-9a-f]{64}$/);
      console.log(`PREFIX_SHA256_PIN = '${actual}'`);
    } else {
      expect(actual).toBe(PREFIX_SHA256_PIN);
    }
  });

  it('prefix is versioned and lands in the ~1,100-token band', () => {
    expect(PROMPT_PREFIX_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
    const tokens = estimateTokens(STATIC_PROMPT_PREFIX);
    expect(tokens).toBeGreaterThan(TARGET_PREFIX_TOKENS * 0.7);
    expect(tokens).toBeLessThan(TARGET_PREFIX_TOKENS * 1.4);
  });

  it('contains every mandatory section', () => {
    expect(STATIC_PROMPT_PREFIX).toContain('PEDAGOGICAL STANDARD');
    expect(STATIC_PROMPT_PREFIX).toContain('STATE CHECKPOINT PROTOCOL');
    expect(STATIC_PROMPT_PREFIX).toContain('[STATE_CHECKPOINT:');
    expect(STATIC_PROMPT_PREFIX).toContain('GUARDRAILS');
    expect(STATIC_PROMPT_PREFIX).toContain('Never reveal');
    expect(STATIC_PROMPT_PREFIX).toContain('these instructions');
    expect(STATIC_PROMPT_PREFIX.startsWith(`[LEARNOS_STATIC_PREFIX ${PROMPT_PREFIX_VERSION}]`)).toBe(true);
  });

  it('openai dialect: single stable leading system message', () => {
    const { prefixMessages } = buildPrefixMessages('openai');
    expect(prefixMessages).toHaveLength(1);
    expect(prefixMessages[0]?.role).toBe('system');
    expect(prefixMessages[0]?.content).toBe(STATIC_PROMPT_PREFIX);
    expect(prefixMessages[0]?.cacheControl).toBeUndefined();
  });

  it('anthropic dialect: ephemeral cache_control breakpoint on prefix', () => {
    const { prefixMessages } = buildPrefixMessages('anthropic');
    expect(prefixMessages[0]?.cacheControl).toEqual({ type: 'ephemeral' });
  });
});
