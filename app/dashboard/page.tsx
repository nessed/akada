'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import ConfirmSheet from '@/components/ConfirmSheet';
import AddCourseSheet from '@/components/AddCourseSheet';
import JotTaskSheet from '@/components/JotTaskSheet';
import {
  CourseDot,
  Eyebrow,
  PageButton,
  PlayGlyph,
  TextButton,
} from '@/components/notebook/Marks';
import type { Course } from '@/lib/data';
import { formatHM, isoDate, dueLabel } from '@/lib/utils';
import {
  dayBlocks,
  formatClock,
  loggable,
  nextUp,
  secondsByCourse,
  weekBounds,
} from '@/lib/derive';
import { termWeek } from '@/lib/review';
import { useTimer } from '@/lib/timer-context';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  useActiveSemester,
  useReviewWaiting,
} from '@/lib/data-hooks';

/**
 * Today. One question: what do I do right now.
 *
 * This screen used to be seven screens. A dashboard, a planner, a timetable,
 * a task list, a course list, a week view and a review inbox, every one of
 * them set at the same volume, and most of the facts printed two or three
 * times over: the class schedule as a sentence and a chart and a legend, the
 * overdue count in the header and the section heading and beside every day in
 * the right rail, the Next task also sitting at the top of the overdue list.
 *
 * What is left is four blocks. Where you are in the term, the one thing to do
 * now, what else is true today, and the week waiting to be read back. Volume
 * is earned by action: the only thing at full ink and full size is the piece
 * of work a reader can start from here. Everything they cannot act on from
 * this screen is a count with a link, and everything else lives on the screen
 * that owns it.
 */
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
    <PageShell width="read">
      <LoadingIndicator compact label="Loading your planner" className="mb-6" />
    </PageShell>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { active, cancel } = useTimer();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { semester } = useActiveSemester();
  const reviewWaiting = useReviewWaiting();

  const sessions = useMemo(() => loggable(rawSessions), [rawSessions]);

  const [addingCourse, setAddingCourse] = useState(false);
  const [jotting, setJotting] = useState(false);
  const [pendingTimer, setPendingTimer] = useState<{
    courseId: string;
    taskId: string | null;
  } | null>(null);

  // What the clock says, read after mount and then every minute. The server
  // has a different one, so a class that is "at 14:00" on the server and "in
  // progress" in the browser would be two different trees to reconcile.
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    };
    read();
    const id = window.setInterval(read, 60_000);
    return () => window.clearInterval(id);
  }, []);

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
  const blocks = useMemo(() => dayBlocks(courses, sessions, today), [courses, sessions, today]);
  const weekSeconds = useMemo(() => {
    const [from, to] = weekBounds(new Date());
    return Object.values(secondsByCourse(sessions, from, to)).reduce((a, s) => a + s, 0);
  }, [sessions]);

  const openOverdue = tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < today).length;
  const openDueToday = tasks.filter(
    (t) => !t.completed && t.dueDate === today && t.id !== next?.id,
  ).length;

  const weekNo = termWeek(semester?.startDate ?? null, now);

  if (loading) {
    return (
      <PageShell width="read">
        <LoadingIndicator compact label="Loading your planner" className="mb-6" />
      </PageShell>
    );
  }

  // Up to three, and each one disappears cleanly when it has nothing to say.
  // If all three are quiet there is no line at all, because a heading over
  // nothing is worse than a gap.
  const alsoToday = [
    {
      key: 'class',
      href: '/term',
      label: 'See the timetable',
      text: classFragment(blocks, courses, nowMinutes),
    },
    {
      key: 'work',
      href: '/tasks#late',
      label: 'Open the list of late work',
      text: workFragment(openOverdue - (next ? 1 : 0), openDueToday),
    },
    {
      key: 'hours',
      href: '/courses',
      label: 'See the hours each course got',
      text: hoursFragment(weekSeconds, courses.length),
    },
  ].filter((f) => f.text !== null);

  return (
    <PageShell width="read">
      {/* The main column is the height of the window on a desktop, so the
          "also" line can sit at the foot of it and leave the one thing worth
          doing in open space. */}
      <div className="flex max-w-[760px] flex-col lg:min-h-[calc(100dvh-92px)]">
        {/* Where you are. */}
        <div className="flex items-baseline justify-between gap-5 border-b border-line pb-4">
          <Eyebrow as="span">
            {semester?.label || 'This term'}
            {weekNo ? ` · Week ${weekNo}` : ''}
          </Eyebrow>
          <p className="m-0 font-serif text-[15px] leading-none text-ink-soft">
            {now.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* The one thing. */}
        {next ? (
          <div className="rule-ink mt-10 pt-4">
            <Eyebrow>Next</Eyebrow>
            <h1
              className="mt-2.5 font-serif text-[26px] font-normal leading-[1.18] tracking-[-0.02em] text-ink md:text-[34px]"
              style={{ textWrap: 'balance' }}
            >
              {next.title}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-2.5 text-[14px] leading-[1.5] text-ink-soft">
              {nextCourse && <CourseDot color={nextCourse.color} />}
              {nextCourse?.code}
              <span
                className="font-mono"
                style={{
                  color:
                    dueLabel(next.dueDate)?.category === 'overdue'
                      ? 'var(--warn)'
                      : 'var(--ink-soft)',
                }}
              >
                {dueWord(next.dueDate)}
              </span>
              {next.weight ? <span>counts for {next.weight}%</span> : null}
            </p>
            <div className="mt-7 flex w-full flex-col items-stretch gap-3.5 sm:w-auto sm:flex-row sm:items-center">
              <PageButton
                size="sheet"
                className="sm:w-[212px]"
                icon={<PlayGlyph />}
                onClick={() => handleStartTimer(next.courseId, next.id)}
              >
                Start a session
              </PageButton>
              <Link
                href="/tasks"
                className="text-center font-serif text-[14px] italic text-muted hover:text-ink-soft sm:text-left"
              >
                something else →
              </Link>
            </div>
          </div>
        ) : (
          <div className="rule-ink mt-10 pt-4">
            <Eyebrow>Next</Eyebrow>
            <p className="mt-2.5 font-serif text-[22px] leading-[1.25] text-ink-soft">
              Nothing is written down yet.
            </p>
            <TextButton className="mt-6" onClick={() => setJotting(true)}>
              add the first task
            </TextButton>
          </div>
        )}

        {/* What else is true today. Counts, and where to go for them. */}
        {alsoToday.length > 0 && (
          <div className="mt-16 border-b border-line pb-3.5 lg:mt-auto lg:pt-16">
            <Eyebrow className="mb-2">Also today</Eyebrow>
            <p className="m-0 flex flex-col gap-1.5 text-[14px] leading-[1.5] text-ink-soft sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-0">
              {alsoToday.map((fragment, i) => (
                <span key={fragment.key}>
                  {i > 0 && (
                    <span aria-hidden className="hidden px-2.5 text-line-strong sm:inline">
                      ·
                    </span>
                  )}
                  <Link
                    href={fragment.href}
                    aria-label={fragment.label}
                    className="hover:text-ink"
                  >
                    {fragment.text}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        )}

        {/* The week behind this one, if it has not been read back yet. */}
        {weekNo && weekNo > 1 && reviewWaiting && (
          <p className="m-0 mt-3.5 text-[14px] leading-[1.5] text-ink-soft">
            Your week {weekNo - 1} review is ready.{' '}
            <Link href="/stats" className="ink-underline text-ink">
              Read it
            </Link>
          </p>
        )}
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

/** "due tomorrow" rather than "Tomorrow": this sits inside a sentence. */
function dueWord(iso: string | null): string {
  const label = dueLabel(iso);
  if (!label) return '';
  if (label.category === 'overdue') {
    const days = -label.days;
    return `${days} ${days === 1 ? 'day' : 'days'} late`;
  }
  if (label.category === 'today') return 'due today';
  if (label.category === 'tomorrow') return 'due tomorrow';
  if (label.days < 7) return `due in ${label.days}d`;
  return `due ${label.formattedDate}`;
}

/**
 * Where the room comes from. `meetingTime` is one display string the catalog
 * wrote, "Mon & Wed, 14:00 - 15:50 · SS 3302", so the room is whatever
 * follows the time. A course typed in by hand has no room and says so by
 * saying nothing.
 */
function roomOf(course: Course | undefined): string | null {
  const parts = (course?.meetingTime ?? '').split(' · ');
  if (parts.length < 2) return null;
  return parts.slice(1).join(' · ') || null;
}

/**
 * The next class, or the one happening now. Written the way a person would
 * say it out loud, and omitted entirely once the last one is over: a reader
 * with no classes left today does not need to be told there are none.
 */
function classFragment(
  blocks: ReturnType<typeof dayBlocks>,
  courses: Course[],
  nowMinutes: number | null,
): string | null {
  if (nowMinutes === null) return null;
  const classes = blocks.filter((b) => b.kind === 'class');

  const running = classes.find((b) => b.start <= nowMinutes && b.end > nowMinutes);
  const upcoming = classes.filter((b) => b.start > nowMinutes).sort((a, b) => a.start - b.start)[0];
  const block = running ?? upcoming;
  if (!block) return null;

  const room = roomOf(courses.find((c) => `class-${c.id}` === block.id));
  const when = running ? `In class until ${formatClock(block.end)}` : `Class at ${formatClock(block.start)}`;
  return room ? `${when}, ${room}` : when;
}

/**
 * What is owing beyond the one thing already on the screen. The Next block is
 * the oldest late piece of work, so it is subtracted here rather than counted
 * twice, which is what the old header sentence did.
 */
function workFragment(moreOverdue: number, dueToday: number): string | null {
  const parts: string[] = [];
  if (moreOverdue > 0) parts.push(`${moreOverdue} more overdue`);
  if (dueToday > 0) parts.push(`${dueToday} due today`);
  if (parts.length === 0) return null;
  return parts.join(' and ');
}

/** The week's hours, and how many courses there are to spread them over. */
function hoursFragment(seconds: number, courseCount: number): string | null {
  if (courseCount === 0) return null;
  const spread = `${courseCount} ${courseCount === 1 ? 'course' : 'courses'}`;
  if (seconds === 0) return `nothing logged yet this week, ${spread}`;
  return `${formatHM(seconds)} logged this week, ${spread}`;
}
