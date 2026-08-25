'use client';

import { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';
export type ButtonSize = 'standard' | 'prominent';

interface PushButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-sys-blue text-white hover:brightness-110 active:brightness-95 active:scale-[0.98]',
  secondary:
    'bg-gray5 text-label hover:brightness-[0.97] dark:bg-gray4 dark:hover:brightness-125 active:scale-[0.98]',
  destructive:
    'bg-gray5 text-sys-red hover:brightness-[0.97] dark:bg-gray4 dark:hover:brightness-125 active:scale-[0.98]'
};

/** §4.5 push button — filled blue primary, gray secondary, red-text destructive. */
export const PushButton = forwardRef<HTMLButtonElement, PushButtonProps>(function PushButton(
  { variant = 'secondary', size = 'standard', className = '', type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`focus-halo inline-flex items-center justify-center gap-1.5 rounded-control px-4 font-semibold tracking-tight transition-[filter,background-color,transform] duration-150 disabled:pointer-events-none disabled:opacity-40 ${
        VARIANT_CLASSES[variant]
      } ${size === 'prominent' ? 'h-[var(--control-height-prominent)] text-title-3' : ''}`}
      style={{ height: size === 'standard' ? 'var(--control-height)' : undefined, fontSize: size === 'standard' ? 16 : undefined }}
      {...rest}
    />
  );
});
