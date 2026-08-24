'use client';

import { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';
export type ButtonSize = 'standard' | 'prominent';

interface PushButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-sys-blue text-white hover:brightness-110 active:brightness-95',
  secondary:
    'bg-gray5 text-label hover:brightness-[0.98] dark:bg-gray4 dark:hover:brightness-110 border border-separator',
  destructive:
    'bg-gray5 text-sys-red hover:brightness-[0.98] dark:bg-gray4 dark:hover:brightness-110 border border-separator'
};

/** §4.5 push button — default blue, secondary gray, destructive red-text. */
export const PushButton = forwardRef<HTMLButtonElement, PushButtonProps>(function PushButton(
  { variant = 'secondary', size = 'standard', className = '', type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`focus-halo inline-flex items-center justify-center gap-1 rounded-control px-3 font-headline transition-[filter,background-color] duration-150 disabled:pointer-events-none disabled:opacity-40 ${
        VARIANT_CLASSES[variant]
      } ${size === 'prominent' ? 'h-9' : ''}`}
      style={{ height: size === 'standard' ? 'var(--control-height)' : undefined }}
      {...rest}
    />
  );
});
