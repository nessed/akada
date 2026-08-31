'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CatalogCourse } from '@/lib/catalog';
import SectionPicker from '@/components/SectionPicker';

type SearchCatalog = (query: string) => CatalogCourse[];

/** Approximate row height and gutter, used only to decide which way to open. */
const ROW_HEIGHT = 46;
const LIST_GAP = 14;
const MAX_ROWS = 5;

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  picked: CatalogCourse | null;
  onPick: (course: CatalogCourse | null) => void;
  section: string;
  onSectionChange: (value: string) => void;
  /** The course's own colour and tint, carried through to the section list. */
  accent: string;
  accentTint: string;
  /** Enter with nothing highlighted submits, so the picker is never required. */
  onSubmit: () => void;
  autoFocus?: boolean;
}

/**
 * The whole add-course input. The catalog is background autocomplete, not a
 * browser: at most five compact suggestions, no filters, no metadata beyond
 * code / title / credits, and typing past the suggestions and hitting Enter
 * quietly creates a manual course instead.
 */
export default function CourseSearchInput({
  query,
  onQueryChange,
  picked,
  onPick,
  section,
  onSectionChange,
  accent,
  accentTint,
  onSubmit,
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false);
  // -1 means "nothing highlighted", which is what makes Enter fall through to
  // manual creation rather than silently picking the first suggestion.
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The add-course sheet is anchored to the bottom of the screen, so on a
  // tall viewport the input can sit low enough that a downward list runs off
  // the bottom. Flip it above the input when it wouldn't fit below.
  const [placeAbove, setPlaceAbove] = useState(false);
  const listId = useId();
  // The term catalog is a few hundred courses, so it is fetched as its own
  // chunk when this sheet opens rather than shipped with the dashboard.
  const [searchCatalog, setSearchCatalog] = useState<SearchCatalog | null>(null);

  useEffect(() => {
    let live = true;
    import('@/lib/catalog/search').then((module) => {
      if (live) setSearchCatalog(() => module.searchCatalog);
    });
    return () => {
      live = false;
    };
  }, []);

  const results = useMemo(
    () => (picked || !searchCatalog ? [] : searchCatalog(query)),
    [query, picked, searchCatalog],
  );

  // Until the catalog lands there is nothing to say about the query, and
  // "not in the catalog" would be a lie for the few milliseconds it takes.
  const showList = open && !picked && Boolean(searchCatalog) && query.trim().length >= 2;

  // Clicking anywhere else closes the list without touching what was typed.
  useEffect(() => {
    if (!showList) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showList]);

  useEffect(() => {
    setHighlight(-1);
  }, [query]);

  useLayoutEffect(() => {
    if (!showList) return;
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rowCount = Math.max(1, Math.min(results.length, MAX_ROWS));
    const needed = rowCount * ROW_HEIGHT + LIST_GAP;
    setPlaceAbove(
      window.innerHeight - rect.bottom < needed && rect.top > needed,
    );
  }, [showList, results.length]);

  function choose(course: CatalogCourse) {
    onPick(course);
    onQueryChange(`${course.code} ${course.title}`);
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
      return;
    }
    if (event.key === 'ArrowDown' && showList && results.length > 0) {
      event.preventDefault();
      setHighlight((i) => (i + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp' && showList && results.length > 0) {
      event.preventDefault();
      setHighlight((i) => (i <= 0 ? results.length - 1 : i - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (showList && highlight >= 0 && results[highlight]) {
        choose(results[highlight]);
      } else {
        onSubmit();
      }
    }
  }

  const sections = picked?.sections ?? [];

  return (
    <div ref={rootRef} className="relative">
      <input
        autoFocus={autoFocus}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={
          showList && highlight >= 0 ? `${listId}-${highlight}` : undefined
        }
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          // Editing after choosing drops back to a plain typed course.
          if (picked) onPick(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        placeholder="Search course code or name…"
        className="w-full bg-paper border border-line rounded-[10px] px-4 py-3 text-sm font-serif italic text-ink outline-none focus:border-line-strong placeholder:not-italic placeholder:font-sans"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute left-0 right-0 z-[70] m-0 list-none overflow-hidden rounded-[12px] border border-line bg-paper p-0 shadow-[0_18px_48px_rgba(26,25,21,0.16)] animate-fade-in ${
            placeAbove ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
          }`}
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 font-serif text-[13px] italic text-muted-soft">
              Not in the catalog — press Enter to add it anyway.
            </li>
          ) : (
            results.map((course, i) => (
              <li key={course.code} role="none">
                <button
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  type="button"
                  // Mouse-down would blur the input before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(course)}
                  className={`flex w-full items-baseline gap-2 px-4 py-2.5 text-left transition-colors ${
                    i < results.length - 1 ? 'border-b border-line' : ''
                  }`}
                  style={{ background: i === highlight ? 'var(--bg-tint)' : 'transparent' }}
                >
                  <span className="shrink-0 font-mono text-[12px] font-semibold text-ink">
                    {course.code}
                  </span>
                  <span className="text-muted-soft" aria-hidden>
                    ·
                  </span>
                  <span className="min-w-0 flex-1 truncate font-serif text-[14px] text-ink-soft">
                    {course.title}
                  </span>
                  {typeof course.credits === 'number' && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-soft">
                      {course.credits} cr
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {picked && (
        <div className="mt-2.5 animate-fade-in">
          {sections.length > 0 ? (
            <SectionPicker
              // Re-mounts on a different course, so its list opens again.
              key={picked.code}
              sections={sections}
              value={section}
              onChange={onSectionChange}
              accent={accent}
              accentTint={accentTint}
            />
          ) : (
            <input
              type="text"
              value={section}
              onChange={(e) => onSectionChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Section (optional)"
              className="w-full bg-paper border border-line rounded-[10px] px-4 py-3 text-sm text-ink outline-none focus:border-line-strong"
            />
          )}
        </div>
      )}
    </div>
  );
}
