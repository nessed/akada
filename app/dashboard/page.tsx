'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import ConfirmSheet from '@/components/ConfirmSheet';
import AddCourseSheet from '@/components/AddCourseSheet';
import JotTaskSheet from '@/components/JotTaskSheet';
import DayLine from '@/components/dashboard/DayLine';
import WeekStrip from '@/components/dashboard/WeekStrip';
import TaskLine from '@/components/TaskLine';
import Tally from '@/components/notebook/Tally';
import Marginalia from '@/components/notebook/Marginalia';
import WeekSpine, { ReviewInvitation, buildWeek } from '@/components/notebook/WeekSpine';
import {
  CourseSpine,
  CourseDot,
  Eyebrow,
  PageButton,
  PlayGlyph,
  TextButton,
  Tick,
} from '@/components/notebook/Marks';
import { useNotice } from '@/components/Notice';
import type { Task } from '@/lib/data';
import { daysBetween, formatHM, isoDate, dueLabel } from '@/lib/utils';
import {
  countdowns,
  dayBlocks,
  daysQuiet,
  loggable,
  nextUp,
  quietThisWeek,
  secondsByCourse,
  weekBounds,
} from '@/lib/derive';
import { termWeek } from '@/lib/review';
import { usePreferences } from '@/lib/preferences';
import { useTimer } from '@/lib/timer-context';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  useActiveSemester,
  toggleTaskOptimistic,
} from '@/lib/data-hooks';

/**
 * How many rows either list on Today is allowed. Past this the count in the
 * heading still tells the truth and the rest are one link away, which is
 * better than a screen that scrolls for a minute before it reaches the week.
 */
const LIST_CAP = 5;

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardPageContent />
    </Suspense>
  );
}

