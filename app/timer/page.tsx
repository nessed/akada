'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTimer } from '@/lib/timer-context';
import { useAmbientNoise } from '@/lib/use-ambient-noise';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import PendingSessionLogSheet from '@/components/PendingSessionLogSheet';
import LoadingIndicator from '@/components/LoadingIndicator';
import StudyFan from '@/components/StudyFan';
import NextMarkLine from '@/components/progression/NextMarkLine';
import { useCourses, useTasks } from '@/lib/data-hooks';

/**
 * The timer.
 *
 * Two modes over one clock. A **block** has a target: it counts down inside a
 * frame, and the study fan is sized so that touching the top edge is the
 * completion. **Open** has none: the fan is sized to the screen instead and
 * keeps unlocking depth for as long as the reader sits. Either way the state
 * is the one in lib/timer-context; the mode is only whether a target is set.
 *
 * The fan replaced a countdown ring. A ring says what fraction is gone, which
 * is the one thing a reader in the middle of a chapter does not want to be
 * told; the fan only ever grows.
 */

const BLOCK_LENGTHS = [25, 45, 60] as const;

function clockFace(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function spoken(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [
    h > 0 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '',
    `${m} ${m === 1 ? 'minute' : 'minutes'}`,
    `${sec} ${sec === 1 ? 'second' : 'seconds'}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function TimerPage() {
  const router = useRouter();
  const {
    hydrated,
    active,
    pendingLog,
    elapsedSeconds,
    start,
    extend,
    pause,
    resume,
    cancel,
    clearPendingLog,
    stop,
  } = useTimer();

  const { courses } = useCourses();
  const { tasks } = useTasks();
  const noise = useAmbientNoise();
  const [immersive, setImmersive] = useState(false);

  const timerCourseId = active?.courseId ?? pendingLog?.courseId ?? null;
  const timerTaskId = active?.taskId ?? pendingLog?.taskId ?? null;

  const course = useMemo(
    () => (timerCourseId ? courses.find((c) => c.id === timerCourseId) ?? null : null),
    [courses, timerCourseId],
  );
  const task = useMemo(
    () => (timerTaskId ? tasks.find((t) => t.id === timerTaskId) ?? null : null),
    [tasks, timerTaskId],
  );

  const handleStop = useCallback(() => {
    const result = stop();
    if (!result) {
      router.replace('/dashboard');
      return;
    }
    const durationSeconds = clampSessionSeconds(result.durationSeconds);
    if (!isLoggableDuration(durationSeconds)) {
      clearPendingLog();
      router.replace('/dashboard');
    }
  }, [clearPendingLog, router, stop]);

  /* Dead ends. A timer pointing at a course that has since been deleted, or
     an account with no courses at all, used to leave this screen spinning on
     "Loading your timer" with the browser's back button as the only way out.
     Both cases now land somewhere the reader can act. */
  useEffect(() => {
    // Nothing is known about the timer until the provider has read storage,
    // and a provider's effects run after its children's. Redirecting before
    // that point sent anyone who reloaded /timer mid-session back to the
    // dashboard with the session still running behind them.
    if (!hydrated) return;
    if (!active && !pendingLog) {
      router.replace('/dashboard');
      return;
    }
    if (timerCourseId && courses.length > 0 && !course) {
      cancel();
      clearPendingLog();
      router.replace('/dashboard');
    }
  }, [active, cancel, clearPendingLog, course, courses.length, hydrated, pendingLog, router, timerCourseId]);

  const isPaused = active?.isPaused ?? false;
  const elapsed = clampSessionSeconds(elapsedSeconds);
  const target = active?.targetSeconds ?? null;
  const isBlock = target != null;

  /* Space pauses, F finishes, Escape goes back. Typed into a field they mean
     what the field means, so the handler stands down for one. */
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (active.isPaused) resume();
        else pause();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleStop();
      } else if (e.key === 'Escape') {
        if (immersive) setImmersive(false);
        else router.push('/dashboard');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, handleStop, immersive, pause, resume, router]);

  if (!hydrated || (!course && !pendingLog)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="flex flex-col items-center">
          <LoadingIndicator compact label="Loading your timer" className="mb-8" />
          <div className="flex animate-pulse flex-col items-center opacity-40" aria-hidden>
            <div className="mb-2 h-5 w-20 rounded bg-line" />
            <div className="mb-10 h-8 w-48 rounded bg-line" />
            <div className="h-[200px] w-[340px] rounded-[14px] border-[1.5px] border-dashed border-line" />
          </div>
        </div>
      </div>
    );
  }

  const color = course?.color ?? '#A8B89B';
  const code = course?.code ?? 'Session';
  const startedAtMs = active ? active.startedAt - active.accumulatedMs : Date.now();

  // Block mode counts down; open mode counts up. The fan reads the same
  // number either way, as a fraction of the target or of a long sitting.
  const remaining = isBlock ? Math.max(0, target - elapsed) : elapsed;
  const overrun = isBlock && elapsed > target;
  const progress = isBlock
    ? Math.min(1, elapsed / Math.max(1, target))
    : // An open session has nothing to fill, so it grows against a notional
      // three hours: long enough that a normal sitting never tops out.
      Math.min(1, elapsed / (3 * 60 * 60));

  function setMode(next: 'block' | 'open') {
    if (!active) return;
    if (next === 'open') {
      start(active.courseId, active.taskId, null);
      return;
    }
    // Coming back to a block picks the shortest length that is still ahead of
    // where the clock already is, so switching never lands already expired.
    const mins = BLOCK_LENGTHS.find((n) => n * 60 > elapsed) ?? 60;
    start(active.courseId, active.taskId, Math.max(mins * 60, Math.ceil(elapsed / 60) * 60 + 300));
  }

  /* Open mode is the one screen in the app that inverts, so the chrome takes
     its ink as a value rather than a token: on the night paper `text-ink` is
     still the daylight ink and the switch read as dark on dark. */
  const night = !isBlock;
  const ink = night ? '#EFE9DC' : 'var(--ink)';
  const inkSoft = night ? '#C8C0B0' : 'var(--ink-soft)';
  const inkFaint = night ? '#958D7E' : 'var(--muted)';
  const hoverBg = night ? '#24211C' : 'var(--bg-tint)';

  const modeButton = (label: string, on: boolean, go: () => void) => (
    <button
      type="button"
      onClick={go}
      aria-pressed={on}
      className="h-10 rounded-[10px] px-3 text-[13px] font-medium transition-colors"
      style={{ color: on ? ink : inkSoft }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg;
        e.currentTarget.style.color = ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = on ? ink : inkSoft;
      }}
    >
      <span
        className={on ? 'hl-swipe' : ''}
        style={on ? ({ '--hl': night ? '#3E4238' : `${color}55` } as React.CSSProperties) : undefined}
      >
        {label}
      </span>
    </button>
  );

  const modeSwitch = (
    <div className="flex gap-1">
      {modeButton('Block', isBlock, () => setMode('block'))}
      {modeButton('Open', !isBlock, () => setMode('open'))}
    </div>
  );

  const controls = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => (isPaused ? resume() : pause())}
        style={
          night ? { background: '#EFE9DC', color: '#1A1815' } : undefined
        }
        className="flex h-11 items-center gap-2.5 rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-contrast transition-opacity hover:opacity-90"
      >
        {isPaused ? (
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5l12 7-12 7V5z" />
          </svg>
        ) : (
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 5v14M15 5v14" />
          </svg>
        )}
        {isPaused ? 'Resume' : 'Pause'}
      </button>

      {isBlock && (
        <button
          type="button"
          onClick={() => extend(5 * 60)}
          style={night ? { borderColor: '#4A4438', color: ink } : undefined}
          className="h-11 rounded-[10px] border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
        >
          +5 min
        </button>
      )}

      <button
        type="button"
        onClick={handleStop}
        style={night ? { borderColor: '#4A4438', color: ink } : undefined}
        className="h-11 rounded-[10px] border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
      >
        Finish and log
      </button>

      <button
        type="button"
        onClick={() => {
          cancel();
          router.replace('/dashboard');
        }}
        style={night ? { color: '#CC8462' } : undefined}
        className="h-11 rounded-[10px] px-4 text-[13px] font-medium text-warn transition-colors hover:bg-warnTint"
      >
        Discard
      </button>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] md:pt-5">
      <button
        type="button"
        onClick={() => router.push('/dashboard')}
        style={{ color: inkSoft }}
        className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-transparent px-2.5 text-[13px] font-medium transition-colors"
      >
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Today
      </button>

      {active && modeSwitch}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={noise.toggle}
          aria-pressed={noise.on}
          aria-label={noise.on ? 'Stop ambient noise' : 'Play ambient noise'}
          title={noise.error || 'Ambient noise'}
          style={{ color: noise.on ? ink : inkFaint }}
          className="grid h-10 w-10 place-items-center rounded-[10px] transition-colors"
        >
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setImmersive((v) => !v)}
          aria-label={immersive ? 'Exit full screen' : 'Full screen'}
          style={{ color: inkFaint }}
          className="grid h-10 w-10 place-items-center rounded-[10px] transition-colors"
        >
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d={immersive ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} />
          </svg>
        </button>
      </div>
    </div>
  );

  /* Open mode goes to the night paper and lets the fan fill the whole screen.
     It is the one place in the app that inverts, and it does it because a
     long sitting in a dark room is what the mode is for. */
  if (!isBlock) {
    return (
      <div
        className="relative flex min-h-[100dvh] flex-col overflow-hidden"
        style={{
          background: '#1A1815',
          backgroundImage:
            'radial-gradient(circle at 18% 12%, rgba(196,168,106,.07), transparent 55%), radial-gradient(circle at 82% 88%, rgba(138,120,92,.05), transparent 60%)',
          color: '#EFE9DC',
        }}
      >
        <StudyFan
          progress={progress}
          seed={active?.sessionId}
          color={color}
          light
          depth={10}
          tripleP={0.3}
          trunkWidth={15}
          padTop={20}
          widthFill={0.94}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        <div className="relative flex min-h-[100dvh] flex-col">
          {header}
          <div className="flex-1" />
          <div className="flex flex-col gap-6 px-6 pb-[max(env(safe-area-inset-bottom),32px)] md:flex-row md:items-end md:justify-between md:px-12 md:pb-10">
            <div>
              <p className="eyebrow m-0 mb-2" style={{ color }}>
                {code} · Open
              </p>
              <p
                className="m-0 font-mono text-[56px] font-medium leading-none tracking-[-0.03em] tabular-nums md:text-[72px]"
                aria-label={spoken(elapsed)}
              >
                {clockFace(elapsed)}
              </p>
              <p className="m-0 mt-3 font-mono text-[12px] tracking-[0.02em]" style={{ color: '#958D7E' }}>
                since {hhmm(startedAtMs)}
                {task ? <> · <span style={{ color: '#EFE9DC' }}>{task.title}</span></> : null}
                {isPaused ? ' · paused' : ''}
              </p>
            </div>
            <div>{controls}</div>
          </div>
        </div>
        <PendingSessionLogSheet />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg">
      {!immersive && header}

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 pb-10">
        {/* The frame. The fan is scaled so it exactly fills this box at the
            target, which is what makes "touched the top" mean "done". */}
        <div
          className="deckle relative w-full max-w-[720px] overflow-hidden border border-line bg-paper"
          style={{ height: 'min(46vh, 400px)' }}
        >
          <span
            aria-hidden
            className="absolute right-0 top-0 h-[22px] w-[22px]"
            style={{ background: 'linear-gradient(225deg, var(--bg-tint) 50%, transparent 50%)' }}
          />
          <span className="eyebrow absolute left-5 top-3.5 z-10" style={{ color }}>
            {code}
          </span>
          <span className="absolute right-5 top-3.5 z-10 font-mono text-[10px] tracking-[0.06em] text-muted">
            {hhmm(startedAtMs)} to {hhmm(startedAtMs + target * 1000)}
          </span>
          <StudyFan
            progress={progress}
            seed={active?.sessionId}
            color={color}
            depth={7}
            trunkWidth={11}
            padTop={45}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        <div className="text-center">
          <p
            className={`m-0 font-mono text-[56px] font-medium leading-none tracking-[-0.03em] tabular-nums md:text-[72px] ${
              isPaused ? 'opacity-60' : ''
            }`}
            aria-label={`${overrun ? 'Over by' : 'Remaining'} ${spoken(remaining)}`}
          >
            {clockFace(remaining)}
          </p>
          <p className="m-0 mt-3 font-mono text-[12px] tracking-[0.02em] text-muted">
            {overrun ? 'over' : 'of'} {clockFace(target)}
            {task ? <> · <span className="text-ink">{task.title}</span></> : null}
            {isPaused ? ' · paused' : ''}
          </p>
        </div>

        {controls}

        {/* Next Mark, quietly, under the controls. It says what this sitting
            is approaching and stays silent when nothing is near. It is kept
            off the open-mode night screen on purpose: that screen exists to
            hold one thing, and this would be a second one. */}
        <NextMarkLine surface="timer" className="-mt-4" />

        <p className="m-0 -mt-3 font-mono text-[11px] text-muted-soft">
          Space pause · F finish · Esc back
        </p>
      </div>

      <PendingSessionLogSheet />
    </div>
  );
}
