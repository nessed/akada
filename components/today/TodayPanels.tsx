'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Course, Session, Task } from '@/lib/data';
import type { UpNextSort } from '@/lib/preferences';
import {
  dueLabel,
  formatHM,
  formatRelativeDate,
  isoDate,
  sessionsForDate,
  startOfWeek,
  totalSeconds,
} from '@/lib/utils';
import { isLoggableDuration } from '@/lib/session-safety';
import { LIVE_SESSION_PREFIX } from '@/lib/live-session';
import { backlogPages, countdowns, readingBacklog, readingRate } from '@/lib/derive';
import HourStrokes from '@/components/HourStrokes';
import HandNote from '@/components/notebook/HandNote';
import { RecallStrokes } from '@/components/recall/RecallMarks';
import type { RecallReading } from '@/lib/recall';

/**
 * The panels Today is made of.
 *
 * Each one is a reading of the same three lists, so they live together: the
 * hours panel and the course panel disagreeing about what "this week" means
 * is exactly the bug that comes of writing them in two places.
 */

/* ── Up next ───────────────────────────────────────────────────────────── */

interface UpNextProps {
  task: Task;
  course: Course | undefined;
  /** The third argument starts the session with no target length. */
  onStart: (task: Task, el: HTMLElement, untimed: boolean) => void;
  onDone: (task: Task) => void;
  onSnooze: (task: Task) => void;
  onOpen?: (task: Task) => void;
  sort?: UpNextSort;
  onSortChange?: (sort: UpNextSort) => void;
  /**
   * The record with the running sitting folded in, so the time already put
   * into this task counts up while a timer runs on it.
   */
  sessions?: Session[];
}

// How long Done and Tomorrow wait for the task to lift off before handing
// it over. Matches .lift-away in globals.css.
const LIFT_MS = 200;

// What the marginal note says for each rule, in its own voice rather than the
// name of the setting.
const SORT_NOTE: Record<UpNextSort, string> = {
  'in-progress': 'carry on where you left off',
  'last-done': 'least studied first',
  overdue: 'oldest overdue first',
};

// The note is the control, so clicking it walks the rules in a ring rather
// than flipping between two. Three is still few enough that a click gets you
// back to where you started without thinking about it.
const SORT_ORDER: UpNextSort[] = ['in-progress', 'last-done', 'overdue'];

function nextSort(sort: UpNextSort): UpNextSort {
  const i = SORT_ORDER.indexOf(sort);
  return SORT_ORDER[(i + 1) % SORT_ORDER.length];
}

/**
 * The one task the screen actually asks for.
 *
 * Which one that is depends on `sort`, and the handwritten note in the corner
 * is the control: it says which rule is running and switching is a click on
 * it. A dropdown here would have been the heaviest piece of chrome on the
 * page, for a choice between two things.
 */
