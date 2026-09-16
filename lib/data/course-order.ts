import type { Course } from './types';

/**
 * How a course list is ordered everywhere it is read.
 *
 * `position` is what the student dragged the card into. It is optional on
 * purpose: rows written before the column existed, and any project that has
 * not re-run supabase/schema.sql, simply have none, and those fall back to
 * the implicit order the app used before this, oldest course first. Ordering
 * a mixed list this way keeps the explicitly placed courses at the top in
 * their chosen order and leaves the rest in the order they always had.
 */
export function compareCourseOrder(a: Course, b: Course): number {
  const ap = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
  const bp = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
  if (ap !== bp) return ap - bp;
  return a.createdAt.localeCompare(b.createdAt);
}

/** A sorted copy, never sorting the caller's array in place. */
export function sortCourses(courses: Course[]): Course[] {
  return [...courses].sort(compareCourseOrder);
}

/** The position a newly added course takes: after everything already there. */
export function nextCoursePosition(courses: Course[]): number {
  let top = -1;
  for (const course of courses) {
    if (typeof course.position === 'number' && course.position > top) {
      top = course.position;
    }
  }
  return top + 1;
}
