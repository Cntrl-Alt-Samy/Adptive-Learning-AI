import { getLocks, getMisconceptionMatrix } from '@/lib/server/educator-data';
import { LocksPanel } from '@/components/educator/locks-panel';

/**
 * S8B-T6 — syllabus topic locks with unlock requests (server data →
 * client affordance).
 */

export const dynamic = 'force-dynamic';

const CONCEPT_TITLES: Record<string, string> = {
  eco_scarcity_choice: 'Scarcity & choice',
  eco_ppf: 'Production possibility frontier',
  eco_demand_supply: 'Demand & supply',
  eco_elasticity: 'Elasticity',
  eco_market_failure: 'Market failure'
};

export default function LocksPage() {
  const { locked, requests } = getLocks();
  const matrix = getMisconceptionMatrix();
  const locks = locked.map((conceptId) => ({
    tenantId: 'demo',
    conceptId,
    reason:
      conceptId === 'eco_market_failure'
        ? 'Held back until the mock exam window closes.'
        : 'Locked by your department.'
  }));
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-title-1">Topic locks</h2>
        <p className="text-caption-1 text-secondary-label">
          Locked topics stay out of learner roadmaps until you unlock them. Requests are logged below.
        </p>
      </header>
      <LocksPanel locks={locks} requests={requests} matrix={matrix} titles={CONCEPT_TITLES} />
    </section>
  );
}
