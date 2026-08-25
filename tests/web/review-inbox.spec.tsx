// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewInbox, bucketReviews } from '@/components/pedagogy/review-inbox';
import type { ScheduledReviewItem } from '@/hooks/learner-store';

/**
 * S8B-T2 — review inbox gate: bucket mirroring of REVIEW_OFFSET_HOURS,
 * overdue surfacing, empty state and the portable prompt copy affordance.
 */

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

const items: ScheduledReviewItem[] = [
  { conceptId: 'a', subjectId: 's', offsetHours: 24, dueAtMs: NOW - HOUR },
  { conceptId: 'b', subjectId: 's', offsetHours: 72, dueAtMs: NOW + 10 * HOUR },
  { conceptId: 'c', subjectId: 's', offsetHours: 168, dueAtMs: NOW + 20 * HOUR }
];

afterEach(cleanup);

describe('bucketReviews', () => {
  it('mirrors REVIEW_OFFSET_HOURS order and separates overdue', () => {
    const { overdue, buckets } = bucketReviews(items, NOW);
    expect(overdue.map((r) => r.conceptId)).toEqual(['a']);
    expect(buckets.map((b) => [b.offsetHours, b.items.length])).toEqual([
      [72, 1],
      [168, 1]
    ]);
  });
});

describe('ReviewInbox component', () => {
  it('renders the empty state with no reviews', () => {
    render(<ReviewInbox reviews={[]} matrix={null} sessionSubject="Economics" titles={{}} />);
    expect(screen.getByText('Nothing due')).toBeTruthy();
  });

  it('surfaces overdue items and due-in buckets', () => {
    render(<ReviewInbox reviews={items} matrix={null} sessionSubject="Economics" titles={{ a: 'Alpha' }} nowMs={NOW} />);
    expect(screen.getByText(/Overdue · 1/)).toBeTruthy();
    expect(screen.getByText(/was due 24h/)).toBeTruthy();
    expect(screen.getByText('Due in 3d')).toBeTruthy();
    expect(screen.getByText('Due in 7d')).toBeTruthy();
  });

  it('shows the portable resume prompt when a matrix is provided and copy works', async () => {
    const matrix = {
      rows: [{ conceptId: 'a', preScore: 30, postScore: 40, delta: 10, knowledgeGainPct: 33, title: 'Alpha' }],
      aggregate: { preScore: 30, postScore: 40, knowledgeGainPct: 33 }
    };
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    render(<ReviewInbox reviews={items} matrix={matrix} sessionSubject="Economics" titles={{}} nowMs={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(write).toHaveBeenCalled());
    expect(write.mock.calls[0]?.[0]).toContain('- Re-practice');
  });
});
