'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCourses, useSessions, useTasks } from '@/lib/data-hooks';
import { readingRateDetail } from '@/lib/derive';
import { usePreferences } from '@/lib/preferences';
import { readHabits } from '@/lib/progression/habits';
import { isLoggableDuration } from '@/lib/session-safety';
import { readLastLength } from '@/lib/timer-length';
import { readUpNext, type UpNextCandidate, type UpNextReading } from '@/lib/up-next';
import { EMPTY_DAY, readUpNextDay, subscribeUpNextDay, type UpNextDay } from '@/lib/up-next-day';
import { readTonight, sizeSession, type UpNextSession } from '@/lib/up-next-session';
import { isoDate } from '@/lib/utils';

/**
 * Up next from anywhere: Today's band and the rail's start both read this,
 * so the two can never offer different things, and both read the same
 * per-device day (lib/up-next-day.ts), so a Not now on Today reaches the rail
 * at once.
 *
 * The rule the whole feature rests on is kept here by what each part is
 * allowed to depend on. The reading (what is up, and in what order) depends
 * on the logged record, the date, and this device's Not now and promoted row,
 * and on nothing that moves by the minute: no clock, no sitting on the timer,
 * no recall count, no weak points. So it is computed once per change in the
 * record, not once per render, and the pick holds still all evening. The
 * clock reaches only `sizeOf`, which the caller hands the minute it wants to
 * size for, and only UpNext itself subscribes to the minute (useMinuteClock):
 * the page and the rail re-render when the day turns, never on the minute.
 */

/* ── The minute ─────────────────────────────────────────────────────────── */

/*
 * One module-level clock for every subscriber, aligned to the wall-clock
 * minute so "20m before 11pm" turns over when the clock on the reader's
 * phone does, not at some arbitrary second of it. A chain of timeouts rather
 * than an interval, so a timer that fires late (a backgrounded tab is let
 * run once a minute at best) does not carry its lateness into every tick
 * after it. The snapshot is the minute floored, so every read inside one
 * minute returns the same number, which is what useSyncExternalStore needs.
 */
const MINUTE_MS = 60_000;
let minute: number | null = null;
let minuteTimer: number | null = null;
const minuteListeners = new Set<() => void>();

const floorMinute = (ms: number) => ms - (ms % MINUTE_MS);

function tickMinute() {
  minute = floorMinute(Date.now());
  for (const fn of minuteListeners) fn();
}

function armMinute() {
  const now = Date.now();
  // A few milliseconds past the boundary, so the floor lands on the new minute.
  minuteTimer = window.setTimeout(() => {
    tickMinute();
    armMinute();
  }, MINUTE_MS - (now % MINUTE_MS) + 20);
}

/** Coming back to a tab that slept through an hour catches up at once. */
function onVisible() {
  if (document.visibilityState === 'visible') tickMinute();
}

function subscribeMinute(fn: () => void): () => void {
  minuteListeners.add(fn);
  if (minuteListeners.size === 1) {
    minute = floorMinute(Date.now());
    armMinute();
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    minuteListeners.delete(fn);
    if (minuteListeners.size > 0) return;
    if (minuteTimer !== null) window.clearTimeout(minuteTimer);
    minuteTimer = null;
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function minuteSnapshot(): number {
  // With nobody subscribed the stored minute is not being kept, so a first
  // read after a long gap reads the clock rather than a minute from an hour
  // ago. Floored, so two reads in one render still agree.
  if (minute === null || minuteTimer === null) minute = floorMinute(Date.now());
  return minute;
}

const noMinute = () => null;

/**
 * The current minute as an instant, or null on the server and during
 * hydration, so a server render and the first client render agree and the
 * first real figure arrives one render later. Subscribing re-renders only the
 * component that calls this, once a minute.
 */
export function useMinuteClock(): number | null {
  return useSyncExternalStore(subscribeMinute, minuteSnapshot, noMinute);
}

/**
 * The reader's date (isoDate, their day, not the calendar's), re-read each
 * minute but changing only when the day turns. A string snapshot compares by
 * value, so a subscriber re-renders once at the turn and never on the minute
 * in between: the page and the rail pick up the new day without the page
 * re-rendering sixty times an hour to find out it has not come.
 */
function useToday(): string {
  return useSyncExternalStore(subscribeMinute, isoDate, isoDate);
}

/* ── The day ────────────────────────────────────────────────────────────── */

/**
 * What this device set aside and put up next today. The empty day on the
 * server and during hydration, so nothing the server could not have known
 * reaches the first client render; the stored day follows straight after.
 */
export function useUpNextDay(): UpNextDay {
  const today = useToday();
  const read = useCallback(() => readUpNextDay(today), [today]);
  return useSyncExternalStore(subscribeUpNextDay, read, () => EMPTY_DAY);
}

/* ── Up next ────────────────────────────────────────────────────────────── */

export interface UpNextView {
  reading: UpNextReading;
  today: string;
  /**
   * The session for a candidate at `now`, taken to its minute, so any instant
   * inside the minute useMinuteClock reports sizes as Today does. Null `now`
   * (the server, the first render) sizes without tonight's end, so the figure
   * is the reader's usual length until the clock is known, never a guess at
   * the evening.
   */
  sizeOf(c: Pick<UpNextCandidate, 'task' | 'course' | 'spentSeconds'>, now: number | null): UpNextSession;
}

export function useUpNext(): UpNextView {
  const { tasks } = useTasks();
  const { courses } = useCourses();
  const { sessions } = useSessions();
  const day = useUpNextDay();
  const [prefs] = usePreferences();
  const today = useToday();

  // The logged record, with anything too short or too long to be a real
  // sitting left out, the same filter every screen's figures use.
  const logged = useMemo(() => sessions.filter((s) => isLoggableDuration(s.durationSeconds)), [sessions]);

  const reading = useMemo(
    () => readUpNext({ today, courses, tasks, sessions: logged, setAside: day.passes, chosen: day.chosen }),
    [today, courses, tasks, logged, day],
  );

  // Read straight off the record rather than through useProgression, so the
  // rail gains no fetch for its start, and with no notes, the same pace the
  // MCP briefing reads, so the two size a reading alike.
  const habits = useMemo(() => readHabits(courses, logged, tasks), [courses, logged, tasks]);
  const pace = useMemo(() => {
    const detail = readingRateDetail(tasks, logged);
    return { pagesPerHour: detail.pagesPerHour, measured: detail.measured };
  }, [tasks, logged]);

  const dayEndingHour = prefs.dayEndingHour;
  const returning = reading.returning;
  const sizeOf = useCallback(
    (c: Pick<UpNextCandidate, 'task' | 'course' | 'spentSeconds'>, now: number | null) =>
      sizeSession(c, {
        habits,
        pace,
        // Floored here rather than trusted to the caller: the rail hands in
        // Date.now(), and half a minute past the one Today is showing is a
        // minute less of evening, which floor5 can turn into five.
        tonight: now == null ? null : readTonight({ today, now: floorMinute(now), dayEndingHour, habits }),
        // Read at call time: the popover may have changed it since the last render.
        lastUsedMinutes: readLastLength(),
        returning,
      }),
    [habits, pace, today, dayEndingHour, returning],
  );

  return useMemo(() => ({ reading, today, sizeOf }), [reading, today, sizeOf]);
}
