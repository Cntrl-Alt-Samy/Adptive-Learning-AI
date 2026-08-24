'use client';

import { notFound } from 'next/navigation';
import { useState } from 'react';

import {
  AlertModal,
  ChatBubble,
  CodeBlock,
  CommandPalette,
  KaTeXBlock,
  Popover,
  ProgressBar,
  ProgressDots,
  ProgressRing,
  PushButton,
  SegmentedControl,
  Sheet,
  Slider,
  Stepper,
  TextField,
  ToggleSwitch
} from '@/components/mac';
import { useTheme } from '@/components/theme-provider';

const SYS_COLORS = [
  'sys-blue',
  'sys-green',
  'sys-orange',
  'sys-red',
  'sys-purple',
  'sys-teal',
  'sys-indigo',
  'sys-mint',
  'sys-yellow'
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-separator bg-text-background p-5">
      <h2 className="text-title-2">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** /design — token + component gallery (dev-only, 404s in production). */
export default function DesignPage() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [switchOn, setSwitchOn] = useState(true);
  const [sliderVal, setSliderVal] = useState(45);
  const [stepperVal, setStepperVal] = useState(3);
  const [alertErr, setAlertErr] = useState<{ code: string; message: string; retryable: boolean } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  if (process.env.NODE_ENV === 'production') notFound();
  const { pref, resolved, setPref } = useTheme();

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-large-title">/design — living styleguide</h1>
          <p className="text-callout text-secondary-label">
            Every §4 token + §4.5 component · resolved: {resolved} · pref: {pref}
          </p>
        </div>
        <SegmentedControl
          ariaLabel="Appearance"
          value={pref}
          onChange={setPref}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' }
          ]}
        />
      </header>

      <Section title="System colors">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SYS_COLORS.map((name) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <span
                className="h-9 w-full rounded-control border border-separator"
                style={{ backgroundColor: `var(--${name})` }}
                aria-hidden
              />
              <code className="text-caption-1 text-secondary-label">{name}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Materials">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="material-sidebar h-16 rounded-card border border-separator p-2 text-caption-1">sidebar</div>
          <div className="material-hud h-16 rounded-card border border-separator p-2 text-caption-1">hud/inspector</div>
          <div className="material-chrome h-16 rounded-card border border-separator p-2 text-caption-1">toolbar/sheet</div>
        </div>
      </Section>

      <Section title="Typography">
        <p className="text-large-title">largeTitle 26/700</p>
        <p className="text-title-1">title1 22/700</p>
        <p className="text-title-2">title2 17/600</p>
        <p className="text-headline">headline 13/600</p>
        <p className="text-body">body 13/400 — The quick brown fox jumps over the lazy dog.</p>
        <p className="text-chat-body">chat body 15/400</p>
        <p className="text-callout text-secondary-label">callout 12 · caption1 11</p>
      </Section>

      <Section title="Controls">
        <div className="flex flex-wrap items-center gap-2">
          <PushButton variant="primary">Primary</PushButton>
          <PushButton variant="secondary">Secondary</PushButton>
          <PushButton variant="destructive">Delete</PushButton>
          <PushButton variant="primary" size="prominent" onClick={() => setPaletteOpen(true)}>
            ⌘K Palette
          </PushButton>
          <SegmentedControl
            ariaLabel="Demo mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'light', label: 'Tutor' },
              { value: 'dark', label: 'Socratic' }
            ]}
          />
          <ToggleSwitch checked={switchOn} onChange={setSwitchOn} label="Demo switch" />
          <Stepper value={stepperVal} onChange={setStepperVal} label="items" />
        </div>
        <Slider value={sliderVal} onChange={setSliderVal} label="Difficulty" formatValue={(v) => `${v}%`} />
        <TextField label="Email" value="" onChange={() => {}} validate={(v) => (v.includes('@') ? null : 'Enter a valid email')} placeholder="you@example.com" />
      </Section>

      <Section title="Surfaces">
        <div className="flex flex-wrap gap-2">
          <Popover trigger={({ toggle }) => <PushButton onClick={toggle}>Popover</PushButton>} ariaLabel="Demo popover">
            {(close) => (
              <div>
                <p className="text-body">Material popover content.</p>
                <PushButton className="mt-2" onClick={close}>
                  Close
                </PushButton>
              </div>
            )}
          </Popover>
          <PushButton variant="primary" onClick={() => setSheetOpen(true)}>
            Strike-breaker Sheet
          </PushButton>
          <PushButton onClick={() => setAlertErr({ code: 'MODEL_UNAVAILABLE', message: 'All routes failed. Try again shortly.', retryable: true })}>
            Typed error Alert
          </PushButton>
        </div>
      </Section>

      <Section title="Progress">
        <div className="flex items-center gap-4">
          <ProgressDots confirmedStep={4} />
          <ProgressRing value={72} ariaLabel="Mastery" />
          <div className="w-48">
            <ProgressBar value={40} />
          </div>
        </div>
      </Section>

      <Section title="Chat & math">
        <div className="space-y-2">
          <ChatBubble variant="received">
            <KaTeXBlock content={'Kinetic energy is $$KE = \\tfrac{1}{2}mv^2$$ and momentum $p = mv$.'} />
          </ChatBubble>
          <ChatBubble variant="sent">So doubling velocity quadruples KE?</ChatBubble>
          <KaTeXBlock content={'Fragmented tail stays safe: $E = mc'} />
          <CodeBlock language="ts" code={'const gain = computeKnowledgeGainPct(42, 87);'} />
        </div>
      </Section>

      <Sheet open={sheetOpen} locked onClose={() => setSheetOpen(false)} title="Let’s reset for a second">
        <p className="text-body">Strike-breaker coaching copy goes here.</p>
        <PushButton variant="primary" className="mt-3" onClick={() => setSheetOpen(false)}>
          Acknowledge
        </PushButton>
      </Sheet>
      <AlertModal error={alertErr} onRetry={() => setAlertErr(null)} onDismiss={() => setAlertErr(null)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={[
          { id: 'today', title: 'Go to Today', perform: () => {} },
          { id: 'plan', title: 'Go to Plan', perform: () => {} },
          { id: 'design', title: 'This gallery', perform: () => {} }
        ]}
      />
    </main>
  );
}
