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
      <SessionProvider>
        <Shell mode="TUTOR" confirmedStep={3} latencyMs={800} minutesRemaining={20}>
          <h1>Today</h1>
          <p>Delivery content streams here.</p>
        </Shell>
      </SessionProvider>
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
});
