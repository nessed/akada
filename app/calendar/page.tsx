'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import { useCourses, useTasks, useSessions, useOnboardingComplete } from '@/lib/data-hooks';
import { usePreferences, plannerDate } from '@/lib/preferences';
import { parseMeetingTime } from '@/lib/meeting-time';
import { isoDate, formatHM, resolveTint } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import type { Course, Task } from '@/lib/data';

/** Monday first, the way the heatmap and the week strip already count. */
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Task dots a cell will draw before it gives up and counts the rest. */
const MAX_DOTS = 3;

interface DayCell {
  iso: string;
  dayOfMonth: number;
  weekday: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  tasks: Task[];
  openTasks: Task[];
  seconds: number;
  /** Study time as a fraction of the busiest day in view, for the wash. */
  intensity: number;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const [prefs] = usePreferences();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { sessions, isLoading: sessionsLoading } = useSessions();

  // `plannerDate` rather than a raw Date, so a student whose day ends at 2am
  // sees last night still counted as yesterday, the same as everywhere else.
  const todayIso = plannerDate();
  const today = useMemo(() => new Date(todayIso + 'T00:00:00'), [todayIso]);

  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [selected, setSelected] = useState(todayIso);

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) {
      router.replace('/onboarding');
    }
  }, [onboarded, onboardingLoading, onboardingError, router]);

  const courseById = useMemo(() => {
    const map = new Map<string, Course>();
    for (const course of courses) map.set(course.id, course);
    return map;
  }, [courses]);

  // Tasks and logged time, bucketed by the day they belong to. Built once per
  // data change rather than per cell, so the grid below is only arithmetic.
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const bucket = map.get(task.dueDate);
      if (bucket) bucket.push(task);
      else map.set(task.dueDate, [task]);
    }
    return map;
  }, [tasks]);

  const secondsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of sessions) {
      if (!isLoggableDuration(session.durationSeconds)) continue;
      map.set(
        session.date,
        (map.get(session.date) ?? 0) + clampSessionSeconds(session.durationSeconds),
      );
    }
    return map;
  }, [sessions]);

  const { cells, monthLabel, yearLabel } = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    // Back up to the Monday on or before the 1st, so the grid starts on a
    // full week. getDay is Sunday-first; this shifts it to Monday-first.
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(cursor.year, cursor.month, 1 - lead);

    const last = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const weeks = Math.ceil((lead + last) / 7);

    const out: DayCell[] = [];
    let busiest = 0;
    for (let i = 0; i < weeks * 7; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = isoDate(date);
      const seconds = secondsByDate.get(iso) ?? 0;
      if (seconds > busiest) busiest = seconds;
      const dayTasks = tasksByDate.get(iso) ?? [];
      out.push({
        iso,
        dayOfMonth: date.getDate(),
        weekday: (date.getDay() + 6) % 7,
        inMonth: date.getMonth() === cursor.month,
        isToday: iso === todayIso,
        isFuture: iso > todayIso,
        tasks: dayTasks,
        openTasks: dayTasks.filter((task) => !task.completed),
        seconds,
        intensity: 0,
      });
    }
    for (const cell of out) {
      cell.intensity = busiest > 0 ? cell.seconds / busiest : 0;
    }

    return {
      cells: out,
      monthLabel: first.toLocaleDateString(undefined, { month: 'long' }),
      yearLabel: String(cursor.year),
    };
  }, [cursor, tasksByDate, secondsByDate, todayIso]);

  const accent = prefs.primaryAccent === 'green' ? 'var(--sage)' : 'var(--ink)';

  const selectedDate = useMemo(() => new Date(selected + 'T00:00:00'), [selected]);
  const selectedTasks = tasksByDate.get(selected) ?? [];
  const selectedSeconds = secondsByDate.get(selected) ?? 0;
  const selectedWeekday = (selectedDate.getDay() + 6) % 7;

  // Courses that meet on the selected weekday, in the order they meet.
  const selectedClasses = useMemo(() => {
    const out: { course: Course; timeLabel: string }[] = [];
    for (const course of courses) {
      const meeting = parseMeetingTime(course.meetingTime);
      if (!meeting?.days.includes(selectedWeekday)) continue;
      out.push({ course, timeLabel: meeting.timeLabel });
    }
    return out.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
  }, [courses, selectedWeekday]);

  function shiftMonth(delta: number) {
    setCursor((current) => {
      const date = new Date(current.year, current.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  function goToToday() {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
    setSelected(todayIso);
  }

  const loading = onboardingLoading || coursesLoading || tasksLoading || sessionsLoading;
  if (loading) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Loading your calendar" className="mb-6" />
      </PageShell>
    );
  }

  const onThisMonth = monthKey(cursor.year, cursor.month) === monthKey(today.getFullYear(), today.getMonth());

  return (
    <PageShell>
      <header className="mb-[var(--density-header)] flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow m-0 text-muted">The month</p>
          <h1 className="mt-1.5 mb-0 font-serif text-[36px] font-medium leading-[1.05] tracking-[-0.025em]">
            {monthLabel}{' '}
            <span className="font-serif text-[28px] italic text-muted">{yearLabel}</span>
          </h1>
        </div>

        {/* Two arrows and nothing else. The month is named beside them, so a
            label on each one would be the interface talking twice. */}
        <div className="flex shrink-0 items-center gap-1">
          <ArrowButton label="Previous month" onClick={() => shiftMonth(-1)} back />
          <ArrowButton label="Next month" onClick={() => shiftMonth(1)} />
        </div>
      </header>

      {!onThisMonth && (
        <button
          type="button"
          onClick={goToToday}
          className="mb-3 bg-transparent p-0 text-left"
        >
          <HandNote rotate={-2}>take me back to today</HandNote>
        </button>
      )}

      <div className="grid grid-cols-7 gap-x-1">
        {WEEKDAYS.map((day, index) => (
          <span
            key={day}
            className={`eyebrow pb-2 text-center ${
              prefs.hideWeekends && index >= 5 ? 'text-muted-soft opacity-40' : ''
            }`}
          >
            {day}
          </span>
        ))}
      </div>

      {/* The grid itself. No cell borders: a ruled page is lines between
          rows, not a box around every square, so weeks are separated by one
          hairline and the columns by nothing at all. */}
      <div className="grid grid-cols-7 gap-x-1 border-t border-line">
        {cells.map((cell) => (
          <DayButton
            key={cell.iso}
            cell={cell}
            accent={accent}
            courseById={courseById}
            selected={cell.iso === selected}
            dimmed={Boolean(prefs.hideWeekends) && cell.weekday >= 5}
            onSelect={() => setSelected(cell.iso)}
          />
        ))}
      </div>

      <DayDetail
        date={selectedDate}
        isToday={selected === todayIso}
        classes={selectedClasses}
        tasks={selectedTasks}
        seconds={selectedSeconds}
        courseById={courseById}
      />
    </PageShell>
  );
}

function ArrowButton({
  label,
  onClick,
  back,
}: {
  label: string;
  onClick: () => void;
  back?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center bg-transparent text-muted transition-colors hover:text-ink"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={back ? undefined : { transform: 'scaleX(-1)' }}
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}

function DayButton({
  cell,
  accent,
  courseById,
  selected,
  dimmed,
  onSelect,
}: {
  cell: DayCell;
  accent: string;
  courseById: Map<string, Course>;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  // Logged time is a wash behind the number, the same idiom as the stats
  // heatmap: the denser the colour, the longer the day ran. Future days have
  // nothing to show and stay clean paper.
  //
  // The tone is warm on purpose. Ink at any strength greys a cream page, and
  // a grid of grey squares reads as a row of disabled buttons rather than
  // days somebody worked. This is the tan the background texture already
  // uses, kept faint enough that the darkest day is still paper.
  const wash =
    cell.seconds > 0 && !cell.isFuture
      ? accent === 'var(--ink)'
        ? `rgba(176, 158, 116, ${(0.10 + cell.intensity * 0.26).toFixed(3)})`
        : `rgba(168, 184, 155, ${(0.14 + cell.intensity * 0.34).toFixed(3)})`
      : undefined;

  const dots = cell.openTasks.slice(0, MAX_DOTS);
  const overflow = cell.openTasks.length - dots.length;
  const allDone = cell.tasks.length > 0 && cell.openTasks.length === 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${cell.iso}${cell.openTasks.length ? `, ${cell.openTasks.length} due` : ''}`}
      aria-pressed={selected}
      className={`relative flex min-h-[54px] flex-col items-center gap-1 rounded-[10px] border px-0.5 pt-2 pb-1.5 transition-colors ${
        selected ? 'border-ink bg-bg-tint' : 'border-transparent'
      }`}
      style={{ background: selected ? undefined : wash }}
    >
      <span
        className={`font-mono text-[13px] tabular-nums leading-none ${
          !cell.inMonth
            ? 'text-muted-soft opacity-50'
            : dimmed
              ? 'text-muted-soft'
              : cell.isToday
                ? 'font-semibold text-ink'
                : 'text-ink-soft'
        }`}
      >
        {cell.dayOfMonth}
      </span>

      {/* Today is circled by hand rather than filled in. */}
      {cell.isToday && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[3px] h-[20px] w-[24px] -translate-x-1/2 border-[1.3px] border-ink"
          style={{ borderRadius: '48% 52% 47% 53% / 52% 47% 53% 48%', opacity: 0.55 }}
        />
      )}

      <span className="flex min-h-[7px] items-center justify-center gap-[3px]">
        {dots.map((task) => {
          const course = courseById.get(task.courseId);
          return (
            <span
              key={task.id}
              className="block h-[5px] w-[5px] rounded-full"
              style={{
                background: course?.color ?? 'var(--muted)',
                opacity: cell.inMonth ? 1 : 0.4,
              }}
            />
          );
        })}
        {overflow > 0 && (
          <span className="font-mono text-[9px] leading-none text-muted-soft">
            +{overflow}
          </span>
        )}
        {allDone && (
          <span style={{ opacity: cell.inMonth ? 0.55 : 0.25 }}>
            <HandCheck size={11} color="var(--muted)" strokeWidth={1.7} />
          </span>
        )}
      </span>
    </button>
  );
}

function DayDetail({
  date,
  isToday,
  classes,
  tasks,
  seconds,
  courseById,
}: {
  date: Date;
  isToday: boolean;
  classes: { course: Course; timeLabel: string }[];
  tasks: Task[];
  seconds: number;
  courseById: Map<string, Course>;
}) {
  const heading = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const empty = classes.length === 0 && tasks.length === 0 && seconds === 0;

  return (
    <section className="mt-[var(--density-section)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em]">
          {isToday ? <span className="hl">{heading}</span> : heading}
        </h2>
        {seconds > 0 && (
          <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-ink-soft">
            {formatHM(seconds)}
          </span>
        )}
      </div>

      {empty ? (
        <p className="mt-3 mb-0 font-serif text-[15px] italic text-muted-soft">
          Nothing on this one.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {classes.length > 0 && (
            <div>
              <p className="eyebrow m-0 mb-2 text-muted">In class</p>
              <ul className="m-0 list-none p-0">
                {classes.map(({ course, timeLabel }) => (
                  <li
                    key={course.id}
                    className="flex items-baseline gap-3 border-b border-dashed border-line py-2.5 last:border-b-0"
                  >
                    <span
                      className="eyebrow shrink-0"
                      style={{ color: course.color }}
                    >
                      {course.code}
                    </span>
                    <Link
                      href={`/courses/${course.id}`}
                      className="min-w-0 flex-1 truncate font-serif text-[15px] text-ink-soft"
                    >
                      {course.name}
                    </Link>
                    {timeLabel && (
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                        {timeLabel}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tasks.length > 0 && (
            <div>
              <p className="eyebrow m-0 mb-2 text-muted">Due</p>
              <ul className="m-0 list-none p-0">
                {tasks.map((task) => {
                  const course = courseById.get(task.courseId);
                  return (
                    <li
                      key={task.id}
                      className="flex items-baseline gap-3 border-b border-dashed border-line py-2.5 last:border-b-0"
                    >
                      <span
                        className="eyebrow shrink-0"
                        style={{ color: course?.color }}
                      >
                        {course?.code ?? '—'}
                      </span>
                      <Link
                        href={`/tasks?task=${task.id}`}
                        className={`min-w-0 flex-1 font-serif text-[15px] ${
                          task.completed ? 'text-muted-soft' : 'text-ink'
                        }`}
                      >
                        {task.completed ? (
                          <span
                            className="hl-swipe"
                            style={
                              {
                                '--hl': resolveTint(
                                  course?.color ?? 'var(--muted)',
                                  course?.tint,
                                ),
                              } as React.CSSProperties
                            }
                          >
                            {task.title}
                          </span>
                        ) : (
                          task.title
                        )}
                      </Link>
                      {task.completed ? (
                        <span className="shrink-0 text-muted">
                          <HandCheck size={13} color="currentColor" strokeWidth={1.7} />
                        </span>
                      ) : (
                        task.priority === 'high' && (
                          <span
                            className="font-hand shrink-0 text-[15px] font-semibold text-priority"
                            style={{ transform: 'rotate(-3deg)' }}
                          >
                            !! high
                          </span>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
