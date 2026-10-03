'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCourses } from '@/lib/data-hooks';
import { breakStartsAt, useTimer } from '@/lib/timer-context';
import { formatHHMMSS, formatHM, resolveTint } from '@/lib/utils';
import { hasEarlierBlock, stretchFace } from '@/lib/timer-face';
import ConfirmSheet from './ConfirmSheet';

export default function ActiveTimerDock() {
  const router = useRouter();
  const { active, elapsedSeconds, focusSeconds, onBreak, breakTarget, endBreak, startBreak, pause, resume, stop } =
    useTimer();
  const { courses } = useCourses();
  /* A held clock publishes no seconds, so nothing redraws the dock while it
     is held. What Break would do changes with the length of the hold, and
     the button's label has to keep up with it. */
  const [, setHeldRedraw] = useState(0);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const held = Boolean(active?.isPaused);
  useEffect(() => {
    if (!held) return;
    const id = window.setInterval(() => setHeldRedraw((n) => n + 1), 15 * 1000);
    return () => window.clearInterval(id);
  }, [held]);

  const course = useMemo(
    () => (active ? courses.find((c) => c.id === active.courseId) ?? null : null),
    [active, courses],
  );

  if (!active) return null;

  const color = course?.color ?? 'var(--ink)';
  const tint = course ? resolveTint(course.color, course.tint) : 'var(--bg-tint)';
  const code = course?.code ?? 'Timer';

  /* The same number the timer's face shows: the stretch on the clock, so a
     new block after a break starts again rather than carrying the session.
     The session's total rides beside it, smaller, once a block is behind
     this one; before that the two would be the same number twice. */
  const face = stretchFace({ onBreak, breakTarget, target: active.targetSeconds, elapsed: elapsedSeconds });
  const shown = face.seconds;
  const breakOver = onBreak && face.over;
  const overrun = !onBreak && face.over;
  const showTotal = hasEarlierBlock(active.segments);
  /* Whether Break, pressed now, files the hold it ends as the rest it was. */
  const now = Date.now();
  const breakFromPause = !onBreak && breakStartsAt(active, now) < now;

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
    setConfirmingFinish(false);
    stop();
    router.push('/timer');
  }

  return (
    <>
    <div
      /* Floats over the page at every size. On a phone it sits at the top,
         where the content's own 64px of head room leaves it a lane. On
         desktop the content starts 40px down and every page puts its actions
         on that line, so the dock goes to the foot of the screen instead,
         which is empty there: the bottom bar is phone-only.

         The left padding clears the rail by the same width the content does:
         --rail, set in globals.css from data-rail on <html>. It only applies
         from md, since the rail is never rendered on a phone. */
      className="fixed inset-x-0 top-[max(env(safe-area-inset-top),14px)] md:top-auto md:bottom-[calc(2rem+env(safe-area-inset-bottom))] z-50 px-[var(--density-gutter)] md:pl-[calc(var(--rail,0px)+3rem)] md:pr-12 pointer-events-none animate-fade-in"
    >
      {/* pointer-events stay off the full-width row, it would otherwise be an
          invisible click blocker across the top of the page. */}
      <div className="mx-auto flex max-w-2xl md:max-w-none justify-end">
        {/* The row used to be a div with role="button" wrapping two real
            buttons, which is a control inside a control: a keyboard user
            tabbed into the row and then into its own children, and Space
            scrolled the page instead of opening the timer. The label is the
            button now, and the two controls sit beside it. */}
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-[10px] border border-line bg-paper/90 p-1 backdrop-blur"
          style={{ boxShadow: `inset 0 0 0 1px ${tint}` }}
        >
          <button
            type="button"
            onClick={openTimer}
            aria-label={
              onBreak
                ? `${code} on a break, ${breakOver ? 'over by' : 'remaining'} ${formatHHMMSS(shown)}. Open the timer.`
                : `${active.isPaused ? 'Paused' : 'Running'} timer for ${code}, ${
                    overrun ? 'over by ' : face.countdown ? 'remaining ' : ''
                  }${formatHHMMSS(shown)}${showTotal ? `, ${formatHM(focusSeconds)} in this session` : ''}. Open the timer.`
            }
            className="flex min-h-[44px] items-center gap-2 rounded-[8px] bg-transparent px-1.5 text-left"
          >
            {/* Filled and ticking while the work is happening; an outline,
                still, while it is not. The dot is the one thing on the dock
                that says which of the two is going on. */}
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                active.isPaused || onBreak ? '' : 'animate-tick'
              }`}
              style={
                onBreak
                  ? { border: `1.5px solid ${color}` }
                  : { background: color }
              }
              aria-hidden
            />
            <span className="min-w-0 block">
              <span className="eyebrow block max-w-[74px] truncate" style={{ color }}>
                {code}
              </span>
              <span
                className={`block font-mono text-[13px] font-semibold leading-[1.15] tabular-nums ${
                  breakOver ? 'text-warn' : 'text-ink'
                }`}
              >
                {face.over ? '+' : ''}
                {formatHHMMSS(shown)}
                {showTotal ? (
                  <span className="ml-1.5 text-[11px] font-medium text-muted" title="In this session">
                    {formatHM(focusSeconds)}
                  </span>
                ) : null}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center">
            {/* 24px squares were below every touch-target guideline there
                is, on the one control that has to be hit mid-session. The
                visible mark stays small; the target is 44px. */}
            <button
              type="button"
              onClick={onBreak ? endBreak : togglePaused}
              aria-label={
                onBreak ? 'End the break; the next block waits for you to start it' : active.isPaused ? 'Resume timer' : 'Pause timer'
              }
              /* The same thing the P key does, so the button says so. It is
                 the only place the two keys are named outside the help
                 sheet, and a tooltip is the right weight for it. */
              title={onBreak ? 'End break (P)' : active.isPaused ? 'Resume (P)' : 'Pause (P)'}
              className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-transparent text-ink-soft"
            >
              {active.isPaused || onBreak ? (
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
            {/* Break, from wherever the reader is. It was only on the timer
                screen, so a reader resting from Tasks pressed pause instead,
                and the rest went down as nothing. Not drawn on a break: the
                left button is what ends one. */}
            {!onBreak && (
              <button
                type="button"
                onClick={() => startBreak()}
                aria-label={breakFromPause ? 'Count the pause as a break' : 'Take a break'}
                title={breakFromPause ? 'Count the pause as a break (B)' : 'Break (B)'}
                className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-transparent text-ink-soft"
              >
                <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M9 3.5c-.6.9.6 1.6 0 2.5M12.5 3.5c-.6.9.6 1.6 0 2.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmingFinish(true)}
              aria-label="Stop the timer and log the session"
              title="Finish (K)"
              className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-transparent"
              style={{ color }}
            >
              <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    <ConfirmSheet
      open={confirmingFinish}
      title="Finish this sitting?"
      body="The clock stops and you'll log it next."
      confirmLabel="Finish"
      cancelLabel="Keep going"
      onCancel={() => setConfirmingFinish(false)}
      onConfirm={stopAndLog}
    />
    </>
  );
}
