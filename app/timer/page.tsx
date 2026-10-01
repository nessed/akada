'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { breakStartsAt, useTimer } from '@/lib/timer-context';
import { useAmbientNoise } from '@/lib/use-ambient-noise';
import { useAquariumSound } from '@/lib/use-aquarium-sound';
import { renderWallpaper, saveWallpaper } from '@/lib/wallpaper';
import SoundMenu from '@/components/SoundMenu';
import {
  BLOCK_NOTE_MAX,
  BREAK_LENGTHS,
  clampSessionSeconds,
  isLoggableDuration,
} from '@/lib/session-safety';
import PendingSessionLogSheet from '@/components/PendingSessionLogSheet';
import LoadingIndicator from '@/components/LoadingIndicator';
import { useNotice } from '@/components/Notice';
import StudyFan from '@/components/StudyFan';
import WoodScene from '@/components/WoodScene';
import HandNote from '@/components/notebook/HandNote';
import { arrival, successionAt } from '@/lib/wood/succession';
import dynamic from 'next/dynamic';
import type { ClearRect, OceanClock } from '@/components/OceanScene';
import { mixHex } from '@/lib/fan';
import { depthAt } from '@/lib/ocean/depth';
import { courseKey, oceanKey, oceanKeyFromSegments } from '@/lib/ocean/key';
import { jellyForBlock } from '@/lib/ocean/lineage';
import { HUES } from '@/lib/ocean/palette';
import SessionChain from '@/components/SessionChain';
import NextMarkLine from '@/components/progression/NextMarkLine';
import TallyMarks from '@/components/progression/TallyMarks';
import { MARKS_PER_PAGE } from '@/lib/progression';
import { useProgression } from '@/lib/progression/use-progression';
import { useCourses, useTasks } from '@/lib/data-hooks';
import { clockFace, formatHM } from '@/lib/utils';
import { hasEarlierBlock, stretchFace } from '@/lib/timer-face';
import { NIGHT_UNDERLINE, usePreferences } from '@/lib/preferences';

/* The deep is fetched only by someone who has chosen it. */
const OceanScene = dynamic(() => import('@/components/OceanScene'), { ssr: false });

/* Where the open screen's chrome sits, as shares of it: the header, the face
   and the controls. Animals that wander over them go faint there. */
/* The block frame's corners: the course code, the time range, the tally.
   The wash thins to bare paper there and animals keep out. */
