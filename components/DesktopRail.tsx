'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCourses, useTasks } from '@/lib/data-hooks';
import { useTimer } from '@/lib/timer-context';
import { formatHHMMSS, isoDate } from '@/lib/utils';
import { sortCourses } from '@/lib/data/course-order';
import AkadaMark from './notebook/AkadaMark';

/**
 * The desktop rail.
 *
 * Wide screens used to get the phone column with wider margins, which meant a
 * 1440px display spent two thirds of itself on empty paper and still made the
 * reader go through a bottom bar to change tab. The rail is 232px, collapses
 * to its icons, and carries the four screens, the courses under them, the
 * timer and settings. Phone keeps BottomNav, so this never renders there.
 */

const RAIL_WIDE = 232;
const RAIL_NARROW = 64;
const COLLAPSE_KEY = 'akada.rail.collapsed';

export const RAIL_WIDTHS = { wide: RAIL_WIDE, narrow: RAIL_NARROW };

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

const SETTINGS_ICON = (
  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="10" cy="17" r="2.2" />
  </svg>
);

/** Read the stored choice before first paint so the rail does not jump. */
function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useRailCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
    const onStorage = (e: StorageEvent) => {
      if (e.key === COLLAPSE_KEY) setCollapsed(e.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const set = (next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, String(next));
    } catch {
      // The rail still collapses for this visit; it just will not be
      // remembered, which is a fair trade for not throwing on a click.
    }
    // Other rails on the page (there is one, but a second tab is common)
    // and the shell's own gutter both listen for this.
    window.dispatchEvent(new CustomEvent('akada:rail', { detail: next }));
  };

  return [collapsed, set];
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + '/');
}

