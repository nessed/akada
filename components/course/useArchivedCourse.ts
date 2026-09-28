'use client';

import useSWR from 'swr';
import { db } from '@/lib/data';
import type { Course, Semester, Session } from '@/lib/data';

export interface ArchivedCourse {
  course: Course;
  semester: Semester;
  /** That semester's sessions, already narrowed to this course. */
  sessions: Session[];
}

/**
 * Finds a course that is not in the active semester.
 *
 * Courses, tasks and sessions all read through the active semester, so a link
 * to a course from a finished term resolves to nothing at all. Rather than
 * calling that "not found", which is a lie the reader can see through, the
 * page looks through the archive the same way the semester list in Settings
 * does and shows the term read-only.
 *
 * Only runs when `enabled`, i.e. once the active semester has been read and
 * the course was genuinely not in it, so the common case costs no requests.
 */
export function useArchivedCourse(courseId: string | null, enabled: boolean) {
  const { data, isLoading, error } = useSWR(
    enabled && courseId ? ['archived-course', courseId] : null,
    async ([, id]: [string, string]): Promise<ArchivedCourse | null> => {
      const closed = (await db.getSemesters()).filter((semester) => !semester.isActive);
      // Every closed term's courses at once rather than one term after
      // another. Read in order, so the first term, newest first, that has the
      // course wins, and a failed read only matters if it comes before it.
      const courseLists = await Promise.allSettled(closed.map((semester) => db.getCoursesForSemester(semester.id)));
      for (const [index, read] of courseLists.entries()) {
        if (read.status === 'rejected') throw read.reason;
        const course = read.value.find((item) => item.id === id);
        if (!course) continue;
        const semester = closed[index];
        const sessions = await db.getSessionsForSemester(semester.id);
        return {
          course,
          semester,
          sessions: sessions.filter((session) => session.courseId === course.id),
        };
      }
      return null;
    },
    { revalidateOnFocus: false },
  );

  return {
    archived: data ?? null,
    // Nothing is pending while the lookup is switched off.
    searching: enabled ? isLoading : false,
    error,
  };
}
