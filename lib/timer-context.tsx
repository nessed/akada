'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { MAX_SESSION_SECONDS, clampSessionSeconds } from './session-safety';
import { plannerDate } from './preferences';

interface TimerState {
  courseId: string;
  taskId: string | null;
  startedAt: number; // ms epoch when current run segment started
  startedDate: string;
  accumulatedMs: number; // ms accumulated across previous paused segments
  isPaused: boolean;
  lastSeenAt: number;
  /**
   * Block mode's target, in seconds, or null for an open-ended session. The
   * timer counts the same either way; the target is what the screen counts
   * down from and what the fan is sized to fill.
   */
  targetSeconds: number | null;
  /**
   * Stable for the life of one sitting. The study fan is seeded off it, so a
   * session that is paused, reloaded or restored keeps the shape it grew.
   */
  sessionId: string;
}

interface PendingTimerLog {
  courseId: string;
  taskId: string | null;
  date: string;
  durationSeconds: number;
  recoveryReason?: 'away' | 'max';
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
  elapsedSeconds: number;
  start: (courseId: string, taskId?: string | null, targetSeconds?: number | null) => void;
  /** Push a running block's target out, the timer's "+5 min". */
  extend: (seconds: number) => void;
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
  };
}

/**
 * A block target has to be a positive number of seconds inside the same
 * ceiling a session itself has; anything else means open-ended.
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
  return {
    courseId: log.courseId,
    taskId: typeof log.taskId === 'string' ? log.taskId : null,
    date: typeof log.date === 'string' && log.date.trim() ? log.date : isoDateFromMs(Date.now()),
    durationSeconds,
    recoveryReason:
      log.recoveryReason === 'away' || log.recoveryReason === 'max'
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

function computeElapsed(state: TimerState): number {
  const safeState = sanitizeActive(state);
  if (!safeState) return 0;
  const liveMs = safeState.isPaused ? 0 : Math.max(0, Date.now() - safeState.startedAt);
  return clampSessionSeconds((safeState.accumulatedMs + liveMs) / 1000);
}

function computeElapsedAt(state: TimerState, atMs: number): number {
  const safeState = sanitizeActive(state);
  if (!safeState) return 0;
  const liveMs = safeState.isPaused ? 0 : Math.max(0, atMs - safeState.startedAt);
  return clampSessionSeconds((safeState.accumulatedMs + liveMs) / 1000);
}

function buildPendingLog(
  state: TimerState,
  stoppedAt: number,
  recoveryReason?: PendingTimerLog['recoveryReason'],
): PendingTimerLog | null {
  const safeState = sanitizeActive(state);
  if (!safeState) return null;
  const durationSeconds = computeElapsedAt(safeState, stoppedAt);
  if (durationSeconds <= 0) return null;
  return {
    courseId: safeState.courseId,
    taskId: safeState.taskId,
    date: safeState.startedDate,
    durationSeconds,
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
    const liveMs = parsed.isPaused ? 0 : Math.max(0, now - parsed.startedAt);
    const staleRunning = !parsed.isPaused && now - parsed.lastSeenAt >= STALE_RUNNING_MS;
    if (staleRunning || parsed.accumulatedMs + liveMs >= MAX_TIMER_MS) {
      const stoppedAt = staleRunning ? parsed.lastSeenAt : now;
      const pendingLog = buildPendingLog(parsed, stoppedAt, staleRunning ? 'away' : 'max');
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

    tickRef.current = window.setInterval(() => {
      const now = Date.now();
      const current = activeRef.current ?? active;
      if (!current.isPaused && now - current.lastSeenAt >= STALE_RUNNING_MS) {
        closeOut(current, current.lastSeenAt, 'away');
        return;
      }
      // The 18h ceiling used to be enforced only on the way back from
      // storage. A tab left open past it kept counting while the readout sat
      // clamped at 18:00:00, so the number on screen stopped being the number
      // being measured, and stopping then logged a silently truncated 18h.
      // The ceiling has to close the session where it is reached.
      const liveMs = now - current.startedAt;
      if (!current.isPaused && current.accumulatedMs + liveMs >= MAX_TIMER_MS) {
        closeOut(current, current.startedAt + (MAX_TIMER_MS - current.accumulatedMs), 'max');
        return;
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
    };
    maybeRequestTimerNotificationPermission();
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

  /**
   * "+5 min". Only means anything to a block: an open session has nothing to
   * push out, so the call is dropped rather than silently turning it into one.
   */
  const extend = useCallback((seconds: number) => {
    const running = activeRef.current;
    if (!running || running.targetSeconds == null) return;
    const next = {
      ...running,
      targetSeconds: sanitizeTarget(running.targetSeconds + seconds),
    };
    activeRef.current = next;
    setActive(next);
    saveActive(next);
  }, []);

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
    activeRef.current = null;
    setActive(null);
    saveActive(null);
    setElapsed(0);
  }, []);

  const stop = useCallback(() => {
    const current = activeRef.current;
    if (!current) return null;
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
    activeRef.current = null;
    pendingLogRef.current = null;
    setActive(null);
    setPendingLog(null);
    setElapsed(0);
    clearStoredTimerState();
  }, []);

  return (
    <TimerContext.Provider
      value={{
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
