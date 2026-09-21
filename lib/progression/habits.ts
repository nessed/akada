import type { Course, Session, SessionSegment, Task } from '../data';
import { isLoggableDuration } from '../session-safety';
import {
  HABIT_MIN_BLOCKS,
  HABIT_MIN_SITTINGS,
  HABIT_MIN_TAGGED,
  HABIT_MIN_WEEKS,
  PEAK_MIN_SHARE,
  REACHABLE_SECONDS,
  REACH_MAX_SECONDS,
  REACH_MIN_SECONDS,
} from './constants';

/**
 * What the term has taught the app about how this reader studies.
 *
 * Everything else in this folder measures how much. This measures how: how
 * long a sitting actually runs, how long a block runs and whether it runs
 * past what it was set to, when in the day the work happens, which day of the
 * week carries the most, what a break really costs against what it was meant
 * to, how fast the reading goes on each course. None of it is a target and
 * none of it is compared to anybody else. It is a description of the reader,
 * drawn from their own rows, and it sharpens as the rows accumulate.
 *
 * Every figure is a median, so one heroic evening does not redefine "usually",
 * and every figure is withheld until there is enough behind it to be a
 * habit rather than a coincidence (the HABIT_MIN_* constants). A figure that
 * has not taken shape yet is reported as such, which is the honest way for an
 * app to say it is still getting to know you.
 *
 * Where does the app *use* this, beyond saying it back? Three places. Next
 * Mark's reach is the reader's own sitting rather than a fixed fifty minutes.
 * The start popover defaults to the block length the reader actually runs
 * on that course. And the observations (./observations.ts) are the margin
 * notes on Today and the course pages, which change as the term does.
 */

export interface Stat {
  /** How many the median is drawn from. Zero means nothing to say. */
  n: number;
  median: number;
  /** Upper quartile, for "a good one" rather than "a usual one". */
  upper: number;
}

export interface HourWindow {
  /** The first of three consecutive hours, 0 to 23, local time. */
  start: number;
  /** The share of all focus that landed inside the window, 0 to 1. */
  share: number;
}

export interface CourseHabit {
  courseId: string;
  /** Focus block lengths, in seconds, from timed sittings. */
  blocks: Stat;
  /** Whole sittings, in seconds. */
  sittings: Stat;
  /** Blocks that were set a length, and how many ran past it by a minute or more. */
  overrun: { n: number; over: number };
  /** The three hours this course is most often worked in. */
  peak: HourWindow | null;
  /** Sittings tagged #distracted against sittings tagged at all. */
  distracted: { n: number; count: number };
  /** Pages an hour, from readings finished with time logged against them. */
  pagesPerHour: number | null;
  /** Days on which this course was the first thing worked. */
  openedDays: number;
}

export interface Habits {
  /** Whole sittings, every course. */
  sittings: Stat;
  /** Focus blocks, every course. */
  blocks: Stat;
  /** Focus blocks per timed sitting. */
  blocksPerSitting: Stat;
  /** Breaks as taken, and the length they were set to. */
  breaks: { taken: Stat; meant: Stat };
  /** Next Mark's reach for this reader, in seconds. */
  reach: number;
  /** Whether `reach` is the reader's own or the shipped default. */
  reachIsOwn: boolean;
  /** Focus seconds by local hour of day. */
  hours: number[];
  peak: HourWindow | null;
  /** Focus seconds by weekday, Sunday first. */
  weekdays: number[];
  /** The weekday that usually carries the most, or null until it clearly does. */
  fullestDay: number | null;
  /** Distinct days with something logged. */
  days: number;
  /** Distinct weeks with something logged. */
  weeks: number;
  /** Sittings timed in the app, so they have a shape to read. */
  timedSittings: number;
  byCourse: Map<string, CourseHabit>;
}

const EMPTY_STAT: Stat = { n: 0, median: 0, upper: 0 };

function stat(values: number[]): Stat {
  if (values.length === 0) return EMPTY_STAT;
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, median: quantile(sorted, 0.5), upper: quantile(sorted, 0.75) };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localIso(d);
}

/**
 * When a sitting happened, as a moment on the local clock, or null when the
 * app cannot honestly say.
 *
 * A timed sitting carries the start of its first block. A sitting logged by
 * hand only carries when it was logged, which is fine if it was logged the
 * same day (the middle of the sitting is put a little before that) and
 * useless if it was logged three days later. The hourly picture is built
 * only from sittings the app can place.
 */
