import type { Course, Session, Task } from './data';
import { clampSessionSeconds, isLoggableDuration } from './session-safety';
import { isoDate, startOfWeek } from './utils';

/**
 * The Stats page read through a lens: a stretch of time, set beside the
 * stretch before it.
 *
 * `stats-reading.ts` says what the next sitting would change. This file says
 * what a span of the term looked like from every side that matters to a
 * student: how much, how often, how long at a time, on which course against
 * what that course asks for, when in the week, and what came off the list.
 * Every reading takes a window and nothing is stored, so the page can never
 * disagree with the log under it.
 */

const DAY_MS = 86_400_000;

export type Span = 'week' | 'month' | 'term';

export interface Window {
  /** First day, inclusive, ISO. */
  from: string;
  /** Last day, inclusive, ISO. */
  to: string;
}

export interface SpanWindows {
  now: Window;
  /** The stretch it is set against. Null for the term, which has nothing before it. */
  before: Window | null;
  /** What the stretch is called in a sentence: "this week". */
  name: string;
  /** What it is set against: "last week by now". Null with `before`. */
  againstName: string | null;
}

export function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function mondayOf(iso: string): string {
  return isoDate(startOfWeek(new Date(iso + 'T12:00:00')));
}

export function daysIn(window: Window): number {
  return (
    Math.round(
      (new Date(window.to + 'T12:00:00').getTime() - new Date(window.from + 'T12:00:00').getTime()) /
        DAY_MS,
    ) + 1
  );
}

function inWindow(iso: string, window: Window): boolean {
  return iso >= window.from && iso <= window.to;
}

function logged(sessions: Session[]): Session[] {
  return sessions.filter((s) => isLoggableDuration(s.durationSeconds));
}

/**
 * The two stretches a span compares. A week is this week so far against
 * last week by the same day, since a Wednesday against a whole week is a
 * race nobody could win. Four weeks is the last 28 days against the 28
 * before. The term runs from its first day, or the first thing logged, and
 * stands alone.
 */
export function spanWindows(span: Span, today: string, termStart: string | null): SpanWindows {
  if (span === 'week') {
    const monday = mondayOf(today);
    const into = daysIn({ from: monday, to: today }) - 1;
    const lastMonday = shiftIso(monday, -7);
    return {
      now: { from: monday, to: today },
      before: { from: lastMonday, to: shiftIso(lastMonday, into) },
      name: 'this week',
      againstName: into === 6 ? 'last week' : 'last week by now',
    };
  }
  if (span === 'month') {
    return {
      now: { from: shiftIso(today, -27), to: today },
      before: { from: shiftIso(today, -55), to: shiftIso(today, -28) },
      name: 'the last four weeks',
      againstName: 'the four before',
    };
  }
  const from = termStart && termStart <= today ? termStart : today;
  return { now: { from, to: today }, before: null, name: 'the term', againstName: null };
}

/** Where the term starts for the lens: the semester's first day, or the first thing logged. */
export function termStartOf(sessions: Session[], semesterStart: string | null | undefined): string | null {
  if (semesterStart) return semesterStart;
  let first: string | null = null;
  for (const s of logged(sessions)) if (!first || s.date < first) first = s.date;
  return first;
}

/* ------------------------------------------------------------------ */
/* The span in figures                                                  */
/* ------------------------------------------------------------------ */

export interface SpanFigures {
  seconds: number;
  /** Distinct days with time on them. */
  days: number;
  /** Days the window has had so far. */
  daysElapsed: number;
  sittings: number;
  /** The middle sitting's length, leaving out ones the reader did not end. */
  medianSitting: number;
  longestSitting: number;
  /** Distinct courses with time on them. */
  courses: number;
  tasksDone: number;
  tasksAdded: number;
  tasksSkipped: number;
  /** Share of the hours spent against a named task, 0 to 1. */
  onTasks: number;
  /** Practice papers marked, and their mean as a fraction of full marks. */
  papers: number;
  paperMean: number | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  const lo = Math.floor(mid);
  const hi = Math.ceil(mid);
  return (sorted[lo] + sorted[hi]) / 2;
}

