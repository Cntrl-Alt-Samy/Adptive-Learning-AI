/**
 * S1-T3 — Asymmetric model router (Doc 03 §3).
 *
 * Pure decision table. No I/O; the API layer feeds it mode/step and receives
 * a tier with concrete provider models plus cache directives.
 *
 * Routing contract:
 *   Mode 3 (Tutor) or Step 4 (roadmap generation)  → TIER 1 heavy reasoning
 *   Modes 2/4/5 (CAT, Socratic, grading)           → TIER 2 fast reasoning
 *   Modes 1/6 (intake parsing, review formatting)  → TIER 3 cheap extraction
 *   Unknown mode/step                              → TIER 2 (fail-safe cheap)
 */

export type AiMode =
  | 'PROFILER'
  | 'DIAGNOSTICIAN'
  | 'TUTOR'
  | 'SOCRATIC_COACH'
  | 'ASSESSOR'
  | 'SESSION_REVIEWER';

export type ModelTier = 1 | 2 | 3;
export type Provider = 'openai' | 'anthropic';

export interface TierModelConfig {
  primary: { provider: Provider; model: string };
  fallback: { provider: Provider; model: string };
}

export interface RouteDecision {
  tier: ModelTier;
  reason: string;
}

export interface ResolvedRoute extends RouteDecision {
  primary: TierModelConfig['primary'];
  fallback: TierModelConfig['fallback'];
  cacheDirectives: {
    /** Static prompt-prefix caching applies to this route. */
    prefixCaching: boolean;
    /** Anthropic dialect requires explicit cache_control breakpoints. */
    anthropicCacheControl: boolean;
    /** OpenAI dialect benefits from stable leading system message. */
    openaiStablePrefix: boolean;
  };
}

/** Exhaustive decision table: (mode, step) -> tier. Unknown ⇒ 2. */
export function decideTier(mode: AiMode | string | undefined | null, step?: number): RouteDecision {
  // Step 4 roadmap generation rides Tier 1 regardless of mode.
  if (step === 4) return { tier: 1, reason: 'STEP_4_ROADMAP_GENERATION' };

  const normalized = typeof mode === 'string' ? mode.toUpperCase() : '';
  switch (normalized) {
    case 'TUTOR':
      return { tier: 1, reason: 'MODE_3_CONCEPT_DELIVERY' };
    case 'SOCRATIC_COACH':
    case 'DIAGNOSTICIAN':
    case 'ASSESSOR':
      return { tier: 2, reason: `MODE_${normalized}_FAST_REASONING` };
    case 'PROFILER':
    case 'SESSION_REVIEWER':
      return { tier: 3, reason: `MODE_${normalized}_STRUCTURED_EXTRACTION` };
    default:
      // Fail-safe: default cheap-but-capable.
      return { tier: 2, reason: 'UNKNOWN_MODE_FAIL_SAFE' };
  }
}

const DEFAULT_TIER_MODELS: Record<ModelTier, TierModelConfig> = {
  1: {
    primary: { provider: 'openai', model: 'gpt-4o' },
    fallback: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' }
  },
  2: {
    primary: { provider: 'openai', model: 'gpt-4o-mini' },
    fallback: { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' }
  },
  3: {
    primary: { provider: 'openai', model: 'gpt-4o-mini' },
    fallback: { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' }
  }
};

export interface RouterOptions {
  /** Env-driven overrides, e.g. free-model gateways for local dev. */
  tierModels?: Partial<Record<ModelTier, Partial<TierModelConfig>>>;
}

export function resolveRoute(
  mode: AiMode | string | undefined | null,
  step: number | undefined,
  options: RouterOptions = {}
): ResolvedRoute {
  const decision = decideTier(mode, step);
  const defaults = DEFAULT_TIER_MODELS[decision.tier];
  const overrides = options.tierModels?.[decision.tier] ?? {};

  const primary = overrides.primary ?? defaults.primary;
  const fallback = overrides.fallback ?? defaults.fallback;

  return {
    ...decision,
    primary,
    fallback,
    cacheDirectives: {
      prefixCaching: true,
      anthropicCacheControl: primary.provider === 'anthropic',
      openaiStablePrefix: primary.provider === 'openai'
    }
  };
}