// useSearchParams opts the tree into dynamic rendering, so it needs a
// boundary above it or the build fails to prerender this route.
function DashboardFallback() {
  return (
    <PageShell>
      <LoadingIndicator compact label="Loading your planner" className="mb-6" />
    </PageShell>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { active, cancel } = useTimer();
  const { notify } = useNotice();
  const [prefs] = usePreferences();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { semester } = useActiveSemester();

  const sessions = useMemo(() => loggable(rawSessions), [rawSessions]);

  const [addingCourse, setAddingCourse] = useState(false);
  const [jotting, setJotting] = useState(false);
  const [pendingTimer, setPendingTimer] = useState<{
    courseId: string;
    taskId: string | null;
  } | null>(null);

  // Onboarding gate / auth redirect, fires once SWR has resolved the flag.
  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) router.replace('/onboarding');
  }, [onboarded, onboardingLoading, onboardingError, router]);

  // Settings sends a reader here to add a course. The param is cleared on
  // arrival so a second trip fires again, and the ref stops an SWR
  // revalidation reopening the sheet in the window before the URL settles.
  const handledAddIntent = useRef(false);
  useEffect(() => {
    if (searchParams.get('add') !== 'course') {
      handledAddIntent.current = false;
      return;
    }
    if (handledAddIntent.current || coursesLoading) return;
    handledAddIntent.current = true;
    setAddingCourse(true);
    router.replace('/dashboard', { scroll: false });
  }, [searchParams, coursesLoading, router]);

  /**
   * Opens the sit-down screen for this piece of work. It does not start
   * anything: choosing the length of the block, and what is coming to the
   * desk, happens there. A timer already on the clock is the one thing worth
   * stopping to ask about, because starting another discards it.
   */
  function beginTimer(courseId: string, taskId: string | null) {
    const query = taskId ? `?course=${courseId}&task=${taskId}` : `?course=${courseId}`;
    router.push(`/timer${query}`);
  }

  function handleStartTimer(courseId: string, taskId: string | null = null) {
    if (active && (active.courseId !== courseId || active.taskId !== taskId)) {
      setPendingTimer({ courseId, taskId });
      return;
    }
    beginTimer(courseId, taskId);
  }

  async function handleToggleTask(task: Task) {
    try {
      await toggleTaskOptimistic(task);
    } catch (error) {
      console.error('Failed to update task:', error);
      notify('That task did not update.');
    }
  }

  const loading =
    onboardingLoading ||
    onboarded === false ||
    coursesLoading ||
    sessionsLoading ||
    tasksLoading;

  const today = isoDate();
  const now = new Date();

  const next = useMemo(() => nextUp(tasks, today), [tasks, today]);
  const nextCourse = courses.find((c) => c.id === next?.courseId);
  const quiet = useMemo(() => quietThisWeek(courses, sessions), [courses, sessions]);
  const quietDays = useMemo(() => daysQuiet(courses, sessions, today), [courses, sessions, today]);
  const weekByCourse = useMemo(() => {
    const [from, to] = weekBounds(new Date());
    return secondsByCourse(sessions, from, to);
  }, [sessions]);
  const blocks = useMemo(() => dayBlocks(courses, sessions, today), [courses, sessions, today]);
  const coming = useMemo(() => countdowns(tasks, courses, today, 1)[0], [tasks, courses, today]);
  const week = useMemo(
    () => buildWeek(courses, tasks, sessions, prefs.hideWeekends, today),
    [courses, tasks, sessions, prefs.hideWeekends, today],
  );

  // Two different facts, so two different lists. They used to be one list
  // under a heading that named neither of them, which is how a screen ends up
  // saying "on the page today" over six things that were due last week.
  const overdue = useMemo(
    () =>
      tasks
        .filter((t) => !t.completed && t.dueDate && t.dueDate < today)
        .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string)),
    [tasks, today],
  );
  const dueToday = useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate === today)
        .sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1)),
    [tasks, today],
  );
  const oldestOverdueDays = overdue.length > 0 ? -daysBetween(today, overdue[0].dueDate as string) : 0;

  const todaySeconds = sessions
    .filter((s) => s.date === today)
    .reduce((acc, s) => acc + s.durationSeconds, 0);
  const weekNo = termWeek(semester?.startDate ?? null, now);
  const dueSoon = tasks.filter(
    (t) => !t.completed && t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 2),
  ).length;

  if (loading) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Loading your planner" className="mb-6" />
      </PageShell>
    );
  }

  const aside = (
    <>
      {coming ? (
        <div className="rule-ink pb-4 pt-4">
          <Eyebrow>Next deadline</Eyebrow>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 font-serif text-[18px] leading-[1.2]">{coming.task.title}</p>
              <p className="mt-1 text-[13px] text-muted">
                {[
                  coming.course?.code,
                  coming.task.weight ? `worth ${coming.task.weight}%` : null,
                  longDate(coming.task.dueDate as string),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {/* A countdown of nothing is not a countdown. Zero days reads as
                an error next to a heading that says "next deadline", so the
                last two days are words. */}
            {coming.days <= 1 ? (
              <p
                className="m-0 flex-none font-serif text-[18px] leading-[1.1]"
                style={{ color: 'var(--warn)' }}
              >
                {coming.days === 0 ? 'today' : 'tomorrow'}
              </p>
            ) : (
              <p
                className="m-0 flex-none font-mono text-[27px] font-bold leading-[0.9] tracking-[-0.03em]"
                style={{ color: coming.days <= 10 ? 'var(--warn)' : 'var(--ink)' }}
              >
                {coming.days}
                <span className="text-[13px] font-normal text-muted"> days</span>
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="rule-ink pb-4 pt-4">
          <Eyebrow>Next deadline</Eyebrow>
          <p className="mt-2 font-serif text-[18px] leading-[1.3] text-muted">
            No graded deadlines yet.
          </p>
        </div>
      )}

      {/* The spine proper is the desktop column. On a phone the same week is
          the strip near the top of the page, so it is not drawn twice. */}
      <div className="hidden lg:block">
        <Eyebrow className="mt-5">This week</Eyebrow>
        <WeekSpine days={week} />
      </div>

      {weekNo && weekNo > 1 && <ReviewInvitation weekNumber={weekNo - 1} />}
    </>
  );

  return (
    <PageShell aside={aside}>
      {/* The term, and where you are in it. */}
      <div className="flex items-baseline justify-between gap-5 border-b border-line pb-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <Eyebrow as="span">{semester?.label || 'This term'}</Eyebrow>
          {weekNo && (
            <>
              <Tick />
              <span className="font-mono text-[11px] tracking-[0.1em] text-ink-soft">
                WK {String(weekNo).padStart(2, '0')}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-5">
          {quiet.length > 0 && (
            <span className="hidden font-serif text-sm italic text-muted sm:inline">
              {quiet.length} {quiet.length === 1 ? 'course' : 'courses'} quiet this week
            </span>
          )}
          <TextButton onClick={() => setJotting(true)}>add a task</TextButton>
        </div>
      </div>

      {/* The day. */}
      <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <p className="m-0 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            {now.toLocaleDateString(undefined, { weekday: 'long' })}
          </p>
          <h1 className="mt-1.5 font-serif text-[24px] font-normal leading-none tracking-[-0.03em] text-ink-soft md:text-[28px]">
            {now.toLocaleDateString(undefined, { month: 'long' })}{' '}
            <em className="italic">{now.getDate()}</em>
          </h1>
        </div>
        <p className="m-0 max-w-[34ch] font-serif text-[15px] leading-[1.5] text-ink-soft sm:max-w-[26ch] sm:text-right">
          {daySentence(overdue.length, oldestOverdueDays, dueSoon, todaySeconds)}
        </p>
      </div>

      {/* The week, turned sideways. Phone only: the spine is the aside. */}
      <div className="mt-5 lg:hidden">
        <WeekStrip days={week} />
      </div>

      {/* Next. The one thing the screen is actually for. */}
      {next ? (
        <div className="rule-ink mt-7 flex flex-col items-start gap-5 pt-4 md:flex-row md:gap-8">
          <div className="min-w-0 flex-1">
            <Eyebrow>Next</Eyebrow>
            <h2 className="mt-2 font-serif text-[27px] font-medium leading-[1.15] tracking-[-0.02em] text-ink">
              {next.title}
            </h2>
            <p className="mt-2.5 flex flex-wrap items-center gap-2.5 text-[13px] leading-[1.5] text-ink-soft">
              {nextCourse && <CourseDot color={nextCourse.color} />}
              {nextCourse?.code}
              <Tick />
              <span
                className="font-mono text-[13px]"
                style={{
                  color: (dueLabel(next.dueDate)?.days ?? 1) <= 1 ? 'var(--warn)' : 'var(--ink-soft)',
                }}
              >
                {dueWord(next.dueDate)}
              </span>
              {next.weight ? (
                <>
                  <Tick />
                  <span className="text-muted">counts for {next.weight}%</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex w-full flex-none flex-col items-stretch gap-2.5 md:w-[212px]">
            <PageButton
              size="sheet"
              icon={<PlayGlyph />}
              onClick={() => handleStartTimer(next.courseId, next.id)}
            >
              Start a session
            </PageButton>
            <Link
              href="/tasks"
              className="text-center font-serif text-[13px] italic text-muted hover:text-ink-soft"
            >
              something else →
            </Link>
          </div>
        </div>
      ) : (
        <div className="rule-ink mt-7 flex flex-col items-start gap-4 pt-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Eyebrow>Next</Eyebrow>
            <p className="mt-2 font-serif text-[27px] leading-[1.2] text-ink-soft">
              Nothing is written down yet.
            </p>
          </div>
          <TextButton onClick={() => setJotting(true)}>add the first task</TextButton>
        </div>
      )}

      {/* The day on a line: classes, and what you actually sat down for. */}
      {blocks.length > 0 && (
        <div className="mt-9">
          <div className="flex items-baseline justify-between">
            <Eyebrow>Your day</Eyebrow>
            <p className="m-0 font-mono text-[13px] text-muted">
              {todaySeconds > 0 ? `${formatHM(todaySeconds)} logged` : 'nothing logged yet'}
            </p>
          </div>
          <DayLine blocks={blocks} />
        </div>
      )}

      <div className="mt-9 flex flex-col gap-9 lg:flex-row lg:gap-10">
        {/* What is late, and what is due. Each under its own name. */}
        <div className="min-w-0 flex-[1.05]">
          {overdue.length > 0 && (
            <section>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <Eyebrow style={{ color: 'var(--warn)' }}>Overdue</Eyebrow>
                <span className="font-mono text-[13px]" style={{ color: 'var(--warn)' }}>
                  {overdue.length}
                </span>
              </div>
              {overdue.slice(0, LIST_CAP).map((task, i) => (
                <TaskLine
                  key={task.id}
                  task={task}
                  course={courses.find((c) => c.id === task.courseId)}
                  // The oldest thing is the one worth doing first, so it is
                  // the only one set in full ink. Anything under three days
                  // late has not earned that weight yet.
                  emphasis={
                    i === 0 ? 'strong' : -daysBetween(today, task.dueDate as string) < 3 ? 'soft' : 'normal'
                  }
                  startOnHover={i > 1}
                  onToggle={() => handleToggleTask(task)}
                  onStart={() => handleStartTimer(task.courseId, task.id)}
                />
              ))}
              {overdue.length > LIST_CAP && (
                <Link
                  href="/tasks"
                  className="mt-2.5 inline-block font-serif text-[13px] italic text-muted hover:text-ink-soft"
                >
                  the other {overdue.length - LIST_CAP} are in Tasks →
                </Link>
              )}
            </section>
          )}

          <section className={overdue.length > 0 ? 'mt-7' : ''}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <Eyebrow>Due today</Eyebrow>
              {dueToday.length > 0 && (
                <span className="font-mono text-[13px] text-muted">{dueToday.length}</span>
              )}
            </div>
            {dueToday.length === 0 ? (
              <p className="py-3 font-serif text-[15px] italic text-muted">
                {overdue.length > 0
                  ? 'Nothing else is due today.'
                  : 'Nothing due today, and nothing overdue.'}
              </p>
            ) : (
              dueToday.slice(0, LIST_CAP).map((task) => (
                <TaskLine
                  key={task.id}
                  task={task}
                  course={courses.find((c) => c.id === task.courseId)}
                  onToggle={() => handleToggleTask(task)}
                  onStart={task.completed ? undefined : () => handleStartTimer(task.courseId, task.id)}
                />
              ))
            )}
            {dueToday.length > LIST_CAP && (
              <Link
                href="/tasks"
                className="mt-2.5 inline-block font-serif text-[13px] italic text-muted hover:text-ink-soft"
              >
                the other {dueToday.length - LIST_CAP} are in Tasks →
              </Link>
            )}
          </section>

          <TextButton tone="quiet" className="mt-2.5" onClick={() => setJotting(true)}>
            + add a task
          </TextButton>
        </div>

        {/* Courses, and the hours each one got. */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between">
            <Eyebrow>Courses</Eyebrow>
            <span className="font-mono text-[11px] text-muted">hours this week</span>
          </div>
          {courses.length === 0 ? (
            <div className="border border-dashed border-line-strong px-4 py-6 text-center">
              <p className="m-0 font-serif text-[15px] italic text-muted">
                No courses on the list yet.
              </p>
              <TextButton className="mt-3" onClick={() => setAddingCourse(true)}>
                add the first course
              </TextButton>
            </div>
          ) : (
            courses.map((course) => {
              const hours = (weekByCourse[course.id] || 0) / 3600;
              const quietFor = quietDays[course.id];
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="row-rule flex items-center gap-3 px-0.5 py-2.5"
                >
                  <CourseSpine color={course.color} height={26} />
                  <span className="min-w-0 flex-1">
                    {/* The spine beside it is the colour cue. The code is a
                        word, so it is set in ink a person can read rather
                        than in a pastel that scores under two to one. */}
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                      {course.code}
                    </span>
                    <span className="block truncate font-serif text-[15px] text-ink">
                      {course.name}
                    </span>
                  </span>
                  {hours > 0 ? (
                    <Tally
                      hours={hours}
                      goal={course.weeklyGoalHours}
                      color="var(--ink)"
                      className="flex-none"
                    />
                  ) : (
                    <span className="flex-none font-serif text-[13px] italic text-warn">
                      {quietFor === null
                        ? '0h this week'
                        : `0h this week · ${quietFor} ${quietFor === 1 ? 'day' : 'days'} quiet`}
                    </span>
                  )}
                </Link>
              );
            })
          )}
          {courses.length > 0 && (
            <TextButton tone="quiet" className="mt-2.5" onClick={() => setAddingCourse(true)}>
              + add a course
            </TextButton>
          )}
        </div>
      </div>

      <div className="mt-8 flex justify-center lg:hidden">
        <Marginalia mark="squiggle" width={34} />
      </div>

      <AddCourseSheet
        open={addingCourse}
        onClose={() => setAddingCourse(false)}
        courses={courses}
      />
      <JotTaskSheet open={jotting} onClose={() => setJotting(false)} courses={courses} />

      <ConfirmSheet
        open={Boolean(pendingTimer)}
        title="A timer is already running"
        body="Starting this one discards what is on the clock now."
        confirmLabel="Start the new one"
        onCancel={() => setPendingTimer(null)}
        onConfirm={() => {
          // The running session is discarded rather than logged: the reader
          // just said they wanted this other one instead.
          cancel();
          if (pendingTimer) beginTimer(pendingTimer.courseId, pendingTimer.taskId);
          setPendingTimer(null);
        }}
      />
    </PageShell>
  );
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function longDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "due tomorrow" rather than "Tomorrow": this sits inside a sentence. */
function dueWord(iso: string | null): string {
  const label = dueLabel(iso);
  if (!label) return '';
  if (label.category === 'overdue') return `${-label.days}d late`;
  if (label.category === 'today') return 'due today';
  if (label.category === 'tomorrow') return 'due tomorrow';
  if (label.days < 7) return `due in ${label.days}d`;
  return `due ${label.formattedDate}`;
}

/**
 * How late something is, in the words a person would use. The overdue
 * sentence is the first thing on the page after the date, so it says "two
 * weeks" rather than "15d": a number with a unit stuck to it is a reading,
 * and this is meant to be a sentence.
 */
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

function ageInWords(days: number): string {
  if (days <= 1) return 'a day';
  if (days < 7) return `${days} days`;
  if (days >= 60) return `${Math.round(days / 30)} months`;
  if (days >= 30) return 'a month';
  const weeks = Math.round(days / 7);
  if (weeks === 1) return 'a week';
  return `${NUMBER_WORDS[weeks] ?? weeks} weeks`;
}

/**
 * What the day is like, in one line. Says the useful thing rather than
 * congratulating anybody: what is late, or what is close, or what has been
 * done, or that none of those is true — which is itself worth knowing.
 *
 * Late work comes first and is never quietly dropped. The sentence used to
 * count only what was due in the next two days, so a reader with seven things
 * a fortnight overdue and nothing coming up was told "Nothing is urgent. A
 * clean page to fill." — which is the single most misleading line the app
 * could have printed at that moment.
 */
function daySentence(
  overdueCount: number,
  oldestOverdueDays: number,
  dueSoon: number,
  loggedSeconds: number,
): string {
  if (overdueCount > 0) {
    const what = overdueCount === 1 ? 'One thing is' : `${overdueCount} things are`;
    return `${what} overdue. The oldest is ${ageInWords(oldestOverdueDays)}.`;
  }
  if (dueSoon > 0) {
    return `${dueSoon === 1 ? 'One thing is' : `${dueSoon} things are`} due in the next two days.`;
  }
  if (loggedSeconds > 0) {
    return `${formatHM(loggedSeconds)} down today. Nothing is overdue and nothing is due soon.`;
  }
  return 'Nothing is overdue and nothing is due soon.';
}
