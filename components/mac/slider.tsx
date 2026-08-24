'use client';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  formatValue?: (value: number) => string;
}

/** §4.5 slider — native range input, systemBlue accent, callout readout. */
export function Slider({ value, min = 0, max = 100, step = 1, onChange, label, formatValue }: SliderProps) {
  return (
    <div className="flex w-full items-center gap-2">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="focus-halo h-1 w-full cursor-pointer appearance-none rounded-full bg-gray3 accent-sys-blue dark:bg-gray4"
      />
      {formatValue !== undefined && (
        <span className="w-12 text-right text-callout tabular-nums text-secondary-label">
          {formatValue(value)}
        </span>
      )}
    </div>
  );
}
