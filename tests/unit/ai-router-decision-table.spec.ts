import { describe, it, expect } from 'vitest';
import { decideTier, resolveRoute, type AiMode } from '../../src/ai/router.js';

describe('router.decision-table gate', () => {
  const modes: AiMode[] = ['PROFILER', 'DIAGNOSTICIAN', 'TUTOR', 'SOCRATIC_COACH', 'ASSESSOR', 'SESSION_REVIEWER'];

  it('routes each mode per the Doc 03 §3 table', () => {
    expect(decideTier('TUTOR', 3).tier).toBe(1);
    expect(decideTier('DIAGNOSTICIAN').tier).toBe(2);
    expect(decideTier('SOCRATIC_COACH').tier).toBe(2);
    expect(decideTier('ASSESSOR').tier).toBe(2);
    expect(decideTier('PROFILER').tier).toBe(3);
    expect(decideTier('SESSION_REVIEWER').tier).toBe(3);
  });

  it('step-4 roadmap generation rides Tier 1 regardless of mode', () => {
    for (const m of modes) {
      expect(decideTier(m, 4).tier).toBe(1);
      expect(decideTier(m, 4).reason).toBe('STEP_4_ROADMAP_GENERATION');
    }
  });

  it('unknown/absent mode fails safe cheap at Tier 2', () => {
    for (const bad of [undefined, null, '', 'HALLUCINATED_MODE', 'tutor_typo']) {
      expect(decideTier(bad as string).tier).toBe(2);
      expect(decideTier(bad as string).reason).toBe('UNKNOWN_MODE_FAIL_SAFE');
    }
  });

  it('mode matching is case-insensitive', () => {
    expect(decideTier('tutor').tier).toBe(1);
    expect(decideTier('profiler').tier).toBe(3);
  });

  it('resolveRoute attaches concrete models + cache directives', () => {
    const t1 = resolveRoute('TUTOR', 3);
    expect(t1.primary.model).toBe('gpt-4o');
    expect(t1.fallback.provider).toBe('anthropic');
    expect(t1.cacheDirectives.prefixCaching).toBe(true);

    const t2 = resolveRoute('ASSESSOR', 7);
    expect(t2.primary.model).toBe('gpt-4o-mini');
    expect(t2.tier).toBe(2);
  });

  it('env-driven tier overrides swap models but keep tier semantics', () => {
    const r = resolveRoute('TUTOR', 3, {
      tierModels: { 1: { primary: { provider: 'openai', model: 'x-preview-f-free' } } }
    });
    expect(r.primary.model).toBe('x-preview-f-free');
    // fallback not overridden -> spec default retained
    expect(r.fallback.model).toBe('claude-3-5-sonnet-20241022');
    expect(r.tier).toBe(1);
  });

  it('decision function is total over the full matrix (no throw)', () => {
    for (let step = 0; step <= 10; step++) {
      for (const m of [...modes, undefined]) {
        const d = decideTier(m, step);
        expect([1, 2, 3]).toContain(d.tier);
        expect(d.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
