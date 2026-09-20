'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  MAX_BREAK_SECONDS,
  MAX_SESSION_SECONDS,
  clampBreakSeconds,
  clampSessionSeconds,
  sanitizeSegments,
  totalBreakSeconds,
} from './session-safety';
import type { SessionSegment } from './data';
import { plannerDate, readPreferences } from './preferences';
import { cancelChime, flushChime, primeChime, ringChime, scheduleChime } from './chime';
import { logSessionFollowed } from './progression/log';

interface TimerState {
  courseId: string;
  taskId: string | null;
  startedAt: number; // ms epoch when current run segment started
  startedDate: string;
  accumulatedMs: number; // ms accumulated across previous paused segments
  isPaused: boolean;
  lastSeenAt: number;
  /**
   * Block mode's target, in seconds, or null for an untimed session. The
   * timer counts the same either way; the target is what the screen counts
   * down from and what the fan is sized to fill.
   */
  targetSeconds: number | null;
  /**
   * Stable for the life of one sitting. The study fan is seeded off it, so a
   * session that is paused, reloaded or restored keeps the shape it grew.
   */
  sessionId: string;
  /**
   * Which kind of stretch the clock is measuring. A sitting alternates: a
   * block of focus, the break after it, the next block. `startedAt`,
   * `accumulatedMs` and `isPaused` all describe the *current stretch* only;
   * everything finished is in `segments`.
   *
   * A break is not a pause and the two are deliberately separate. Pause means
   * "I have stepped away, count nothing"; break means "I am resting on
   * purpose, count it as rest". Folding one into the other would make the
   * record unreadable, which is the whole reason for keeping it.
   */
  phase: 'focus' | 'break';
  /**
   * How long this sitting's breaks run, in seconds, or null for a sitting
   * that does not take them and simply runs past its block target the way it
   * always did. Seeded from the reader's preference when the session starts.
   */
  breakSeconds: number | null;
  /** When the whole sitting began. Only the "since 14:20" line reads it. */
  sittingStartedAt: number;
  /** When the current stretch began, pauses included. */
  stretchStartedAt: number;
  /** Stretches already finished, oldest first. */
  segments: SessionSegment[];
}

interface PendingTimerLog {
  courseId: string;
  taskId: string | null;
  date: string;
  /** Focus only. Rest is reported beside it, never folded into it. */
  durationSeconds: number;
  breakSeconds: number;
  segments: SessionSegment[];
  recoveryReason?: 'away' | 'max' | 'break';
}

interface TimerContextValue {
  /**
   * False until the provider has read localStorage. Effects in a child run
   * before effects in its provider, so a screen that mounts alongside a
   * running timer sees `active: null` on its first pass. /timer read that as
   * "no session" and bounced to the dashboard, which is precisely what a
   * reload mid-session used to do.
   */
  hydrated: boolean;
  active: TimerState | null;
  pendingLog: PendingTimerLog | null;
  /**
   * The current stretch, which is what the clock face shows: time into this
   * block, or time into this break. For the sitting's running totals, which
   * is what the dock and the log sheet want, use `focusSeconds`.
   */
  elapsedSeconds: number;
  /** Focus across the whole sitting, breaks excluded. What gets logged. */
  focusSeconds: number;
  /** Rest across the whole sitting. */
  breakSeconds: number;
  onBreak: boolean;
  /** How long this sitting's breaks run, or null when it takes none. */
  breakTarget: number | null;
  start: (courseId: string, taskId?: string | null, targetSeconds?: number | null) => void;
  /** Push the running stretch's target out, the timer's "+5 min". */
  extend: (seconds: number) => void;
  /** End the block here and rest. Defaults to the sitting's break length. */
  startBreak: (seconds?: number) => void;
  /** End the break and open the next block. */
  endBreak: () => void;
  /** Re-arm the break length mid-sitting. Null means stop taking them. */
  setBreakLength: (seconds: number | null) => void;
  /**
   * Write what the block that just ended covered, onto that block.
   *
   * Only means anything on a break, which is the point: the question is
   * asked while the answer is still there, rather than at the end of the
   * sitting when the first block was two hours and two breaks ago.
   */
  noteLastBlock: (note: string) => void;
  /** What has been written about the block the current break follows. */
  lastBlockNote: string;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  clearPendingLog: () => void;
  clearTimerState: () => void;
  stop: () => PendingTimerLog | null;
}

const TimerContext = createContext<TimerContextValue | null>(null);

const STORAGE_KEY = 'lums.activeTimer';
const PENDING_STORAGE_KEY = 'lums.pendingTimerLog';
const NOTIFICATION_PROMPT_KEY = 'lums.timerNotificationPrompted';
const PENDING_NOTIFICATION_KEY = 'lums.pendingTimerLogNotification';
const MAX_TIMER_MS = MAX_SESSION_SECONDS * 1000;
const RUNNING_CHECKPOINT_MS = 10 * 1000;
const STALE_RUNNING_MS = 4 * 60 * 60 * 1000;
/** What "take a break" means when the reader has breaks switched off. */
const DEFAULT_BREAK_SECONDS = 5 * 60;
const TICK_MS = 500;

