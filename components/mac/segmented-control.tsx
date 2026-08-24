'use client';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

/** §4.5 segmented control — radiogroup semantics for mode switches. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-control bg-gray5 p-0.5"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={`focus-halo rounded-control px-3 py-1 text-headline transition-colors duration-150 ${
              selected ? 'bg-window text-label shadow-popover' : 'text-secondary-label'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
