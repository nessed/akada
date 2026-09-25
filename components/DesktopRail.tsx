'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCourses, useTasks } from '@/lib/data-hooks';
import { useTimer } from '@/lib/timer-context';
import { useUpNext } from '@/lib/use-up-next';
import { isoDate, resolveTint } from '@/lib/utils';
import { sortCourses } from '@/lib/data/course-order';
import { useRecordHasNews } from '@/lib/progression/visits';
import { RAIL_COLLAPSED_KEY as COLLAPSE_KEY, writeRailAttribute } from '@/lib/rail';
import type { Course } from '@/lib/data/types';
import AkadaMark from './notebook/AkadaMark';
import StartTimerPopover, { type StartTarget } from './StartTimerPopover';

/**
 * The desktop rail: the margin of the page.
 *
 * On a ruled pad the margin is the strip left of the rose rule where the
 * contents and the tabs get written, and that is what this is. The six
 * screens are words in the serif, the same face as the titles they lead to;
 * the page you are on is swiped with highlighter, the way a page marks a
 * choice, and a pointer draws the pencil underline. The term's courses sit
 * under them as spines, and at the foot the rail offers the one thing Today
 * would start next. Phone keeps BottomNav, so this never renders there.
 *
 * It is 232px, or a 64px strip of icons and spine labels when collapsed.
 * From 768 to 1024 it is always the strip, and the handle lays the full rail
 * over the page rather than pushing the page aside.
 */

/** Below this the rail cannot sit beside the page and overlays it instead. */
const OVERLAY_QUERY = '(max-width: 1023.98px)';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Today',
    icon: (
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v9h14v-9" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: (
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M8 6h12M8 12h12M8 18h12" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </svg>
    ),
  },
  {
    href: '/courses',
    label: 'Courses',
    icon: (
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z" />
        <path d="M4 19a2 2 0 012-2h12" />
      </svg>
    ),
  },
  {
    href: '/notes',
    label: 'Notes',
    icon: (
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M14 3v5h5M9 12h7M9 16h5" />
      </svg>
    ),
  },
  {
    href: '/stats',
    label: 'Stats',
    icon: (
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" />
      </svg>
    ),
  },
  {
    href: '/stamps',
    label: 'Record',
    icon: (
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
      </svg>
    ),
  },
];

const SETTINGS: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </svg>
  ),
};

/** A page with its margin ruled: the handle that folds the margin away. */
const HANDLE_GLYPH = (
  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round">
    <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" />
    <path d="M9.5 4v16" stroke="var(--rose)" />
  </svg>
);

const PLAY = (
  <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 5l12 7-12 7V5z" />
  </svg>
);

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * The stored choice. What is drawn follows the data-rail attribute through
 * CSS; this state only feeds the handle's label and aria-expanded.
 */
export function useRailCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== COLLAPSE_KEY) return;
      const next = e.newValue === 'true';
      writeRailAttribute(next);
      setCollapsed(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const set = (next: boolean) => {
    setCollapsed(next);
    writeRailAttribute(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, String(next));
    } catch {
      // The rail still collapses for this visit; it just will not be
      // remembered, which is a fair trade for not throwing on a click.
    }
  };

  return [collapsed, set];
}

type Mark = 'on' | 'inside' | null;

/** 'on' for the page itself, 'inside' for a page under it (a course page under Courses). */
function markFor(pathname: string | null, href: string): Mark {
  if (!pathname) return null;
  if (pathname === href) return 'on';
  if (pathname.startsWith(href + '/')) return href === '/courses' ? 'inside' : 'on';
  return null;
}

/**
 * A course code as a library spine label: the letters over the number, four
 * characters of each at most. "MATH 120" is MATH over 120, "CS200" is CS
 * over 200, and a code with no number keeps its first four letters.
 */
function spineLabel(code: string): [string, string] {
  const compact = code.replace(/\s+/g, '').toUpperCase();
  const at = compact.search(/\d/);
  if (at <= 0) return [compact.slice(0, 4), ''];
  return [compact.slice(0, Math.min(at, 4)), compact.slice(at, at + 4)];
}

interface Tip {
  text: string;
  top: number;
  left: number;
}