/* localStorage is not always there to be written to: Safari's private mode
   throws on setItem, a blocked-cookies setting throws on the property access
   itself, and a full origin throws QuotaExceededError. Every one of those
   used to surface as an exception thrown out of a click handler or an
   interval, which is to say as a blank screen mid-session. The timer degrades
   to memory-only instead. */
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Memory-only for this session; the timer still runs.
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // As above.
  }
}

let storageProbe: boolean | null = null;

/** Whether this browser will actually hold on to what we write. */
function hasWorkingStorage(): boolean {
  if (typeof window === 'undefined') return false;
  if (storageProbe !== null) return storageProbe;
  try {
    window.localStorage.setItem('lums.storageProbe', '1');
    window.localStorage.removeItem('lums.storageProbe');
    storageProbe = true;
  } catch {
    storageProbe = false;
  }
  return storageProbe;
}

function formatNotificationDuration(seconds: number): string {
  const safeSeconds = clampSessionSeconds(seconds);
  if (safeSeconds < 60) return `${safeSeconds}s`;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function pendingLogSignature(log: PendingTimerLog): string {
  return [
    log.courseId,
    log.taskId ?? '',
    log.date,
    log.durationSeconds,
    log.breakSeconds,
    log.recoveryReason ?? '',
  ].join('|');
}

function maybeRequestTimerNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    if (window.Notification.permission !== 'default') return;
    if (readStorage(NOTIFICATION_PROMPT_KEY) === 'true') return;

    writeStorage(NOTIFICATION_PROMPT_KEY, 'true');
    // Older Safari hands back undefined and takes a callback instead of
    // returning a promise, so `.catch` on the result is not a given.
    const request = window.Notification.requestPermission();
    if (request && typeof request.catch === 'function') {
      request.catch(() => {
        // Permission is optional; the in-app sheet still works without it.
      });
    }
  } catch {
    // A browser that refuses the request outright must not take the start of
    // a study session down with it.
  }
}

function notifyPendingLog(log: PendingTimerLog | null): void {
  if (
    typeof window === 'undefined' ||
    !log ||
    !document.hidden ||
    !('Notification' in window) ||
    window.Notification.permission !== 'granted'
  ) {
    return;
  }

  const signature = pendingLogSignature(log);
  if (readStorage(PENDING_NOTIFICATION_KEY) === signature) return;
  writeStorage(PENDING_NOTIFICATION_KEY, signature);

  try {
    const notification = new window.Notification('Study session ready to log', {
      body: `${formatNotificationDuration(log.durationSeconds)} is waiting in Akada.`,
      icon: '/icon.svg',
      tag: 'akada-pending-session-log',
    });

    notification.onclick = () => {
      window.focus();
      window.location.href = '/timer';
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker. Losing
    // the nudge is fine; losing the session log would not be.
  }
}

/**
 * The only thing that reaches a phone lying face down.
 *
 * The chime is scheduled on the audio clock and survives a backgrounded tab,
 * but not a locked screen, because iOS suspends the audio context along with
 * it. This is the fallback, and it is deliberately not a second alarm: it
 * says what happened and goes quiet.
 */
function notifyBreakOver(): void {
  if (
    typeof window === 'undefined' ||
    !document.hidden ||
    !('Notification' in window) ||
    window.Notification.permission !== 'granted'
  ) {
    return;
  }

  try {
    const notification = new window.Notification("Break\u2019s up", {
      body: 'Akada is holding the next block.',
      icon: '/icon.svg',
      tag: 'akada-break-over',
    });

    notification.onclick = () => {
      window.focus();
      window.location.href = '/timer';
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker. Losing
    // the nudge is survivable; the chime and the screen both still say so.
  }
}

function isoDateFromMs(value: number): string {
  const date = new Date(Number.isFinite(value) ? value : Date.now());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sanitizeActive(value: unknown): TimerState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<TimerState>;
  if (typeof state.courseId !== 'string' || state.courseId.trim() === '') return null;
  const taskId = typeof state.taskId === 'string' ? state.taskId : null;
  const startedAt = Number(state.startedAt);
  const accumulatedMs = Number(state.accumulatedMs);
  const lastSeenAt = Number(state.lastSeenAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(accumulatedMs)) return null;

  return {
    courseId: state.courseId,
    taskId,
    startedAt,
    startedDate:
      typeof state.startedDate === 'string' && state.startedDate.trim()
        ? state.startedDate
        : isoDateFromMs(startedAt),
    accumulatedMs: Math.min(MAX_TIMER_MS, Math.max(0, accumulatedMs)),
    isPaused: Boolean(state.isPaused),
    lastSeenAt: Number.isFinite(lastSeenAt) ? lastSeenAt : startedAt,
    targetSeconds: sanitizeTarget(state.targetSeconds),
    // A state written before blocks existed has no id. Deriving one from the
    // start time keeps it stable across reloads, which is all the fan needs.
    sessionId:
      typeof state.sessionId === 'string' && state.sessionId.trim()
        ? state.sessionId
        : `s${startedAt}`,
    // A state written before continuous mode has none of what follows, and
    // reads back as a single unbroken focus stretch, which is exactly what it
    // was. Nothing in storage changes meaning under an upgrade.
    phase: state.phase === 'break' ? 'break' : 'focus',
    breakSeconds: sanitizeBreak(state.breakSeconds),
    sittingStartedAt: Number.isFinite(Number(state.sittingStartedAt))
      ? Number(state.sittingStartedAt)
      : startedAt - Math.max(0, accumulatedMs),
    stretchStartedAt: Number.isFinite(Number(state.stretchStartedAt))
      ? Number(state.stretchStartedAt)
      : startedAt - Math.max(0, accumulatedMs),
    segments: sanitizeSegments(state.segments),
  };
}

/**
 * A break length, which is bounded far tighter than a session (see
 * MAX_BREAK_SECONDS). Zero and below mean this sitting takes no breaks.
 */
function sanitizeBreak(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_BREAK_SECONDS, Math.round(n));
}

/** The reader's chosen break length, in seconds, or null for none. */
function preferredBreakSeconds(): number | null {
  try {
    return sanitizeBreak(readPreferences().breakMinutes * 60);
  } catch {
    return null;
  }
}

/** Whether the chime should sound at all. Off is a supported answer. */
function soundOn(): boolean {
  try {
    return readPreferences().sessionSound;
  } catch {
    return false;
  }
}

/**
 * A block target has to be a positive number of seconds inside the same
 * ceiling a session itself has; anything else means untimed.
 */
function sanitizeTarget(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_SESSION_SECONDS, Math.round(n));
}

