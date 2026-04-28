'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { clampSessionSeconds } from './session-safety';

interface TimerState {
  courseId: string;
  taskId: string | null;
  startedAt: number; // ms epoch when current run segment started
  startedDate: string;
  accumulatedMs: number; // ms accumulated across previous paused segments
  isPaused: boolean;
  lastSeenAt: number;
}

interface PendingTimerLog {
  courseId: string;
  taskId: string | null;
  date: string;
  durationSeconds: number;
}

interface TimerContextValue {
  active: TimerState | null;
  pendingLog: PendingTimerLog | null;
  elapsedSeconds: number;
  start: (courseId: string, taskId?: string | null) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  clearPendingLog: () => void;
  stop: () => PendingTimerLog | null;
}

const TimerContext = createContext<TimerContextValue | null>(null);

const STORAGE_KEY = 'lums.activeTimer';
const PENDING_STORAGE_KEY = 'lums.pendingTimerLog';
const MAX_TIMER_MS = 18 * 60 * 60 * 1000;
const RUNNING_CHECKPOINT_MS = 10 * 1000;
const STALE_RUNNING_MS = 4 * 60 * 60 * 1000;

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
  };
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
  };
}

function savePendingLog(log: PendingTimerLog | null): void {
  if (typeof window === 'undefined') return;
  if (log === null) {
    window.localStorage.removeItem(PENDING_STORAGE_KEY);
  } else {
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(log));
  }
}

function loadPendingLog(): PendingTimerLog | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
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
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function buildPendingLog(state: TimerState, stoppedAt: number): PendingTimerLog | null {
  const safeState = sanitizeActive(state);
  if (!safeState) return null;
  const durationSeconds = computeElapsedAt(safeState, stoppedAt);
  if (durationSeconds <= 0) return null;
  return {
    courseId: safeState.courseId,
    taskId: safeState.taskId,
    date: safeState.startedDate,
    durationSeconds,
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
      const pendingLog = buildPendingLog(parsed, stoppedAt);
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
      setPendingLog(snapshot.pendingLog);
      setElapsed(0);
      return;
    }
    if (snapshot.active) {
      setActive(snapshot.active);
      setElapsed(computeElapsed(snapshot.active));
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!activeRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const handlePageHide = () => {
      const current = activeRef.current;
      if (!current) return;
      const log = buildPendingLog(current, Date.now());
      activeRef.current = null;
      saveActive(null);
      if (log) {
        pendingLogRef.current = log;
        savePendingLog(log);
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const snapshot = loadActiveSnapshot();
      activeRef.current = snapshot.active;
      pendingLogRef.current = snapshot.pendingLog;
      setActive(snapshot.active);
      setPendingLog(snapshot.pendingLog);
      setElapsed(snapshot.active ? computeElapsed(snapshot.active) : 0);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
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
    tickRef.current = window.setInterval(() => {
      const now = Date.now();
      const current = activeRef.current ?? active;
      if (!current.isPaused && now - current.lastSeenAt >= STALE_RUNNING_MS) {
        const log = buildPendingLog(current, current.lastSeenAt);
        activeRef.current = null;
        setActive(null);
        saveActive(null);
        setElapsed(0);
        if (log) {
          pendingLogRef.current = log;
          setPendingLog(log);
          savePendingLog(log);
        }
        return;
      }
      setElapsed(computeElapsed(active));
      if (now - lastCheckpoint >= RUNNING_CHECKPOINT_MS) {
        lastCheckpoint = now;
        const checkpoint = { ...active, lastSeenAt: now };
        activeRef.current = checkpoint;
        saveActive(checkpoint);
      }
    }, 250);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [active]);

  const start = useCallback((courseId: string, taskId: string | null = null) => {
    if (!courseId.trim()) return;
    const now = Date.now();
    const next: TimerState = {
      courseId,
      taskId,
      startedAt: now,
      startedDate: isoDateFromMs(now),
      accumulatedMs: 0,
      isPaused: false,
      lastSeenAt: now,
    };
    activeRef.current = next;
    setActive(next);
    saveActive(next);
    pendingLogRef.current = null;
    setPendingLog(null);
    savePendingLog(null);
    setElapsed(0);
  }, []);

  const recoverStaleRunningTimer = useCallback((state: TimerState, now: number): PendingTimerLog | null => {
    const safeState = sanitizeActive(state);
    if (!safeState || safeState.isPaused || now - safeState.lastSeenAt < STALE_RUNNING_MS) {
      return null;
    }
    const log = buildPendingLog(safeState, safeState.lastSeenAt);
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

  return (
    <TimerContext.Provider
      value={{
        active,
        pendingLog,
        elapsedSeconds,
        start,
        pause,
        resume,
        cancel,
        clearPendingLog,
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
