'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import HourStrokes from '@/components/HourStrokes';
import StartTimerPopover, { type StartTarget } from '@/components/StartTimerPopover';
import { useCourses, useSessions, useTasks } from '@/lib/data-hooks';
import { sortCourses } from '@/lib/data/course-order';
import { isLoggableDuration } from '@/lib/session-safety';
import { formatHM, isoDate, startOfWeek, totalSeconds } from '@/lib/utils';

/**
 * The courses index.
 *
 * The rail names every course, so this is what "Courses" in it opens: the
 * term as one list, each course against its weekly goal, with the numbers
 * that decide which one to open next. Adding and editing a course still
 * happens on Today, where the cards are.
 */
export default function CoursesPage() {
  const router = useRouter();
  const { courses: raw, isLoading: coursesLoading } = useCourses();
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null);

  const today = isoDate();
  const weekStart = isoDate(startOfWeek());

  const rows = useMemo(() => {
    const ordered = sortCourses(raw);
    return ordered.map((course) => {
      const mine = sessions.filter(
        (s) => s.courseId === course.id && isLoggableDuration(s.durationSeconds),
      );
      const open = tasks.filter((t) => t.courseId === course.id && !t.completed);
      const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
      const last = mine.reduce<string | null>(
        (acc, s) => (acc == null || s.date > acc ? s.date : acc),
        null,
      );
      return {
        course,
        weekSeconds: totalSeconds(mine.filter((s) => s.date >= weekStart)),
        termSeconds: totalSeconds(mine),
        sessionCount: mine.length,
        openCount: open.length,
        overdue,
        last,
      };
    });
  }, [raw, sessions, tasks, today, weekStart]);

  if (coursesLoading || sessionsLoading || tasksLoading) {
    return (
      <PageShell wide>
        <LoadingIndicator label="Reading your courses" />
      </PageShell>
    );
  }

  const termTotal = rows.reduce((a, r) => a + r.termSeconds, 0);
  const weekTotal = rows.reduce((a, r) => a + r.weekSeconds, 0);
  const weekGoal = rows.reduce((a, r) => a + (r.course.weeklyGoalHours || 0), 0);

  return (
    <PageShell wide>
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="m-0 mb-1.5 font-mono text-[12px] tracking-[0.02em] text-muted">
            {rows.length} {rows.length === 1 ? 'course' : 'courses'} · {formatHM(termTotal)} this
            term · {formatHM(weekTotal)} of {weekGoal}h this week
          </p>
          <h1 className="m-0 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
            Courses
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="flex h-10 shrink-0 items-center rounded-[10px] border border-line-strong px-3.5 text-[13px] font-medium text-ink no-underline transition-colors hover:bg-bg-tint"
        >
          Add a course
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="deckle border border-dashed border-line-strong bg-paper px-7 py-10 text-center">
          <p className="m-0 font-serif text-[20px] text-ink-soft">No courses this term yet.</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex h-11 items-center rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-contrast no-underline"
          >
            Add the first one
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-line bg-paper">
          {rows.map(({ course, weekSeconds, termSeconds, sessionCount, openCount, overdue, last }) => (
            <div
              key={course.id}
              className="group grid items-center gap-4 border-b border-line-soft px-4 py-4 transition-colors last:border-b-0 hover:bg-paper-2 md:grid-cols-[minmax(0,1fr)_190px_140px_130px_44px]"
            >
              <Link href={`/courses/${course.id}`} className="flex min-w-0 items-center gap-3 no-underline">
                <span
                  aria-hidden
                  className="block h-9 w-[3px] shrink-0 rounded-[1px]"
                  style={{ background: course.color }}
                />
                <span className="min-w-0">
                  <span className="eyebrow block" style={{ color: course.color }}>
                    {course.code}
                  </span>
                  <span className="mt-0.5 block truncate font-serif text-[17px] text-ink">
                    {course.name}
                  </span>
                </span>
              </Link>

              <div>
                <span className="font-mono text-[11px] text-muted">
                  <span className="text-ink">{formatHM(weekSeconds)}</span> /{' '}
                  {course.weeklyGoalHours}h this week
                </span>
                <HourStrokes
                  seconds={weekSeconds}
                  goalHours={course.weeklyGoalHours}
                  color={course.color}
                  height={12}
                  width={7}
                  max={12}
                  className="mt-1.5"
                  label={`${course.code}, ${formatHM(weekSeconds)} of ${course.weeklyGoalHours} hours this week`}
                />
              </div>

              <span className="font-mono text-[11px] text-muted">
                {formatHM(termSeconds)} term
                <br />
                {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
              </span>

              <span className="text-[12px] text-muted">
                {openCount > 0 ? (
                  <>
                    <span className="text-ink">{openCount}</span> open
                    {overdue > 0 && <span className="text-warn"> · {overdue} overdue</span>}
                  </>
                ) : (
                  'Nothing open'
                )}
                <br />
                <span className="font-mono text-[11px]">
                  {last ? `last ${relative(last, today)}` : 'no sessions yet'}
                </span>
              </span>

              <button
                type="button"
                onClick={(e) => setStartTarget({ task: null, course, anchor: e.currentTarget })}
                aria-label={`Start timer on ${course.code}`}
                className="grid h-10 w-10 place-items-center justify-self-end rounded-[10px] text-ink-soft opacity-0 transition-opacity hover:bg-bg-tint hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
              >
                <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 5l12 7-12 7V5z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <StartTimerPopover
        target={startTarget}
        onClose={() => setStartTarget(null)}
        onStarted={() => router.push('/timer')}
      />
    </PageShell>
  );
}

function relative(iso: string, today: string): string {
  const days = Math.round(
    (new Date(today + 'T12:00:00').getTime() - new Date(iso + 'T12:00:00').getTime()) / 86_400_000,
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}
