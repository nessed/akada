'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCourses, useSessions, useTasks } from '../data-hooks';
import { sortCourses } from '../data/course-order';
import { withLiveSession } from '../live-session';
import { useLiveSession } from '../use-live-session';
import { isoDate } from '../utils';
import { readSittingEffect, type SittingEffect } from './effect';
import { readProgression, type Progression } from './index';
import { readRankingBias, seedLedgerFromServer } from './log';

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

  /* The impressions the server already holds, pulled into the device's
     ledger once. Without this the ranking would start its education on the
     day the learning shipped while a term of evidence sat in the database
     unread. Bumps `seeded`, which re-reads the bias below. */
  const [seeded, setSeeded] = useState(0);
  useEffect(() => {
    let live = true;
    void seedLedgerFromServer().then((changed) => {
      if (changed && live) setSeeded((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  // What the reader has done with each kind of line before. Read again when
  // the record changes, which is also when a followed line is written, so
  // the ranking picks the lesson up on the next sitting.
  const bias = useMemo(
    () => readRankingBias(),
    // sessions is the clock this is read against: a followed line is written
    // when a sitting starts, and the record changes when it is logged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, seeded],
  );

  const logged = useMemo(() => {
    if (isLoading) return null;
    return readProgression(courses, sessions, tasks, today, { bias });
  }, [isLoading, courses, sessions, tasks, today, bias]);

  const progression = useMemo(() => {
    if (!logged || !live) return logged;
    return readProgression(courses, withLiveSession(sessions, live), tasks, today, { bias });
  }, [logged, live, courses, sessions, tasks, today, bias]);

  const sitting = useMemo(() => {
    if (!logged || !progression || !live || progression === logged) return null;
    return readSittingEffect(logged, progression, courses, live.courseId, live.date);
  }, [logged, progression, live, courses]);

  return { progression, logged, sitting, isLoading };
}
