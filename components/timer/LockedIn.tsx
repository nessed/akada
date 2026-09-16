'use client';

import { useEffect, useState } from 'react';
import HandCheck from '../notebook/HandCheck';
import type { Course, Task } from '@/lib/data';
import { updateTaskOptimistic } from '@/lib/data-hooks';

/**
 * Locked in.
 *
 * The one dark screen in the app, and the only one that does not use the
 * reader's chosen paper — because this screen is not paper. It is the desk
 * lamp: everything except the time left and the two or three things being
 * worked through is turned down, and the colours are fixed so the screen
 * looks the same at 2am on any stock.
 *
 * The clock counts *down* against the block that was chosen, which is a
 * different instrument from a stopwatch counting up. A stopwatch asks how
 * long you have managed; a countdown tells you how much longer you agreed to
 * sit there, which is the number that keeps someone in the chair.
 *
 * Past the end of the block it keeps counting, into overtime, rather than
 * stopping or congratulating: the session is over when the reader says so.
 */

const INK = '#F2EDE0';
const DIM = '#8A857A';
const FAINT = '#6F6A5F';
const RULE = '#26221E';
const EDGE = '#332E28';

export default function LockedIn({
  course,
  task,
  elapsedSeconds,
  blockMinutes,
  isPaused,
  onPause,
  onResume,
  onStop,
  noisePlaying,
  onToggleNoise,
}: {
  course: Course | null;
  task: Task | null;
  elapsedSeconds: number;
  blockMinutes: number;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  noisePlaying: boolean;
  onToggleNoise: () => void;
}) {
  const accent = course?.color ?? '#A8B89B';
  const blockSeconds = Math.max(60, blockMinutes * 60);
  const remaining = blockSeconds - elapsedSeconds;
  const over = remaining < 0;
  const shown = Math.abs(remaining);

  const mins = Math.floor(shown / 60);
  const secs = Math.floor(shown % 60);
  const clock = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  // The ring fills as the block is used up, and holds full once it is.
  const progress = Math.min(1, elapsedSeconds / blockSeconds);
  const radius = 118;
  const circumference = 2 * Math.PI * radius;

  // A screen reader reading "16:41" character by character is not a reading of
  // a clock. The digits stay visual; this is what gets announced.
  const spoken = `${over ? 'Over by' : ''} ${mins} ${mins === 1 ? 'minute' : 'minutes'} ${
    over ? '' : 'left'
  }`;

  const [subtasks, setSubtasks] = useState(task?.subtasks ?? []);
  useEffect(() => {
    setSubtasks(task?.subtasks ?? []);
  }, [task?.subtasks]);

  function toggleSubtask(id: string) {
    if (!task) return;
    const next = subtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s));
    // Optimistic locally as well as in the cache: ticking something off
    // mid-session should never wait on a round trip.
    setSubtasks(next);
    updateTaskOptimistic(task.id, { subtasks: next }).catch(() => {
      setSubtasks(subtasks);
    });
  }

  const done = subtasks.filter((s) => s.completed).length;

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col animate-fade-in"
      style={{ background: '#14120F', color: INK }}
    >
      {/* The lamp. A single soft pool of the course's own colour behind the
          clock, which is the only warmth on the screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 38%, ${accent}22, transparent 62%)`,
        }}
      />

      <div className="relative flex items-center justify-between px-6 pt-[max(env(safe-area-inset-top),22px)]">
        <span
          className="text-[9.5px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: FAINT }}
        >
          {isPaused ? 'Paused' : 'Locked in'}
        </span>
        <button
          type="button"
          onClick={onToggleNoise}
          aria-pressed={noisePlaying}
          className="bg-transparent font-mono text-[11px]"
          style={{ color: noisePlaying ? accent : FAINT }}
        >
          {noisePlaying ? 'noise on' : 'noise off'}
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-7">
        {course && (
          <p
            className="m-0 text-[9.5px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: accent }}
          >
            {course.code}
          </p>
        )}
        {task && (
          <p className="mt-2 font-serif text-[17px] italic" style={{ color: DIM }}>
            {task.title}
          </p>
        )}

        <div className="relative mt-11 flex h-[250px] w-[250px] items-center justify-center">
          <svg
            width="250"
            height="250"
            viewBox="0 0 250 250"
            fill="none"
            aria-hidden
            className="absolute inset-0"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle cx="125" cy="125" r={radius} stroke="#2B2723" strokeWidth="1.5" />
            <circle
              cx="125"
              cy="125"
              r={radius}
              stroke={over ? '#B5694C' : accent}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="text-center">
            <p
              className={`m-0 font-mono text-[56px] font-bold leading-none tracking-[-0.04em] tabular-nums ${
                isPaused ? 'animate-tick' : ''
              }`}
              style={{ color: INK }}
            >
              {clock.slice(0, 2)}
              <span style={{ color: FAINT }}>:</span>
              {clock.slice(3)}
            </p>
            <p
              className="mt-3 text-[9.5px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: over ? '#B5694C' : FAINT }}
            >
              {over ? 'over the block' : `left of ${blockMinutes}`}
            </p>
            <span className="sr-only" role="status" aria-live="polite">
              {spoken}
            </span>
          </div>
        </div>

        {subtasks.length > 0 && (
          <div className="mt-10 w-full max-w-[250px]">
            {subtasks.map((sub, i) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => toggleSubtask(sub.id)}
                className={`flex w-full items-center gap-3 bg-transparent py-2.5 text-left ${
                  sub.completed ? 'opacity-40' : ''
                }`}
                style={{
                  borderBottom: i === subtasks.length - 1 ? 'none' : `1px solid ${RULE}`,
                }}
              >
                {sub.completed ? (
                  <span
                    aria-hidden
                    className="flex h-4 w-4 flex-none items-center justify-center"
                    style={{ background: accent, borderRadius: 4 }}
                  >
                    <HandCheck size={10} color="#14120F" strokeWidth={1.9} />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="scribble-box flex-none"
                    style={{ width: 16, height: 16, borderColor: DIM }}
                  />
                )}
                <span
                  className="min-w-0 flex-1 text-[13px]"
                  style={{ color: sub.completed ? DIM : '#E7E1D4' }}
                >
                  {sub.title}
                </span>
              </button>
            ))}
            {done > 0 && (
              <p className="mt-3 text-center font-mono text-[11px]" style={{ color: FAINT }}>
                {done} of {subtasks.length}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="relative flex items-center gap-2.5 px-6 pb-[calc(34px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={isPaused ? onResume : onPause}
          aria-label={isPaused ? 'Resume' : 'Pause'}
          className="flex h-[52px] w-[52px] flex-none items-center justify-center bg-transparent"
          style={{ border: `1px solid ${EDGE}`, color: '#B5AE99' }}
        >
          {isPaused ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M7 5l12 7-12 7V5z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 5v14M15 5v14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={onStop}
          className="h-[52px] flex-1 bg-transparent text-sm"
          style={{ border: `1px solid ${EDGE}`, color: '#E7E1D4' }}
        >
          Stop &amp; write it down
        </button>
      </div>
    </div>
  );
}
