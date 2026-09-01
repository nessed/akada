'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CatalogSection } from '@/lib/catalog';

interface Props {
  sections: CatalogSection[];
  value: string;
  onChange: (value: string) => void;
  /** The course's own colour, used for the tick on the chosen section. */
  accent: string;
  /** Its soft tint, which fills the field while nothing is chosen yet. */
  accentTint: string;
}

/** Roughly a two-line row, used only to decide which way the list opens. */
const ROW_HEIGHT = 58;
const LIST_GAP = 14;
const MAX_ROWS = 4;

/**
 * The two lines a section is read as: when the catalog publishes a meeting
 * time that is the thing worth reading first, and everything else drops to
 * the quieter line under it.
 */
function lines(section: CatalogSection) {
  const when = section.meets || section.cadence;
  const detail = [section.component, section.room, section.instructor]
    .filter(Boolean)
    .join(' · ');
  if (when) return { primary: when, secondary: detail };
  return { primary: detail || `Section ${section.id}`, secondary: '' };
}

/**
 * Section chooser for a course picked out of the catalog.
 *
 * A native <select> put the operating system's own dropdown — system font,
 * blue highlight, one cramped line per option — in the middle of a paper
 * sheet, and gave no hint that a course had eight sections to look through.
 * This is the same list the course suggestions use: paper, ruled dividers,
 * the time in serif and the instructor beneath it.
 */
export default function SectionPicker({
  sections,
  value,
  onChange,
  accent,
  accentTint,
}: Props) {
  // Opens itself the moment a course is picked. A closed field was easy to
  // read as one more thing already filled in and scroll straight past; the
  // list standing open is the only thing that reliably says otherwise.
  const [open, setOpen] = useState(true);
  const [placeAbove, setPlaceAbove] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selected = sections.find((section) => section.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // The sheet is anchored to the bottom of the screen, so the list almost
  // always wants to open upwards — but not on a short course list near the
  // top of a tall window.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const needed = Math.min(sections.length + 1, MAX_ROWS) * ROW_HEIGHT + LIST_GAP;
    setPlaceAbove(window.innerHeight - rect.bottom < needed && rect.top > needed);
  }, [open, sections.length]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="flex w-full items-center gap-3 rounded-[10px] border px-4 py-3 text-left outline-none transition-colors"
        style={
          selected
            ? undefined
            : // Unanswered, the field wears the course's own highlighter tint,
              // so it reads as the one thing on the sheet still waiting.
              { background: accentTint, borderColor: accent }
        }
      >
        {selected ? (
          <>
            <span className="shrink-0 font-mono text-[12px] font-semibold text-ink">
              {selected.id}
            </span>
            <span className="min-w-0 flex-1 truncate font-serif text-[13.5px] text-ink-soft">
              {lines(selected).primary}
            </span>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 font-serif text-[14px] text-ink">
              Pick a section
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-soft">
              {sections.length}
            </span>
          </>
        )}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className={`shrink-0 text-ink-soft transition-transform duration-200 ${
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
          aria-label="Section"
          className={`absolute left-0 right-0 z-[90] m-0 max-h-[min(17rem,42vh)] list-none overflow-y-auto overflow-x-hidden rounded-[12px] border border-line bg-paper p-0 shadow-[0_18px_48px_rgba(26,25,21,0.16)] animate-fade-in ${
            placeAbove ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
          }`}
        >
          {sections.map((section) => {
            const { primary, secondary } = lines(section);
            const isSelected = section.id === value;
            return (
              <li key={section.id} role="none">
                <button
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => choose(isSelected ? '' : section.id)}
                  className="flex w-full items-baseline gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-b-0"
                  style={{ background: isSelected ? 'var(--bg-tint)' : 'transparent' }}
                >
                  <span className="w-8 shrink-0 font-mono text-[12px] font-semibold text-ink">
                    {section.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[13.5px] text-ink-soft">
                      {primary}
                    </span>
                    {secondary && (
                      <span className="mt-0.5 block truncate text-[11px] text-muted-soft">
                        {secondary}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                      className="shrink-0 self-center"
                      style={{ color: accent }}
                    >
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
