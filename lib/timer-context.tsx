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
  clearTimerState: () => void;
  stop: () => PendingTimerLog | null;
}

const TimerContext = createContext<TimerContextValue | null>(null);

const STORAGE_KEY = 'lums.activeTimer';
const PENDING_STORAGE_KEY = 'lums.pendingTimerLog';
const TAB_STORAGE_KEY = 'lums.timerTabs';
const MAX_TIMER_MS = 18 * 60 * 60 * 1000;
const RUNNING_CHECKPOINT_MS = 10 * 1000;
const STALE_RUNNING_MS = 4 * 60 * 60 * 1000;
const TAB_HEARTBEAT_MS = 5 * 1000;
const TAB_TTL_MS = 20 * 1000;

interface TimerTabRecord {
  id: string;
  lastSeenAt: number;
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

export function clearStoredTimerState(): void {
  saveActive(null);
  savePendingLog(null);
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
    const current = sanitizeActive(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'));
    if (!activeMatches(current, state)) return false;
    saveActive(state);
    return true;
  } catch {
    return false;
  }
}

function readTimerTabs(now = Date.now()): TimerTabRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TAB_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((tab) => ({
        id: typeof tab?.id === 'string' ? tab.id : '',
        lastSeenAt: Number(tab?.lastSeenAt),
      }))
      .filter((tab) => tab.id && Number.isFinite(tab.lastSeenAt) && now - tab.lastSeenAt < TAB_TTL_MS);
  } catch {
    return [];
  }
}

function writeTimerTabs(tabs: TimerTabRecord[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabs));
}

function markTimerTab(id: string, now = Date.now()): void {
  const tabs = readTimerTabs(now).filter((tab) => tab.id !== id);
  writeTimerTabs([...tabs, { id, lastSeenAt: now }]);
}

function unregisterTimerTab(id: string, now = Date.now()): TimerTabRecord[] {
  const tabs = readTimerTabs(now).filter((tab) => tab.id !== id);
  writeTimerTabs(tabs);
  return tabs;
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
  const tabHeartbeatRef = useRef<number | null>(null);
  const tabIdRef = useRef(`timer-tab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
    const tabId = tabIdRef.current;
    markTimerTab(tabId);
    tabHeartbeatRef.current = window.setInterval(() => {
      markTimerTab(tabId);
    }, TAB_HEARTBEAT_MS);

    const handlePageHide = () => {
      const current = activeRef.current;
      unregisterTimerTab(tabId);
      if (current) {
        // Refreshes and accidental closes should preserve the timer. A later
        // hydrate decides whether the absence was short enough to keep running.
        saveActive({ ...current, lastSeenAt: Date.now() });
      }
    };

    const syncFromStorage = () => {
      const snapshot = loadActiveSnapshot();
      activeRef.current = snapshot.active;
      pendingLogRef.current = snapshot.pendingLog;
      setActive(snapshot.active);
      setPendingLog(snapshot.pendingLog);
      setElapsed(snapshot.active ? computeElapsed(snapshot.active) : 0);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      markTimerTab(tabId);
      syncFromStorage();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== PENDING_STORAGE_KEY) return;
      syncFromStorage();
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('storage', handleStorage);
    return () => {
      if (tabHeartbeatRef.current) window.clearInterval(tabHeartbeatRef.current);
      unregisterTimerTab(tabId);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('storage', handleStorage);
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
        saveActiveIfCurrent(checkpoint);
      }
    }, 250);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [active]);

  const start = useCallback((courseId: string, taskId: string | null = null) => {
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
        active,
        pendingLog,
        elapsedSeconds,
        start,
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
