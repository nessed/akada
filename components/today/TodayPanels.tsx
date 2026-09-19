'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Course, Session, Task } from '@/lib/data';
import {
  dueLabel,
  formatHM,
  isoDate,
  sessionsForDate,
  startOfWeek,
  totalSeconds,
} from '@/lib/utils';
import { isLoggableDuration } from '@/lib/session-safety';
import { backlogPages, countdowns, readingBacklog, readingRate } from '@/lib/derive';
import HourStrokes from '@/components/HourStrokes';
import HandNote from '@/components/notebook/HandNote';

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
  onStart: (task: Task, el: HTMLElement, open: boolean) => void;
  onDone: (task: Task) => void;
  onSnooze: (task: Task) => void;
  onOpen?: (task: Task) => void;
}

/**
 * The one task the screen actually asks for. Oldest overdue first, because
 * the thing that has been waiting longest is the thing that will keep waiting.
 */
export function UpNext({ task, course, onStart, onDone, onSnooze, onOpen }: UpNextProps) {
  const due = dueLabel(task.dueDate);
  const color = course?.color ?? 'var(--ink)';

  return (
    <section className="deckle relative overflow-hidden border border-line bg-paper py-6 pl-8 pr-7">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <span
        aria-hidden
        className="absolute right-0 top-0 h-[22px] w-[22px]"
        style={{ background: 'linear-gradient(225deg, var(--bg-tint) 50%, transparent 50%)' }}
      />

      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow m-0">Up next</p>
        <HandNote color="var(--ink-soft)" size={17}>
          oldest overdue first
        </HandNote>
      </div>

      {course && (
        <div className="mt-4 flex items-center gap-2.5">
          <span className="eyebrow" style={{ color }}>
            {course.code}
          </span>
          <span className="text-[12px] text-muted">{course.name}</span>
        </div>
      )}

      <h2 className="m-0 mt-1.5 font-serif text-[24px] font-medium leading-[1.15] tracking-[-0.02em] md:text-[28px]">
        {onOpen ? (
          <button type="button" onClick={() => onOpen(task)} className="bg-transparent text-left">
            {task.title}
          </button>
        ) : (
          task.title
        )}
      </h2>

      <p className="m-0 mt-2.5 font-mono text-[12px] tracking-[0.02em] text-muted">
        {due && (
          <span className={due.category === 'overdue' ? 'text-warn' : 'text-ink'}>
            Due {due.formattedDate}
            {due.category === 'overdue' ? ` · ${-due.days} days overdue` : ''}
          </span>
        )}
        {task.priority === 'high' && <span className="text-priority"> · high</span>}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={(e) => onStart(task, e.currentTarget, false)}
          className="flex h-11 items-center gap-2.5 rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-contrast transition-opacity hover:opacity-90"
        >
          <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5l12 7-12 7V5z" />
          </svg>
          Start
        </button>
        <button
          type="button"
          onClick={(e) => onStart(task, e.currentTarget, true)}
          className="h-11 rounded-[10px] border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
        >
          Open ended
        </button>
        <button
          type="button"
          onClick={() => onDone(task)}
          className="h-11 rounded-[10px] px-4 text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => onSnooze(task)}
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
  onOpen,
}: {
  tasks: Task[];
  courses: Course[];
  sessions: Session[];
  onOpen?: (task: Task) => void;
}) {
  const today = isoDate();
  const coming = useMemo(() => countdowns(tasks, courses, today), [tasks, courses, today]);
  const backlog = useMemo(() => readingBacklog(tasks), [tasks]);
  const pages = useMemo(() => backlogPages(tasks), [tasks]);
  const rate = useMemo(() => readingRate(tasks, sessions), [tasks, sessions]);

  if (coming.length === 0 && pages === 0) return null;

  return (
    <section className="rounded-[14px] border border-line bg-paper p-5">
      <div className="flex items-baseline justify-between border-b border-line-soft pb-2.5">
        <p className="eyebrow m-0">Coming</p>
        {coming.length > 0 && (
          <span className="font-mono text-[11px] text-muted">
            next {coming.length === 1 ? 'one' : coming.length}
          </span>
        )}
      </div>

      {coming.map(({ task, course, days }) => (
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
            <span className="eyebrow block truncate" style={{ color: course?.color }}>
              {course?.code ?? '—'}
              {task.kind === 'exam' && <span className="ml-1.5 text-warn">exam</span>}
              {(task.weight ?? 0) > 0 && (
                <span className="ml-1.5 text-muted">{Math.round(task.weight as number)}%</span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-ink">{task.title}</span>
          </span>
          <span
            className={`tnum shrink-0 font-mono text-[13px] font-semibold ${
              days <= 2 ? 'text-warn' : 'text-ink'
            }`}
          >
            {days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`}
          </span>
        </button>
      ))}

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
    <section className="rounded-[14px] border border-line bg-paper p-5">
      <div className="flex items-baseline justify-between border-b border-line-soft pb-2.5">
        <p className="eyebrow m-0">Today</p>
        <span className="font-mono text-[11px] text-muted">of {goalHours}h</span>
      </div>

      <p className="m-0 mt-4 font-mono text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
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
    <section className="rounded-[14px] border border-line bg-paper p-5">
      <div className="flex items-baseline justify-between border-b border-line-soft pb-2.5">
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

      <div className="mt-2 flex gap-1.5 font-mono text-[9.5px] text-muted-soft">
        {days.map((day) => (
          <span key={day.iso} className="flex-1 text-center">
            <span className={day.isToday ? 'text-ink' : ''}>{day.label}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

/* ── Courses this week ─────────────────────────────────────────────────── */

export function CoursesWeekPanel({
  courses,
  sessions,
  onStart,
}: {
  courses: Course[];
  sessions: Session[];
  onStart: (course: Course, el: HTMLElement) => void;
}) {
  const weekStart = isoDate(startOfWeek());

  const rows = useMemo(
    () =>
      courses.map((course) => {
        const mine = sessions.filter(
          (s) => s.courseId === course.id && isLoggableDuration(s.durationSeconds),
        );
        const week = mine.filter((s) => s.date >= weekStart);
        const last = mine.reduce<string | null>(
          (acc, s) => (acc == null || s.date > acc ? s.date : acc),
          null,
        );
        const quietDays = last
          ? Math.round((Date.now() - new Date(last + 'T12:00:00').getTime()) / 86_400_000)
          : null;
        return { course, secs: totalSeconds(week), quietDays };
      }),
    [courses, sessions, weekStart],
  );

  if (rows.length === 0) return null;

  return (
    <section className="rounded-[14px] border border-line bg-paper p-5">
      <div className="flex items-baseline justify-between border-b border-line-soft pb-2.5">
        <p className="eyebrow m-0">Courses · week</p>
        <Link href="/courses" className="text-[11px] text-muted no-underline hover:text-ink">
          All
        </Link>
      </div>

      <div className="mt-1">
        {rows.map(({ course, secs, quietDays }) => (
          <div
            key={course.id}
            className="group flex items-center gap-3 rounded-[10px] px-1 py-2.5 transition-colors hover:bg-paper-2"
          >
            <span
              aria-hidden
              className="block h-7 w-[3px] shrink-0 rounded-[1px]"
              style={{ background: course.color }}
            />
            <Link href={`/courses/${course.id}`} className="min-w-0 flex-1 no-underline">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] text-ink">{course.code}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {/* A course nobody has opened in a while says so rather than
                      showing a row of empty strokes and leaving it at that. */}
                  {secs > 0
                    ? `${formatHM(secs)} / ${course.weeklyGoalHours}h`
                    : quietDays && quietDays > 1
                      ? `${quietDays}d quiet`
                      : `0m / ${course.weeklyGoalHours}h`}
                </span>
              </span>
              <HourStrokes
                seconds={secs}
                goalHours={course.weeklyGoalHours}
                color={course.color}
                height={10}
                width={7}
                max={10}
                className="mt-1.5"
                label={`${course.code}, ${formatHM(secs)} of ${course.weeklyGoalHours} hours this week`}
              />
            </Link>
            <button
              type="button"
              onClick={(e) => onStart(course, e.currentTarget)}
              aria-label={`Start timer on ${course.code}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-bg-tint text-ink-soft opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5l12 7-12 7V5z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
