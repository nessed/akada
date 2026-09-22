'use client';

import { useMemo } from 'react';
import { useCourses, useRecallRecords, useTasks } from '../data-hooks';
import { sortCourses } from '../data/course-order';
import { isoDate } from '../utils';
import { readRecall, type RecallReading } from './index';

/**
 * Recall, read over the lists every screen already has.
 *
 * Courses and tasks come through the same SWR caches as Today, and the rows
 * through one of their own, so Today, a course page, the task sheet and the
 * Coming panel all read one answer and cannot disagree about what is due.
 */
export function useRecall(): {
  reading: RecallReading | null;
  /** False on a database without the recall table; see RecallRecords. */
  available: boolean;
  isLoading: boolean;
} {
  const { courses: raw, isLoading: coursesLoading } = useCourses();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { records, available, isLoading: recallLoading } = useRecallRecords();

  const isLoading = coursesLoading || tasksLoading || recallLoading;
  const today = isoDate();
  const courses = useMemo(() => sortCourses(raw), [raw]);

  const reading = useMemo(
    () => (isLoading ? null : readRecall({ courses, tasks, records, today })),
    [isLoading, courses, tasks, records, today],
  );

  return { reading, available, isLoading };
}
