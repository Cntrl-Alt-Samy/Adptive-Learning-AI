import Link from 'next/link';
import { redirect } from 'next/navigation';

import { verifySignedSession } from '@/lib/auth/session';

/**
 * S8B-T1/T6 — educator portal chrome. Server-side role gate (defense in
 * depth alongside middleware): non-instructors bounce to /today?denied.
 */

export default async function EducatorLayout({ children }: { children: React.ReactNode }) {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const token = store.get('learnos_session')?.value ?? null;
  const session = verifySignedSession(token);
  if (session === null || (session.role !== 'INSTRUCTOR' && session.role !== 'ADMIN')) {
    redirect('/today?denied=educator');
  }

  const tabs = [
    { href: '/educator', label: 'Roster' },
    { href: '/educator/library', label: 'Library' },
    { href: '/educator/misconceptions', label: 'Misconceptions' },
    { href: '/educator/locks', label: 'Topic locks' },
    { href: '/educator/transcripts', label: 'Transcripts' }
  ];

  return (
    <div className="material-sidebar min-h-dvh">
      <header className="material-chrome border-b border-separator px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-baseline justify-between gap-4">
          <div>
            <h1 className="text-title-1">Educator console</h1>
            <p className="text-caption-1 text-secondary-label">
              {session.displayName} · {session.role} · alias-only cohort data
            </p>
          </div>
          <Link href="/today" className="focus-halo rounded-control text-callout text-sys-blue hover:underline">
            Learner workspace →
          </Link>
        </div>
        <nav aria-label="Educator sections" className="mx-auto mt-3 flex max-w-4xl gap-2">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="focus-halo rounded-control border border-separator bg-text-background px-3 py-1.5 text-callout hover:bg-gray5"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-6">{children}</main>
    </div>
  );
}
