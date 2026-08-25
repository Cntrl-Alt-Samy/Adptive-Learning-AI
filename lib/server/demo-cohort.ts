import type { AttemptRecord } from '@/src/educator/aggregation.js';
import type { TargetUser } from '@/src/access/precedence.js';

/**
 * S8B-T6 — in-memory demo cohort for the educator portal. Server-only
 * module (never imported client-side). Cells are crafted so some concepts
 * sit above the k=5 anonymity floor and others below it, exercising
 * suppression end-to-end.
 */

export const DEMO_TENANT = 'demo';

export interface DemoLearner extends TargetUser {
  aliasSeed: string;
  displayName: string;
  overallStatus: 'NEEDS_WORK' | 'PARTIAL' | 'SOLID';
}

export const DEMO_LEARNERS: DemoLearner[] = [
  { userId: 'demo:amara', tenantId: DEMO_TENANT, isMinor: false, parentalConsentVerified: false, aliasSeed: 'amara#7', displayName: 'Amara', overallStatus: 'SOLID' },
  { userId: 'demo:bilal', tenantId: DEMO_TENANT, isMinor: true, parentalConsentVerified: true, aliasSeed: 'bilal#3', displayName: 'Bilal', overallStatus: 'PARTIAL' },
  { userId: 'demo:chao', tenantId: DEMO_TENANT, isMinor: false, parentalConsentVerified: false, aliasSeed: 'chao#11', displayName: 'Chao', overallStatus: 'PARTIAL' },
  { userId: 'demo:dee', tenantId: DEMO_TENANT, isMinor: true, parentalConsentVerified: false, aliasSeed: 'dee#5', displayName: 'Dee', overallStatus: 'NEEDS_WORK' },
  { userId: 'demo:elif', tenantId: DEMO_TENANT, isMinor: false, parentalConsentVerified: false, aliasSeed: 'elif#9', displayName: 'Elif', overallStatus: 'SOLID' },
  { userId: 'demo:farid', tenantId: DEMO_TENANT, isMinor: false, parentalConsentVerified: false, aliasSeed: 'farid#2', displayName: 'Farid', overallStatus: 'PARTIAL' }
];

const CORE_CONCEPTS = ['eco_scarcity_choice', 'eco_ppf', 'eco_demand_supply'] as const;
const THIN_CONCEPTS = ['eco_elasticity', 'eco_market_failure'] as const;

/** Latest attempt per learner per concept; wrong-biased on purpose. */
const ATTEMPT_PLAN: Record<string, boolean> = {
  'demo:amara': true,
  'demo:bilal': false,
  'demo:chao': true,
  'demo:dee': false,
  'demo:elif': true,
  'demo:farid': false
};

function buildAttempts(): AttemptRecord[] {
  const out: AttemptRecord[] = [];
  // Full-cohort concepts → 6 distinct learners ≥ floor of 5.
  for (const conceptId of CORE_CONCEPTS) {
    for (const l of DEMO_LEARNERS) {
      out.push({ userId: l.userId, conceptId, correct: ATTEMPT_PLAN[l.userId] ?? false });
    }
  }
  // Thin concepts → only 4 learners attempt them (< floor ⇒ suppressed).
  const thinCohort = DEMO_LEARNERS.slice(0, 4);
  for (const conceptId of THIN_CONCEPTS) {
    for (const l of thinCohort) {
      out.push({ userId: l.userId, conceptId, correct: l.overallStatus === 'SOLID' });
    }
  }
  return out;
}

export const DEMO_ATTEMPTS: AttemptRecord[] = buildAttempts();