export function readSpan(sessions: Session[], tasks: Task[], window: Window): SpanFigures {
  const rows = logged(sessions).filter((s) => inWindow(s.date, window));
  let seconds = 0;
  let onTask = 0;
  const days = new Set<string>();
  const courses = new Set<string>();
  const lengths: number[] = [];
  let longest = 0;
  let papers = 0;
  let paperSum = 0;
  for (const s of rows) {
    const sec = clampSessionSeconds(s.durationSeconds);
    seconds += sec;
    if (s.taskId) onTask += sec;
    days.add(s.date);
    courses.add(s.courseId);
    if (!s.recovery) {
      lengths.push(sec);
      if (sec > longest) longest = sec;
    }
    if (s.score != null && s.scoreOutOf != null && s.scoreOutOf > 0) {
      papers += 1;
      paperSum += s.score / s.scoreOutOf;
    }
  }

  let tasksDone = 0;
  let tasksAdded = 0;
  let tasksSkipped = 0;
  for (const t of tasks) {
    if (t.createdAt && inWindow(t.createdAt.slice(0, 10), window)) tasksAdded += 1;
    if (t.completed && t.completedAt && inWindow(t.completedAt.slice(0, 10), window)) {
      if (t.completedVia === 'skip') tasksSkipped += 1;
      else tasksDone += 1;
    }
  }

  return {
    seconds,
    days: days.size,
    daysElapsed: daysIn(window),
    sittings: rows.length,
    medianSitting: median(lengths),
    longestSitting: longest,
    courses: courses.size,
    tasksDone,
    tasksAdded,
    tasksSkipped,
    onTasks: seconds > 0 ? onTask / seconds : 0,
    papers,
    paperMean: papers > 0 ? paperSum / papers : null,
  };
}

/* ------------------------------------------------------------------ */
/* The term, a week at a time                                           */
/* ------------------------------------------------------------------ */

export interface TermWeek {
  /** Monday, ISO. */
  start: string;
  /** Week of the term, counted from one. */
  n: number;
  seconds: number;
  byCourse: Map<string, number>;
  /** Seconds by day, Monday first. */
  byDay: number[];
  /** Seconds by day and course, Monday first. */
  byDayCourse: Map<string, number>[];
  /** Distinct days with time on them. */
  days: number;
  sittings: number;
  tasksDone: number;
  current: boolean;
  future: boolean;
}

/** More weeks than this and the oldest fall off the front of the chart. */
export const TERM_WEEKS_MAX = 20;

/**
 * Every week of the term, the ones still to come included, so a chart of
 * them says where in the term today is as well as what the weeks held. A
 * term with no end date shows up to this week; one longer than the chart
 * keeps the most recent weeks.
 */
export function readTermWeeks(
  sessions: Session[],
  tasks: Task[],
  termStart: string | null,
  termEnd: string | null,
  today: string,
): TermWeek[] {
  const thisMonday = mondayOf(today);
  const firstMonday = termStart ? mondayOf(termStart <= today ? termStart : today) : thisMonday;
  const lastMonday = termEnd && termEnd > today ? mondayOf(termEnd) : thisMonday;

  const weeks: TermWeek[] = [];
  const index = new Map<string, TermWeek>();
  for (let monday = firstMonday, n = 1; monday <= lastMonday; monday = shiftIso(monday, 7), n++) {
    const week: TermWeek = {
      start: monday,
      n,
      seconds: 0,
      byCourse: new Map(),
      byDay: new Array(7).fill(0),
      byDayCourse: Array.from({ length: 7 }, () => new Map<string, number>()),
      days: 0,
      sittings: 0,
      tasksDone: 0,
      current: monday === thisMonday,
      future: monday > thisMonday,
    };
    weeks.push(week);
    index.set(monday, week);
  }

  for (const s of logged(sessions)) {
    const week = index.get(mondayOf(s.date));
    if (!week) continue;
    const sec = clampSessionSeconds(s.durationSeconds);
    const dow = (new Date(s.date + 'T12:00:00').getDay() + 6) % 7;
    week.seconds += sec;
    week.sittings += 1;
    week.byCourse.set(s.courseId, (week.byCourse.get(s.courseId) ?? 0) + sec);
    week.byDay[dow] += sec;
    week.byDayCourse[dow].set(s.courseId, (week.byDayCourse[dow].get(s.courseId) ?? 0) + sec);
  }
  for (const week of weeks) week.days = week.byDay.filter((v) => v > 0).length;

  for (const t of tasks) {
    if (!t.completed || !t.completedAt || t.completedVia === 'skip') continue;
    const week = index.get(mondayOf(t.completedAt.slice(0, 10)));
    if (week) week.tasksDone += 1;
  }

  return weeks.length > TERM_WEEKS_MAX ? weeks.slice(weeks.length - TERM_WEEKS_MAX) : weeks;
}

