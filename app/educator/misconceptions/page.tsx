import { getMisconceptionMatrix } from '@/lib/server/educator-data';
import { MisconceptionHeatmap } from '@/components/educator/heatmap';

/**
 * S8B-T6 — misconception heatmap. Suppression (k ≥ 5) happens inside the
 * aggregation builder on the server; the client only renders results.
 */

export const dynamic = 'force-dynamic';

const CONCEPT_TITLES: Record<string, string> = {
  eco_scarcity_choice: 'Scarcity & choice',
  eco_ppf: 'Production possibility frontier',
  eco_demand_supply: 'Demand & supply',
  eco_elasticity: 'Elasticity',
  eco_market_failure: 'Market failure'
};

export default function MisconceptionsPage() {
  const matrix = getMisconceptionMatrix();
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-title-1">Misconception heatmap</h2>
        <p className="text-caption-1 text-secondary-label">
          Share of the cohort answering each core concept incorrectly. Cells under five learners are suppressed.
        </p>
      </header>
      <MisconceptionHeatmap matrix={matrix} titles={CONCEPT_TITLES} />
    </section>
  );
}