function placeSitting(session: Session): Date | null {
  const first = session.segments?.find((s) => s.kind === 'focus');
  if (first) {
    const at = new Date(first.startedAt);
    if (!Number.isNaN(at.getTime())) return at;
  }
  const logged = new Date(session.createdAt);
  if (Number.isNaN(logged.getTime())) return null;
  if (localIso(logged) !== session.date) return null;
  return new Date(logged.getTime() - (session.durationSeconds * 1000) / 2);
}

/** The three-hour window holding the most focus, if it holds enough to be a peak. */
function peakOf(hours: number[], minTotal: number): HourWindow | null {
  const total = hours.reduce((a, b) => a + b, 0);
  if (total < minTotal) return null;
  let best = 0;
  let bestStart = 0;
  for (let start = 0; start < 24; start++) {
    const sum = hours[start] + hours[(start + 1) % 24] + hours[(start + 2) % 24];
    if (sum > best) {
      best = sum;
      bestStart = start;
    }
  }
  const share = best / total;
  return share >= PEAK_MIN_SHARE ? { start: bestStart, share } : null;
}

function focusBlocks(segments: SessionSegment[] | undefined): SessionSegment[] {
  return (segments ?? []).filter((s) => s.kind === 'focus');
}

function tagged(note: string, tag: string): boolean {
  return new RegExp(`(^|\\s)#${tag}(\\s|$)`).test(note);
}

