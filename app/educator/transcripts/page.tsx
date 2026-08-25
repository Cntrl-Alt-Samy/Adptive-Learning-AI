import { requestTranscript } from '@/lib/server/educator-data';
import { verifySignedSession } from '@/lib/auth/session';
import { TranscriptView } from '@/components/educator/transcript-view';

/**
 * S8B-T6 — transcript access. The precedence decision runs server-side
 * (resolveTranscriptAccess → requireRawTranscript); the page renders raw
 * turns or the aggregates-only fallback honestly.
 */

export const dynamic = 'force-dynamic';

const CONCEPT_TITLES: Record<string, string> = {
  eco_scarcity_choice: 'Scarcity & choice',
  eco_ppf: 'Production possibility frontier',
  eco_demand_supply: 'Demand & supply',
  eco_elasticity: 'Elasticity',
  eco_market_failure: 'Market failure'
};

const LEARNERS = [
  { id: 'demo:amara', label: 'learner-7…' },
  { id: 'demo:bilal', label: 'learner-3…' },
  { id: 'demo:dee', label: 'learner-5…' }
];

export default async function TranscriptsPage({
  searchParams
}: {
  searchParams: Promise<{ target?: string }>;
}) {
  const params = await searchParams;
  const target = typeof params.target === 'string' && params.target.length > 0 ? params.target : null;

  const { cookies } = await import('next/headers');
  const store = await cookies();
  const session = verifySignedSession(store.get('learnos_session')?.value ?? null);

  let result = null;
  if (target !== null && session !== null) {
    try {
      result = requestTranscript(
        { userId: session.userId, tenantId: session.tenantId, role: session.role },
        target
      );
    } catch {
      result = { targetId: target, decision: 'DENY' as const, raw: undefined, aggregatesOnly: undefined };
    }
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-title-1">Transcripts</h2>
        <p className="text-caption-1 text-secondary-label">
          Raw dialogue only where learner consent allows; everyone else sees aggregates.
        </p>
      </header>

      <nav aria-label="Pick a learner" className="flex flex-wrap gap-2">
        {LEARNERS.map((l) => (
          <a
            key={l.id}
            href={`/educator/transcripts?target=${encodeURIComponent(l.id)}`}
            className={`focus-halo rounded-control border px-3 py-1.5 font-mono text-callout ${
              target === l.id ? 'border-sys-blue bg-sys-blue/10 text-label' : 'border-separator bg-text-background text-secondary-label hover:bg-gray5'
            }`}
          >
            {l.label}
          </a>
        ))}
      </nav>

      {result === null ? (
        <p className="rounded-card border border-separator p-4 text-callout text-secondary-label">
          Select a learner to view their transcript status.
        </p>
      ) : (
        <TranscriptView result={result} titles={CONCEPT_TITLES} />
      )}
    </section>
  );
}
