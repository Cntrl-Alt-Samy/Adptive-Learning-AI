'use client';

import { useEffect } from 'react';

interface SheetProps {
  open: boolean;
  /** Non-dismissible until acknowledged (strike-breaker contract). */
  locked?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/** §4.5 sheet — macOS strike-breaker intervention surface. */
export function Sheet({ open, locked = false, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open || locked) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, locked, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-60 flex items-end justify-center bg-black/25 sm:items-center"
      onPointerDown={(e) => {
        if (!locked && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-pop w-full max-w-md translate-y-0 rounded-sheet border border-separator bg-window p-5 shadow-popover">
        <h2 className="text-title-2">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