export function readHabits(courses: Course[], sessions: Session[], tasks: Task[]): Habits {
  const known = new Set(courses.map((c) => c.id));
  const logged = sessions.filter(
    (s) => isLoggableDuration(s.durationSeconds) && known.has(s.courseId),
  );

  const hours = new Array<number>(24).fill(0);
  const weekdays = new Array<number>(7).fill(0);
  const days = new Set<string>();
  const weeks = new Set<string>();

  const allSittings: number[] = [];
  const allBlocks: number[] = [];
  const perSitting: number[] = [];
  const breaksTaken: number[] = [];
  const breaksMeant: number[] = [];
  let timedSittings = 0;

  const courseSittings = new Map<string, number[]>();
  const courseBlocks = new Map<string, number[]>();
  const courseOverrun = new Map<string, { n: number; over: number }>();
  const courseHours = new Map<string, number[]>();
  const courseTagged = new Map<string, { n: number; count: number }>();
  const secondsByTask = new Map<string, number>();
  const firstOfDay = new Map<string, { at: number; courseId: string }>();

  const bucket = <T,>(map: Map<string, T[]>, key: string): T[] => {
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    return list;
  };

  for (const session of logged) {
    days.add(session.date);
    weeks.add(mondayOf(session.date));
    allSittings.push(session.durationSeconds);
    bucket(courseSittings, session.courseId).push(session.durationSeconds);
    if (session.taskId) {
      secondsByTask.set(
        session.taskId,
        (secondsByTask.get(session.taskId) ?? 0) + session.durationSeconds,
      );
    }

    const blocks = focusBlocks(session.segments);
    if (blocks.length > 0) {
      timedSittings += 1;
      perSitting.push(blocks.length);
      const over = courseOverrun.get(session.courseId) ?? { n: 0, over: 0 };
      for (const block of blocks) {
        allBlocks.push(block.seconds);
        bucket(courseBlocks, session.courseId).push(block.seconds);
        if (block.targetSeconds) {
          over.n += 1;
          if (block.seconds >= block.targetSeconds + 60) over.over += 1;
        }
      }
      courseOverrun.set(session.courseId, over);
      for (const rest of session.segments ?? []) {
        if (rest.kind !== 'break') continue;
        breaksTaken.push(rest.seconds);
        if (rest.targetSeconds) breaksMeant.push(rest.targetSeconds);
      }
    }

    if (tagged(session.note, 'focused') || tagged(session.note, 'distracted')) {
      const t = courseTagged.get(session.courseId) ?? { n: 0, count: 0 };
      t.n += 1;
      if (tagged(session.note, 'distracted')) t.count += 1;
      courseTagged.set(session.courseId, t);
    }

    const at = placeSitting(session);
    if (at) {
      // Spread the sitting across the hours it ran through, so a two hour
      // evening is an evening and not a spike at the minute it began.
      let remaining = session.durationSeconds;
      const cursor = new Date(at);
      const mine = courseHours.get(session.courseId) ?? new Array<number>(24).fill(0);
      while (remaining > 0) {
        const untilNextHour = 3600 - (cursor.getMinutes() * 60 + cursor.getSeconds());
        const slice = Math.min(remaining, untilNextHour);
        hours[cursor.getHours()] += slice;
        mine[cursor.getHours()] += slice;
        remaining -= slice;
        cursor.setTime(cursor.getTime() + slice * 1000);
      }
      courseHours.set(session.courseId, mine);
      weekdays[new Date(session.date + 'T12:00:00').getDay()] += session.durationSeconds;

      const held = firstOfDay.get(session.date);
      if (!held || at.getTime() < held.at) {
        firstOfDay.set(session.date, { at: at.getTime(), courseId: session.courseId });
      }
    }
  }

  // Reading pace per course: pages on finished readings against the time
  // logged on those very tasks, the same bound the credit ledger uses.
  const pagesByCourse = new Map<string, { pages: number; seconds: number; n: number }>();
  for (const task of tasks) {
    if (!task.completed || !task.pages || !known.has(task.courseId)) continue;
    const seconds = secondsByTask.get(task.id) ?? 0;
    if (seconds <= 0) continue;
    const row = pagesByCourse.get(task.courseId) ?? { pages: 0, seconds: 0, n: 0 };
    row.pages += task.pages;
    row.seconds += seconds;
    row.n += 1;
    pagesByCourse.set(task.courseId, row);
  }

  const openedDays = new Map<string, number>();
  for (const { courseId } of firstOfDay.values()) {
    openedDays.set(courseId, (openedDays.get(courseId) ?? 0) + 1);
  }

  const sittings = stat(allSittings);
  const minPeakFocus = HABIT_MIN_SITTINGS * 20 * 60;

  // The fullest weekday, claimed only once there are enough weeks for a
  // weekday to mean anything and the leader is clearly ahead of the rest.
  let fullestDay: number | null = null;
  if (weeks.size >= HABIT_MIN_WEEKS) {
    const top = weekdays.reduce((best, v, i) => (v > weekdays[best] ? i : best), 0);
    const rest = weekdays.filter((_, i) => i !== top);
    const restMean = rest.reduce((a, b) => a + b, 0) / rest.length;
    if (weekdays[top] > 0 && weekdays[top] >= restMean * 1.5) fullestDay = top;
  }

  const byCourse = new Map<string, CourseHabit>();
  for (const course of courses) {
    const pace = pagesByCourse.get(course.id);
    byCourse.set(course.id, {
      courseId: course.id,
      blocks: stat(courseBlocks.get(course.id) ?? []),
      sittings: stat(courseSittings.get(course.id) ?? []),
      overrun: courseOverrun.get(course.id) ?? { n: 0, over: 0 },
      peak: peakOf(courseHours.get(course.id) ?? [], minPeakFocus),
      distracted: courseTagged.get(course.id) ?? { n: 0, count: 0 },
      pagesPerHour:
        pace && pace.n >= 2 && pace.seconds > 0
          ? Math.max(1, Math.round(pace.pages / (pace.seconds / 3600)))
          : null,
      openedDays: openedDays.get(course.id) ?? 0,
    });
  }

  const reachIsOwn = sittings.n >= HABIT_MIN_SITTINGS;
  const reach = reachIsOwn
    ? Math.min(REACH_MAX_SECONDS, Math.max(REACH_MIN_SECONDS, sittings.upper))
    : REACHABLE_SECONDS;

  return {
    sittings,
    blocks: stat(allBlocks),
    blocksPerSitting: stat(perSitting),
    breaks: { taken: stat(breaksTaken), meant: stat(breaksMeant) },
    reach,
    reachIsOwn,
    hours,
    peak: peakOf(hours, minPeakFocus),
    weekdays,
    fullestDay,
    days: days.size,
    weeks: weeks.size,
    timedSittings,
    byCourse,
  };
}

/** Whether a stat has enough behind it to be stated as a habit. */
export function settled(s: Stat, min = HABIT_MIN_SITTINGS): boolean {
  return s.n >= min;
}

/** "9pm", "noon", "7am". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** "the evening", "late at night", for a peak window's first hour. */
export function windowLabel(start: number): string {
  if (start >= 5 && start < 9) return 'early in the morning';
  if (start >= 9 && start < 12) return 'in the morning';
  if (start >= 12 && start < 17) return 'in the afternoon';
  if (start >= 17 && start < 21) return 'in the evening';
  return 'late at night';
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Minutes, rounded to the nearest five, as a plain number. */
export function roughMinutes(seconds: number): number {
  return Math.max(5, Math.round(seconds / 300) * 5);
}

export { HABIT_MIN_BLOCKS, HABIT_MIN_SITTINGS, HABIT_MIN_TAGGED, HABIT_MIN_WEEKS };
