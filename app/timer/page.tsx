'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingIndicator from '@/components/LoadingIndicator';
import PendingSessionLogSheet from '@/components/PendingSessionLogSheet';
import { PageButton } from '@/components/notebook/Marks';
import SitDown from '@/components/timer/SitDown';
import LockedIn from '@/components/timer/LockedIn';
import { useTimer } from '@/lib/timer-context';
import { useAmbientNoise } from '@/lib/use-ambient-noise';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import { useCourses, useTasks } from '@/lib/data-hooks';

/**
 * The clock, in two halves.
 *
 * Before the redesign there was one screen: you pressed a button somewhere
 * else, the timer was already running by the time you arrived, and the screen
 * showed a ring. Sitting down was something that happened to you.
 *
 * Now there is a moment first — how long, with a break or without, and which
 * three things you are bringing to the desk — and then the desk itself, which
 * is the one dark screen in the app because it is the one screen you are
 * meant to stop looking at.
 */
export default function TimerPage() {
  return (
    <Suspense fallback={<TimerFallback />}>
      <TimerPageContent />
    </Suspense>
  );
}

function TimerFallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <LoadingIndicator compact label="Loading your timer" />
    </div>
  );
}

/**
 * The end of every wait that is not going to end on its own.
 *
 * A spinner is a promise that something is still coming. When the courses
 * read has already failed, or has come back without the course this screen
 * was opened for, nothing is coming, and leaving the dots bouncing is how a
 * student ends up staring at "Loading your timer" with a session they cannot
 * write up and no way out but the browser's back button.
 */
function TimerDeadEnd({
  message,
  onRetry,
  onLeave,
}: {
  message: string;
  onRetry?: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="m-0 font-serif text-[17px] italic leading-[1.4] text-ink-soft">{message}</p>
      <div className="flex w-full flex-col gap-3">
        {onRetry && <PageButton onClick={onRetry}>Try again</PageButton>}
        <button
          type="button"
          onClick={onLeave}
          className="bg-transparent py-2 font-serif text-[14px] italic text-muted underline decoration-line underline-offset-4"
        >
          Back to today
        </button>
      </div>
    </div>
  );
}

/** Where the chosen block length survives a reload mid-session. */
const BLOCK_KEY = 'akada.timer.block';

function TimerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hydrated, active, pendingLog, elapsedSeconds, start, pause, resume, cancel, clearPendingLog, stop } =
    useTimer();
  const { courses, isLoading: coursesLoading, error: coursesError, revalidate } = useCourses();
  const { tasks } = useTasks();
  const noise = useAmbientNoise();

  // How long this block is meant to be, in minutes. Read back from storage on
  // mount so a reload mid-session does not reset the countdown to 50.
  const [blockMinutes, setBlockMinutes] = useState(50);
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(BLOCK_KEY));
      if (Number.isFinite(stored) && stored >= 5) setBlockMinutes(stored);
    } catch {
      // A block length that cannot be read is a block length of 50.
    }
  }, []);

  const paramCourse = searchParams.get('course');
  const paramTask = searchParams.get('task');

  const courseId = active?.courseId ?? pendingLog?.courseId ?? paramCourse ?? null;
  const taskId = active?.taskId ?? pendingLog?.taskId ?? paramTask ?? null;

  const course = useMemo(
    () => (courseId ? courses.find((c) => c.id === courseId) ?? null : null),
    [courses, courseId],
  );
  const task = useMemo(
    () => (taskId ? tasks.find((t) => t.id === taskId) ?? null : null),
    [tasks, taskId],
  );

  /**
   * Nothing is known about the timer until the provider has read storage, and
   * a provider's effects run after its children's. Redirecting before that
   * point sent anyone who reloaded /timer mid-session back to the dashboard
   * with the session still running behind them.
   */
  useEffect(() => {
    if (!hydrated) return;
    if (active || pendingLog) return;
    // No timer, and no course named to start one for: there is nothing here.
    if (!paramCourse) router.replace('/dashboard');
  }, [hydrated, active, pendingLog, paramCourse, router]);

  /** A timer pointing at a course that has since been deleted. */
  useEffect(() => {
    if (!hydrated || !active || courses.length === 0) return;
    if (!courses.some((c) => c.id === active.courseId)) {
      cancel();
      router.replace('/dashboard');
    }
  }, [hydrated, active, courses, cancel, router]);

  // The noise is for the sitting, not for the app. It stops when the session
  // does, however the session ends.
  useEffect(() => {
    if (!active && noise.playing) noise.stop();
  }, [active, noise]);

  function beginSession(minutes: number, wantsNoise: boolean) {
    if (!courseId) return;
    setBlockMinutes(minutes);
    try {
      window.localStorage.setItem(BLOCK_KEY, String(minutes));
    } catch {
      // Not worth failing a session over.
    }
    if (wantsNoise && !noise.playing) noise.toggle();
    start(courseId, taskId);
  }

  function handleStop() {
    if (noise.playing) noise.stop();
    const result = stop();
    if (!result) {
      router.replace('/dashboard');
      return;
    }
    // Too short to be a session. Clearing the pending log rather than opening
    // the note sheet is what stops a stray tap becoming a one-second record.
    if (!isLoggableDuration(clampSessionSeconds(result.durationSeconds))) {
      clearPendingLog();
      router.replace('/dashboard');
    }
    // Otherwise PendingSessionLogSheet takes over and asks what was done.
  }

  // A session that has stopped but not been written up. The note sheet lives
  // in PageShell, which this route deliberately does not use, so it is
  // mounted here too or pressing Stop would leave the page waiting on a sheet
  // that never arrives. Resolving it, either way, sends you back to today.
  if (pendingLog) {
    // SessionLogModal renders nothing without a course, so a failed courses
    // read would otherwise put a sheetless screen in front of a session that
    // cannot be written up. The log itself is kept: a network blip is not a
    // reason to throw a sitting away.
    const sheetCanOpen = Boolean(course) || coursesLoading;
    return (
      <>
        {sheetCanOpen ? (
          <div className="flex min-h-[100dvh] items-center justify-center px-6">
            <p className="m-0 font-serif text-[15px] italic text-muted">That is the block done.</p>
          </div>
        ) : (
          <TimerDeadEnd
            message="That is the block done. Your courses did not load, so it is kept on this device until they do."
            onRetry={() => revalidate()}
            onLeave={() => router.replace('/dashboard')}
          />
        )}
        <PendingSessionLogSheet onResolved={() => router.replace('/dashboard')} />
      </>
    );
  }

  // The courses read failed, so `course` is never going to arrive.
  if (!course && coursesError) {
    return (
      <TimerDeadEnd
        message="Your courses did not load, so this session has nothing to attach to."
        onRetry={() => revalidate()}
        onLeave={() => router.replace('/dashboard')}
      />
    );
  }

  // Loaded, and the course this screen was opened for is not among them: it
  // was deleted, or the link is stale, or there are no courses at all. The
  // redirect effect above only covers the case where a timer is already
  // running against it.
  if (!course && !coursesLoading) {
    return (
      <TimerDeadEnd
        message={
          courses.length === 0
            ? 'There are no courses to time yet.'
            : 'That course is not here any more.'
        }
        onLeave={() => router.replace('/dashboard')}
      />
    );
  }

  if (!hydrated || !course) return <TimerFallback />;

  if (active) {
    return (
      <LockedIn
        course={course}
        task={task}
        elapsedSeconds={clampSessionSeconds(elapsedSeconds)}
        blockMinutes={blockMinutes}
        isPaused={active.isPaused}
        onPause={pause}
        onResume={resume}
        onStop={handleStop}
        noisePlaying={noise.playing}
        onToggleNoise={noise.toggle}
      />
    );
  }

  return (
    <SitDown
      course={course}
      task={task}
      tasks={tasks}
      minutes={blockMinutes}
      onMinutesChange={setBlockMinutes}
      noiseError={noise.error}
      onStart={beginSession}
      onBack={() => router.back()}
    />
  );
}
