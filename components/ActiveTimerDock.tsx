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

  function togglePaused(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!active) return;
    if (active.isPaused) {
      resume();
    } else {
      pause();
    }
  }

  function stopAndLog(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    stop();
    router.push('/timer');
  }

  return (
    <div
      className="fixed inset-x-0 top-[max(env(safe-area-inset-top),14px)] z-50 px-[22px] pointer-events-none animate-fade-in"
    >
      <div className="mx-auto flex max-w-2xl justify-end pointer-events-auto">
        <div
          role="button"
          tabIndex={0}
          onClick={openTimer}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openTimer();
          }}
          aria-label={`${active.isPaused ? 'Paused' : 'Active'} timer for ${code}`}
          className="flex items-center gap-2 rounded-[8px] border border-line bg-paper/90 px-2.5 py-2 text-left backdrop-blur"
          style={{ boxShadow: `inset 0 0 0 1px ${tint}` }}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${active.isPaused ? '' : 'animate-tick'}`}
            style={{ background: color }}
            aria-hidden
          />

          <div className="min-w-0">
            <p className="m-0 max-w-[74px] truncate text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
              {code}
            </p>
            <p className="m-0 font-mono text-[13px] font-semibold leading-[1.15] tabular-nums text-ink">
              {formatHHMMSS(elapsedSeconds)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={togglePaused}
              aria-label={active.isPaused ? 'Resume timer' : 'Pause timer'}
              className="w-6 h-6 rounded-full border border-line bg-bg flex items-center justify-center text-ink-soft"
            >
              {active.isPaused ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 5l12 7-12 7V5z" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
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
              aria-label="Stop and log timer"
              className="w-6 h-6 rounded-full border border-line bg-bg flex items-center justify-center"
              style={{ color }}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
