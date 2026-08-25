/**
 * Minimal SF-Symbols-flavoured nav icons — single-stroke, currentColor,
 * optical size tuned for 18px boxes.
 */

interface IconProps {
  size?: number;
}

function base(size: number): React.SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  } as const;
}

export function IconToday({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPlan({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 6.5h2M9.5 6.5H20M4 12h2M9.5 12H20M4 17.5h2M9.5 17.5H14" />
    </svg>
  );
}

export function IconReview({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 3.5v4.6h-4.6" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconBadges({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3l2.47 5 5.53.8-4 3.9.94 5.5L12 15.6l-4.94 2.6L8 12.7l-4-3.9 5.53-.8L12 3z" />
    </svg>
  );
}

export function IconPrivacy({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 21s7.5-3.7 7.5-9.4V5.6L12 2.8 4.5 5.6v6C4.5 17.3 12 21 12 21z" />
      <circle cx="12" cy="10.6" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 12.2v3.2" />
    </svg>
  );
}

export function IconSettings({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="15" cy="7" r="2.1" fill="var(--window)" />
      <circle cx="9" cy="12" r="2.1" fill="var(--window)" />
      <circle cx="13" cy="17" r="2.1" fill="var(--window)" />
    </svg>
  );
}
