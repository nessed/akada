'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Course, Task } from '@/lib/data';
import { HABIT_MIN_BLOCKS, roughMinutes, settled } from '@/lib/progression';
import { useProgression } from '@/lib/progression/use-progression';
import { useTimerState } from '@/lib/timer-context';
import { LENGTHS, nearestLength, readLastLength, writeLastLength } from '@/lib/timer-length';

/**
 * The start popover.
 *
 * Every play mark in the app opens this: the row's own task already filled
 * in, four lengths, and one button. It replaces the trip to /timer to pick a
 * course, which was the reason starting a session used to cost four clicks.
 *
 * "Open" is the fourth length rather than a mode switch, because from the
 * reader's side an open session is just a block with no end on it.
 *
 * The length it opens on is learned. Once a course has enough timed blocks
 * behind it, the popover opens on the fixed length nearest to how long this
 * reader's blocks on that course actually run, and says so under the
 * choices; until then it opens on whatever was used last. A caller that has
 * already sized the session (Up next's Another length, the rail's start)
 * passes that length instead, and when it is not one of the three the
 * popover offers it as one more chip, first, so the figure the reader was
 * just shown is the one it opens on.
 */

export interface StartTarget {
  task: Task | null;
  course: Course;
  /** The element the popover hangs off, so it opens where it was clicked. */
  anchor: HTMLElement | null;
  /**
   * The length to open on, when the caller has already sized the session:
   * Up next's Another length, and the rail's start, pass the length Up next
   * gives (lib/up-next-session.ts), so the popover opens on the figure the
   * reader was just shown rather than on a different one. Null opens on
   * Untimed. Left out, the popover opens on the learned or last length.
   */
  minutes?: number | null;
}

function isFixedLength(n: number): boolean {
  return (LENGTHS as readonly number[]).includes(n);
}

