'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Course, Session, Task } from '@/lib/data';
import {
  addDays,
  dayEndingHour,
  dayStartsAt,
  formatHM,
  isoDate,
  sessionsForDate,
  startOfWeek,
  totalSeconds,
} from '@/lib/utils';
import { isLoggableDuration } from '@/lib/session-safety';
import { LIVE_SESSION_PREFIX } from '@/lib/live-session';
import { useNotes } from '@/lib/data-hooks';
import { backlogPages, countdowns, readingBacklog, readingRateDetail } from '@/lib/derive';
import HourStrokes from '@/components/HourStrokes';
import { RecallStrokes } from '@/components/recall/RecallMarks';
import { preparesFor, type RecallReading } from '@/lib/recall';

/**
 * The panels Today is made of.
 *
 * Each one is a reading of the same three lists, so they live together: the
 * hours panel and the course panel disagreeing about what "this week" means
 * is exactly the bug that comes of writing them in two places.
 *
 * Up next is not here. It used to be, as one more reading of the lists; it
 * now sizes a session to the evening and carries a plan, an Or list and a
 * quiet state, and lives in ./UpNext.tsx with the one minute clock on the
 * screen.
 */

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
  const { notes } = useNotes();
  const pace = useMemo(() => readingRateDetail(tasks, sessions, notes), [tasks, sessions, notes]);
  const rate = pace.pagesPerHour;
  // A reading with no page count cannot be turned into hours, so it is named
  // rather than quietly left out of the sum.
  const unpaged = backlog.filter((t) => !t.pages).length;
  const paged = backlog.length - unpaged;

  if (coming.length === 0 && pages === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between pb-1.5">
        <p className="eyebrow m-0 text-ink-soft">Coming</p>
        {coming.length > 0 && (
          <span className="font-serif text-[12.5px] italic text-muted">
            next {coming.length === 1 ? 'one' : coming.length}
          </span>
        )}
      </div>

      {coming.map(({ task, course, days }, index) => {
        // Once per course, on its nearest row: two midterms in one course
        // draw on the same material, and saying so twice is saying it twice.
        // Only under something recall is preparing for (an exam, or a piece
        // worth a fifth of the course), on the course's nearest such row,
        // and only once something in the course has actually been asked:
        // "0 of 1 clear" under a problem set said nothing true.
        const mine = course ? (recall?.byCourse.get(course.id) ?? null) : null;
        const standing =
          course &&
          mine &&
          preparesFor(task) &&
          mine.states.some((state) => state.history.length > 0) &&
          coming.findIndex((c) => c.course?.id === course.id && preparesFor(c.task)) === index
            ? mine
            : null;
        return (
        <button
          key={task.id}
          type="button"
          onClick={() => onOpen?.(task)}
          title={days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`}
          className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3.5 rounded-[8px] border-b border-line-soft px-2 py-3 text-left transition-colors last:border-b-0 hover:bg-bg-tint"
        >
          {/* The date, set like a diary's margin: the weekday over the day. */}
          <span className="flex w-10 shrink-0 flex-col">
            <span className="eyebrow text-muted">{weekday(task.dueDate)}</span>
            <span
              className={`tnum font-mono text-[18px] font-medium leading-[1.2] ${
                days <= 2 ? 'text-warn' : 'text-ink'
              }`}
            >
              {task.dueDate ? Number(task.dueDate.slice(8, 10)) : '—'}
            </span>
          </span>
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
              {task.kind === 'exam' && (
                <span className="ml-2 rounded-[4px] bg-warnTint px-1.5 py-[3px] text-warn">exam</span>
              )}
              {(task.weight ?? 0) > 0 && (
                <span className="ml-1.5 text-muted">worth {Math.round(task.weight as number)}%</span>
              )}
            </span>
            <span className="mt-1 block truncate text-[14px] text-ink">{task.title}</span>
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
        </button>
        );
      })}

      {pages > 0 && (
        <p
          className={`m-0 font-serif text-[13px] italic leading-[1.5] text-muted ${
            coming.length > 0 ? 'mt-3.5 border-t border-line-soft pt-3.5' : 'mt-3'
          }`}
        >
          {pages} pages of reading still open across {paged}{' '}
          {paged === 1 ? 'reading' : 'readings'}
          {unpaged > 0 && <>, and {unpaged} without a page count</>}, about{' '}
          {formatHM(Math.round((pages / rate) * 3600))} at{' '}
          {pace.measured ? 'your' : 'the usual'} {rate} pages an hour.
        </p>
      )}
    </section>
  );
}

function weekday(date: string | null): string {
  if (!date) return '';
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
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
  // Yesterday's, for the small hours: with a day that ends after midnight,
  // what was studied at 4am belongs to the day before, and after the cutoff
  // it used to drop off this page without a trace.
  const yesterdays = useMemo(
    () => sessionsForDate(sessions, addDays(today, -1)),
    [sessions, today],
  );
  const total = totalSeconds(todays);

  // Which courses the day was actually spent on, biggest first. Only the top
  // few are named; the rest are on the ledger either way.
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
        <p className="eyebrow m-0 text-ink-soft">Today</p>
        <span className="font-serif text-[12.5px] italic text-muted">
          of <span className="font-mono text-[11px] not-italic tabular-nums">{goalHours}h</span>
        </span>
      </div>

      <p className="m-0 mt-3 font-mono text-[34px] font-medium leading-none tracking-[-0.03em] tabular-nums xl:text-[40px]">
        {total > 0 ? formatHM(total) : '0m'}
      </p>

      <DayLedger sessions={todays} carried={yesterdays} courses={courses} today={today} />

      {byCourse.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-soft">
          {byCourse.slice(0, 3).map(({ course, secs }) => (
            <span key={course!.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="block h-2 w-2 rounded-[2px]"
                style={{ background: course!.color }}
              />
              {course!.code} <span className="font-mono text-muted">{formatHM(secs)}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The day as a strip from morning to midnight, each sitting laid on it where
 * it happened, in its course colour, with a mark for now. Only a sitting the
 * timer ran knows when it happened (its blocks carry their start); one logged
 * by hand counts in the figure above and is simply not placed.
 *
 * With a day that ends after midnight (Settings, "day ends at"), the strip
 * also carries the small hours before today began: yesterday's blocks that
 * ran after midnight, in pencil, left of a dashed line where the day started,
 * with a line saying which day they were counted to. They are not in today's
 * figure, since they are not today's, but they happened this morning and a
 * reader who studied from four to seven should see it here.
 */
function DayLedger({
  sessions,
  carried = [],
  courses,
  today,
}: {
  sessions: Session[];
  /** The day before's sessions, read only for blocks past midnight. */
  carried?: Session[];
  courses: Course[];
  today: string;
}) {
  // Read after mount, so the server and the first paint agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const dayStart = new Date(`${today}T00:00:00`).getTime();
  // Where the reader's day begins, as hours on the strip: 0 for midnight.
  const cutoff = now === null ? 0 : (dayStartsAt(today) - dayStart) / 3_600_000;
  const blocks = useMemo(() => {
    const out: { key: string; from: number; to: number; color: string; live: boolean; carried: boolean }[] = [];
    const place = (s: Session, carried: boolean) => {
      const color = courses.find((c) => c.id === s.courseId)?.color ?? 'var(--ink-soft)';
      if (s.id.startsWith(LIVE_SESSION_PREFIX)) {
        if (now === null) return;
        out.push({ key: s.id, from: now - s.durationSeconds * 1000, to: now, color, live: true, carried });
        return;
      }
      for (const g of s.segments ?? []) {
        if (g.kind !== 'focus') continue;
        const from = Date.parse(g.startedAt);
        if (!Number.isFinite(from)) continue;
        out.push({ key: `${s.id}:${g.ordinal}`, from, to: from + g.seconds * 1000, color, live: false, carried });
      }
    };
    for (const s of sessions) place(s, false);
    // Only the part of yesterday that ran on past midnight, into this
    // morning, and only once today has begun: before the cutoff those hours
    // are today's own and already on the strip.
    if (cutoff > 0) for (const s of carried) place(s, true);
    return out
      .map((b) => ({ ...b, from: (b.from - dayStart) / 3_600_000, to: (b.to - dayStart) / 3_600_000 }))
      .filter((b) => (b.carried ? b.to > 0 && b.from < cutoff : b.to > 0 && b.from < 32));
  }, [sessions, carried, courses, now, dayStart, cutoff]);

  // Today's time that no timed block accounts for: sittings logged by hand or
  // through the connector carry a length and no clock. The figure above counts
  // them; the strip cannot place them, so it says how much is missing rather
  // than letting a 5h day draw as two.
  const unplacedSeconds = useMemo(() => {
    let sum = 0;
    for (const s of sessions) {
      if (s.id.startsWith(LIVE_SESSION_PREFIX)) continue;
      const timed = (s.segments ?? [])
        .filter((g) => g.kind === 'focus' && Number.isFinite(Date.parse(g.startedAt)))
        .reduce((a, g) => a + g.seconds, 0);
      sum += Math.max(0, s.durationSeconds - timed);
    }
    return sum;
  }, [sessions]);

  const carriedSeconds = blocks
    .filter((b) => b.carried)
    .reduce((sum, b) => sum + (Math.min(b.to, cutoff) - Math.max(b.from, 0)) * 3600, 0);

  // Seven in the morning to midnight, stretched for an early start or a late
  // night past the day boundary.
  const earliest = Math.min(7, ...blocks.map((b) => Math.floor(b.from)));
  const first = Math.max(0, earliest);
  const nowH = now === null ? null : (now - dayStart) / 3_600_000;
  const last = Math.max(24, Math.ceil(Math.max(0, ...blocks.map((b) => b.to), nowH ?? 0)));
  const span = last - first;
  const at = (h: number) => `${((Math.min(last, Math.max(first, h)) - first) / span) * 100}%`;
  const ticks: number[] = [];
  for (let h = first; h <= last; h += 3) ticks.push(h);
  const tickLabel = (h: number) => {
    const hh = h % 24;
    if (hh === 0) return '12a';
    if (hh === 12) return '12p';
    return hh < 12 ? `${hh}a` : `${hh - 12}p`;
  };
  const showBoundary = carriedSeconds > 0 && cutoff > first && cutoff < last;
  const cutoffLabel = tickLabel(dayEndingHour()).replace('a', 'am').replace('p', 'pm');
  const yesterdayName = new Date(`${addDays(today, -1)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
  });

  return (
    <div className="mt-5">
      <div
        role="img"
        aria-label={`${blocks.filter((b) => !b.carried).length} blocks timed today${
          carriedSeconds > 0 ? `, and ${formatHM(carriedSeconds)} before the day began, counted to ${yesterdayName}` : ''
        }`}
        className="relative h-[26px]"
      >
        <span aria-hidden className="absolute inset-x-0 top-[8px] h-[10px] rounded-[3px] bg-bg-tint" />
        {blocks.map((b) => (
          <span
            key={b.key}
            aria-hidden
            className={`absolute top-[8px] h-[10px] min-w-[3px] rounded-[2px] ${b.live ? 'animate-tick' : ''}`}
            style={{
              left: at(b.from),
              width: `calc(${at(b.carried && !b.live ? Math.min(b.to, cutoff) : b.to)} - ${at(b.from)})`,
              background: b.color,
              // Yesterday's, in pencil: on the page, not in today's figure.
              opacity: b.carried ? 0.45 : undefined,
            }}
          />
        ))}
        {showBoundary && (
          <span
            aria-hidden
            className="absolute bottom-0 top-0 border-l border-dashed border-ink-soft"
            style={{ left: at(cutoff) }}
          />
        )}
        {nowH !== null && nowH >= first && nowH <= last && (
          <span aria-hidden className="absolute bottom-0.5 top-0.5 w-[1.5px] rounded-full bg-ink" style={{ left: at(nowH) }} />
        )}
      </div>
      <div aria-hidden className="relative mt-1 h-3.5">
        {ticks.map((h, i) => (
          <span
            key={h}
            className={`absolute font-mono text-[10px] text-muted ${
              i === 0 ? '' : i === ticks.length - 1 && h === last ? '-translate-x-full' : '-translate-x-1/2'
            }`}
            style={{ left: at(h) }}
          >
            {tickLabel(h)}
          </span>
        ))}
      </div>
      {unplacedSeconds >= 60 && (
        <p className="m-0 mt-2.5 font-serif text-[12.5px] italic leading-snug text-muted">
          <span className="font-mono not-italic tabular-nums text-ink-soft">{formatHM(unplacedSeconds)}</span>{' '}
          logged without a start time, so not on the strip
        </p>
      )}
      {carriedSeconds >= 60 && (
        <p className="m-0 mt-2.5 font-serif text-[12.5px] italic leading-snug text-muted">
          <span className="font-mono not-italic tabular-nums text-ink-soft">{formatHM(carriedSeconds)}</span>{' '}
          before {cutoffLabel}, counted to {yesterdayName} ·{' '}
          <Link href="/settings" className="text-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
            your day ends at {cutoffLabel}
          </Link>
        </p>
      )}
    </div>
  );
}

/* ── The week against its goal ─────────────────────────────────────────── */

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * The week's hours against the week's goal, which is the course goals added
 * up (there is no separate one to set). The figure, then the week as a bar a
 * day, each bar its hours written over it and stacked in the colours of the
 * courses it went to, with a dashed line at the day's share of the goal. It
 * replaced a row of one stroke per goal hour, twenty-odd thin marks that read
 * as a barcode: a week is read by its days.
 */
export function WeekHours({ courses, sessions }: { courses: Course[]; sessions: Session[] }) {
  const today = isoDate();
  const monday = isoDate(startOfWeek());
  const { days, total } = useMemo(() => {
    const days = WEEKDAYS.map((label, i) => {
      const d = new Date(`${monday}T12:00:00`);
      d.setDate(d.getDate() + i);
      return { label, date: isoDate(d), byCourse: new Map<string, number>(), total: 0 };
    });
    let total = 0;
    for (const s of sessions) {
      if (s.date < monday || !isLoggableDuration(s.durationSeconds)) continue;
      const day = days.find((d) => d.date === s.date);
      if (!day) continue;
      day.byCourse.set(s.courseId, (day.byCourse.get(s.courseId) ?? 0) + s.durationSeconds);
      day.total += s.durationSeconds;
      total += s.durationSeconds;
    }
    return { days, total };
  }, [sessions, monday]);

  const goalHours = courses.reduce((a, c) => a + (c.weeklyGoalHours || 0), 0);
  const left = Math.max(0, goalHours * 3600 - total);
  // Today counts as one of the days left, so Sunday is "1 day".
  const daysLeft = 7 - ((new Date(today + 'T12:00:00').getDay() + 6) % 7);

  // The tallest thing on the chart, a day or the goal line, stands 80px.
  const pace = goalHours / 7;
  const top = Math.max(pace * 1.1, ...days.map((d) => d.total / 3600), 1);
  const px = (hours: number) => Math.round((hours / top) * 80);
  const worked = courses.filter((c) => days.some((d) => d.byCourse.has(c.id)));

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow m-0 text-ink-soft">This week</p>
        {goalHours > 0 && (
          <span className="font-serif text-[12.5px] italic text-muted">
            of <span className="font-mono text-[11px] not-italic tabular-nums">{goalHours}h</span>
          </span>
        )}
      </div>

      <p className="m-0 mt-3 font-mono text-[34px] font-medium leading-none tracking-[-0.03em] tabular-nums xl:text-[40px]">
        {total > 0 ? formatHM(total) : '0m'}
      </p>

      <div
        role="img"
        aria-label={days.map((d) => `${d.label} ${formatHM(d.total)}`).join(', ')}
        className="relative mt-5 grid h-[108px] grid-cols-7 items-end border-b border-line"
      >
        {goalHours > 0 && (
          <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-line-strong" style={{ bottom: px(pace) }} />
        )}
        {days.map((d) => {
          const future = d.date > today;
          return (
            <div key={d.date} aria-hidden className="relative flex flex-col items-center justify-end gap-1">
              {!future && (
                <span className={`relative whitespace-nowrap bg-bg px-0.5 font-mono text-[10px] tabular-nums ${d.total > 0 ? 'text-ink' : 'text-muted'}`}>
                  {d.total > 0 ? formatHM(d.total) : '·'}
                </span>
              )}
              <span className="flex w-[22px] flex-col-reverse overflow-hidden rounded-t-[3px] sm:w-[26px]">
                {courses
                  .filter((c) => d.byCourse.has(c.id))
                  .map((c) => (
                    <span key={c.id} style={{ height: px((d.byCourse.get(c.id) ?? 0) / 3600), background: c.color }} />
                  ))}
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-2 grid grid-cols-7 justify-items-center">
        {days.map((d) => (
          <span
            key={d.date}
            className={`eyebrow rounded-[3px] px-1 py-0.5 ${
              d.date === today ? 'text-ink' : d.date > today ? 'text-muted-soft' : 'text-muted'
            }`}
            style={d.date === today ? { background: 'var(--highlight-yellow)' } : undefined}
          >
            {d.date === today ? 'Today' : d.label}
          </span>
        ))}
      </div>

      {/* The key: the course colours when more than one had time, and what
          the dashed line is. Its label used to sit on the line itself, where
          a tall day ran straight through it. */}
      {(worked.length > 1 || goalHours > 0) && (
        <div className="mt-3.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-ink-soft">
          {goalHours > 0 && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="block w-3 border-t border-dashed border-line-strong" />
              goal <span className="font-mono text-muted">{formatHM(Math.round(pace * 3600))}</span> a day
            </span>
          )}
          {(worked.length > 1 ? worked : []).map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span aria-hidden className="block h-2 w-2 rounded-[2px]" style={{ background: c.color }} />
              {c.code}
            </span>
          ))}
        </div>
      )}

      {goalHours > 0 ? (
        <p className="m-0 mt-3 font-serif text-[13px] italic text-ink-soft">
          {left > 0 ? (
            <>
              <span className="font-mono text-[12px] not-italic tabular-nums text-ink">{formatHM(left)}</span>{' '}
              to go · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
            </>
          ) : (
            'Goal met for the week.'
          )}
        </p>
      ) : (
        <Link
          href="/settings"
          className="mt-3 inline-block font-serif text-[12.5px] italic text-muted no-underline transition-colors hover:text-ink"
        >
          Give your courses a weekly goal →
        </Link>
      )}
    </section>
  );
}

/* ── The courses this week ─────────────────────────────────────────────── */

/**
 * Each course with its hours this week against its goal, a row of four under
 * the day's work. It stands where one line of codes and hours did, which read
 * as a footnote; the hours against the goal are what a course is looked at
 * for on Today, and the strokes say "two of six" at a glance.
 */
export function CourseLine({
  courses,
  sessions,
  tasks = [],
}: {
  courses: Course[];
  sessions: Session[];
  tasks?: Task[];
}) {
  const byCourse = useMemo(() => {
    const monday = isoDate(startOfWeek());
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (s.date < monday || !isLoggableDuration(s.durationSeconds)) continue;
      map.set(s.courseId, (map.get(s.courseId) ?? 0) + s.durationSeconds);
    }
    return map;
  }, [sessions]);
  const open = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) if (!t.completed) map.set(t.courseId, (map.get(t.courseId) ?? 0) + 1);
    return map;
  }, [tasks]);

  if (courses.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow m-0 text-ink-soft">Your courses this week</p>
        <Link
          href="/courses"
          className="font-serif text-[12.5px] italic text-muted no-underline transition-colors hover:text-ink"
        >
          all courses →
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        {courses.map((course) => {
          const secs = byCourse.get(course.id) ?? 0;
          const count = open.get(course.id) ?? 0;
          return (
            <Link
              key={course.id}
              href={`/courses/${encodeURIComponent(course.id)}`}
              className="-mx-2 flex min-w-0 flex-col rounded-[8px] px-2 py-1.5 text-ink no-underline transition-colors hover:bg-bg-tint"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className="course-rule" style={{ ['--c' as string]: course.color }} />
                <span className="eyebrow truncate text-ink-soft">{course.code}</span>
              </span>
              <span className="mt-1.5 line-clamp-2 font-serif text-[15px] leading-[1.25]">{course.name}</span>
              <span className="mt-2.5 flex items-baseline gap-1.5">
                <span className="font-mono text-[20px] font-medium tracking-[-0.02em] tabular-nums">{formatHM(secs)}</span>
                {course.weeklyGoalHours > 0 && (
                  <span className="font-mono text-[11px] text-muted">/ {course.weeklyGoalHours}h</span>
                )}
              </span>
              {course.weeklyGoalHours > 0 && (
                <HourStrokes
                  seconds={secs}
                  goalHours={course.weeklyGoalHours}
                  color={course.color}
                  width={9}
                  height={18}
                  max={12}
                  className="mt-2.5"
                  label={`${formatHM(secs)} of ${course.weeklyGoalHours} hours this week`}
                />
              )}
              <span className="mt-2 font-serif text-[12.5px] italic text-muted">
                {count === 0 ? 'nothing open' : `${count} open`}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
