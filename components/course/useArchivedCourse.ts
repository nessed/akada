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
      const semesters = await db.getSemesters();
      for (const semester of semesters) {
        if (semester.isActive) continue;
        const courses = await db.getCoursesForSemester(semester.id);
        const course = courses.find((item) => item.id === id);
        if (!course) continue;
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
