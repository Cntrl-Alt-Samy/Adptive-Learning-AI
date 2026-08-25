// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => '/educator/locks'
}));

import { MisconceptionHeatmap } from '@/components/educator/heatmap';
import { LocksPanel } from '@/components/educator/locks-panel';
import { TranscriptView } from '@/components/educator/transcript-view';

/**
 * S8B-T6 — educator surface gates: k-anonymity suppression rendering,
 * unlock-request POST affordance, and the honest raw/aggregates fallback.
 */

const TITLES = { eco_a: 'Alpha', eco_b: 'Beta', eco_thin: 'Thin' };

afterEach(cleanup);

describe('MisconceptionHeatmap', () => {
  it('renders cells plus the suppression aside for sub-floor concepts', () => {
    render(
      <MisconceptionHeatmap
        matrix={{
          cells: [{ conceptId: 'eco_a', failedPct: 66, learnerCount: 6 }],
          suppressedConceptIds: ['eco_thin']
        }}
        titles={TITLES}
      />
    );
    expect(screen.getByText('66% struggle · n=6')).toBeTruthy();
    expect(screen.getByText('k-anonymity suppression')).toBeTruthy();
    expect(screen.getByText(/fewer than five learners/)).toBeTruthy();
  });
});

describe('LocksPanel', () => {
  const matrix = { cells: [], suppressedConceptIds: [] };

  it('renders locked topics with a request-unlock button that POSTs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ request: { conceptId: 'eco_a', requestedBy: 'Sam', requestedAt: new Date().toISOString(), status: 'PENDING' } })
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <LocksPanel
        locks={[{ tenantId: 'demo', conceptId: 'eco_a', reason: 'Exam window' }]}
        requests={[]}
        matrix={matrix}
        titles={TITLES}
      />
    );
    expect(screen.getByText('Exam window')).toBeTruthy();
    const btn = screen.getByRole('button', { name: 'Request unlock for Alpha' }) as HTMLButtonElement;
    btn.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/educator/unlock-requests', expect.anything()));
    await vi.waitFor(() => expect(screen.getByText(/Requested ✓/)).toBeTruthy());
    vi.unstubAllGlobals();
  });

  it('shows an empty state when nothing is locked', () => {
    render(<LocksPanel locks={[]} requests={[]} matrix={matrix} titles={{}} />);
    expect(screen.getByText(/No topics are locked/)).toBeTruthy();
  });
});

describe('TranscriptView privacy fallback', () => {
  it('renders raw turns on ALLOW_RAW', () => {
    render(
      <TranscriptView
        result={{
          targetId: 'u1',
          decision: 'ALLOW_RAW',
          raw: { turns: [{ role: 'user', excerpt: 'Explain opportunity cost' }] }
        }}
        titles={TITLES}
      />
    );
    expect(screen.getByText(/Raw access granted/)).toBeTruthy();
    expect(screen.getByText(/Learner: Explain opportunity cost/)).toBeTruthy();
  });

  it('degrades to the aggregates card under DENY / aggregates-only', () => {
    render(
      <TranscriptView
        result={{ targetId: 'u1', decision: 'ALLOW_AGGREGATE_ONLY', aggregatesOnly: { rows: [{ conceptId: 'eco_a', failedPct: 50, learnerCount: 6 }] } }}
        titles={TITLES}
      />
    );
    expect(screen.getByText(/Transcript locked/)).toBeTruthy();
    expect(screen.getByText('cohort struggle 50% · n=6')).toBeTruthy();
  });
});
