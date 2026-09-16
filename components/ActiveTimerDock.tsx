'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCourses } from '@/lib/data-hooks';
import { useTimer } from '@/lib/timer-context';
import { formatHHMMSS, resolveTint } from '@/lib/utils';

export default function ActiveTimerDock() {
  const router = useRouter();
  const { active, elapsedSeconds, pause, resume, stop } = useTimer();
  const { courses } = useCourses();

  const course = useMemo(
    () => (active ? courses.find((c) => c.id === active.courseId) ?? null : null),
    [active, courses],
  );

  if (!active) return null;

  const color = course?.color ?? 'var(--ink)';
  const tint = course ? resolveTint(course.color, course.tint) : 'var(--bg-tint)';
  const code = course?.code ?? 'Timer';

  function openTimer() {
    router.push('/timer');
  }

  function togglePaused() {
    if (!active) return;
    if (active.isPaused) {
      resume();
    } else {
      pause();
    }
  }

  function stopAndLog() {
    stop();
    router.push('/timer');
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),14px)] z-50 animate-fade-in px-[var(--density-gutter)] md:pl-[calc(74px+44px)] md:pr-11"
    >
      {/* pointer-events stay off the full-width row, it would otherwise be an
          invisible click blocker across the top of the page. The left padding
          clears the rail, so the dock sits over the page rather than over the
          nav; PageShell sets the same 74px. */}
      <div className="flex justify-end">
        {/* The row used to be a div with role="button" wrapping two real
            buttons, which is a control inside a control: a keyboard user
            tabbed into the row and then into its own children, and Space
            scrolled the page instead of opening the timer. The label is the
            button now, and the two controls sit beside it. */}
        <div
          className="pointer-events-auto flex items-center gap-1 border border-line-strong bg-paper/95 p-1 backdrop-blur"
          style={{ boxShadow: `inset 0 0 0 1px ${tint}` }}
        >
          <button
            type="button"
            onClick={openTimer}
            aria-label={`${active.isPaused ? 'Paused' : 'Running'} timer for ${code}, ${formatHHMMSS(elapsedSeconds)}. Open the timer.`}
            className="flex min-h-[44px] items-center gap-2 bg-transparent px-1.5 text-left"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${active.isPaused ? '' : 'animate-tick'}`}
              style={{ background: color }}
              aria-hidden
            />
            <span className="min-w-0 block">
              <span className="eyebrow block max-w-[74px] truncate" style={{ color }}>
                {code}
              </span>
              <span className="block font-mono text-[13px] font-semibold leading-[1.15] tabular-nums text-ink">
                {formatHHMMSS(elapsedSeconds)}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center">
            {/* 24px squares were below every touch-target guideline there
                is, on the one control that has to be hit mid-session. The
                visible mark stays small; the target is 44px. */}
            <button
              type="button"
              onClick={togglePaused}
              aria-label={active.isPaused ? 'Resume timer' : 'Pause timer'}
              className="flex h-11 w-11 items-center justify-center bg-transparent text-ink-soft"
            >
              {active.isPaused ? (
                <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 5l12 7-12 7V5z" />
                </svg>
              ) : (
                <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 5v14M15 5v14"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={stopAndLog}
              aria-label="Stop the timer and log the session"
              className="flex h-11 w-11 items-center justify-center bg-transparent"
              style={{ color }}
            >
              <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
