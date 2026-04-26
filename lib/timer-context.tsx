'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

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
  stop: () => { courseId: string; taskId: string | null; durationSeconds: number } | null;
}

const TimerContext = createContext<TimerContextValue | null>(null);

const STORAGE_KEY = 'lums.activeTimer';

function loadActive(): TimerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TimerState;
  } catch {
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
  const liveMs = state.isPaused ? 0 : Date.now() - state.startedAt;
  return Math.floor((state.accumulatedMs + liveMs) / 1000);
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
        accumulatedMs: prev.accumulatedMs + (Date.now() - prev.startedAt),
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
    <TimerContext.Provider value={{ active, elapsedSeconds, start, pause, resume, stop }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within a TimerProvider');
  return ctx;
}