function sanitizePendingLog(value: unknown): PendingTimerLog | null {
  if (!value || typeof value !== 'object') return null;
  const log = value as Partial<PendingTimerLog>;
  if (typeof log.courseId !== 'string' || log.courseId.trim() === '') return null;
  const durationSeconds = clampSessionSeconds(log.durationSeconds);
  if (durationSeconds <= 0) return null;
  const segments = sanitizeSegments(log.segments);
  return {
    courseId: log.courseId,
    taskId: typeof log.taskId === 'string' ? log.taskId : null,
    date: typeof log.date === 'string' && log.date.trim() ? log.date : isoDateFromMs(Date.now()),
    durationSeconds,
    // The chain is the authority where there is one: a hand-edited total
    // should not be able to disagree with the stretches it is made of.
    breakSeconds: segments.length
      ? totalBreakSeconds(segments)
      : clampSessionSeconds(log.breakSeconds),
    segments,
    recoveryReason:
      log.recoveryReason === 'away' || log.recoveryReason === 'max' || log.recoveryReason === 'break'
        ? log.recoveryReason
        : undefined,
  };
}

function savePendingLog(log: PendingTimerLog | null): void {
  if (typeof window === 'undefined') return;
  if (log === null) {
    removeStorage(PENDING_STORAGE_KEY);
    removeStorage(PENDING_NOTIFICATION_KEY);
  } else {
    writeStorage(PENDING_STORAGE_KEY, JSON.stringify(log));
    notifyPendingLog(log);
  }
}

export function clearStoredTimerState(): void {
  saveActive(null);
  savePendingLog(null);
}

function loadPendingLog(): PendingTimerLog | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = readStorage(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = sanitizePendingLog(JSON.parse(raw));
    if (!parsed) savePendingLog(null);
    return parsed;
  } catch {
    savePendingLog(null);
    return null;
  }
}

function saveActive(state: TimerState | null): void {
  if (typeof window === 'undefined') return;
  if (state === null) {
    removeStorage(STORAGE_KEY);
  } else {
    writeStorage(STORAGE_KEY, JSON.stringify(state));
  }
}

function activeMatches(a: TimerState | null, b: TimerState): boolean {
  return Boolean(
    a &&
      a.courseId === b.courseId &&
      a.taskId === b.taskId &&
      a.startedAt === b.startedAt &&
      a.startedDate === b.startedDate,
  );
}

function saveActiveIfCurrent(state: TimerState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = sanitizeActive(JSON.parse(readStorage(STORAGE_KEY) || 'null'));
    if (!activeMatches(current, state)) return false;
    saveActive(state);
    return true;
  } catch {
    return false;
  }
}

