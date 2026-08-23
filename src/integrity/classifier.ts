/**
 * S2-T7 — Academic-integrity classifier (Doc 03 §9.2).
 * Rules-first; LLM fallback is a future adapter behind the same interface.
 */

export type IntentVerdict = 'LEARNING' | 'CHEATING' | 'AMBIGUOUS';

const CHEAT_PATTERNS: RegExp[] = [
  /\b(do|write|finish|complete)\s+(my|the)\s+(homework|assignment|essay|coursework|project)\b/i,
  /\b(answers?\s+(to|for))\s+(the\s+)?(exam|test|quiz|paper)\b/i,
  /\b(sit|take)\s+(the\s+)?(exam|test)\s+for\s+me\b/i,
  /\b(give|tell|send)\s+me\s+(the\s+)?(correct\s+)?(final\s+)?answer(s)?\s*(only|now|please)?\s*$/i,
  /\bsolve\s+(this|these|it)\s+for\s+me\b/i,
  /\bwrite\s+(my|a)\s+(personal\s+statement|ucas|cover\s+letter|cv)\b/i,
  /\bduring\s+(my\s+)?(exam|test)\b/i,
  /\bwithout\s+(showing|any)\s+work(ing)?s?\b/i
];

const LEARNING_SIGNALS: RegExp[] = [
  /\b(explain|help me understand|why does|how does|walk me through|what is|what's)\b/i,
  /\b(practice|drill|revise|revision|revising|understand)\b/i,
  /\b(step by step|hints?|scaffold|worked example)\b/i,
  /\bi('m| am)\s+(stuck|confused|struggling)\b/i
];

export const REFUSAL_SCAFFOLD_TEMPLATE =
  `I can't provide a direct solution for graded work — but I can absolutely help you **build it yourself**.

Let's scaffold it:
1. Restate what the task is asking in your own words.
2. Identify which concept/topic this maps to.
3. Work through ONE analogous example together.
4. You attempt the original; I'll check each stage.`;

export function classifyIntent(text: string): { verdict: IntentVerdict; reason: string } {
  const t = text ?? '';
  const cheatHit = CHEAT_PATTERNS.find((p) => p.test(t));
  if (cheatHit) {
    return { verdict: 'CHEATING', reason: `pattern:${cheatHit.source.slice(0, 40)}` };
  }
  const learningHit = LEARNING_SIGNALS.find((p) => p.test(t));
  if (learningHit) {
    return { verdict: 'LEARNING', reason: `signal:${learningHit.source.slice(0, 30)}` };
  }
  return { verdict: 'AMBIGUOUS', reason: 'no rule matched' };
}
