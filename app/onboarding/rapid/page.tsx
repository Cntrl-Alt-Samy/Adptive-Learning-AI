'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PushButton, SegmentedControl, Stepper, TextField } from '@/components/mac';
import { api } from '@/lib/api';
import type { SubjectSummary } from '@/lib/api';
import { useSession } from '@/hooks/session-store';

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'some_exposure', label: 'Some exposure' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' }
] as const;

const MODALITY_OPTIONS = [
  { value: 'stepwise', label: 'Stepwise' },
  { value: 'examples', label: 'Examples' },
  { value: 'visual', label: 'Visual' },
  { value: 'hands_on', label: 'Hands-on' }
] as const;

/** S8A-T6 (F2) — rapid intake form (<60s), subjects served by /api/subjects. */
export default function RapidOnboardingPage() {
  const router = useRouter();
  const session = useSession();
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [level, setLevel] = useState<(typeof LEVEL_OPTIONS)[number]['value']>('beginner');
  const [modality, setModality] = useState<(typeof MODALITY_OPTIONS)[number]['value']>('stepwise');
  const [goal, setGoal] = useState('');
  const [minutes, setMinutes] = useState(30);

  useEffect(() => {
    void api
      .subjects()
      .then((res) => {
        setSubjects(res.subjects);
        if (res.subjects[0] !== undefined) setSubjectId(res.subjects[0].id);
      })
      .catch(() => setSubjects([]));
  }, []);

  const start = (): void => {
    if (subjectId === '') return;
    const subject = subjects.find((s) => s.id === subjectId);
    session.setPersona({
      subjectId,
      subjectTitle: subject?.title ?? subjectId,
      selfLevel: level,
      goal,
      timeMinutes: minutes,
      modality
    });
    router.push('/onboarding/calibration');
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4">
      <h1 className="text-large-title">Quick setup</h1>

      <fieldset className="rounded-card border border-separator bg-text-background p-4">
        <legend className="text-headline text-secondary-label">Subject</legend>
        <div role="radiogroup" aria-label="Subject" className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <PushButton key={s.id} variant={s.id === subjectId ? 'primary' : 'secondary'} onClick={() => setSubjectId(s.id)}>
              {s.title}
            </PushButton>
          ))}
          {subjects.length === 0 && <p className="text-callout text-tertiary-label">Loading subjects…</p>}
        </div>
      </fieldset>

      <div>
        <p className="mb-1 text-headline text-secondary-label">Self-assessed level</p>
        <SegmentedControl options={[...LEVEL_OPTIONS]} value={level} onChange={setLevel} ariaLabel="Self-assessed level" />
      </div>

      <TextField label="What are you aiming for?" value={goal} onChange={setGoal} placeholder="e.g. pass the June paper" required validate={(v) => (v.trim().length >= 3 ? null : 'Tell us your goal')} />

      <Stepper value={minutes} onChange={setMinutes} min={15} max={90} step={5} label="Daily minutes" suffix=" min" />

      <div>
        <p className="mb-1 text-headline text-secondary-label">Preferred teaching style</p>
        <SegmentedControl options={[...MODALITY_OPTIONS]} value={modality} onChange={setModality} ariaLabel="Preferred teaching style" />
      </div>

      <PushButton variant="primary" size="prominent" className="w-full!" disabled={goal.trim().length < 3 || subjectId === ''} onClick={start}>
        Continue to calibration →
      </PushButton>
    </main>
  );
}
