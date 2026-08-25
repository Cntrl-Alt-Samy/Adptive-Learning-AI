'use client';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** iOS switch — 51×31 track, green when on. */
export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`focus-halo relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-sys-green' : 'bg-gray4 dark:bg-gray3'
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[var(--thumb-shadow)] transition-all duration-200 ease-out ${
          checked ? 'left-[22px]' : 'left-[2px]'
        }`}
      />
    </button>
  );
}
