'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MasteryDot } from '@/components/mac';
import type { ConceptProgress } from '@/hooks/session-store';

const NAV = [
  { href: '/today', label: 'Today', icon: '◉' },
  { href: '/plan', label: 'Plan', icon: '▤' },
  { href: '/review', label: 'Review', icon: '⟳', disabled: true },
  { href: '/badges', label: 'Badges', icon: '✦', disabled: true },
  { href: '/settings', label: 'Settings', icon: '⚙' }
] as const;

interface SidebarProps {
  roadmap: Array<{ conceptId: string; title: string }>;
  progress: ConceptProgress[];
  activeConceptId: string | null;
}

/** §4.5 source-list sidebar — nav + roadmap nodes with mastery dots.
 *  Review/Badges render disabled ("Coming in 8b") until that sprint mounts them. */
export function Sidebar({ roadmap, progress, activeConceptId }: SidebarProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <ul className="space-y-0.5">
        {NAV.map((item) =>
          'disabled' in item && item.disabled === true ? (
            <li key={item.href}>
              <span
                aria-disabled
                aria-label={`${item.label} — coming in Sprint 8b`}
                className="flex cursor-not-allowed items-center gap-2 rounded-control px-2 py-1 text-headline text-tertiary-label"
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </span>
            </li>
          ) : (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                className={`focus-halo flex items-center gap-2 rounded-control px-2 py-1 text-headline ${
                  pathname === item.href ? 'bg-sys-blue/15 text-label' : 'text-secondary-label hover:bg-gray5'
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          )
        )}
      </ul>

      {roadmap.length > 0 && (
        <div>
          <p className="px-2 pb-1 text-caption-1 font-semibold uppercase tracking-wide text-tertiary-label">
            Roadmap
          </p>
          <ul className="space-y-0.5">
            {roadmap.map((c) => {
              const prog = progress.find((p) => p.conceptId === c.conceptId);
              return (
                <li
                  key={c.conceptId}
                  className={`flex items-center gap-2 rounded-control px-2 py-1 text-callout ${
                    activeConceptId === c.conceptId ? 'bg-gray5 text-label' : 'text-secondary-label'
                  }`}
                >
                  <MasteryDot score={prog?.masteryScore ?? 0} />
                  <span className="truncate" title={c.title}>
                    {c.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}