export default function DesktopRail() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useRailCollapsed();
  const { courses } = useCourses();
  const { tasks } = useTasks();
  const { active, elapsedSeconds, pause, resume, stop } = useTimer();

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

  const runningCourse = active
    ? courses.find((c) => c.id === active.courseId) ?? null
    : null;

  const width = collapsed ? RAIL_NARROW : RAIL_WIDE;

  const rowBase =
    'flex h-10 items-center rounded-[10px] text-[13px] transition-colors hover:bg-bg-tint hover:text-ink';

  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col gap-1 border-r border-line bg-bg px-3 pb-4 pt-5 md:flex"
      style={{ width }}
    >
      {/* Wordmark and the collapse handle. When the rail is narrow the mark
          becomes the handle, because there is no room for both. */}
      <div className={`flex items-center px-2 pb-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5 text-ink no-underline">
            <AkadaMark size={18} />
            <span className="font-serif text-[20px] font-medium tracking-[-0.02em]">Akada</span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="grid h-10 w-10 place-items-center rounded-[10px] text-muted transition-colors hover:bg-bg-tint hover:text-ink"
        >
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d={collapsed ? 'M4 5h16M4 12h16M4 19h16' : 'M4 5h16M4 12h10M4 19h16'} />
          </svg>
        </button>
      </div>

      {NAV.map((item) => {
        const on = isActive(pathname, item.href);
        const count = item.href === '/tasks' ? openCounts.total : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={collapsed ? item.label : undefined}
            aria-current={on ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            className={`${rowBase} no-underline ${collapsed ? 'justify-center px-0' : 'gap-3 px-2.5'} ${
              on ? 'bg-bg-tint font-medium text-ink' : 'text-ink-soft'
            }`}
          >
            {item.icon}
            {!collapsed && (
              <>
                <span className="font-medium">{item.label}</span>
                {count > 0 && (
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-muted">{count}</span>
                )}
              </>
            )}
          </Link>
        );
      })}

      {/* The courses, in the order the reader dragged their dashboard into.
          Each is a colour mark rather than an icon, so the rail reads as the
          term's own spine. */}
      {ordered.length > 0 && (
        <>
          <div className="mx-2.5 mb-2 mt-4 border-t border-line" />
          {!collapsed && <p className="eyebrow mb-2 px-2.5">Courses</p>}
          <div className="min-h-0 flex-1 overflow-y-auto app-scroll">
            {ordered.map((course) => {
              const on = pathname === `/courses/${course.id}`;
              const count = openCounts.per.get(course.id) ?? 0;
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  aria-label={collapsed ? course.code : undefined}
                  title={collapsed ? `${course.code} · ${course.name}` : undefined}
                  className={`${rowBase} no-underline ${collapsed ? 'justify-center px-0' : 'gap-3 px-2.5'} ${
                    on ? 'bg-bg-tint text-ink' : 'text-ink-soft'
                  }`}
                >
                  <span
                    aria-hidden
                    className="block w-[3px] shrink-0 rounded-[1px]"
                    style={{ height: collapsed ? 18 : 16, background: course.color }}
                  />
                  {!collapsed && (
                    <>
                      <span className="truncate">{course.code}</span>
                      {count > 0 && (
                        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted">
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
      {ordered.length === 0 && <div className="flex-1" />}

      {/* The timer lives in the rail on desktop rather than floating over the
          page. Idle it is a dashed box offering a start; running it is the
          clock with pause and stop beside it. */}
      {active ? (
        <div
          className="mt-2 rounded-[10px] border border-line bg-paper p-2"
          style={{ boxShadow: `inset 0 0 0 1px ${runningCourse?.color ?? 'transparent'}22` }}
        >
          {collapsed ? (
            <Link
              href="/timer"
              aria-label={`Timer running, ${runningCourse?.code ?? 'session'}, ${formatHHMMSS(elapsedSeconds)}`}
              className="grid h-10 w-full place-items-center rounded-[8px] no-underline"
            >
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${active.isPaused ? '' : 'animate-tick'}`}
                style={{ background: runningCourse?.color ?? 'var(--ink)' }}
              />
            </Link>
          ) : (
            <>
              <Link href="/timer" className="block no-underline">
                <span className="eyebrow block truncate" style={{ color: runningCourse?.color }}>
                  {runningCourse?.code ?? 'Timer'}
                </span>
                <span className="mt-0.5 block font-mono text-[15px] font-medium tabular-nums text-ink">
                  {formatHHMMSS(elapsedSeconds)}
                </span>
              </Link>
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => (active.isPaused ? resume() : pause())}
                  aria-label={active.isPaused ? 'Resume timer' : 'Pause timer'}
                  className="grid h-10 flex-1 place-items-center rounded-[8px] text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
                >
                  {active.isPaused ? (
                    <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 5l12 7-12 7V5z" />
                    </svg>
                  ) : (
                    <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M9 5v14M15 5v14" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stop();
                    router.push('/timer');
                  }}
                  aria-label="Stop the timer and log the session"
                  className="grid h-10 flex-1 place-items-center rounded-[8px] transition-colors hover:bg-bg-tint"
                  style={{ color: runningCourse?.color ?? 'var(--ink)' }}
                >
                  <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <Link
          href="/timer"
          aria-label="Start a timer"
          title={collapsed ? 'Start a timer' : undefined}
          className={`mt-2 flex items-center rounded-[10px] border border-dashed border-line-strong no-underline transition-colors hover:bg-bg-tint ${
            collapsed ? 'h-10 justify-center' : 'justify-between gap-2 px-3 py-2.5'
          }`}
        >
          {collapsed ? (
            <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-ink-soft">
              <path d="M7 5l12 7-12 7V5z" />
            </svg>
          ) : (
            <>
              <span>
                <span className="eyebrow block">Timer</span>
                <span className="mt-0.5 block font-mono text-[13px] tabular-nums text-muted-soft">00:00</span>
              </span>
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 5l12 7-12 7V5z" />
                </svg>
                Start
              </span>
            </>
          )}
        </Link>
      )}

      <Link
        href="/settings"
        aria-label={collapsed ? 'Settings' : undefined}
        title={collapsed ? 'Settings' : undefined}
        aria-current={isActive(pathname, '/settings') ? 'page' : undefined}
        className={`${rowBase} mt-1 no-underline ${collapsed ? 'justify-center px-0' : 'gap-3 px-2.5'} ${
          isActive(pathname, '/settings') ? 'bg-bg-tint font-medium text-ink' : 'text-ink-soft'
        }`}
      >
        {SETTINGS_ICON}
        {!collapsed && <span className="font-medium">Settings</span>}
      </Link>
    </nav>
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