export function UpNext({
  task,
  course,
  onStart,
  onDone,
  onSnooze,
  onOpen,
  sort = 'in-progress',
  onSortChange,
  sessions = [],
}: UpNextProps) {
  const due = dueLabel(task.dueDate);
  const color = course?.color ?? 'var(--ink)';

  // What this task has had so far, and whether it is on the clock right now.
  // The live sitting is in the list, so the figure moves while it runs.
  const { spent, lastSat, onClock } = useMemo(() => {
    let spent = 0;
    let lastSat: string | null = null;
    let onClock = false;
    for (const s of sessions) {
      if (s.taskId !== task.id) continue;
      if (s.id.startsWith(LIVE_SESSION_PREFIX)) onClock = true;
      else if (!lastSat || s.date > lastSat) lastSat = s.date;
      spent += totalSeconds([s]);
    }
    return { spent, lastSat, onClock };
  }, [sessions, task.id]);

  // Done and Tomorrow lift the task off the page first, then hand it over,
  // so the next one arrives into a space rather than replacing it mid-frame.
  // Keyed on the id so the next task never inherits it; the timeout puts the
  // task back if the change never lands.
  const [leaving, setLeaving] = useState<string | null>(null);
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), 1600);
    return () => window.clearTimeout(t);
  }, [leaving]);
  const letGo = (then: (task: Task) => void) => {
    if (leaving === task.id) return;
    setLeaving(task.id);
    window.setTimeout(() => then(task), LIFT_MS);
  };

  // The swipe under the title is the course's own pastel, lifted off the
  // line the way the highlighter tokens are.
  const swipe = course?.color
    ? `color-mix(in srgb, ${course.color} 42%, transparent)`
    : 'var(--highlight-yellow)';

  // No card. Up next leads by where it sits, across the top of the page
  // over the double rule, and the course colour is the short rule before
  // the code rather than a stripe down a box's edge.
  return (
    <section className="relative">
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow m-0 text-ink-soft">Up next</p>
        {onSortChange ? (
          <button
            type="button"
            onClick={() => onSortChange(nextSort(sort))}
            // The note is already the label, so it says what it is rather
            // than "sort by", and the title carries what a click will do.
            title={`Showing ${SORT_NOTE[sort]}. Switch to ${SORT_NOTE[nextSort(sort)]}.`}
            className="-my-3 flex min-h-10 shrink-0 items-center bg-transparent p-0 text-right transition-opacity hover:opacity-70"
          >
            {/* Wrapped, because HandNote's tilt is a transform and settle
                would hold its own over it. */}
            <span key={sort} className="inline-block animate-settle">
              <HandNote color="var(--ink-soft)" size={17}>
                {SORT_NOTE[sort]}
              </HandNote>
            </span>
          </button>
        ) : (
          <HandNote color="var(--ink-soft)" size={17}>
            {SORT_NOTE[sort]}
          </HandNote>
        )}
      </div>

      {/* Everything about the task itself, keyed on it, so a new one settles
          in and draws its rule and its swipe fresh. */}
      <div key={task.id} className={leaving === task.id ? 'lift-away' : 'animate-settle'}>
      {course && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <span aria-hidden className="course-rule rule-draw" style={{ ['--c' as string]: color }} />
          <span className="eyebrow text-ink-soft">{course.code}</span>
          <span className="text-[12px] text-muted">{course.name}</span>
        </div>
      )}

      <h2 className="m-0 mt-1.5 font-serif text-[24px] font-medium leading-[1.15] tracking-[-0.02em] md:text-[28px]">
        {onOpen ? (
          <button type="button" onClick={() => onOpen(task)} className="bg-transparent text-left">
            <span className="hl-swipe hl-draw -mx-[3px]" style={{ ['--hl' as string]: swipe }}>
              {task.title}
            </span>
          </button>
        ) : (
          <span className="hl-swipe hl-draw -mx-[3px]" style={{ ['--hl' as string]: swipe }}>
            {task.title}
          </span>
        )}
      </h2>

      <p className="m-0 mt-2 font-serif italic text-[15px] text-muted">
        {/* No date is a state the task is in, and since Up next now reaches
            open-ended work on a day with nothing due, it is said rather than
            left as a gap with " · high" hanging off the front of it. */}
        {due ? (
          <span className={due.category === 'overdue' ? 'text-warn' : 'text-ink'}>
            Due {due.formattedDate}
            {due.category === 'overdue' ? ` · ${-due.days} days overdue` : ''}
          </span>
        ) : (
          <span>open ended</span>
        )}
        {task.priority === 'high' && <span className="text-priority"> · high</span>}
        {onClock ? (
          <span className="text-ink">
            {' · '}
            <span aria-hidden className="inline-block h-[6px] w-[6px] -translate-y-[2px] animate-tick rounded-full" style={{ background: color }} />{' '}
            on the clock, <span className="font-mono not-italic tnum text-[13.5px]">{formatHM(spent)}</span> in
          </span>
        ) : spent >= 60 ? (
          <span>
            {' · '}
            <span className="font-mono not-italic tnum text-[13.5px]">{formatHM(spent)}</span> in
            {lastSat && `, last sat ${formatRelativeDate(lastSat).toLowerCase()}`}
          </span>
        ) : null}
      </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={(e) => onStart(task, e.currentTarget, false)}
          className="group flex h-11 items-center gap-2.5 rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-contrast transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]"
        >
          <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover:translate-x-[2px]">
            <path d="M7 5l12 7-12 7V5z" />
          </svg>
          Start
        </button>
        <button
          type="button"
          onClick={(e) => onStart(task, e.currentTarget, true)}
          className="h-11 rounded-[10px] border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
        >
          Untimed
        </button>
        <button
          type="button"
          onClick={() => letGo(onDone)}
          className="h-11 rounded-[10px] px-4 text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => letGo(onSnooze)}
          className="h-11 rounded-[10px] px-4 text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
        >
          Tomorrow
        </button>
      </div>
    </section>
  );
}

