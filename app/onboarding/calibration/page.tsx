'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ProgressDots, PushButton } from '@/components/mac';
import { api } from '@/lib/api';
import { useSession } from '@/hooks/session-store';
import { CatEngine } from '@/src/pedagogy/cat.js';
import type { CatItem, CatResult } from '@/src/pedagogy/cat.js';

const LEVEL_LABEL: Record<CatResult['calibratedLevel'], string> = {
  confirmed_beginner: 'Confirmed beginner',
  low_intermediate: 'Low intermediate',
  high_intermediate: 'High intermediate',
  near_advanced: 'Near advanced'
};

function probeStatement(conceptTitle: string, difficulty: number): string {
  if (difficulty < 4) return `I can explain the basics of “${conceptTitle}” in my own words.`;
  if (difficulty < 7) return `I can apply “${conceptTitle}” to an unfamiliar problem without hints.`;
  return `I can tackle exam-level extensions of “${conceptTitle}” under time pressure.`;
}

/**
 * S8A-T6 (F2.2/F2.3) — silent adaptive calibration. The S4 CatEngine picks
 * the next probe; no verdict language appears until diagnose() runs.
 */
export default function CalibrationPage() {
  const router = useRouter();
  const session = useSession();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ item: CatItem; statement: string } | null>(null);
  const [askedCount, setAskedCount] = useState(0);
  const [result, setResult] = useState<CatResult | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [buildingPlan, setBuildingPlan] = useState(false);
  const engineRef = useRef<CatEngine | null>(null);
  const titlesRef = useRef<Record<string, string>>({});
  const startedRef = useRef(false);

  const persona = session.persona;

  function advance(): void {
    const engine = engineRef.current;
    if (engine === null) return;
    const item = engine.selectNext();
    if (item === null) {
      setResult(engine.diagnose());
      return;
    }
    const title = titlesRef.current[item.conceptId] ?? item.conceptId;
    setCurrent({ item, statement: probeStatement(title, item.difficulty) });
  }

  useEffect(() => {
    if (persona === null) router.replace('/onboarding');
  }, [persona, router]);

  useEffect(() => {
    if (persona === null || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      try {
        const bank = await api.catBank(persona.subjectId);
        titlesRef.current = bank.conceptTitles;
        setTitles(bank.conceptTitles);
        engineRef.current = new CatEngine(bank.items, { seed: hashSeed(persona.subjectId) });
        advance();
      } catch {
        setError('Could not load the calibration bank.');
      }
    })();
  }, [persona]);

  function answer(canDo: boolean): void {
    const engine = engineRef.current;
    if (engine === null || current === null) return;
    engine.recordResponse(current.item.itemId, canDo);
    setAskedCount(engine.administered);
    advance();
  }

  const startLearning = useCallback(async () => {
    if (result === null || persona === null) return;
    setBuildingPlan(true);
    session.setCatResult(result);
    try {
      const plan = await api.plan(persona.subjectId, persona.timeMinutes);
      session.setPlan(plan);
      router.push('/today');
    } catch {
      setError('Roadmap generation failed. Go back and retry.');
      setBuildingPlan(false);
    }
  }, [result, persona, session, router]);

  if (error !== null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center text-center">
        <p className="text-body text-sys-red">{error}</p>
      </main>
    );
  }

  if (result !== null && persona !== null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center">
        <h1 className="text-large-title">You’re calibrated</h1>
        <p className="mt-1 text-body text-secondary-label">
          Level: <strong>{LEVEL_LABEL[result.calibratedLevel]}</strong> · {result.itemsAdministered} probes · ±
          {result.standardError.toFixed(2)} SE
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-caption-1 uppercase tracking-wide text-tertiary-label">Focus areas</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {result.gapMap.map((c) => (
                <span key={c} className="rounded-full bg-sys-red/12 px-2 py-0.5 text-caption-1 text-label">
                  {titles[c] ?? c}
                </span>
              ))}
            </div>
          </div>
          {result.strengthMap.length > 0 && (
            <div>
              <p className="text-caption-1 uppercase tracking-wide text-tertiary-label">Strengths</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {result.strengthMap.map((c) => (
                  <span key={c} className="rounded-full bg-sys-green/15 px-2 py-0.5 text-caption-1 text-label">
                    {titles[c] ?? c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <PushButton variant="primary" size="prominent" className="mt-6 w-full!" disabled={buildingPlan} onClick={() => void startLearning()}>
          {buildingPlan ? 'Building your roadmap…' : 'Build my roadmap →'}
        </PushButton>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center">
      <h1 className="text-large-title">Quick calibration</h1>
      <p className="mt-1 text-callout text-secondary-label">
        A few honest self-checks so lessons start at the right depth. There are no wrong answers.
      </p>
      <div className="my-3 max-w-[200px]">
        <ProgressDots confirmedStep={askedCount} />
      </div>
      {current !== null ? (
        <section aria-label="Calibration probe" className="rounded-card border border-separator bg-text-background p-4">
          <p className="text-chat-body">{current.statement}</p>
          <div className="mt-3 flex gap-2">
            <PushButton variant="primary" onClick={() => answer(true)}>
              Yes, I can do this
            </PushButton>
            <PushButton variant="secondary" onClick={() => answer(false)}>
              Not yet
            </PushButton>
          </div>
        </section>
      ) : (
        <p className="text-body text-tertiary-label">Preparing probes…</p>
      )}
    </main>
  );
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
