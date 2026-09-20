import type { Course, Session, Task } from '../data';
import { clampSessionSeconds, isLoggableDuration } from '../session-safety';
import {
  COURSE_TAPER,
  DAY_TAPER,
  PAGE_CREDIT_CEILING_PER_DAY,
  PAGE_SECONDS,
  TASK_TICKS_PER_COURSE_PER_DAY,
  TASK_TICK_SECONDS,
  type Taper,
} from './constants';

/**
 * Claimed effort, converted into the only currency the game layer spends:
 * credited seconds, per course, per day.
 *
 * Two readings of the same sessions live side by side in this app and must
 * never be confused. Stats, the heatmap, the weekly bars and every export
 * report true unmodified hours. This file reports the tapered, bounded,
 * game-layer reading, and nothing outside `lib/progression` may read it. A
 * capped hour is not a shorter hour; it is an hour the pages decline to
 * reward twice.
 */

export interface DayCredit {
  iso: string;
  /** Credited seconds by course id, after both tapers. */
  byCourse: Map<string, number>;
  /** Credited seconds across every course that day. */
  total: number;
  /** True seconds logged that day, untapered. What the rest of the app shows. */
  rawTotal: number;
  /** True seconds logged by course, untapered. */
  rawByCourse: Map<string, number>;
  /** Tasks ticked that day, by course id. */
  ticksByCourse: Map<string, number>;
  /** Pages recorded on tasks finished that day. */
  pages: number;
  /** Whether either taper actually bit, so the copy can say so plainly. */
  tapered: boolean;
}

function taper(seconds: number, rule: Taper): number {
  if (seconds <= rule.full) return seconds;
  const over = seconds - rule.full;
  if (over <= rule.span) return rule.full + over * rule.secondRate;
  return rule.full + rule.span * rule.secondRate + (over - rule.span) * rule.tailRate;
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

/**
 * The whole ledger in one pass over sessions and tasks.
 *
 * Returned oldest day first, with only days that carry something. Days with
 * nothing on them are absent rather than zero, because every consumer walks
 * the calendar itself and a sparse map is cheaper than a term of blanks.
 */
export function readCredit(courses: Course[], sessions: Session[], tasks: Task[]): DayCredit[] {
  const known = new Set(courses.map((c) => c.id));
  const days = new Map<string, DayCredit>();

  const day = (iso: string): DayCredit => {
    let entry = days.get(iso);
    if (!entry) {
      entry = {
        iso,
        byCourse: new Map(),
        total: 0,
        rawTotal: 0,
        rawByCourse: new Map(),
        ticksByCourse: new Map(),
        pages: 0,
        tapered: false,
      };
      days.set(iso, entry);
    }
    return entry;
  };

  // Pass one: real logged time, and the time logged against each task, which
  // is the bound a typed page count has to live inside.
  const secondsByTask = new Map<string, number>();
  for (const session of sessions) {
    if (!isLoggableDuration(session.durationSeconds)) continue;
    if (!known.has(session.courseId)) continue;
    const seconds = clampSessionSeconds(session.durationSeconds);
    const entry = day(session.date);
    add(entry.rawByCourse, session.courseId, seconds);
    entry.rawTotal += seconds;
    if (session.taskId) add(secondsByTask, session.taskId, seconds);
  }

  // Pass two: the cheap inputs. A tick is worth minutes and only the first
  // few on a course in a day; pages are worth a twelfth of a minute each and
  // cannot exceed the session that was actually logged against that task.
  const finishedOn = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.completed || !task.completedAt) continue;
    if (!known.has(task.courseId)) continue;
    const iso = task.completedAt.slice(0, 10);
    const entry = day(iso);
    add(entry.ticksByCourse, task.courseId, 1);
    entry.pages += task.pages || 0;
    const bucket = finishedOn.get(iso);
    if (bucket) bucket.push(task);
    else finishedOn.set(iso, [task]);
  }

  const ordered = [...days.values()].sort((a, b) => a.iso.localeCompare(b.iso));

  for (const entry of ordered) {
    const contributions = new Map(entry.rawByCourse);

    for (const [courseId, ticks] of entry.ticksByCourse) {
      const counted = Math.min(ticks, TASK_TICKS_PER_COURSE_PER_DAY);
      add(contributions, courseId, counted * TASK_TICK_SECONDS);
    }

    // Pages, bounded by the task's own logged session and then by the day.
    let pageBudget = PAGE_CREDIT_CEILING_PER_DAY;
    for (const task of finishedOn.get(entry.iso) ?? []) {
      if (!task.pages) continue;
      const claimed = task.pages * PAGE_SECONDS;
      const covered = secondsByTask.get(task.id) ?? 0;
      const credited = Math.min(claimed, covered, pageBudget);
      if (credited <= 0) continue;
      pageBudget -= credited;
      add(contributions, task.courseId, credited);
    }

    // Taper per course, then taper the day, spreading the day's cut across
    // the courses in proportion so no single course absorbs all of it.
    let perCourseTotal = 0;
    const tapered = new Map<string, number>();
    for (const [courseId, seconds] of contributions) {
      const value = taper(seconds, COURSE_TAPER);
      if (value < seconds - 1) entry.tapered = true;
      tapered.set(courseId, value);
      perCourseTotal += value;
    }

    const dayValue = taper(perCourseTotal, DAY_TAPER);
    if (dayValue < perCourseTotal - 1) entry.tapered = true;
    const scale = perCourseTotal > 0 ? dayValue / perCourseTotal : 0;

    for (const [courseId, seconds] of tapered) entry.byCourse.set(courseId, seconds * scale);
    entry.total = dayValue;
  }

  return ordered;
}

/** The day's entry, or an empty one, so callers never branch on absence. */
export function creditOn(ledger: DayCredit[], iso: string): DayCredit | null {
  return ledger.find((d) => d.iso === iso) ?? null;
}
