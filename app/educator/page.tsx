import { getRoster } from '@/lib/server/educator-data';

/**
 * S8B-T6 — alias-only roster. Server component; the aggregation service
 * strips identity before rows ever leave the server module.
 */

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  SOLID: 'Solid',
  PARTIAL: 'Partial',
  NEEDS_WORK: 'Needs support'
};

export default function EducatorRosterPage() {
  const roster = getRoster();
  return (
    <section aria-label="Cohort roster" className="space-y-3">
      <h2 className="text-title-1">Roster · {roster.length} learners</h2>
      <p className="text-caption-1 text-secondary-label">
        Identities are aliased by design — you see mastery signals, not names.
      </p>
      <ul className="space-y-2">
        {roster.map((row) => (
          <li key={row.alias} className="flex items-center justify-between gap-3 rounded-card border border-separator bg-text-background px-4 py-3">
            <span className="font-mono text-body">{row.alias}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-caption-1 ${
                row.overallStatus === 'NEEDS_WORK'
                  ? 'bg-sys-orange/15 text-sys-orange'
                  : row.overallStatus === 'SOLID'
                    ? 'bg-sys-green/15 text-sys-green'
                    : 'bg-gray5 text-secondary-label'
              }`}
            >
              {STATUS_LABEL[row.overallStatus] ?? row.overallStatus}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