export default function DesktopRail() {
  const pathname = usePathname();
  const recordNews = useRecordHasNews();
  const [collapsed, setCollapsed] = useRailCollapsed();
  const { courses } = useCourses();
  const { tasks } = useTasks();
  const { active } = useTimer();
  const upNext = useUpNext();

  const navRef = useRef<HTMLElement | null>(null);
  const stripHandleRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<HTMLButtonElement | null>(null);

  /** The full rail laid over the page, 768 to 1024 only. */
  const [overlay, setOverlay] = useState(false);
  const [fade, setFade] = useState({ top: false, bottom: false });
  const [tip, setTip] = useState<Tip | null>(null);
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ordered = useMemo(() => sortCourses(courses), [courses]);

  /** Open tasks per course, and the total the Tasks row carries. */
  const openCounts = useMemo(() => {
    const per = new Map<string, number>();
    let total = 0;
    for (const t of tasks) {
      if (t.completed) continue;
      total += 1;
      per.set(t.courseId, (per.get(t.courseId) ?? 0) + 1);
    }
    return { per, total };
  }, [tasks]);

  /* What the start at the foot would begin: Up next, as Today reads it, or
     with no open work the first course in the reader's order, untasked. */
  const start = useMemo((): { course: Course; taskTitle: string | null; task: typeof upNext } | null => {
    if (upNext) {
      const course = courses.find((c) => c.id === upNext.courseId);
      if (course) return { course, taskTitle: upNext.title, task: upNext };
    }
    const first = ordered[0];
    return first ? { course: first, taskTitle: null, task: null } : null;
  }, [upNext, courses, ordered]);

  const narrowNow = () => (navRef.current?.getBoundingClientRect().width ?? 232) < 120;

  const onHandle = () => {
    setTip(null);
    if (window.matchMedia(OVERLAY_QUERY).matches) {
      setOverlay((open) => !open);
      return;
    }
    setCollapsed(!collapsed);
  };

  /* The overlay behaves like anything laid over a page: Esc or a click
     outside puts it away, focus goes in when it opens and back to the handle
     when it closes. A navigation remounts the rail, which closes it too. */
  const closeOverlay = useCallback(() => {
    setOverlay(false);
    // Once closed the strip is back, and its handle is the mark. It can only
    // take focus when the rail has narrowed past the point it is drawn at,
    // which is after the 0.2s width transition.
    window.setTimeout(() => stripHandleRef.current?.focus(), 240);
  }, []);
  useEffect(() => {
    if (!overlay) return;
    navRef.current?.querySelector<HTMLElement>('a[href="/dashboard"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOverlay();
    };
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOverlay(false);
    };
    const onWide = (e: MediaQueryListEvent) => {
      if (!e.matches) setOverlay(false);
    };
    const mq = window.matchMedia(OVERLAY_QUERY);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    mq.addEventListener('change', onWide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      mq.removeEventListener('change', onWide);
    };
  }, [overlay, closeOverlay]);

  /* The course list fades at whichever end has more behind it. */
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setFade((f) => (f.top === top && f.bottom === bottom ? f : { top, bottom }));
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, ordered.length]);

  /* On a course page, that course is in view even at the foot of a long list. */
  useLayoutEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [pathname, ordered.length]);

  /* The strip has no room for words, so a pointer or a Tab on an item there
     puts its name on a paper tip beside it. Fixed and portalled, because the
     course list scrolls and the rail contains its layout. */
  const tipFrom = (target: EventTarget) => {
    const el = (target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (el?.dataset.tip) showTip(el, el.dataset.tip);
    else setTip(null);
  };
  function showTip(el: HTMLElement, text: string) {
    if (!narrowNow()) return;
    const r = el.getBoundingClientRect();
    const railRight = navRef.current?.getBoundingClientRect().right ?? r.right;
    setTip({ text, top: r.top + r.height / 2, left: railRight + 8 });
  }

  const openStart = () => {
    if (!start) return;
    setTip(null);
    setStartTarget({ task: start.task, course: start.course, anchor: startRef.current });
  };

  const rowBase =
    'rail-link rail-row relative flex h-10 items-center gap-3 rounded-[10px] px-3.5 no-underline transition-colors';

  function screenRow(item: NavItem, extra?: React.ReactNode) {
    const mark = markFor(pathname, item.href);
    const news = item.href === '/stamps' && recordNews && mark === null;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={mark === 'on' ? 'page' : undefined}
        className={`${rowBase} ${mark ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
        data-tip={item.label}
      >
        <span className="rail-narrow relative mx-auto flex">
          {mark === 'on' && (
            <span aria-hidden className="hl hl-draw-quick absolute -inset-x-1.5 -bottom-1 h-[7px] p-0" />
          )}
          <span className="relative">{item.icon}</span>
          {news && <span aria-hidden className="absolute -right-1 -top-0.5 h-[6px] w-[6px] rounded-full bg-ink" />}
        </span>
        <span
          className={`rail-label font-serif text-[15px] leading-[1.3] tracking-[-0.005em] ${
            mark === 'on' ? 'hl hl-draw-quick' : ''
          }`}
        >
          {item.label}
        </span>
        {news && <span className="sr-only">Something new on the record</span>}
        {news && <span aria-hidden className="rail-wide ml-auto h-[6px] w-[6px] rounded-full bg-ink" />}
        {extra}
      </Link>
    );
  }

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Main"
        data-open={overlay ? '' : undefined}
        onPointerOver={(e) => tipFrom(e.target)}
        onPointerLeave={() => setTip(null)}
        onFocus={(e) => tipFrom(e.target)}
        onBlur={() => setTip(null)}
        className={`rail fixed inset-y-0 left-0 hidden shrink-0 flex-col gap-0.5 px-2 pb-4 pt-5 md:flex ${
          overlay ? 'z-50' : 'z-40'
        }`}
      >
        {/* The wordmark and the handle. On the strip the mark is the handle,
            because there is no room for both. */}
        <div className="rail-wide flex items-center justify-between pb-4 pl-3.5 pr-1">
          <Link href="/dashboard" className="flex items-center gap-2.5 text-ink no-underline">
            <AkadaMark size={18} />
            <span className="font-serif text-[20px] font-medium tracking-[-0.02em]">Akada</span>
          </Link>
          <button
            type="button"
            onClick={onHandle}
            aria-label={overlay ? 'Close sidebar' : 'Collapse sidebar'}
            aria-expanded
            className="rail-link grid h-10 w-10 place-items-center rounded-[10px] text-muted transition-colors hover:text-ink"
          >
            {HANDLE_GLYPH}
          </button>
        </div>
        <div className="rail-narrow flex justify-center pb-4">
          <button
            ref={stripHandleRef}
            type="button"
            onClick={onHandle}
            aria-label="Expand sidebar"
            aria-expanded={false}
            className="rail-link grid h-10 w-10 place-items-center rounded-[10px] text-ink transition-colors"
            data-tip="Expand"
          >
            <AkadaMark size={18} />
          </button>
        </div>

        {NAV.map((item) =>
          screenRow(
            item,
            item.href === '/tasks' && openCounts.total > 0 ? (
              <span className="rail-wide ml-auto font-mono text-[11px] tabular-nums text-muted">
                {openCounts.total}
              </span>
            ) : null,
          ),
        )}

        <div className="mx-3.5 mb-2 mt-4 border-t border-line" />
        <p className="eyebrow rail-wide mb-1.5 px-3.5">Courses</p>

        {/* The courses, in the order the reader dragged their dashboard into,
            each a spine in its colour, so the rail reads as the term's own. */}
        <div
          ref={listRef}
          onScroll={measure}
          className={`group/courses app-scroll min-h-0 flex-1 overflow-y-auto ${fade.top ? 'rail-fade-top' : ''} ${
            fade.bottom ? 'rail-fade-bottom' : ''
          }`}
        >
          {ordered.map((course) => {
            const on = pathname === `/courses/${course.id}`;
            const count = openCounts.per.get(course.id) ?? 0;
            const running = active?.courseId === course.id;
            const [letters, number] = spineLabel(course.code);
            const tint = resolveTint(course.color, course.tint);
            const tipText = `${course.code} · ${course.name}${count > 0 ? ` · ${count} open` : ''}`;
            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                aria-current={on ? 'page' : undefined}
                className={`${rowBase} scroll-my-7 ${on ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
                data-tip={tipText}
              >
                <span
                  aria-hidden
                  className="block w-[3px] shrink-0 rounded-[1px]"
                  style={{ height: 16, background: course.color }}
                />
                {/* On the strip, the code as a spine label: letters over the number. */}
                <span aria-hidden className="rail-narrow flex min-w-0 flex-col items-start leading-none">
                  <span
                    className="text-[9.5px] font-semibold uppercase tracking-[0.08em]"
                    style={on ? { background: tint, boxShadow: `0 0 0 2px ${tint}` } : undefined}
                  >
                    {letters}
                  </span>
                  {number && <span className="mt-[3px] font-mono text-[10px] tabular-nums text-muted">{number}</span>}
                </span>
                <span
                  className={`rail-label truncate text-[13px] ${on ? 'hl-swipe hl-draw-quick' : ''}`}
                  style={on ? ({ ['--hl' as string]: tint } as React.CSSProperties) : undefined}
                >
                  {course.code}
                </span>
                {running && (
                  <>
                    <span
                      aria-hidden
                      className="rail-wide ml-auto h-[6px] w-[6px] shrink-0 animate-tick rounded-full"
                      style={{ background: course.color }}
                    />
                    <span
                      aria-hidden
                      className="rail-narrow absolute right-2 top-2 h-[6px] w-[6px] animate-tick rounded-full"
                      style={{ background: course.color }}
                    />
                    <span className="sr-only">, on the clock</span>
                  </>
                )}
                {count > 0 && (
                  <span
                    className={`rail-wide shrink-0 font-mono text-[11px] tabular-nums text-muted ${running ? '' : 'ml-auto'}`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}

          {/* There is more you could add here: the dashed line, as on the
              Tasks bands and the shelf. Quiet until the list is pointed at,
              and always there when the term has no courses yet. */}
          <Link
            href="/dashboard?add=course"
            className={`rail-link rail-wide mt-1 flex h-9 items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3.5 font-serif text-[13px] italic text-muted no-underline transition-opacity hover:text-ink focus-visible:opacity-100 ${
              ordered.length > 0 ? 'opacity-0 group-hover/courses:opacity-100' : ''
            }`}
          >
            <span aria-hidden className="not-italic">+</span>
            <span className="rail-label">add a course</span>
          </Link>
          {ordered.length === 0 && (
            <Link
              href="/dashboard?add=course"
              aria-label="Add a course"
              className="rail-link rail-narrow mx-auto mt-1 grid h-10 w-10 place-items-center rounded-[10px] border border-dashed border-line-strong text-muted no-underline hover:text-ink"
              data-tip="Add a course"
            >
              +
            </Link>
          )}
        </div>

        {/* The start. It offers what Today would start next, through the same
            popover a row opens, and draws no clock of its own: once a sitting
            runs the dock is the only clock and this steps aside. */}
        {!active && start && (
          <div className="mx-1.5 mt-2 border-t border-line pt-2">
          <button
            ref={startRef}
            type="button"
            onClick={openStart}
            aria-label={
              start.taskTitle ? `Start timer for ${start.taskTitle}` : `Start timer for ${start.course.code}`
            }
            className="rail-link rail-row flex w-full items-center gap-3 rounded-[10px] px-2 py-1.5 text-left"
            data-tip={start.taskTitle ? `Start · ${start.taskTitle}` : `Time ${start.course.code}`}
          >
            <span
              aria-hidden
              className="mx-auto grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform hover:scale-105 active:scale-95"
              style={{ background: resolveTint(start.course.color, start.course.tint), color: start.course.color }}
            >
              {PLAY}
            </span>
            <span className="rail-wide min-w-0 flex-1">
              <span className="rail-label block truncate font-serif text-[14px] leading-tight text-ink">
                {start.taskTitle ?? `time ${start.course.code}`}
              </span>
              <span className="mt-1 flex items-center gap-1.5">
                <span className="course-rule" style={{ ['--c' as string]: start.course.color, width: 14 }} />
                <span className="eyebrow truncate">
                  {start.taskTitle ? start.course.code : start.course.name}
                </span>
              </span>
            </span>
          </button>
          </div>
        )}

        <div className="mt-1">{screenRow(SETTINGS)}</div>
      </nav>

      {mounted &&
        tip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[60] -translate-y-1/2 animate-fade-in whitespace-nowrap rounded-[10px] border border-line bg-paper px-2.5 py-1.5 text-[12px] text-ink shadow-[0_8px_20px_rgba(57,48,36,.12)]"
            style={{ top: tip.top, left: tip.left }}
          >
            {tip.text}
          </div>,
          document.body,
        )}
      {mounted &&
        createPortal(
          <StartTimerPopover target={startTarget} onClose={() => setStartTarget(null)} />,
          document.body,
        )}
    </>
  );
}

/** Today's date line, "Thu 19 Sep 2026", used by every desktop page header. */
export function todayLine(): string {
  const d = new Date(isoDate() + 'T12:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