/* ── Coming ────────────────────────────────────────────────────────────── */

/**
 * What the kind column is for.
 *
 * A dated task and a dated exam are not the same news, and a list sorted
 * purely by date buries the midterm under tomorrow's problem set. This says
 * what is coming that actually carries weight, and what reading has piled up
 * behind it, in pages and in the hours those pages have historically cost.
 *
 * It draws nothing at all when nothing has a kind or a weight, which is the
 * state every account starts in. Today does not grow an empty box to prove a
 * feature exists.
 */
export function ComingPanel({
  tasks,
  courses,
  sessions,
  recall = null,
  onOpen,
}: {
  tasks: Task[];
  courses: Course[];
  sessions: Session[];
  /**
   * What the reader is keeping for each course and how much of it came back
   * clear, drawn under the course's first row. A countdown on its own says
   * how close an exam is; this says how close the reader is to it, which is
   * the half of the question the days cannot answer.
   */
  recall?: RecallReading | null;
  onOpen?: (task: Task) => void;
}) {
  const today = isoDate();
  const coming = useMemo(() => countdowns(tasks, courses, today), [tasks, courses, today]);
  const backlog = useMemo(() => readingBacklog(tasks), [tasks]);
  const pages = useMemo(() => backlogPages(tasks), [tasks]);
  const rate = useMemo(() => readingRate(tasks, sessions), [tasks, sessions]);

  if (coming.length === 0 && pages === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between pb-1.5">
        <p className="eyebrow m-0">Coming</p>
        {coming.length > 0 && (
          <span className="font-serif text-[12.5px] italic text-muted">
            next {coming.length === 1 ? 'one' : coming.length}
          </span>
        )}
      </div>

      {coming.map(({ task, course, days }, index) => {
        // Once per course, on its nearest row: two midterms in one course
        // draw on the same material, and saying so twice is saying it twice.
        const standing =
          course && coming.findIndex((c) => c.course?.id === course.id) === index
            ? (recall?.byCourse.get(course.id) ?? null)
            : null;
        return (
        <button
          key={task.id}
          type="button"
          onClick={() => onOpen?.(task)}
          className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-2.5 rounded-[8px] border-b border-line-soft px-2 py-2.5 text-left transition-colors last:border-b-0 hover:bg-bg-tint"
        >
          <span className="min-w-0 flex-1">
            {/* Course, what it is and what it is worth all ride the eyebrow,
                so the countdown is the only thing on the right and the title
                keeps the width it needs. */}
            <span className="eyebrow block truncate text-ink-soft">
              {course && (
                <span
                  aria-hidden
                  className="course-rule relative -top-px mr-2"
                  style={{ ['--c' as string]: course.color }}
                />
              )}
              {course?.code ?? '—'}
              {task.kind === 'exam' && <span className="ml-1.5 text-warn">exam</span>}
              {(task.weight ?? 0) > 0 && (
                <span className="ml-1.5 text-muted">{Math.round(task.weight as number)}%</span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-ink">{task.title}</span>
            {standing && course && (
              <span
                className="mt-1.5 flex items-center gap-2"
                title={`${standing.settled + standing.clear} of the ${standing.kept} things kept for ${course.code} came back clear last time, ${standing.settled} of them on several days running`}
              >
                <RecallStrokes recall={standing} color={course.color} height={10} />
                <span className="tnum font-mono text-[10.5px] text-muted">
                  {standing.settled + standing.clear} of {standing.kept} clear
                </span>
              </span>
            )}
          </span>
          <span
            className={`tnum shrink-0 font-mono text-[13px] font-semibold ${
              days <= 2 ? 'text-warn' : 'text-ink'
            }`}
          >
            {days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`}
          </span>
        </button>
        );
      })}

      {pages > 0 && (
        <p
          className={`m-0 font-serif text-[13px] italic leading-[1.5] text-muted ${
            coming.length > 0 ? 'mt-3.5 border-t border-line-soft pt-3.5' : 'mt-3'
          }`}
        >
          {pages} pages of reading still open across {backlog.length}{' '}
          {backlog.length === 1 ? 'reading' : 'readings'}, about{' '}
          {formatHM(Math.round((pages / rate) * 3600))} at {rate} pages an hour.
        </p>
      )}
    </section>
  );
}

/* ── Today's hours ─────────────────────────────────────────────────────── */

export function TodayHours({
  sessions,
  courses,
  goalHours,
}: {
  sessions: Session[];
  courses: Course[];
  goalHours: number;
}) {
  const today = isoDate();
  const todays = useMemo(() => sessionsForDate(sessions, today), [sessions, today]);
  const total = totalSeconds(todays);

  // Which courses the day was actually spent on, biggest first. Only the top
  // few are named; the rest are in the strokes either way.
  const byCourse = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of todays) map.set(s.courseId, (map.get(s.courseId) ?? 0) + s.durationSeconds);
    return [...map.entries()]
      .map(([id, secs]) => ({ course: courses.find((c) => c.id === id), secs }))
      .filter((r) => r.course)
      .sort((a, b) => b.secs - a.secs);
  }, [courses, todays]);

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow m-0">Today</p>
        <span className="font-serif text-[12.5px] italic text-muted">
          of <span className="font-mono text-[11px] not-italic tabular-nums">{goalHours}h</span>
        </span>
      </div>

      <p className="m-0 mt-4 font-mono text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums xl:mt-6">
        {total > 0 ? formatHM(total) : '0m'}
      </p>

      <HourStrokes
        seconds={total}
        goalHours={goalHours}
        color="var(--ink)"
        className="mt-4"
        label={`${formatHM(total)} of ${goalHours} hours today`}
      />

      {byCourse.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] text-muted">
          {byCourse.slice(0, 3).map(({ course, secs }) => (
            <span key={course!.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="block h-1.5 w-1.5 rounded-[1px]"
                style={{ background: course!.color }}
              />
              {course!.code} <span className="font-mono">{formatHM(secs)}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── This week ─────────────────────────────────────────────────────────── */

export function WeekPanel({
  sessions,
  courses,
  goalHours,
}: {
  sessions: Session[];
  courses: Course[];
  goalHours: number;
}) {
  const days = useMemo(() => {
    const start = startOfWeek();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = isoDate(d);
      const forDay = sessions.filter(
        (s) => s.date === iso && isLoggableDuration(s.durationSeconds),
      );
      // The day's bar is stacked in the colours it was spent on, which is
      // the whole reason this is not one flat rectangle per day.
      const parts = new Map<string, number>();
      for (const s of forDay) parts.set(s.courseId, (parts.get(s.courseId) ?? 0) + s.durationSeconds);
      return {
        iso,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        secs: totalSeconds(forDay),
        parts: [...parts.entries()],
        isToday: iso === isoDate(),
      };
    });
  }, [sessions]);

  const weekTotal = days.reduce((a, d) => a + d.secs, 0);
  const peak = Math.max(1, ...days.map((d) => d.secs));

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow m-0">This week</p>
        <span className="font-mono text-[11px] text-ink">
          {formatHM(weekTotal)} <span className="text-muted">/ {goalHours}h</span>
        </span>
      </div>

      <div className="mt-4 flex h-[52px] items-end gap-1.5">
        {days.map((day) => (
          <div key={day.iso} className="flex h-full flex-1 flex-col justify-end gap-[2px]">
            {day.secs === 0 ? (
              <span
                aria-hidden
                className="block h-[3px] w-full rounded-[1px]"
                style={{ background: 'var(--line)' }}
              />
            ) : (
              day.parts.map(([courseId, secs]) => {
                const course = courses.find((c) => c.id === courseId);
                return (
                  <span
                    key={courseId}
                    aria-hidden
                    className="block w-full rounded-[1px]"
                    style={{
                      height: `${Math.max(4, (secs / peak) * 46)}px`,
                      background: course?.color ?? 'var(--muted-soft)',
                    }}
                  />
                );
              })
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5 text-[10.5px] text-muted-soft">
        {days.map((day) => (
          <span key={day.iso} className="flex-1 text-center">
            <span className={day.isToday ? 'text-ink' : ''}>{day.label}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