const FRAME_POOLS: ClearRect[] = [
  { x: -0.05, y: -0.1, w: 0.33, h: 0.2 },
  { x: 0.72, y: -0.1, w: 0.33, h: 0.2 },
  { x: -0.05, y: 0.88, w: 0.36, h: 0.2 },
];
const OPEN_CLEAR: ClearRect[] = [
  { x: 0, y: 0, w: 1, h: 0.09 },
  { x: 0, y: 0.64, w: 0.46, h: 0.36 },
  { x: 0.58, y: 0.82, w: 0.42, h: 0.18 },
];

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
 *
 * A block that runs out keeps running, shown as overrun rather than stopped
 * outright — nothing is asked and nothing is decided for the reader. A
 * **break** is a stretch the reader chooses to take, by hand, and the
 * sitting carries on as a chain of blocks and the rests between them. The
 * break borrows this whole screen rather than bringing its own. The frame
 * stays, the clock counts the rest, and the fan holds exactly where the
 * block left it, which is the honest drawing of what is happening: nothing
 * is growing, and nothing has been lost either.
 */

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
  const [{ timerDrawing, darkMode }] = usePreferences();
  const {
    hydrated,
    active: liveActive,
    pendingLog,
    elapsedSeconds: liveElapsed,
    focusSeconds: liveFocus,
    onBreak: liveOnBreak,
    breakTarget: liveBreakTarget,
    lastBlockNote,
    extend,
    startBreak,
    endBreak,
    setBreakLength,
    noteLastBlock,
    pause,
    resume,
    cancel,
    clearPendingLog,
    stop,
  } = useTimer();

  const { courses } = useCourses();
  const { tasks } = useTasks();
  const { notify } = useNotice();
  const noise = useAmbientNoise();
  const aquarium = useAquariumSound();
  /* The record with this sitting folded in. The course's open page is drawn
     in the corner of the frame and fills as the reader sits; a mark that
     lands mid-block draws itself in there and then, which is the whole
     point of reading the clock rather than the log. */
  const { progression, sitting } = useProgression();

  /* The hook already refuses to fail silently — but a `title` is a tooltip,
     and a phone has no cursor to hover with, so on the device most likely to
     have the audio blocked the reason reached nobody. It is said out loud
     once, each time the reason changes. */
  useEffect(() => {
    if (noise.error) notify(noise.error);
  }, [noise.error, notify]);
  useEffect(() => {
    if (aquarium.error) notify(aquarium.error);
  }, [aquarium.error, notify]);
  const [immersive, setImmersive] = useState(false);
  /* Full screen is the browser's where it has one, and the page's own
     (the header put away) where it doesn't, which is every iPhone. Whichever
     way it was entered, the browser leaving it (Escape, the system gesture)
     puts the header back. */
  const nativeFull = useRef(false);
  const toggleImmersive = useCallback(() => {
    if (immersive) {
      setImmersive(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      return;
    }
    setImmersive(true);
    const root = document.documentElement;
    if (root.requestFullscreen) {
      nativeFull.current = true;
      root.requestFullscreen().catch(() => {
        nativeFull.current = false;
      });
    }
  }, [immersive]);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && nativeFull.current) {
        nativeFull.current = false;
        setImmersive(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  /* The wood's margin note when the land turns a stage: "scrub, year 5",
     in the hand, for a few seconds, and then the margin is clear again. */
  const [stageNote, setStageNote] = useState<{ text: string; at: number } | null>(null);
  const lastStageRef = useRef<number | null>(null);
  const chromeRef = useRef<HTMLDivElement | null>(null);

  /* The screen as it stood the moment Finish was pressed. Stopping empties
     the timer, and with no target left a block screen read as an open one:
     the page flipped to the night paper at 00:00 behind the log sheet as it
     rose. The sheet should come up over the sitting it is about, so the last
     frame is kept and drawn, still, until the sheet is dealt with. */
  const [held, setHeld] = useState<{
    active: NonNullable<typeof liveActive>;
    elapsed: number;
    focus: number;
    onBreak: boolean;
    breakTarget: number | null;
  } | null>(null);
  const active = liveActive ?? (pendingLog ? held?.active ?? null : null);
  const elapsedSeconds = liveActive ? liveElapsed : held?.elapsed ?? 0;
  const focusSeconds = liveActive ? liveFocus : held?.focus ?? 0;
  // In the deep, the noise darkens as the water does. Stepped, so the
  // filter is only touched a few dozen times over a whole descent.
  // Under the wood's canopy it closes in the same way: open in the meadow,
  // most of the way muffled by old growth.
  const noiseDepth =
    timerDrawing === 'ocean'
      ? Math.round(depthAt(focusSeconds).z * 50) / 50
      : timerDrawing === 'wood'
        ? Math.round(arrival(successionAt(focusSeconds).z, 0.45, 0.45) * 0.85 * 50) / 50
        : null;
  const setNoiseDepth = noise.setDepth;
  useEffect(() => setNoiseDepth(noiseDepth), [setNoiseDepth, noiseDepth]);
  const setAquariumDepth = aquarium.setDepth;
  useEffect(() => setAquariumDepth(noiseDepth), [setAquariumDepth, noiseDepth]);
  const onBreak = liveActive ? liveOnBreak : held?.onBreak ?? false;
  const breakTarget = liveActive ? liveBreakTarget : held?.breakTarget ?? null;
  /* Whether anything on screen can still be acted on. A held frame is a
     picture of the sitting, not the sitting. */
  const live = liveActive != null;

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

  const segments = useMemo(() => active?.segments ?? [], [active]);

  /* What the fan is holding at during a break: the block that just ended,
     as a fraction of what it was armed for. A block ended by hand half way
     through holds the fan half way through, which is where it was. */
  const heldProgress = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = segments[i];
      if (segment.kind !== 'focus') continue;
      return segment.targetSeconds
        ? Math.min(1, segment.seconds / segment.targetSeconds)
        : // An open block fills against the same notional three hours the live
          // screen does, so the fan holds exactly where it stood.
          Math.min(1, segment.seconds / (3 * 60 * 60));
    }
    return 0;
  }, [segments]);

  const blocksDone = useMemo(
    () => segments.filter((segment) => segment.kind === 'focus').length,
    [segments],
  );

  const handleStop = useCallback(() => {
    if (liveActive) {
      setHeld({
        active: liveActive,
        elapsed: liveElapsed,
        focus: liveFocus,
        onBreak: liveOnBreak,
        breakTarget: liveBreakTarget,
      });
    }
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
  }, [clearPendingLog, liveActive, liveBreakTarget, liveElapsed, liveFocus, liveOnBreak, router, stop]);

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
    if (!liveActive && !pendingLog) {
      router.replace('/dashboard');
      return;
    }
    if (timerCourseId && courses.length > 0 && !course) {
      cancel();
      clearPendingLog();
      router.replace('/dashboard');
    }
  }, [cancel, clearPendingLog, course, courses.length, hydrated, liveActive, pendingLog, router, timerCourseId]);

  const isPaused = active?.isPaused ?? false;

  /* The wall clock, for the frame's window. A running stretch re-renders
     every second anyway; a held one does not, and its projected end moves
     with the wall, so the screen is redrawn every so often while held. */
  const [, setHeldRedraw] = useState(0);
  useEffect(() => {
    if (!live || !isPaused) return;
    const id = window.setInterval(() => setHeldRedraw((n) => n + 1), 15 * 1000);
    return () => window.clearInterval(id);
  }, [live, isPaused]);
  const wallNow = Date.now();
  /* The current stretch, which is what the face shows: time into this block,
     or time into this break. The sitting's total is `focusSeconds`. */
  const elapsed = clampSessionSeconds(elapsedSeconds);
  const target = active?.targetSeconds ?? null;
  /* A break inside a block session keeps the block screen, because the block
     length is still what the sitting is made of. A break taken during an open
     session stays on the night screen for the same reason. */
  const isBlock = target != null;
  const resting = onBreak && active != null;
  /* The face is the stretch on the clock, the same number the dock and the
     tab show. After a break it starts again on the new block; the session's
     running total sits under it once there is an earlier block to add up. */
  const face = stretchFace({ onBreak: resting, breakTarget, target, elapsed });
  const breakOver = resting && face.over;
  const showTotal = active != null && hasEarlierBlock(active.segments);

  /* The wood reads the sitting's focus, not the stretch's: the land ages on
     every block, and waits through the breaks. */
  const woodFocus = liveActive ? liveFocus : held ? held.focus : pendingLog?.durationSeconds ?? 0;
  const wood = timerDrawing === 'wood' ? successionAt(woodFocus) : null;
  const woodStage = wood?.index ?? null;
  useEffect(() => {
    if (woodStage == null || !live) {
      lastStageRef.current = woodStage;
      return;
    }
    const before = lastStageRef.current;
    lastStageRef.current = woodStage;
    if (before != null && woodStage > before) {
      const s = successionAt(woodFocus);
      setStageNote({ text: `${s.name}, year ${s.years}`, at: Date.now() });
      const id = window.setTimeout(() => setStageNote(null), 6500);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woodStage, live]);

  /* Space pauses, F finishes, Escape goes back. Typed into a field they mean
     what the field means, so the handler stands down for one. B is not here:
     it takes a break from every screen, so it lives in TimerHotkeys. */
  useEffect(() => {
    if (!liveActive) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === ' ') {
        e.preventDefault();
        // On a break the one thing Space can mean is ending it. Pausing a
        // break is a control nobody reaches for and it reads as stopping. The
        // next block then waits for another Space to start it.
        if (onBreak) endBreak();
        else if (liveActive.isPaused) resume();
        else pause();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleStop();
      } else if (e.key === 'Escape') {
        if (immersive) toggleImmersive();
        else router.push('/dashboard');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [endBreak, handleStop, immersive, liveActive, onBreak, pause, resume, router, toggleImmersive]);

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
  const pageRecord = course ? (progression?.pages.get(course.id) ?? null) : null;
  const tally =
    sitting && course && sitting.courseId === course.id
      ? sitting.tally
      : pageRecord
        ? { inked: pageRecord.onPage, fresh: 0 }
        : null;
  /* Two different starts. The frame's window is the stretch on the clock; the
     open screen's "since" is the whole sitting, breaks and all. */
  const sittingStartedAt = active?.sittingStartedAt ?? wallNow;

  // Block mode counts down, and past its target counts the overrun up; open
  // mode counts up. The fan reads elapsed either way, as a fraction of the
  // target or of a long sitting.
  const remaining = face.seconds;
  const overrun = !resting && face.over;
  /* Past its length the face counts up what has run over, and says so with
     a plus: "16:23" under "over 45:00" read as sixteen minutes left. */
  const faceText = `${face.over ? '+' : ''}${clockFace(remaining)}`;
  const progress = resting
    ? // Held. Rest is not progress, and a fan that shrank back would be
      // telling the reader they had lost the block they just finished.
      heldProgress
    : isBlock
      ? Math.min(1, elapsed / Math.max(1, target))
      : // An open session has nothing to fill, so it grows against a notional
        // three hours: long enough that a normal sitting never tops out.
        Math.min(1, elapsed / (3 * 60 * 60));

  /* Each block grows its own fan, so the second one is not a replay of the
     first. During a break the seed stays on the block that just ended, which
     is the fan still on screen. */
  const fanSeed = `${active?.sessionId ?? 's'}-${resting ? Math.max(0, blocksDone - 1) : blocksDone}`;

  /* The deep. The sitting's ocean is keyed on the course and the moment the
     sitting started, which the log keeps too, so a finished sitting still
     finds its own sea under the sheet. Each block's jelly is the child of
     the last (lib/ocean/lineage); the ones already finished hang back in the
     water as a bloom. */
  const ocean = timerDrawing === 'ocean';
  const blockIndex = resting ? Math.max(0, blocksDone - 1) : blocksDone;
  const sittingKey =
    ocean && timerCourseId
      ? active?.sittingStartedAt != null && Number.isFinite(active.sittingStartedAt)
        ? oceanKey(timerCourseId, active.sittingStartedAt)
        : oceanKeyFromSegments(timerCourseId, pendingLog?.segments)
      : null;
  const heroBody = sittingKey ? jellyForBlock(sittingKey, blockIndex) : undefined;
  const heroColor = heroBody ? mixHex(color, HUES[heroBody.hue], heroBody.hueMix) : color;
  const drawingSeed = sittingKey ? `${sittingKey}-${blockIndex}` : fanSeed;
  /* A break runs the stretch too: focus stands still through it, but the
     animals swim on (OceanScene's swim clock), so it is handed over as is. */
  const oceanClock: OceanClock =
    live && active
      ? {
          segments,
          phase: active.phase,
          stretchMs: Math.max(0, active.accumulatedMs),
          runningSince: active.isPaused ? null : active.startedAt,
        }
      : // After Finish the sitting is a still; after a close that bypassed
        // the Finish button there is no snapshot, and the log says how long.
        // The log has the last stretch closed into it, so it is the one that
        // knows how long the breaks were.
        {
          frozen: held ? focusSeconds : pendingLog?.durationSeconds ?? focusSeconds,
          rest: (pendingLog?.segments ?? segments).reduce((sum, s) => (s.kind === 'break' ? sum + s.seconds : sum), 0),
          segments: pendingLog?.segments ?? segments,
        };
  const oceanDepth = ocean ? depthAt(focusSeconds) : null;
  /* The water as a picture, for a wallpaper: the scene and the jelly drawn
     again at full size (lib/wallpaper), without the clock on top of them. */
  const saveWater = async () => {
    const box = document.querySelector<HTMLElement>('[data-ocean-scene]');
    const wall = box ? await renderWallpaper(box) : null;
    if (!wall) {
      notify('Couldn’t draw the water just now.');
      return;
    }
    await saveWallpaper(wall, `akada-deep-${oceanDepth?.meters ?? 0}m.png`);
  };
  /* In the frame the deep is laid on the page itself: on the night paper it
     is night water from the start, on a daylight paper a wash that goes dark
     by the midnight zone, where the jelly's ink turns light with it. */
  const frameGround = darkMode ? 'night' : 'paper';
  const frameLight = frameGround === 'night' || (oceanDepth?.z ?? 0) >= 0.42;

  /* The chain with the rest currently being taken drawn on the end of it, so
     the first break of a sitting has two marks to show rather than one. A
     single mark is not a chain; it is a bar, which is the one shape the app
     does not draw. Hence the length test at both call sites. */
  const liveChain =
    resting && active
      ? [
          ...segments,
          {
            kind: 'break' as const,
            ordinal: segments.length + 1,
            startedAt: new Date(active.stretchStartedAt).toISOString(),
            seconds: Math.max(1, elapsed),
            targetSeconds: breakTarget,
          },
        ]
      : segments;

  /* Pausing is the page going quiet, not a switch being thrown. The clock
     lets its ink down over half a second, the fan loses some of its colour
     and the word "paused" fades in after them; resuming runs the same way
     back. The same curve as the sheet's slide-up, so every move on this
     screen is the one hand. */
  const pausedFocus = isPaused && !resting;
  /* A block set out after a break waits at zero for the reader to start it.
     Held there, it is ready rather than paused, and the button starts it. */
  const heldFresh = pausedFocus && (active?.accumulatedMs ?? 0) === 0;

  /* The frame's "14:20 to 14:45". The end is where the stretch will actually
     reach its length from here, so a ten-minute pause moves it ten minutes;
     it used to be the start plus the target, which stopped being true the
     first time anybody paused. A held block has not started, so both ends
     are read from now. */
  const stretchStartedAt = heldFresh ? wallNow : active?.stretchStartedAt ?? wallNow;
  const stretchTargetMs = (resting ? breakTarget ?? 0 : target ?? 0) * 1000;
  const stretchEndsAt = active
    ? (isPaused ? wallNow : active.startedAt) + stretchTargetMs - Math.max(0, active.accumulatedMs)
    : wallNow + stretchTargetMs;
  const clockEase: CSSProperties = {
    transition: 'opacity 480ms cubic-bezier(0.2, 0.7, 0.2, 1), color 480ms cubic-bezier(0.2, 0.7, 0.2, 1)',
  };
  const quiet = `transition-[filter,opacity] duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
    pausedFocus ? 'opacity-80 saturate-[0.55]' : ''
  }`;
  const swap =
    'absolute inset-0 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]';
  const swapWord =
    'col-start-1 row-start-1 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]';
  /* How long the clock has been held, once that is a minute or more. A
     pause used to be a frozen number and nothing else, so a reader coming
     back had no way to tell whether they had been gone five minutes or
     fifty, which is the thing that decides whether it was a break. */
  const heldSeconds =
    pausedFocus && !heldFresh && active?.pausedAt != null ? Math.max(0, (wallNow - active.pausedAt) / 1000) : 0;
  const pausedMark = pausedFocus ? (
    <span className="inline-block animate-settle" style={{ animationDelay: '120ms' }}>
      {heldFresh ? '\u00a0· ready' : '\u00a0· paused'}
      {heldSeconds >= 60 ? (
        <>
          {' '}
          <span className="font-mono not-italic tabular-nums">{formatHM(heldSeconds)}</span>
        </>
      ) : null}
    </span>
  ) : null;
  /* Whether Break, pressed now, files the hold as the rest it was. Named on
     the button when it does, since it is a different thing to press. */
  const breakFromPause = live && active != null && !resting && breakStartsAt(active, wallNow) < wallNow;

  /* The wood's line: the stage it has reached and how many years of growth,
     the digits in mono and the words in the serif, the same division the
     "in this session" line makes. */
  const woodLine = (tone: { words: string; digits: string } | null) =>
    wood ? (
      <p className="m-0 mt-1.5 text-[12.5px]" style={tone ? { color: tone.words } : undefined}>
        <span className={`font-serif italic ${tone ? '' : 'text-muted'}`}>{wood.name} · </span>
        <span className={`font-mono tabular-nums ${tone ? '' : 'text-ink-soft'}`} style={tone ? { color: tone.digits } : undefined}>
          {wood.years}
        </span>{' '}
        <span className={`font-serif italic ${tone ? '' : 'text-muted'}`}>{wood.years === 1 ? 'year' : 'years'}</span>
      </p>
    ) : null;
  const stageMark = (ink: string) =>
    stageNote ? (
      <span key={stageNote.at} className="stage-note pointer-events-none">
        <HandNote size={18} rotate={-2} color={ink}>
          {stageNote.text}
        </HandNote>
      </span>
    ) : null;

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
      // Set here rather than at the call sites: the break lengths are
      // rendered from a list and React wants a key on each of them.
      key={label}
      type="button"
      onClick={go}
      aria-pressed={on}
      className="h-10 rounded-[10px] px-3 text-[13px] font-medium transition-[color,background-color,transform] duration-200 active:scale-[0.97]"
      style={{ color: on ? ink : inkSoft }}
      // A cursor only: a finger fires enter on a tap and never leaves, which
      // left the tapped length looking pointed at after the finger was gone.
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        e.currentTarget.style.background = hoverBg;
        e.currentTarget.style.color = ink;
      }}
      onPointerLeave={(e) => {
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

  /* The same slot, while resting. Switching the shape of the sitting in the
     middle of a break is meaningless; the length of the break is the one
     thing worth reaching for, so it takes the place rather than joining it. */
  const breakSwitch = (
    <div className="flex gap-1">
      {BREAK_LENGTHS.map((n) =>
        modeButton(`${n}m`, breakTarget === n * 60, () => setBreakLength(n * 60)),
      )}
    </div>
  );

  /* The bordered header action from readmedesign.md's button section. The
     solid fill is spent on exactly one control per screen: pause while a
     block runs, "end break" while a break does. */
  const secondary = (label: string, go: () => void) => (
    <button
      type="button"
      onClick={go}
      style={night ? { borderColor: '#4A4438', color: ink } : undefined}
      className="h-11 rounded-[10px] border border-line-strong px-4 text-[13px] font-medium text-ink transition-[background-color,transform] duration-200 ease-out hover:bg-bg-tint active:scale-[0.97]"
    >
      {label}
    </button>
  );

  const finishButton = secondary('Finish', handleStop);

  const discardButton = (
    <button
      type="button"
      onClick={() => {
        cancel();
        router.replace('/dashboard');
      }}
      style={night ? { color: '#CC8462' } : undefined}
      className="h-11 rounded-[10px] px-4 text-[13px] font-medium text-warn transition-[background-color,transform] duration-200 ease-out hover:bg-warnTint active:scale-[0.97]"
    >
      Discard
    </button>
  );

  const restControls = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={endBreak}
        style={night ? { background: '#EFE9DC', color: '#1A1815' } : undefined}
        className="flex h-11 items-center rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-contrast transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.97]"
      >
        End break
      </button>
      {secondary('+5 min', () => extend(5 * 60))}
      {finishButton}
      {discardButton}
    </div>
  );

  const focusControls = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => (isPaused ? resume() : pause())}
        style={
          night ? { background: '#EFE9DC', color: '#1A1815' } : undefined
        }
        aria-label={isPaused ? (heldFresh ? 'Start' : 'Resume') : 'Pause'}
        className="flex h-11 items-center gap-2.5 rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-contrast transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.97]"
      >
        {/* Both glyphs and both words are always there, stacked in one cell,
            and the press crosses them over rather than swapping one for the
            other. The cell is as wide as the longer word, so the button does
            not change size under the finger either. */}
        <span aria-hidden className="relative h-3 w-3">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={`${swap} ${isPaused ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0'}`}
          >
            <path d="M7 5l12 7-12 7V5z" />
          </svg>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={`${swap} ${isPaused ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'}`}
          >
            <path d="M9 5v14M15 5v14" />
          </svg>
        </span>
        <span aria-hidden className="grid text-left">
          <span className={`${swapWord} ${isPaused ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'}`}>{heldFresh ? 'Start' : 'Resume'}</span>
          <span className={`${swapWord} ${isPaused ? '-translate-y-1.5 opacity-0' : 'translate-y-0 opacity-100'}`}>Pause</span>
        </span>
      </button>

      {isBlock && secondary('+5 min', () => extend(5 * 60))}
      {secondary(breakFromPause ? 'Count as break' : 'Break', () => startBreak())}
      {finishButton}
      {discardButton}
    </div>
  );

  /* Resting and working are different sets of controls in the same place.
     Keyed on which it is, so the new set settles in rather than cutting. A
     held frame keeps its controls on screen but out of reach. */
  const controls = (
    <div
      key={resting ? 'controls-rest' : 'controls-focus'}
      className={`animate-settle ${live ? '' : 'pointer-events-none'}`}
      aria-hidden={live ? undefined : true}
    >
      {resting ? restControls : focusControls}
    </div>
  );

  /* The question asked where the answer still is.
     A sitting's own note is written at the end, by which point the first
     block is two hours and two breaks ago and gets remembered as "algorithms,
     I think". A break is five minutes with nothing to do in them, so the
     block that just ended is asked about here instead.

     A line to write on rather than a field to fill in: no box, no label, the
     question itself set faintly in the serif on the hand-drawn rule. There is
     nothing to save and nothing to submit, because every keystroke is already
     on the block it belongs to.

     Only drawn when there is a block to attach it to. Tapping Break the
     instant a session starts leaves a focus stretch too short to record, and
     a line that silently swallowed what was typed into it would be worse than
     no line. */
  const blockNoteLine =
    resting && blocksDone > 0 ? (
      <input
        type="text"
        value={lastBlockNote}
        onChange={(event) => noteLastBlock(event.target.value)}
        maxLength={BLOCK_NOTE_MAX}
        placeholder="what did that cover?"
        aria-label="What the block you just finished covered"
        className="hand-underline w-full max-w-[340px] bg-transparent text-center font-serif italic text-[14px] leading-[1.5] outline-none placeholder:text-muted-soft"
        style={
          night
            ? ({
                color: '#EFE9DC',
                // The open screen inverts with literal values, and the rule's
                // ink lives inside a data URI, so the night paper's url is
                // swapped in whole.
                '--underline-svg': NIGHT_UNDERLINE,
              } as React.CSSProperties)
            : undefined
        }
      />
    ) : null;

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

      {/* A block or an open session is chosen once, in the start popover
          (25 / 45 / 60 / Untimed), so the header no longer offers to switch
          it mid-sitting. It carries the break's lengths while one runs. */}
      {active && resting ? (
        <div key="switch-rest" className={`animate-settle ${live ? '' : 'pointer-events-none'}`}>
          {breakSwitch}
        </div>
      ) : (
        <span aria-hidden />
      )}

      <div className="flex items-center gap-0.5">
        {timerDrawing === 'ocean' && (
          <button
            type="button"
            onClick={saveWater}
            aria-label="Save the water as a wallpaper"
            title="Save as wallpaper"
            style={{ color: inkSoft }}
            className="grid h-10 w-10 place-items-center rounded-[10px] transition-colors"
          >
            <svg aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3.5" width="16" height="17" rx="2" />
              <path d="M4 15.5l4.5-4 3.5 3 3-2.5 5 4.5" />
            </svg>
          </button>
        )}
        <SoundMenu
          night={night}
          accent={color}
          noise={{ on: noise.on, toggle: noise.toggle }}
          tank={timerDrawing === 'ocean' ? aquarium : undefined}
        />
        <button
          type="button"
          onClick={toggleImmersive}
          aria-label={immersive ? 'Exit full screen' : 'Full screen'}
          title={immersive ? 'Exit full screen' : 'Full screen'}
          style={{ color: inkSoft }}
          className="grid h-10 w-10 place-items-center rounded-[10px] transition-colors"
        >
          <svg aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={immersive ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} />
          </svg>
        </button>
      </div>
    </div>
  );

  /* With the header put away there is still a way back: one small mark in the
     corner, since the header is where the full-screen button lives. */
  const exitChip = (
    <div className="flex justify-end px-5 pt-[max(env(safe-area-inset-top),16px)] md:pt-5">
      <button
        type="button"
        onClick={toggleImmersive}
        aria-label="Exit full screen"
        title="Exit full screen"
        style={{ color: inkSoft }}
        className="grid h-10 w-10 place-items-center rounded-[10px] opacity-70 transition-[opacity,color] hover:opacity-100"
      >
        <svg aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        </svg>
      </button>
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
            'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(196,168,106,.10), transparent 70%), radial-gradient(circle at 18% 12%, rgba(196,168,106,.07), transparent 55%), radial-gradient(circle at 82% 88%, rgba(138,120,92,.05), transparent 60%)',
          color: '#EFE9DC',
        }}
      >
        {ocean && sittingKey && timerCourseId ? (
          <OceanScene
            sittingKey={sittingKey}
            courseKey={courseKey(timerCourseId)}
            color={color}
            clock={oceanClock}
            blocks={blockIndex}
            resting={resting}
            paused={pausedFocus}
            still={!live}
            ground="night"
            clear={OPEN_CLEAR}
            className="!absolute inset-0 h-full w-full"
          >
            <StudyFan
              progress={progress}
              seed={drawingSeed}
              color={heroColor}
              species="ocean"
              body={heroBody}
              light
              padTop={96}
              widthFill={0.94}
              resting={pausedFocus}
              className={`absolute inset-0 h-full w-full ${quiet}`}
            />
          </OceanScene>
        ) : timerDrawing === 'wood' ? (
          <WoodScene
            mode="open"
            courseId={course?.id ?? pendingLog?.courseId ?? 'course'}
            color={color}
            sitting={active}
            ended={!active ? pendingLog?.segments ?? null : null}
            still={!live}
            sessionId={active?.sessionId ?? null}
            clearRef={chromeRef}
            hero={{ progress, seed: fanSeed, depth: 10, tripleP: 0.3, trunkWidth: 15, padTop: 20, widthFill: 0.94, light: true, resting: pausedFocus }}
            className={quiet}
          />
        ) : (
          <StudyFan
            progress={progress}
            seed={fanSeed}
            color={color}
            species={timerDrawing}
            light
            depth={10}
            tripleP={0.3}
            trunkWidth={15}
            // The fan reaches up under the header; the jelly's bell hangs
            // from the top, so it is given the header's height to hang below.
            padTop={timerDrawing === 'tree' ? 20 : 96}
            widthFill={0.94}
            resting={pausedFocus}
            className={`absolute inset-0 h-full w-full ${quiet}`}
          />
        )}

        {/* The chrome floats over the fan, and only the chrome takes the
            pointer. The empty middle of the screen is left to the tree, so a
            hand that reaches into it lands on a branch rather than on a sheet
            of glass laid over one. */}
        <div className="pointer-events-none relative flex min-h-[100dvh] flex-col">
          <div className="pointer-events-auto">{immersive ? exitChip : header}</div>
          <div className="flex-1" />
          {stageNote ? <div className="absolute right-6 top-20 md:right-12">{stageMark('#C8C0B0')}</div> : null}
          <div
            ref={chromeRef}
            className="pointer-events-auto flex flex-col gap-6 px-6 pb-[max(env(safe-area-inset-bottom),32px)] md:flex-row md:items-end md:justify-between md:px-12 md:pb-10"
          >
            <div key={resting ? 'face-rest' : 'face-focus'} className="animate-settle">
              <p className="eyebrow m-0 mb-2" style={{ color }}>
                {code} · {resting ? 'Break' : 'Open'}
              </p>
              <p
                className="m-0 font-mono text-[56px] font-medium leading-none tracking-[-0.03em] tabular-nums md:text-[72px]"
                /* The alarm ramp, not red, and only once the break has
                   actually run past its length. See "No Alarmist
                   Indicators": the number going quietly warm is the whole
                   announcement. */
                style={{
                  ...clockEase,
                  opacity: pausedFocus ? 0.5 : 1,
                  color: breakOver ? '#CC8462' : undefined,
                }}
                aria-label={
                  resting
                    ? `${breakOver ? 'Break over by' : 'Break, remaining'} ${spoken(remaining)}`
                    : spoken(elapsed)
                }
              >
                <span className={pausedFocus ? 'held-breath' : undefined}>
                  {faceText}
                </span>
              </p>
              <p className="m-0 mt-3 font-serif italic text-[13.5px]" style={{ color: '#958D7E' }}>
                {resting ? (
                  <>
                    {breakOver ? 'over' : 'of'} {clockFace(breakTarget ?? 0)} break
                  </>
                ) : (
                  <>since {hhmm(sittingStartedAt)}</>
                )}
                {oceanDepth ? (
                  <>
                    {' · '}
                    <span className="font-mono not-italic tabular-nums" style={{ color: '#C8C0B0' }}>
                      {oceanDepth.meters.toLocaleString('en-US')} m
                    </span>{' '}
                    down
                  </>
                ) : null}
                {task ? <> · <span style={{ color: '#EFE9DC' }}>{task.title}</span></> : null}
                {pausedMark}
              </p>
              {showTotal ? (
                <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: '#958D7E' }}>
                  <span className="font-mono tabular-nums" style={{ color: '#C8C0B0' }}>
                    {clockFace(focusSeconds)}
                  </span>{' '}
                  <span className="font-serif italic">in this session</span>
                </p>
              ) : null}
              {woodLine({ words: '#958D7E', digits: '#C8C0B0' })}
              {/* The course's page, the same one the block frame carries in
                  its margin. It fills as the reader sits and a mark that
                  lands inks itself in where they can see it. The empty marks
                  take an explicit dark rule: this screen inverts with literal
                  values, so the paper's own line would be the daylight one. */}
              {tally && (
                <span className="mt-4 flex items-center gap-2.5">
                  <TallyMarks
                    inked={tally.inked}
                    total={MARKS_PER_PAGE}
                    fresh={tally.fresh}
                    color={color}
                    trackColor="#4A4438"
                    size={14}
                  />
                  <span className="font-mono text-[10.5px] tracking-[0.06em]" style={{ color: '#958D7E' }}>
                    {tally.inked} / {MARKS_PER_PAGE}
                  </span>
                </span>
              )}

              {/* What the sitting has done, and only that. This screen holds
                  one thing and is not given a prompt; a mark that landed
                  while the reader sat is not a prompt, it is the record. */}
              <NextMarkLine surface="timer" night onlyLanded align="start" className="mt-3" />
              {blockNoteLine ? <div className="mt-5 max-w-[280px]">{blockNoteLine}</div> : null}

              {resting && liveChain.length > 1 ? (
                <SessionChain
                  segments={liveChain}
                  color={color}
                  restColor="#4A4438"
                  className="mt-4 max-w-[280px]"
                />
              ) : null}
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
      {immersive ? exitChip : header}

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 pb-10">
        {/* The frame. The fan is scaled so it exactly fills this box at the
            target, which is what makes "touched the top" mean "done". */}
        <div
          className="deckle relative w-full max-w-[800px] overflow-hidden border border-line bg-paper"
          style={{
            height: 'min(50vh, 450px)',
            /* A page from the notebook: faint rules, a margin, and the one
               warm shadow a sheet lying on the desk would throw. */
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--line-soft) 31px, var(--line-soft) 32px)',
            boxShadow: '0 1px 0 var(--line-soft), 0 18px 40px -28px rgba(96, 74, 40, 0.35)',
          }}
        >
          <span aria-hidden className="absolute bottom-0 left-16 top-0 w-px bg-line" />
          <span
            aria-hidden
            className="absolute right-0 top-0 z-10 h-6 w-6"
            style={{
              background: 'linear-gradient(225deg, var(--bg) 50%, var(--bg-tint) 50%)',
              boxShadow: '-1px 1px 2px rgba(96, 74, 40, 0.12)',
            }}
          />
          {/* The course's colour is a mark, never text: a short rule, with the
              code beside it in ink-soft. */}
          <span className="absolute left-5 top-4 z-10 flex items-center gap-2">
            <span aria-hidden className="block h-[3px] w-4 rounded-sm" style={{ background: color }} />
            <span className="eyebrow text-ink-soft">
              {code}
              {resting ? ' · Break' : ''}
            </span>
          </span>
          <span className="absolute right-9 top-4 z-10 font-mono text-[10.5px] tracking-[0.06em] text-muted">
            {hhmm(stretchStartedAt)} to {hhmm(stretchEndsAt)}
          </span>
          {/* The course's open page, in the margin of the frame. It reads the
              sitting on the clock, so a mark inked twelve minutes into this
              block draws itself in twelve minutes into this block. */}
          {tally && (
            <span className="absolute bottom-3.5 left-5 z-10 flex items-center gap-2">
              <TallyMarks
                inked={tally.inked}
                total={MARKS_PER_PAGE}
                fresh={tally.fresh}
                color={color}
                size={13}
              />
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted">
                {tally.inked} / {MARKS_PER_PAGE}
              </span>
            </span>
          )}
          {/* Standing on a drawn ground, with the rest of its shape sketched
              in pencil above it for the ink to fill. */}
          {ocean && sittingKey && timerCourseId ? (
            <OceanScene
              sittingKey={sittingKey}
              courseKey={courseKey(timerCourseId)}
              color={color}
              clock={oceanClock}
              blocks={blockIndex}
              resting={resting}
              paused={pausedFocus}
              still={!live}
              ground={frameGround}
              clear={FRAME_POOLS}
              pools={FRAME_POOLS}
              rules
              className="!absolute inset-0 h-full w-full"
            >
              <StudyFan
                species="ocean"
                body={heroBody}
                progress={progress}
                seed={drawingSeed}
                color={heroColor}
                light={frameLight}
                padTop={46}
                baseOffset={24}
                sketch
                ground
                resting={pausedFocus}
                className={`absolute inset-0 h-full w-full ${quiet}`}
              />
            </OceanScene>
          ) : timerDrawing === 'wood' ? (
            <WoodScene
              mode="frame"
              courseId={course?.id ?? pendingLog?.courseId ?? 'course'}
              color={color}
              sitting={active}
              ended={!active ? pendingLog?.segments ?? null : null}
              still={!live}
              sessionId={active?.sessionId ?? null}
              hero={{ progress, seed: fanSeed, depth: 7, trunkWidth: 12, padTop: 46, baseOffset: 24, sketch: true, ground: true, resting: pausedFocus }}
              className={quiet}
            />
          ) : (
            <StudyFan
              species={timerDrawing}
              body={heroBody}
              progress={progress}
              seed={drawingSeed}
              color={heroColor}
              depth={7}
              trunkWidth={12}
              padTop={46}
              baseOffset={24}
              sketch
              ground
              resting={pausedFocus}
              className={`absolute inset-0 h-full w-full ${quiet}`}
            />
          )}
          {stageNote ? <div className="absolute right-9 top-10 z-10">{stageMark('var(--ink-soft)')}</div> : null}
        </div>

        <div key={resting ? 'face-rest' : 'face-focus'} className="animate-settle text-center">
          <p
            className={`m-0 font-mono text-[64px] font-medium leading-none tracking-[-0.035em] tabular-nums md:text-[88px] ${
              breakOver ? 'text-warn' : ''
            }`}
            style={{ ...clockEase, opacity: pausedFocus ? 0.5 : 1 }}
            aria-label={
              resting
                ? `${breakOver ? 'Break over by' : 'Break, remaining'} ${spoken(remaining)}`
                : `${overrun ? 'Over by' : 'Remaining'} ${spoken(remaining)}`
            }
          >
            <span className={pausedFocus ? 'held-breath' : undefined}>{faceText}</span>
          </p>
          <p className="m-0 mt-3 font-serif italic text-[13.5px] text-muted">
            {resting ? (
              <>
                {breakOver ? 'over' : 'of'} {clockFace(breakTarget ?? 0)} break
              </>
            ) : (
              <>
                {overrun ? 'over' : 'of'} {clockFace(target)}
              </>
            )}
            {task ? <> · <span className="text-ink">{task.title}</span></> : null}
            {pausedMark}
          </p>
          {/* The session so far, blocks added up, breaks left out. Second to
              the face: it is the number the log sheet will ask about, not the
              one being worked against right now. */}
          {showTotal ? (
            <p className="m-0 mt-1.5 text-[12.5px] text-muted">
              <span className="font-mono tabular-nums text-ink-soft">{clockFace(focusSeconds)}</span>{' '}
              <span className="font-serif italic">in this session</span>
            </p>
          ) : null}
          {woodLine(null)}
        </div>

        {controls}

        {/* Next Mark, quietly, under the controls. It says what this sitting
            is approaching and stays silent when nothing is near. It is kept
            off the open-mode night screen on purpose: that screen exists to
            hold one thing, and this would be a second one.

            A break takes the same slot rather than adding one: what the
            sitting has come to so far is the thing to look at while resting,
            and what it is approaching is not. */}
        {blockNoteLine}

        {resting && liveChain.length > 1 ? (
          <SessionChain
            segments={liveChain}
            color={color}
            className={`w-full max-w-[340px] ${blockNoteLine ? '' : '-mt-4'}`}
          />
        ) : (
          <NextMarkLine surface="timer" className="-mt-4" />
        )}

        <p className="key-hint m-0 -mt-3 font-mono text-[11px] text-muted-soft">
          {resting
            ? 'Space back · F finish · R reset · Esc back'
            : `Space ${isPaused ? (heldFresh ? 'start' : 'resume') : 'pause'} · B ${breakFromPause ? 'count as break' : 'break'} · F finish · R reset · Esc back`}
        </p>
      </div>

      <PendingSessionLogSheet />
    </div>
  );
}