/**
 * How long the *current stretch* has run. A break is clamped to its own much
 * tighter ceiling, so the number on screen can never claim more rest than the
 * database would accept.
 */
function stretchSecondsAt(state: TimerState, atMs: number): number {
  const liveMs = state.isPaused ? 0 : Math.max(0, atMs - state.startedAt);
  const seconds = (state.accumulatedMs + liveMs) / 1000;
  return state.phase === 'break' ? clampBreakSeconds(seconds) : clampSessionSeconds(seconds);
}

function computeElapsed(state: TimerState): number {
  const safeState = sanitizeActive(state);
  if (!safeState) return 0;
  return stretchSecondsAt(safeState, Date.now());
}

function computeElapsedAt(state: TimerState, atMs: number): number {
  const safeState = sanitizeActive(state);
  if (!safeState) return 0;
  return stretchSecondsAt(safeState, atMs);
}

/** Focus and rest across the whole sitting, the stretch in progress included. */
function sittingTotals(
  state: TimerState,
  atMs: number,
): { focusSeconds: number; breakSeconds: number } {
  let focus = 0;
  let rest = 0;
  for (const segment of state.segments) {
    if (segment.kind === 'break') rest += segment.seconds;
    else focus += segment.seconds;
  }
  const current = stretchSecondsAt(state, atMs);
  if (state.phase === 'break') rest += current;
  else focus += current;
  return { focusSeconds: clampSessionSeconds(focus), breakSeconds: clampSessionSeconds(rest) };
}

/** Focus this sitting has accumulated against the 18h ceiling. */
function focusSecondsAt(state: TimerState, atMs: number): number {
  return sittingTotals(state, atMs).focusSeconds;
}

/**
 * Write the stretch in progress into the chain and hand back the new one.
 *
 * A stretch that rounds to nothing is dropped rather than recorded: tapping
 * "back to it" the instant the chime lands should not leave a zero-second
 * break in the record, and the database would refuse it anyway.
 */
function closeStretch(state: TimerState, atMs: number): SessionSegment[] {
  const seconds = stretchSecondsAt(state, atMs);
  if (seconds <= 0) return state.segments;
  return [
    ...state.segments,
    {
      kind: state.phase,
      ordinal: state.segments.length + 1,
      startedAt: new Date(state.stretchStartedAt).toISOString(),
      seconds,
      targetSeconds: state.phase === 'break' ? state.breakSeconds : state.targetSeconds,
    },
  ];
}

/** End the block here and rest. The clock restarts on the break. */
function toBreakState(state: TimerState, atMs: number, breakSeconds: number): TimerState {
  return {
    ...state,
    phase: 'break',
    segments: closeStretch(state, atMs),
    breakSeconds,
    startedAt: atMs,
    stretchStartedAt: atMs,
    accumulatedMs: 0,
    // A break inherits nothing from the block: a session paused at the moment
    // its block ran out should come back to a break that is actually running,
    // not one frozen behind a pause the reader has forgotten about.
    isPaused: false,
    lastSeenAt: atMs,
  };
}

/** End the break and open the next block, at the same length as the last. */
function toFocusState(state: TimerState, atMs: number): TimerState {
  return {
    ...state,
    phase: 'focus',
    segments: closeStretch(state, atMs),
    startedAt: atMs,
    stretchStartedAt: atMs,
    accumulatedMs: 0,
    isPaused: false,
    lastSeenAt: atMs,
  };
}

/**
 * Ring for the break now and arrange the note that ends it.
 *
 * Both are set going in, because the second one has to be on the audio clock
 * before the tab has any chance to be backgrounded. See lib/chime.ts.
 */
function announceBreak(breakSeconds: number): void {
  cancelChime();
  if (!soundOn()) return;
  ringChime('break');
  scheduleChime('back', breakSeconds);
}

function buildPendingLog(
  state: TimerState,
  stoppedAt: number,
  recoveryReason?: PendingTimerLog['recoveryReason'],
): PendingTimerLog | null {
  const safeState = sanitizeActive(state);
  if (!safeState) return null;
  const segments = sanitizeSegments(closeStretch(safeState, stoppedAt));
  const durationSeconds = clampSessionSeconds(
    segments.reduce((sum, segment) => (segment.kind === 'focus' ? sum + segment.seconds : sum), 0),
  );
  // A sitting that was nothing but a break has no hours to log and nothing
  // worth keeping the shape of.
  if (durationSeconds <= 0) return null;
  return {
    courseId: safeState.courseId,
    taskId: safeState.taskId,
    date: safeState.startedDate,
    durationSeconds,
    breakSeconds: totalBreakSeconds(segments),
    segments,
    recoveryReason,
  };
}

