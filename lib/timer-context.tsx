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
  accumulatedMs: number; // ms accumulated across previous paused segments
  isPaused: boolean;
}

interface TimerContextValue {
  active: TimerState | null;
  elapsedSeconds: number;
  start: (courseId: string, taskId?: string | null) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  stop: () => { courseId: string; taskId: string | null; durationSeconds: number } | null;
}

const TimerContext = createContext<TimerContextValue | null>(null);

const STORAGE_KEY = 'lums.activeTimer';
const MAX_TIMER_MS = 18 * 60 * 60 * 1000;

function sanitizeActive(value: unknown): TimerState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<TimerState>;
  if (typeof state.courseId !== 'string' || state.courseId.trim() === '') return null;
  const taskId = typeof state.taskId === 'string' ? state.taskId : null;
  const startedAt = Number(state.startedAt);
  const accumulatedMs = Number(state.accumulatedMs);
  if (!Number.isFinite(startedAt) || !Number.isFinite(accumulatedMs)) return null;

  return {
    courseId: state.courseId,
    taskId,
    startedAt,
    accumulatedMs: Math.min(MAX_TIMER_MS, Math.max(0, accumulatedMs)),
    isPaused: Boolean(state.isPaused),
  };
}

function loadActive(): TimerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = sanitizeActive(JSON.parse(raw));
    if (!parsed) {
      saveActive(null);
      return null;
    }
    const liveMs = parsed.isPaused ? 0 : Math.max(0, Date.now() - parsed.startedAt);
    if (parsed.accumulatedMs + liveMs >= MAX_TIMER_MS) {
      saveActive(null);
      return null;
    }
    return parsed;
  } catch {
    saveActive(null);
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

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<TimerState | null>(null);
  const [elapsedSeconds, setElapsed] = useState(0);
  const tickRef = useRef<number | null>(null);

  // Hydrate from storage on mount
  useEffect(() => {
    const loaded = loadActive();
    if (loaded) {
      setActive(loaded);
      setElapsed(computeElapsed(loaded));
    }
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
    tickRef.current = window.setInterval(() => {
      setElapsed(computeElapsed(active));
    }, 250);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [active]);

  const start = useCallback((courseId: string, taskId: string | null = null) => {
    if (!courseId.trim()) return;
    const next: TimerState = {
      courseId,
      taskId,
      startedAt: Date.now(),
      accumulatedMs: 0,
      isPaused: false,
    };
    setActive(next);
    saveActive(next);
    setElapsed(0);
  }, []);

  const pause = useCallback(() => {
    setActive((prev) => {
      if (!prev || prev.isPaused) return prev;
      const next: TimerState = {
        ...prev,
        accumulatedMs: Math.min(
          MAX_TIMER_MS,
          Math.max(0, prev.accumulatedMs) + Math.max(0, Date.now() - prev.startedAt),
        ),
        isPaused: true,
      };
      saveActive(next);
      return next;
    });
  }, []);

  const resume = useCallback(() => {
    setActive((prev) => {
      if (!prev || !prev.isPaused) return prev;
      const next: TimerState = {
        ...prev,
        startedAt: Date.now(),
        isPaused: false,
      };
      saveActive(next);
      return next;
    });
  }, []);

  const cancel = useCallback(() => {
    setActive(null);
    saveActive(null);
    setElapsed(0);
  }, []);

  const stop = useCallback(() => {
    if (!active) return null;
    const totalSeconds = computeElapsed(active);
    const result = {
      courseId: active.courseId,
      taskId: active.taskId,
      durationSeconds: totalSeconds,
    };
    setActive(null);
    saveActive(null);
    setElapsed(0);
    return result;
  }, [active]);

  return (
    <TimerContext.Provider value={{ active, elapsedSeconds, start, pause, resume, cancel, stop }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within a TimerProvider');
  return ctx;
}