function endsAt(minutes: number | null): ReactNode {
  if (minutes == null) return 'no end';
  const d = new Date(Date.now() + minutes * 60_000);
  return (
    <>
      ends at{' '}
      <span className="font-mono text-[11px] not-italic tabular-nums">
        {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
      </span>
    </>
  );
}

interface Props {
  target: StartTarget | null;
  onClose: () => void;
  /** Called once the session is running, before the timer screen opens. */
  onStarted?: () => void;
  /** Stay on the current screen rather than following the session to /timer. */
  stayPut?: boolean;
  /** Above a full-screen layer, such as Notes' focus mode. */
  raised?: boolean;
}

export default function StartTimerPopover({ target, onClose, onStarted, stayPut, raised }: Props) {
  const router = useRouter();
  const { start } = useTimerState();
  const { logged } = useProgression();
  const [minutes, setMinutes] = useState<number | null>(45);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /* How long this reader's blocks on this course actually run, once there
     are enough of them to say. Read from the record without the sitting on
     the clock, so starting a second block does not move the figure. */
  const usualHabit = target ? logged?.habits.byCourse.get(target.course.id) ?? null : null;
  const usualBlock = usualHabit?.blocks ?? null;
  const usualMinutes = usualBlock && settled(usualBlock, HABIT_MIN_BLOCKS) ? roughMinutes(usualBlock.median) : null;
  /* Whole sittings stand in where there are not enough timed blocks to read,
     so the line says which it is rather than calling a sitting a block. */
  const usualNoun = usualHabit?.blocksFrom === 'timed' ? 'blocks' : 'sessions';

  useEffect(() => {
    if (!target) return;
    if (target.minutes !== undefined) {
      setMinutes(target.minutes);
      return;
    }
    if (usualMinutes != null) {
      setMinutes(nearestLength(usualMinutes));
      return;
    }
    setMinutes(readLastLength());
  }, [target, usualMinutes]);

  /* Placed against the anchor's box and then pulled back inside the viewport,
     because a play mark near the right edge would otherwise open off screen. */
  useEffect(() => {
    if (!target?.anchor) {
      setPos(null);
      return;
    }
    const rect = target.anchor.getBoundingClientRect();
    // Never wider than the screen less its two 12px margins: at 320 a fixed
    // 360 ran the lengths and the start button off the right edge.
    const width = Math.min(360, window.innerWidth - 24);
    const left = Math.min(
      Math.max(12, rect.right - width),
      Math.max(12, window.innerWidth - width - 12),
    );
    const below = rect.bottom + 8;
    const top = below + 300 > window.innerHeight ? Math.max(12, rect.top - 308) : below;
    setPos({ top, left });
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onAway = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !target.anchor?.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        go();
      }
    };
    document.addEventListener('mousedown', onAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onAway);
      document.removeEventListener('keydown', onKey);
    };
    // `go` closes over the current length, so it is rebound as that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, minutes, onClose]);

  if (!target || !pos) return null;

  const { task, course } = target;
  /* The length the caller sized, when it is not one of the fixed three: one
     more chip, first and in the same style, so "Start 40 min" on Up next
     opens on 40 rather than on the nearest round number. */
  const offered = target.minutes != null && !isFixedLength(target.minutes) ? target.minutes : null;

  function go() {
    if (!target) return;
    // Only a fixed length, or Untimed, is a choice about how long the reader
    // likes to work. Up next's own figure (a session shortened to the
    // evening, say) would read back as 45 and teach the default nothing true.
    if (minutes == null || isFixedLength(minutes)) writeLastLength(minutes);
    start(target.course.id, target.task?.id ?? null, minutes == null ? null : minutes * 60);
    onStarted?.();
    onClose();
    if (!stayPut) router.push('/timer');
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Start timer"
      className={`fixed ${raised ? 'z-[85]' : 'z-50'} w-[min(360px,calc(100vw-24px))] animate-fade-in rounded-[14px] border border-line bg-paper p-5 shadow-[0_8px_20px_rgba(57,48,36,.12)]`}
      style={{ top: pos.top, left: pos.left }}
    >
      <p className="eyebrow m-0">Start timer</p>

      <div className="mt-3 flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5">
        <span
          aria-hidden
          className="block h-7 w-[3px] shrink-0 rounded-[1px]"
          style={{ background: course.color }}
        />
        <span className="min-w-0 flex-1">
          <span className="eyebrow block" style={{ color: course.color }}>
            {course.code}
          </span>
          <span className="mt-0.5 block truncate text-[14px] text-ink">
            {task?.title ?? 'No task, just the course'}
          </span>
        </span>
      </div>

      <div className={`mt-4 grid gap-1.5 ${offered != null ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {(offered != null ? [offered, ...LENGTHS] : LENGTHS).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMinutes(n)}
            aria-pressed={minutes === n}
            className={`h-11 rounded-[10px] font-mono text-[13px] transition-colors ${
              minutes === n
                ? 'border border-ink bg-bg-tint text-ink'
                : 'border border-line bg-transparent text-ink-soft hover:bg-bg-tint'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMinutes(null)}
          aria-pressed={minutes == null}
          className={`h-11 rounded-[10px] text-[12px] font-medium transition-colors ${
            minutes == null
              ? 'border border-ink bg-bg-tint text-ink'
              : 'border border-line bg-transparent text-ink-soft hover:bg-bg-tint'
          }`}
        >
          Untimed
        </button>
      </div>

      <p className="m-0 mt-2 font-serif text-[12.5px] italic text-muted-soft">
        {endsAt(minutes)}
        {usualMinutes != null && (
          <>
            {' · '}
            <span className="font-serif italic">
              your {course.code} {usualNoun} run about {usualMinutes} min
            </span>
          </>
        )}
      </p>

      <button
        type="button"
        onClick={go}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] bg-primary text-[14px] font-medium text-primary-contrast transition-opacity hover:opacity-90"
      >
        <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 5l12 7-12 7V5z" />
        </svg>
        {minutes == null ? 'Start untimed' : `Start ${minutes} min`}
      </button>

      <p className="key-hint m-0 mt-2.5 text-center font-mono text-[11px] text-muted-soft">
        {target.minutes !== undefined
          ? "Enter starts with Up next's length"
          : usualMinutes != null
            ? 'Enter starts with your usual length'
            : 'Enter starts with the last used length'}
      </p>
    </div>
  );
}
