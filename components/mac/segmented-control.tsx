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

/** iOS segmented control — raised white thumb sliding over a gray track. */
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
      className="inline-flex items-center gap-[2px] rounded-[10px] bg-gray5 p-[2px] dark:bg-gray4"
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
            className={`focus-halo rounded-[8px] px-3.5 py-1.5 text-[15px] leading-6 transition-all duration-150 ${
              selected ? 'bg-text-background text-label shadow-[var(--thumb-shadow)]' : 'text-secondary-label hover:text-label'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