function loadActiveSnapshot(): { active: TimerState | null; pendingLog: PendingTimerLog | null } {
  if (typeof window === 'undefined') return { active: null, pendingLog: null };
  const existingPending = loadPendingLog();
  if (existingPending) {
    saveActive(null);
    return { active: null, pendingLog: existingPending };
  }

  try {
    const raw = readStorage(STORAGE_KEY);
    if (!raw) return { active: null, pendingLog: null };
    const parsed = sanitizeActive(JSON.parse(raw));
    if (!parsed) {
      saveActive(null);
      return { active: null, pendingLog: null };
    }

    const now = Date.now();
    const staleRunning = !parsed.isPaused && now - parsed.lastSeenAt >= STALE_RUNNING_MS;
    // A break past its ceiling closes the sitting where the ceiling was
    // reached. Returning to the tab the next morning should log yesterday's
    // study, not the night as rest.
    const breakOverrun =
      parsed.phase === 'break' && stretchSecondsAt(parsed, now) >= MAX_BREAK_SECONDS;
    const maxReached = focusSecondsAt(parsed, now) >= MAX_SESSION_SECONDS;
    if (staleRunning || breakOverrun || maxReached) {
      const stoppedAt = staleRunning
        ? parsed.lastSeenAt
        : breakOverrun
          ? parsed.startedAt + (MAX_BREAK_SECONDS * 1000 - parsed.accumulatedMs)
          : now;
      const reason: PendingTimerLog['recoveryReason'] = staleRunning
        ? 'away'
        : breakOverrun
          ? 'break'
          : 'max';
      const pendingLog = buildPendingLog(parsed, stoppedAt, reason);
      saveActive(null);
      savePendingLog(pendingLog);
      return { active: null, pendingLog };
    }

    return { active: parsed, pendingLog: null };
  } catch {
    saveActive(null);
    return { active: null, pendingLog: null };
  }
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<TimerState | null>(null);
  const [pendingLog, setPendingLog] = useState<PendingTimerLog | null>(null);
  const [elapsedSeconds, setElapsed] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const tickRef = useRef<number | null>(null);
  const activeRef = useRef<TimerState | null>(null);
  const pendingLogRef = useRef<PendingTimerLog | null>(null);
  /** Which break the "break's up" notice has already been raised for. */
  const breakNoticeRef = useRef<string | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    pendingLogRef.current = pendingLog;
  }, [pendingLog]);

  // Hydrate from storage on mount
  useEffect(() => {
    const snapshot = loadActiveSnapshot();
    if (snapshot.pendingLog) {
      pendingLogRef.current = snapshot.pendingLog;
      setPendingLog(snapshot.pendingLog);
      setElapsed(0);
    } else if (snapshot.active) {
      activeRef.current = snapshot.active;
      setActive(snapshot.active);
      setElapsed(computeElapsed(snapshot.active));
      // A reload mid-break took the old page's audio clock with it, and the
      // note that was sitting on it. Put it back on the new one. The context
      // may be suspended until the reader next touches the page, since this
      // is not a user gesture; that is what flushChime and the notification
      // are for.
      const resting = snapshot.active;
      if (resting.phase === 'break' && resting.breakSeconds != null && soundOn()) {
        const left = resting.breakSeconds - computeElapsed(resting);
        if (left > 0) scheduleChime('back', left);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      const current = activeRef.current;
      if (current) {
        // Refreshes and accidental closes should preserve the timer. A later
        // hydrate decides whether the absence was short enough to keep running.
        saveActive({ ...current, lastSeenAt: Date.now() });
      }
    };

    const syncFromStorage = () => {
      const snapshot = loadActiveSnapshot();
      // Where storage is refused (Safari private browsing, blocked cookies)
      // the timer lives in memory only, and an empty read means "nothing was
      // saved", not "the timer stopped". Clearing a running session on that
      // reading would throw the session away.
      if (!snapshot.active && !snapshot.pendingLog && activeRef.current && !hasWorkingStorage()) {
        setElapsed(computeElapsed(activeRef.current));
        return;
      }
      activeRef.current = snapshot.active;
      pendingLogRef.current = snapshot.pendingLog;
      setActive(snapshot.active);
      setPendingLog(snapshot.pendingLog);
      setElapsed(snapshot.active ? computeElapsed(snapshot.active) : 0);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      syncFromStorage();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== PENDING_STORAGE_KEY) return;
      syncFromStorage();
    };

    // A backgrounded tab has its intervals throttled to about once a minute,
    // and a phone that sleeps stops firing them at all. Elapsed time is read
    // from the wall clock rather than counted up, so nothing drifts, but the
    // reading on screen would be as stale as the last fire. Re-reading on the
    // way back is what makes the first frame after a return correct.
    const handleVisibility = () => {
      if (document.hidden) {
        const current = activeRef.current;
        if (current) saveActiveIfCurrent({ ...current, lastSeenAt: Date.now() });
        return;
      }
      // A note whose moment passed while the audio context was suspended,
      // which is what a locked phone does to it, never arrived and never
      // will. Ringing it a minute late still tells the reader what happened.
      flushChime();
      syncFromStorage();
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Keep ticking
  useEffect(() => {
    if (!active || active.isPaused) {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    let lastCheckpoint = Date.now();
    const closeOut = (
      current: TimerState,
      stoppedAt: number,
      reason: PendingTimerLog['recoveryReason'],
    ) => {
      cancelChime();
      breakNoticeRef.current = null;
      const log = buildPendingLog(current, stoppedAt, reason);
      activeRef.current = null;
      setActive(null);
      saveActive(null);
      setElapsed(0);
      if (log) {
        pendingLogRef.current = log;
        setPendingLog(log);
        savePendingLog(log);
      }
    };

    const commit = (next: TimerState) => {
      activeRef.current = next;
      setActive(next);
      saveActive(next);
      setElapsed(computeElapsed(next));
    };

    tickRef.current = window.setInterval(() => {
      const now = Date.now();
      const current = activeRef.current ?? active;
      if (!current.isPaused && now - current.lastSeenAt >= STALE_RUNNING_MS) {
        closeOut(current, current.lastSeenAt, 'away');
        return;
      }

      // A note whose moment passed while the context was asleep is rung late
      // here rather than not at all.
      flushChime();

      const stretch = stretchSecondsAt(current, now);

      if (current.phase === 'break') {
        // Rest has its own, much tighter ceiling: a timer left sitting on a
        // break overnight closes the sitting out at the last believable
        // moment instead of recording the night as considered rest.
        if (!current.isPaused && stretch >= MAX_BREAK_SECONDS) {
          closeOut(
            current,
            current.startedAt + (MAX_BREAK_SECONDS * 1000 - current.accumulatedMs),
            'break',
          );
          return;
        }
        // The break is up. The chime was arranged when it started; this is
        // the nudge for a phone that is face down, and it fires once.
        if (current.breakSeconds != null && stretch >= current.breakSeconds) {
          const key = `${current.sessionId}:${current.segments.length}`;
          if (breakNoticeRef.current !== key) {
            breakNoticeRef.current = key;
            notifyBreakOver();
          }
        }
      } else {
        // The 18h ceiling used to be enforced only on the way back from
        // storage. A tab left open past it kept counting while the readout sat
        // clamped at 18:00:00, so the number on screen stopped being the number
        // being measured, and stopping then logged a silently truncated 18h.
        // The ceiling has to close the session where it is reached. It counts
        // focus, because rest is not what it is protecting.
        const priorFocusMs = current.segments.reduce(
          (sum, segment) => (segment.kind === 'focus' ? sum + segment.seconds * 1000 : sum),
          0,
        );
        const liveMs = now - current.startedAt;
        if (!current.isPaused && priorFocusMs + current.accumulatedMs + liveMs >= MAX_TIMER_MS) {
          closeOut(
            current,
            current.startedAt + (MAX_TIMER_MS - priorFocusMs - current.accumulatedMs),
            'max',
          );
          return;
        }
      }
      // setElapsed on every fire re-rendered every consumer four times a
      // second to show the same digits. Only whole seconds are ever
      // displayed, so only whole seconds are published.
      setElapsed((prev) => {
        const next = computeElapsed(current);
        return next === prev ? prev : next;
      });
      if (now - lastCheckpoint >= RUNNING_CHECKPOINT_MS) {
        lastCheckpoint = now;
        const checkpoint = { ...current, lastSeenAt: now };
        activeRef.current = checkpoint;
        saveActiveIfCurrent(checkpoint);
      }
    }, TICK_MS);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [active]);

  const start = useCallback(
    (courseId: string, taskId: string | null = null, targetSeconds: number | null = null) => {
    if (!courseId.trim()) return;
    const snapshot = loadActiveSnapshot();
    const existingPending = pendingLogRef.current ?? snapshot.pendingLog;
    if (existingPending) {
      activeRef.current = null;
      pendingLogRef.current = existingPending;
      setActive(null);
      setPendingLog(existingPending);
      saveActive(null);
      setElapsed(0);
      return;
    }
    // Starting the timer on the course it is already running on is a no-op,
    // not a restart. It used to build a fresh TimerState with accumulatedMs
    // back at zero, so tapping "start" on the course already on the clock
    // threw away everything logged so far without a word.
    const running = activeRef.current ?? snapshot.active;
    if (running && running.courseId === courseId && running.taskId === taskId) {
      // Same sitting, possibly re-armed with a different block length. The
      // clock carries on; only the target it is measured against moves.
      const next = { ...running, targetSeconds: sanitizeTarget(targetSeconds) };
      activeRef.current = next;
      setActive(next);
      saveActive(next);
      setElapsed(computeElapsed(next));
      return;
    }
    if (snapshot.active && !activeMatches(activeRef.current, snapshot.active)) {
      activeRef.current = snapshot.active;
      setActive(snapshot.active);
      setElapsed(computeElapsed(snapshot.active));
      return;
    }
    const now = Date.now();
    const next: TimerState = {
      courseId,
      taskId,
      startedAt: now,
      startedDate: plannerDate(new Date(now)),
      accumulatedMs: 0,
      isPaused: false,
      lastSeenAt: now,
      targetSeconds: sanitizeTarget(targetSeconds),
      sessionId: `s${now}-${Math.random().toString(36).slice(2, 8)}`,
      phase: 'focus',
      // Read once, at the start, so changing the preference mid-sitting does
      // not silently move the break the reader is already counting on.
      breakSeconds: preferredBreakSeconds(),
      sittingStartedAt: now,
      stretchStartedAt: now,
      segments: [],
    };
    maybeRequestTimerNotificationPermission();
    // Every browser refuses to open an audio context outside a user gesture,
    // and one opened later is born suspended, so the chime arranged half an
    // hour from now would never sound. This click is the gesture.
    primeChime();
    breakNoticeRef.current = null;
    // A new sitting is what "did the line work?" means. Fails silently and
    // does nothing at all if no Next Mark was shown recently.
    void logSessionFollowed();
    activeRef.current = next;
    setActive(next);
    saveActive(next);
    pendingLogRef.current = null;
    setPendingLog(null);
    savePendingLog(null);
    setElapsed(0);
    },
    [],
  );

  const applyActive = useCallback((next: TimerState) => {
    activeRef.current = next;
    setActive(next);
    saveActive(next);
    setElapsed(computeElapsed(next));
  }, []);

  /**
   * "+5 min", on whichever stretch is running. Only means anything to a
   * stretch with a target: an open session has nothing to push out, so the
   * call is dropped rather than silently turning it into one.
   */
  const extend = useCallback(
    (seconds: number) => {
      const running = activeRef.current;
      if (!running) return;

      if (running.phase === 'break') {
        if (running.breakSeconds == null) return;
        const breakSeconds = sanitizeBreak(running.breakSeconds + seconds);
        if (breakSeconds == null) return;
        const next = { ...running, breakSeconds };
        // The note that ends the break went onto the audio clock when the
        // break started, so pushing the break out has to move it too.
        cancelChime();
        if (soundOn()) {
          const left = breakSeconds - stretchSecondsAt(next, Date.now());
          if (left > 0) scheduleChime('back', left);
        }
        breakNoticeRef.current = null;
        applyActive(next);
        return;
      }

      if (running.targetSeconds == null) return;
      applyActive({ ...running, targetSeconds: sanitizeTarget(running.targetSeconds + seconds) });
    },
    [applyActive],
  );

  /**
   * End the block here and rest.
   *
   * Only reached by hand from the timer. Turning breaks off in Appearance and
   * then asking for one explicitly is not a contradiction, so it falls back
   * to a sensible five rather than refusing.
   */
  const startBreak = useCallback(
    (seconds?: number) => {
      const running = activeRef.current;
      if (!running || running.phase === 'break') return;
      const breakSeconds =
        sanitizeBreak(seconds) ??
        running.breakSeconds ??
        preferredBreakSeconds() ??
        DEFAULT_BREAK_SECONDS;
      primeChime();
      announceBreak(breakSeconds);
      breakNoticeRef.current = null;
      applyActive(toBreakState(running, Date.now(), breakSeconds));
    },
    [applyActive],
  );

  /** End the break, open the next block at the same length as the last. */
  const endBreak = useCallback(() => {
    const running = activeRef.current;
    if (!running || running.phase !== 'break') return;
    cancelChime();
    breakNoticeRef.current = null;
    applyActive(toFocusState(running, Date.now()));
  }, [applyActive]);

  /**
   * The block a note written now belongs to: the last focus stretch in the
   * chain. Finding it by walking back rather than assuming `length - 1`,
   * because a break of zero seconds is dropped rather than recorded and the
   * positions do not always alternate.
   */
  const noteLastBlock = useCallback(
    (note: string) => {
      const running = activeRef.current;
      if (!running || running.phase !== 'break') return;
      let index = -1;
      for (let i = running.segments.length - 1; i >= 0; i -= 1) {
        if (running.segments[i].kind === 'focus') {
          index = i;
          break;
        }
      }
      if (index === -1) return;
      const current = running.segments[index].note ?? '';
      if (current === note) return;
      applyActive({
        ...running,
        segments: running.segments.map((segment, i) =>
          i === index ? { ...segment, note } : segment,
        ),
      });
    },
    [applyActive],
  );

  /** Re-arm the break length mid-sitting. Null stops the sitting taking them. */
  const setBreakLength = useCallback(
    (seconds: number | null) => {
      const running = activeRef.current;
      if (!running) return;
      const breakSeconds = seconds == null ? null : sanitizeBreak(seconds);
      const next = { ...running, breakSeconds };

      if (running.phase === 'break') {
        cancelChime();
        breakNoticeRef.current = null;
        // Switching breaks off while resting is a way of saying "back to it".
        if (breakSeconds == null) {
          applyActive(toFocusState(next, Date.now()));
          return;
        }
        if (soundOn()) {
          const left = breakSeconds - stretchSecondsAt(next, Date.now());
          if (left > 0) scheduleChime('back', left);
        }
      }
      applyActive(next);
    },
    [applyActive],
  );

  const recoverStaleRunningTimer = useCallback((state: TimerState, now: number): PendingTimerLog | null => {
    const safeState = sanitizeActive(state);
    if (!safeState || safeState.isPaused || now - safeState.lastSeenAt < STALE_RUNNING_MS) {
      return null;
    }
    const log = buildPendingLog(safeState, safeState.lastSeenAt, 'away');
    activeRef.current = null;
    setActive(null);
    saveActive(null);
    setElapsed(0);
    if (log) {
      pendingLogRef.current = log;
      setPendingLog(log);
      savePendingLog(log);
    }
    return log;
  }, []);

  const pause = useCallback(() => {
    const current = activeRef.current;
    if (current && recoverStaleRunningTimer(current, Date.now())) return;
    setActive((prev) => {
      if (!prev || prev.isPaused) return prev;
      const now = Date.now();
      const next: TimerState = {
        ...prev,
        accumulatedMs: Math.min(
          MAX_TIMER_MS,
          Math.max(0, prev.accumulatedMs) + Math.max(0, now - prev.startedAt),
        ),
        isPaused: true,
        lastSeenAt: now,
      };
      activeRef.current = next;
      saveActive(next);
      setElapsed(computeElapsed(next));
      return next;
    });
  }, [recoverStaleRunningTimer]);

  const resume = useCallback(() => {
    setActive((prev) => {
      if (!prev || !prev.isPaused) return prev;
      const now = Date.now();
      const next: TimerState = {
        ...prev,
        startedAt: now,
        isPaused: false,
        lastSeenAt: now,
      };
      activeRef.current = next;
      saveActive(next);
      return next;
    });
  }, []);

  const cancel = useCallback(() => {
    cancelChime();
    breakNoticeRef.current = null;
    activeRef.current = null;
    setActive(null);
    saveActive(null);
    setElapsed(0);
  }, []);

  const stop = useCallback(() => {
    const current = activeRef.current;
    if (!current) return null;
    cancelChime();
    breakNoticeRef.current = null;
    const now = Date.now();
    const staleRecovered = recoverStaleRunningTimer(current, now);
    if (staleRecovered) return staleRecovered;
    const result = buildPendingLog(current, now);
    activeRef.current = null;
    setActive(null);
    saveActive(null);
    setElapsed(0);
    if (result) {
      pendingLogRef.current = result;
      setPendingLog(result);
      savePendingLog(result);
    }
    return result;
  }, [recoverStaleRunningTimer]);

  const clearPendingLog = useCallback(() => {
    pendingLogRef.current = null;
    setPendingLog(null);
    savePendingLog(null);
  }, []);

  const clearTimerState = useCallback(() => {
    cancelChime();
    breakNoticeRef.current = null;
    activeRef.current = null;
    pendingLogRef.current = null;
    setActive(null);
    setPendingLog(null);
    setElapsed(0);
    clearStoredTimerState();
  }, []);

  /* The sitting's running totals. `elapsedSeconds` only ever publishes whole
     seconds, so this recomputes once a second rather than four times. */
  const totals = useMemo(
    () => (active ? sittingTotals(active, Date.now()) : { focusSeconds: 0, breakSeconds: 0 }),
    // elapsedSeconds is the clock these are read against; it is a dependency
    // even though the expression does not name it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, elapsedSeconds],
  );

  /* Seeds the field on the break screen, so a reload mid-break comes back to
     what was already typed rather than to an empty line. */
  const lastBlockNote = useMemo(() => {
    if (!active || active.phase !== 'break') return '';
    for (let i = active.segments.length - 1; i >= 0; i -= 1) {
      if (active.segments[i].kind === 'focus') return active.segments[i].note ?? '';
    }
    return '';
  }, [active]);

  return (
    <TimerContext.Provider
      value={{
        hydrated,
        active,
        pendingLog,
        elapsedSeconds,
        focusSeconds: totals.focusSeconds,
        breakSeconds: totals.breakSeconds,
        onBreak: active?.phase === 'break',
        breakTarget: active?.breakSeconds ?? null,
        start,
        extend,
        startBreak,
        endBreak,
        setBreakLength,
        noteLastBlock,
        lastBlockNote,
        pause,
        resume,
        cancel,
        clearPendingLog,
        clearTimerState,
        stop,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within a TimerProvider');
  return ctx;
}
