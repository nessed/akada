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
import type { Course, Session } from '../data';

/**
 * The last result for the last inputs, compared by identity.
 *
 * A screen mounts several readers at once (Today has the page, the margin,
 * the Next Mark line, the log sheet and two start popovers), and while the
 * clock runs each of them re-reads the term every second. They all read the
 * same SWR lists, so the reading is worked out once and handed to the rest.
 * readProgression is pure, so the shared answer is the one each would have
 * worked out for itself.
 */
function lastResult<R>() {
  let lastKey: readonly unknown[] | null = null;
  let last: R;
  return (key: readonly unknown[], compute: () => R): R => {
    if (lastKey && key.length === lastKey.length && key.every((part, i) => Object.is(part, lastKey![i]))) {
      return last;
    }
    last = compute();
    lastKey = key;
    return last;
  };
}

const sharedCourses = lastResult<Course[]>();
const sharedLogged = lastResult<Progression>();
const sharedLive = lastResult<Progression>();
const sharedSitting = lastResult<SittingEffect | null>();

/** Every field of the live row, so two readers holding equal rows match. */
function liveKey(live: Session): string {
  return [live.id, live.courseId, live.taskId, live.date, live.durationSeconds].join('\u0000');
}

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
  const courses = useMemo(() => sharedCourses([raw], () => sortCourses(raw)), [raw]);

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

  // The bias is read afresh by each reader, so it is compared by what it
  // says rather than by which object holds it.
  const biasKey = useMemo(() => JSON.stringify(bias), [bias]);

  const logged = useMemo(() => {
    if (isLoading) return null;
    return sharedLogged([courses, sessions, tasks, today, biasKey], () =>
      readProgression(courses, sessions, tasks, today, { bias }),
    );
  }, [isLoading, courses, sessions, tasks, today, bias, biasKey]);

  const progression = useMemo(() => {
    if (!logged || !live) return logged;
    return sharedLive([logged, liveKey(live)], () =>
      readProgression(courses, withLiveSession(sessions, live), tasks, today, { bias }),
    );
  }, [logged, live, courses, sessions, tasks, today, bias]);

  const sitting = useMemo(() => {
    if (!logged || !progression || !live || progression === logged) return null;
    return sharedSitting([logged, progression, courses, live.courseId, live.date], () =>
      readSittingEffect(logged, progression, courses, live.courseId, live.date),
    );
  }, [logged, progression, live, courses]);

  return { progression, logged, sitting, isLoading };
}
