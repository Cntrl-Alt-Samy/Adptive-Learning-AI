'use client';

import { useEffect, useRef, useState } from 'react';

export interface PaletteCommand {
  id: string;
  title: string;
  keywords?: string;
  perform: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: ReadonlyArray<PaletteCommand>;
}

/** §4.5 command palette — ⌘K Spotlight-style navigator over mounted routes. */
export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = commands.filter((c) => {
    const hay = `${c.title} ${c.keywords ?? ''}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const run = (index: number): void => {
    const cmd = results[index];
    if (cmd === undefined) return;
    onClose();
    cmd.perform();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-60 flex items-start justify-center bg-black/25 pt-[12vh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="material-chrome w-full max-w-md rounded-card border border-separator p-2 shadow-popover">
        <input
          ref={inputRef}
          value={query}
          placeholder="Type a command or route…"
          aria-label="Search commands"
          role="combobox"
          aria-expanded
          aria-controls="command-palette-list"
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(activeIndex);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          className="focus-halo h-8 w-full rounded-control border border-separator bg-text-background px-3 text-body text-label placeholder:text-tertiary-label"
        />
        <ul id="command-palette-list" role="listbox" aria-label="Commands" className="mt-1 max-h-72 overflow-auto">
          {results.length === 0 && (
            <li className="px-3 py-4 text-center text-callout text-secondary-label">No results</li>
          )}
          {results.map((cmd, i) => (
            <li key={cmd.id} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                tabIndex={-1}
                onPointerMove={() => setActiveIndex(i)}
                onClick={() => run(i)}
                className={`w-full rounded-control px-3 py-1.5 text-left text-body ${
                  i === activeIndex ? 'bg-sys-blue text-white' : 'text-label'
                }`}
              >
                {cmd.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