/* ------------------------------------------------------------------ */
/* Course against course                                                */
/* ------------------------------------------------------------------ */

export interface CourseStanding {
  course: Course;
  seconds: number;
  /** The span's seconds before, for the change. Null for the term. */
  before: number | null;
  /** Its share of the span's hours, 0 to 1. */
  share: number;
  /** Its share of the week's goal hours, 0 to 1. Null when no course has a goal. */
  goalShare: number | null;
  /** Seconds a week, the last eight weeks, oldest first, this one last. */
  weekly: number[];
  /** Whole weeks it met its goal, of the whole weeks shown in `weekly`. */
  weeksOnGoal: number;
  weeksCounted: number;
  lastStudied: string | null;
  sittings: number;
  medianSitting: number;
}

export const STANDING_WEEKS = 8;

export function readStandings(
  courses: Course[],
  sessions: Session[],
  windows: SpanWindows,
  today: string,
  termStart: string | null,
): CourseStanding[] {
  const rows = logged(sessions);
  const goalTotal = courses.reduce((a, c) => a + Math.max(0, c.weeklyGoalHours || 0), 0);
  const thisMonday = mondayOf(today);
  const firstMonday = termStart ? mondayOf(termStart) : null;
  const weekStarts = Array.from({ length: STANDING_WEEKS }, (_, i) =>
    shiftIso(thisMonday, -7 * (STANDING_WEEKS - 1 - i)),
  );

  let spanTotal = 0;
  for (const s of rows) if (inWindow(s.date, windows.now)) spanTotal += clampSessionSeconds(s.durationSeconds);

  return courses.map((course) => {
    const mine = rows.filter((s) => s.courseId === course.id);
    let seconds = 0;
    let before = windows.before ? 0 : null;
    const lengths: number[] = [];
    const weekly = new Array<number>(STANDING_WEEKS).fill(0);
    let lastStudied: string | null = null;
    for (const s of mine) {
      const sec = clampSessionSeconds(s.durationSeconds);
      if (inWindow(s.date, windows.now)) {
        seconds += sec;
        if (!s.recovery) lengths.push(sec);
      }
      if (windows.before && before !== null && inWindow(s.date, windows.before)) before += sec;
      const w = weekStarts.indexOf(mondayOf(s.date));
      if (w >= 0) weekly[w] += sec;
      if (!lastStudied || s.date > lastStudied) lastStudied = s.date;
    }

    // Whole weeks only, and only ones inside the term: the week in progress
    // has not had its chance yet, and a week before the course existed was
    // never one it could meet.
    const goal = Math.max(0, course.weeklyGoalHours || 0) * 3600;
    let weeksOnGoal = 0;
    let weeksCounted = 0;
    const created = course.createdAt ? mondayOf(course.createdAt.slice(0, 10)) : null;
    weekStarts.forEach((monday, i) => {
      if (monday === thisMonday) return;
      if (firstMonday && monday < firstMonday) return;
      if (created && monday < created) return;
      weeksCounted += 1;
      if (goal > 0 && weekly[i] >= goal) weeksOnGoal += 1;
    });

    return {
      course,
      seconds,
      before,
      share: spanTotal > 0 ? seconds / spanTotal : 0,
      goalShare: goalTotal > 0 ? Math.max(0, course.weeklyGoalHours || 0) / goalTotal : null,
      weekly,
      weeksOnGoal: goal > 0 ? weeksOnGoal : 0,
      weeksCounted: goal > 0 ? weeksCounted : 0,
      lastStudied,
      sittings: mine.filter((s) => inWindow(s.date, windows.now)).length,
      medianSitting: median(lengths),
    };
  });
}

