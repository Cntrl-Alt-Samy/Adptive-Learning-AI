'use client';

import { useId, useState } from 'react';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Returns an error message when invalid, or null when valid. */
  validate?: (value: string) => string | null;
  type?: 'text' | 'email' | 'password';
  required?: boolean;
}

/** §4.5 text field with inline validation. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  validate,
  type = 'text',
  required = false
}: TextFieldProps) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const error = touched && validate !== undefined ? validate(value) : null;

  return (
    <div className="w-full">
      <label htmlFor={id} className="mb-1 block text-headline text-secondary-label">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-sys-red">
            *
          </span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        className={`focus-halo h-7 w-full rounded-control border bg-text-background px-2 text-body text-label placeholder:text-tertiary-label ${
          error !== null ? 'border-sys-red' : 'border-separator'
        }`}
      />
      {error !== null && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-caption-1 text-sys-red">
          {error}
        </p>
      )}
    </div>
  );
}
