'use client';

import { useMemo } from 'react';
import { useCourses, useSessions, useTasks } from '../data-hooks';
import { sortCourses } from '../data/course-order';
import { withLiveSession } from '../live-session';
import { useLiveSession } from '../use-live-session';
import { isoDate } from '../utils';
import { readSittingEffect, type SittingEffect } from './effect';
import { readProgression, type Progression } from './index';

/**
 * The progression layer over the three lists every other screen already has,
 * with the sitting on the clock folded in.
 *
 * It reads through the same SWR caches as Today and Stats, so mounting the
 * Next Mark line on a page costs no extra request, and the line cannot
 * disagree with the hours drawn above it.
 *
 * Two readings come back. `progression` includes the running timer, or the
 * sitting waiting on the log sheet, so every distance in it moves while the
 * reader works. `logged` is the record as it stands, and the difference
 * between the two is `sitting`: what this sitting has done so far, which is
 * the line under the timer and the answer on the log sheet.
 */
export function useProgression(): {
  progression: Progression | null;
  /** The record without the sitting on the clock. Same object when there is none. */
  logged: Progression | null;
  /** What the running or pending sitting has done so far. Null when there is none. */
  sitting: SittingEffect | null;
  isLoading: boolean;
} {
  const { courses: raw, isLoading: coursesLoading } = useCourses();
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const live = useLiveSession();

  const isLoading = coursesLoading || sessionsLoading || tasksLoading;
  const today = isoDate();
  const courses = useMemo(() => sortCourses(raw), [raw]);

  const logged = useMemo(() => {
    if (isLoading) return null;
    return readProgression(courses, sessions, tasks, today);
  }, [isLoading, courses, sessions, tasks, today]);

  const progression = useMemo(() => {
    if (!logged || !live) return logged;
    return readProgression(courses, withLiveSession(sessions, live), tasks, today);
  }, [logged, live, courses, sessions, tasks, today]);

  const sitting = useMemo(() => {
    if (!logged || !progression || !live || progression === logged) return null;
    return readSittingEffect(logged, progression, courses, live.courseId, live.date);
  }, [logged, progression, live, courses]);

  return { progression, logged, sitting, isLoading };
}
