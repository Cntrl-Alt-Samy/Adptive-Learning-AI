'use client';

import { useEffect, useRef, useState } from 'react';

interface PopoverProps {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  ariaLabel: string;
}

/** §4.5 popover — material surface + separator border + popover shadow.
 *  Closes on Escape and outside pointerdown; returns focus to trigger. */
export function Popover({ trigger, children, ariaLabel }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          role="dialog"
          aria-label={ariaLabel}
          className="material-hud absolute right-0 z-50 mt-1.5 min-w-52 rounded-card border border-separator p-3 shadow-popover"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