/* ------------------------------------------------------------------ */
/* The week and the day, together                                       */
/* ------------------------------------------------------------------ */

export interface Rhythm {
  /**
   * Focus seconds by the reader's weekday (Monday first) and hour. Column 0
   * is the hour their day starts at, so a night reads left to right without
   * breaking at midnight.
   */
  grid: number[][];
  /** The wall-clock hour column 0 stands for: 0, or the day-end cutoff. */
  startHour: number;
  /** Timed sittings placed on the grid. */
  placed: number;
  /** Every sitting's seconds by weekday, Monday first, placed or not. */
  byWeekday: number[];
  /** The fullest cell, if the grid holds anything. `hour` is the wall-clock hour. */
  peak: { day: number; hour: number; seconds: number } | null;
}

/**
 * When in the week the work lands: a row per weekday, a column per hour.
 *
 * Only a sitting the timer ran knows when it happened, from its blocks, so
 * only those are placed on the grid, each block spread across the hours it
 * actually ran through. Every sitting counts toward its weekday, since the
 * date is known for all of them.
 *
 * Rows are the reader's days, not the calendar's. With a day that ends at
 * 8am, three in the morning after Sunday is still Sunday, the same as every
 * other count in the app; it used to land on Monday's row and make Monday
 * the fullest day of somebody who studies on Sunday nights.
 */
export function readRhythm(sessions: Session[], window: Window, cutoff = 0): Rhythm {
  const startHour = Math.max(0, Math.min(8, Math.round(cutoff)));
  const shift = startHour * 3_600_000;
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const byWeekday = new Array<number>(7).fill(0);
  let placed = 0;
  for (const s of logged(sessions)) {
    if (!inWindow(s.date, window)) continue;
    byWeekday[(new Date(s.date + 'T12:00:00').getDay() + 6) % 7] += clampSessionSeconds(
      s.durationSeconds,
    );
    const blocks = (s.segments ?? []).filter((seg) => seg.kind === 'focus' && seg.seconds > 0);
    if (blocks.length === 0 || s.recovery) continue;
    let any = false;
    for (const block of blocks) {
      const start = new Date(block.startedAt);
      if (Number.isNaN(start.getTime())) continue;
      let at = start.getTime();
      let left = Math.min(block.seconds, 12 * 3600);
      while (left > 0) {
        const wall = new Date(at);
        const toNextHour = 3600 - (wall.getMinutes() * 60 + wall.getSeconds());
        const take = Math.min(left, toNextHour);
        // The same instant, pulled back into the reader's day.
        const day = new Date(at - shift);
        grid[(day.getDay() + 6) % 7][day.getHours()] += take;
        left -= take;
        at += take * 1000;
        any = true;
      }
    }
    if (any) placed += 1;
  }

  let peak: Rhythm['peak'] = null;
  for (let day = 0; day < 7; day++) {
    for (let col = 0; col < 24; col++) {
      const seconds = grid[day][col];
      if (seconds > 0 && (!peak || seconds > peak.seconds)) {
        peak = { day, hour: (col + startHour) % 24, seconds };
      }
    }
  }
  return { grid, startHour, placed, byWeekday, peak };
}

/* ------------------------------------------------------------------ */
/* How long a sitting runs                                              */
/* ------------------------------------------------------------------ */

export interface LengthBucket {
  label: string;
  /** Lower bound in seconds, inclusive. */
  from: number;
  /** Upper bound in seconds, exclusive. Infinity for the last. */
  to: number;
  n: number;
  seconds: number;
}

