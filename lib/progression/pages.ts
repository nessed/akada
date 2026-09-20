import type { Course } from '../data';
import { FIRST_MARK_SECONDS, MARKS_PER_PAGE, MARK_SECONDS } from './constants';
import type { DayCredit } from './credit';

/**
 * A course's record: marks in the margin, pages bound, the page open now.
 *
 * A mark is a flat distance of credited time. There are no bands, no
 * multiplier and no rate that moves with consistency. That was considered and
 * cut: it is the most complicated piece in the whole design and all it moves
 * is a cosmetic quantity. The one exception is the first mark on a course,
 * which is shorter so that a course added this morning can be marked this
 * afternoon. The distance is shortened, never pre-filled.
 */

export interface CoursePages {
  courseId: string;
  /** Credited seconds banked against this course over the whole term. */
  seconds: number;
  /** Marks inked, ever. */
  marks: number;
  /** Pages bound, ever. A bound page stays in the record permanently. */
  bound: number;
  /** Marks on the page currently open, 0 to MARKS_PER_PAGE - 1. */
  onPage: number;
  /** Credited seconds still to go before the next mark. */
  toNextMark: number;
  /** Marks still to go before this page binds. */
  toBind: number;
  /** Marks inked today, which is what caps the plain Next Mark candidates. */
  markedToday: number;
}

/** Marks earned by a running total, with the first one discounted. */
export function marksFor(seconds: number): number {
  if (seconds < FIRST_MARK_SECONDS) return 0;
  return 1 + Math.floor((seconds - FIRST_MARK_SECONDS) / MARK_SECONDS);
}

/** Credited seconds at which the nth mark lands (n counted from one). */
function secondsForMark(n: number): number {
  if (n <= 0) return 0;
  return FIRST_MARK_SECONDS + (n - 1) * MARK_SECONDS;
}

export function readPages(
  courses: Course[],
  ledger: DayCredit[],
  today: string,
): Map<string, CoursePages> {
  const totals = new Map<string, number>();
  const beforeToday = new Map<string, number>();

  for (const entry of ledger) {
    for (const [courseId, seconds] of entry.byCourse) {
      totals.set(courseId, (totals.get(courseId) ?? 0) + seconds);
      if (entry.iso < today) {
        beforeToday.set(courseId, (beforeToday.get(courseId) ?? 0) + seconds);
      }
    }
  }

  const out = new Map<string, CoursePages>();
  for (const course of courses) {
    const seconds = totals.get(course.id) ?? 0;
    const marks = marksFor(seconds);
    const bound = Math.floor(marks / MARKS_PER_PAGE);
    const onPage = marks % MARKS_PER_PAGE;
    out.set(course.id, {
      courseId: course.id,
      seconds,
      marks,
      bound,
      onPage,
      toNextMark: Math.max(0, secondsForMark(marks + 1) - seconds),
      toBind: MARKS_PER_PAGE - onPage,
      markedToday: marks - marksFor(beforeToday.get(course.id) ?? 0),
    });
  }
  return out;
}

/** Marks inked across every course today. */
export function marksToday(pages: Map<string, CoursePages>): number {
  let total = 0;
  for (const entry of pages.values()) total += entry.markedToday;
  return total;
}
