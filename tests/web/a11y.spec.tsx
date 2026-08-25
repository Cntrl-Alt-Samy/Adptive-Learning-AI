// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import 'axe-core';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => '/today'
}));

import { Shell } from '@/components/workspace/shell';
import { Sidebar } from '@/components/workspace/sidebar';
import { InspectorHud } from '@/components/workspace/inspector-hud';
import { SessionProvider } from '@/hooks/session-store';
import { LearnerLedgerProvider } from '@/hooks/learner-store';
import { ReviewInbox } from '@/components/pedagogy/review-inbox';
import { MisconceptionHeatmap } from '@/components/educator/heatmap';

function WithLedger({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <SessionProvider>
      <LearnerLedgerProvider>{children}</LearnerLedgerProvider>
    </SessionProvider>
  );
}

/**
 * S8A-T8 a11y.audit — axe-core over the mounted workspace shell, sidebar,
 * and inspector HUD. Pass condition (Sprint 8a §6): zero critical violations.
 */

interface AxeResults {
  violations: Array<{ id: string; impact: string | null; nodes: unknown[] }>;
}

const axe = (globalThis as unknown as { axe?: { run: (el: HTMLElement, o?: Record<string, unknown>) => Promise<AxeResults> } }).axe;

async function auditCritical(el: HTMLElement): Promise<string[]> {
  if (axe === undefined) throw new Error('axe-core failed to attach to globalThis');
  const results = await axe.run(el, { resultTypes: ['violations'] });
  return results.violations.filter((v) => v.impact === 'critical').map((v) => `${v.id} (${v.nodes.length} nodes)`);
}

afterEach(cleanup);

describe('a11y.audit (zero critical)', () => {
  it('workspace shell with learner content', async () => {
    const { baseElement } = render(
      <WithLedger>
        <Shell mode="TUTOR" confirmedStep={3} latencyMs={800} minutesRemaining={20}>
          <h1>Today</h1>
          <p>Delivery content streams here.</p>
        </Shell>
      </WithLedger>
    );
    expect(await auditCritical(baseElement)).toEqual([]);
  });

  it('sidebar source-list and inspector HUD', async () => {
    const { baseElement } = render(
      <SessionProvider>
        <Sidebar
          roadmap={[
            { conceptId: 'eco_scarcity_choice', title: 'Scarcity & choice' },
            { conceptId: 'eco_ppf', title: 'Production possibility frontier' }
          ]}
          progress={[{ conceptId: 'eco_scarcity_choice', title: 'Scarcity & choice', masteryScore: 80, strikes: 0 }]}
          activeConceptId="eco_scarcity_choice"
        />
        <InspectorHud mode="SOCRATIC_COACH" confirmedStep={5} latencyMs={1400} minutesRemaining={12} />
      </SessionProvider>
    );
    expect(await auditCritical(baseElement)).toEqual([]);
  });

  it('Sprint 8b — review inbox, badge shelf, privacy center, heatmap', async () => {
    const { BadgeShelf } = await import('@/components/badges/badge-shelf');
    const { PrivacyCenter } = await import('@/components/privacy/privacy-center');
    const { baseElement } = render(
      <WithLedger>
        <ReviewInbox reviews={[]} matrix={null} sessionSubject="Economics" titles={{}} />
        <BadgeShelf />
        <PrivacyCenter />
        <MisconceptionHeatmap
          matrix={{ cells: [{ conceptId: 'eco_a', failedPct: 50, learnerCount: 6 }], suppressedConceptIds: [] }}
          titles={{ eco_a: 'Alpha' }}
        />
      </WithLedger>
    );
    expect(await auditCritical(baseElement)).toEqual([]);
  });
});