const LENGTH_EDGES: { label: string; from: number; to: number }[] = [
  { label: '<15m', from: 0, to: 15 * 60 },
  { label: '15m', from: 15 * 60, to: 30 * 60 },
  { label: '30m', from: 30 * 60, to: 45 * 60 },
  { label: '45m', from: 45 * 60, to: 60 * 60 },
  { label: '1h', from: 60 * 60, to: 90 * 60 },
  { label: '90m', from: 90 * 60, to: 120 * 60 },
  { label: '2h+', from: 120 * 60, to: Infinity },
];

export interface Lengths {
  buckets: LengthBucket[];
  n: number;
  median: number;
  /** Which bucket holds the most hours, not the most sittings. */
  heaviest: number | null;
}

/**
 * Sittings sorted by length. Counted by sittings, with the hours each length
 * carried beside it, since twenty short sittings and two long ones can hold
 * the same afternoon. A sitting the reader did not end is left out.
 */
export function readLengths(sessions: Session[], window: Window): Lengths {
  const buckets: LengthBucket[] = LENGTH_EDGES.map((e) => ({ ...e, n: 0, seconds: 0 }));
  const lengths: number[] = [];
  for (const s of logged(sessions)) {
    if (!inWindow(s.date, window) || s.recovery) continue;
    const sec = clampSessionSeconds(s.durationSeconds);
    lengths.push(sec);
    const bucket = buckets.find((b) => sec >= b.from && sec < b.to);
    if (bucket) {
      bucket.n += 1;
      bucket.seconds += sec;
    }
  }
  let heaviest: number | null = null;
  buckets.forEach((b, i) => {
    if (b.seconds > 0 && (heaviest === null || b.seconds > buckets[heaviest].seconds)) heaviest = i;
  });
  return { buckets, n: lengths.length, median: median(lengths), heaviest };
}

/* ------------------------------------------------------------------ */
/* The list, in and out                                                 */
/* ------------------------------------------------------------------ */

export interface TaskFlowWeek {
  start: string;
  added: number;
  done: number;
}

export interface TaskFlow {
  weeks: TaskFlowWeek[];
  /** Open tasks past their date today. */
  overdue: number;
  /** Open tasks with a date in the next seven days. */
  dueSoon: number;
  /** The middle finished task's logged time, among finished tasks with any. */
  medianPerTask: number;
  /** Finished tasks that had time logged against them. */
  timedDone: number;
}

export const FLOW_WEEKS = 8;

export function readTaskFlow(tasks: Task[], sessions: Session[], today: string): TaskFlow {
  const thisMonday = mondayOf(today);
  const weeks: TaskFlowWeek[] = Array.from({ length: FLOW_WEEKS }, (_, i) => ({
    start: shiftIso(thisMonday, -7 * (FLOW_WEEKS - 1 - i)),
    added: 0,
    done: 0,
  }));
  const at = new Map(weeks.map((w) => [w.start, w]));

  const timeOn = new Map<string, number>();
  for (const s of logged(sessions)) {
    if (!s.taskId) continue;
    timeOn.set(s.taskId, (timeOn.get(s.taskId) ?? 0) + clampSessionSeconds(s.durationSeconds));
  }

  let overdue = 0;
  let dueSoon = 0;
  const perTask: number[] = [];
  const soon = shiftIso(today, 7);
  for (const t of tasks) {
    if (t.createdAt) {
      const w = at.get(mondayOf(t.createdAt.slice(0, 10)));
      if (w) w.added += 1;
    }
    if (t.completed) {
      if (t.completedVia === 'skip' || !t.completedAt) continue;
      const w = at.get(mondayOf(t.completedAt.slice(0, 10)));
      if (w) w.done += 1;
      const spent = timeOn.get(t.id) ?? 0;
      if (spent > 0) perTask.push(spent);
    } else if (t.dueDate) {
      if (t.dueDate < today) overdue += 1;
      else if (t.dueDate <= soon) dueSoon += 1;
    }
  }
  return { weeks, overdue, dueSoon, medianPerTask: median(perTask), timedDone: perTask.length };
}
