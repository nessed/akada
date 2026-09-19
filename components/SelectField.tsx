'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional monospace prefix, e.g. a course code. */
  tag?: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * A select in the app's own hand.
 *
 * A native `<select>` renders the operating system's list, system font, its
 * own highlight colour, one cramped line per option, in the middle of a
 * paper sheet. This is the same construction as the course suggestions and
 * the section picker: paper, ruled dividers, a tint on what is chosen.
 */
export default function SelectField({
  value,
  options,
  onChange,
  placeholder = 'Choose',
  ariaLabel,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full items-center gap-2 rounded-[10px] border border-line bg-bg-tint px-3 py-2.5 text-left outline-none transition-colors hover:border-line-strong focus:border-line-strong"
      >
        {selected?.tag && (
          <span className="shrink-0 font-mono text-[11px] font-semibold text-ink">
            {selected.tag}
          </span>
        )}
        <span
          className={`min-w-0 flex-1 truncate text-xs ${
            selected ? 'text-ink-soft' : 'text-muted-soft'
          }`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 bottom-[calc(100%+6px)] z-[90] m-0 max-h-[min(15rem,38vh)] list-none overflow-y-auto rounded-[12px] border border-line bg-paper p-0 shadow-[0_18px_48px_rgba(26,25,21,0.16)] animate-fade-in"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="none">
                <button
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex w-full items-baseline gap-2 border-b border-line px-4 py-2.5 text-left transition-colors last:border-b-0"
                  style={{ background: isSelected ? 'var(--bg-tint)' : 'transparent' }}
                >
                  {option.tag && (
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-ink">
                      {option.tag}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-serif text-[13.5px] text-ink-soft">
                    {option.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
