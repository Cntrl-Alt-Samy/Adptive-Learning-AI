'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MasteryDot } from '@/components/mac';
import type { ConceptProgress } from '@/hooks/session-store';
import { IconToday, IconPlan, IconReview, IconBadges, IconPrivacy, IconSettings } from './nav-icons';

const NAV = [
  { href: '/today', label: 'Today', icon: IconToday },
  { href: '/plan', label: 'Plan', icon: IconPlan },
  { href: '/review', label: 'Review', icon: IconReview },
  { href: '/badges', label: 'Badges', icon: IconBadges },
  { href: '/privacy', label: 'Privacy', icon: IconPrivacy },
  { href: '/settings', label: 'Settings', icon: IconSettings }
] as const;

interface SidebarProps {
  roadmap: Array<{ conceptId: string; title: string }>;
  progress: ConceptProgress[];
  activeConceptId: string | null;
}

/** §4.5 iOS-style sidebar — rounded filled selection, SF-symbol strokes, inset-grouped canvas. */
export function Sidebar({ roadmap, progress, activeConceptId }: SidebarProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="flex h-full flex-col gap-5 overflow-y-auto px-3 pt-4 pb-3">
      <ul className="space-y-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`focus-halo flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[15px] font-medium transition-colors duration-100 ${
                  active
                    ? 'bg-sys-blue text-white shadow-sm'
                    : 'text-label hover:bg-gray5/60 active:bg-gray5 dark:hover:bg-gray4'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {roadmap.length > 0 && (
        <div>
          <p className="px-3 pb-1.5 text-caption-1 font-semibold uppercase tracking-wider text-tertiary-label">
            Roadmap
          </p>
          <ul className="space-y-0.5">
            {roadmap.map((c) => {
              const prog = progress.find((p) => p.conceptId === c.conceptId);
              return (
                <li
                  key={c.conceptId}
                  className={`flex items-center gap-2 rounded-[8px] px-3 py-2 text-callout ${
                    activeConceptId === c.conceptId
                      ? 'bg-gray5/80 font-medium text-label dark:bg-gray4'
                      : 'text-secondary-label hover:bg-gray5/40 dark:hover:bg-gray4'
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
