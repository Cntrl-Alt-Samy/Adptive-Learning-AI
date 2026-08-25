'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CommandPalette, PushButton } from '@/components/mac';
import { Sidebar } from './sidebar';
import { InspectorHud } from './inspector-hud';
import type { ConceptProgress } from '@/hooks/session-store';
import { useLedger } from '@/hooks/learner-store';
import type { AiModeName } from '@/src/state/transition-table.js';

interface ShellProps {
  children: React.ReactNode;
  mode: AiModeName;
  confirmedStep: number;
  latencyMs?: number | null;
  minutesRemaining?: number | null;
  roadmap?: Array<{ conceptId: string; title: string }>;
  progress?: ConceptProgress[];
  activeConceptId?: string | null;
}

/**
 * S8A-T4 — app shell: sidebar source-list · toolbar · inspector HUD.
 * Collapses ≤1024px (sidebar → drawer) per Doc 06 §12; ⌘K palette routes.
 */
export function Shell({
  children,
  mode,
  confirmedStep,
  latencyMs = null,
  minutesRemaining = null,
  roadmap = [],
  progress = [],
  activeConceptId = null
}: ShellProps) {
  const router = useRouter();
  const ledger = useLedger();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-dvh">
      <div className="material-sidebar hidden w-60 shrink-0 border-r border-separator lg:block">
        <Sidebar roadmap={roadmap} progress={progress} activeConceptId={activeConceptId} />
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Navigation drawer">
          <div
            className="absolute inset-0 bg-black/25"
            onPointerDown={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="material-sidebar absolute inset-y-0 left-0 w-64 border-r border-separator">
            <Sidebar roadmap={roadmap} progress={progress} activeConceptId={activeConceptId} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="material-chrome flex h-11 shrink-0 items-center justify-between border-b border-separator px-3">
          <div className="flex items-center gap-2">
            <PushButton variant="secondary" className="lg:hidden!" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
              ☰
            </PushButton>
            <span className="text-title-2">LearnOS</span>
          </div>
          <PushButton variant="secondary" aria-keyshortcuts="Meta+K" onClick={() => setPaletteOpen(true)}>
            ⌘K
          </PushButton>
        </header>

        <div className="flex min-h-0 flex-1">
          <main id="main" className="min-w-0 flex-1 overflow-y-auto bg-window p-4">
            {children}
          </main>
          <div className="hidden w-64 shrink-0 border-l border-separator xl:block">
            <InspectorHud
              mode={mode}
              confirmedStep={confirmedStep}
              latencyMs={latencyMs}
              minutesRemaining={minutesRemaining}
            />
          </div>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={[
          { id: 'nav-today', title: 'Go to Today', perform: () => router.push('/today') },
          { id: 'nav-plan', title: 'Go to Plan', perform: () => router.push('/plan') },
          { id: 'nav-review', title: 'Go to Review inbox', perform: () => router.push('/review') },
          { id: 'nav-badges', title: 'Go to Badges', perform: () => router.push('/badges') },
          { id: 'nav-privacy', title: 'Open Privacy Center', perform: () => router.push('/privacy') },
          { id: 'nav-settings', title: 'Go to Settings', perform: () => router.push('/settings') },
          ...(ledger.role === 'INSTRUCTOR' || ledger.role === 'ADMIN'
            ? [{ id: 'nav-educator', title: 'Open Educator console', perform: () => router.push('/educator') }]
            : []),
          {
            id: 'sign-out',
            title: 'Sign out',
            perform: () => {
              void fetch('/api/auth/session', { method: 'DELETE' }).finally(() => {
                router.push('/signin');
              });
            }
          }
        ]}
      />
    </div>
  );
}
