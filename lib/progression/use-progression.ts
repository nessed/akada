'use client';

import { useMemo } from 'react';
import { useCourses, useSessions, useTasks } from '../data-hooks';
import { sortCourses } from '../data/course-order';
import { isoDate } from '../utils';
import { readProgression, type Progression } from './index';

/**
 * The progression layer over the three lists every other screen already has.
 *
 * It reads through the same SWR caches as Today and Stats, so mounting the
 * Next Mark line on a page costs no extra request, and the line cannot
 * disagree with the hours drawn above it.
 */
export function useProgression(): {
  progression: Progression | null;
  isLoading: boolean;
} {
  const { courses: raw, isLoading: coursesLoading } = useCourses();
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();

  const isLoading = coursesLoading || sessionsLoading || tasksLoading;
  const today = isoDate();

  const progression = useMemo(() => {
    if (isLoading) return null;
    return readProgression(sortCourses(raw), sessions, tasks, today);
  }, [isLoading, raw, sessions, tasks, today]);

  return { progression, isLoading };
}
