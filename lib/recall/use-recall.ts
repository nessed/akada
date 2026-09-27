'use client';

import { useMemo } from 'react';
import { useCourses, useNotes, useRecallRecords, useSessions, useTasks } from '../data-hooks';
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
  /**
   * Null until the rows have been read, and for as long as a read has failed
   * without one ever arriving. Every surface draws nothing and offers nothing
   * while it is null: rows are written whole, and an answer or a keep made
   * against rows that never loaded would write over whatever was stored.
   */
  reading: RecallReading | null;
  /** False on a database without the recall table; see RecallRecords. */
  available: boolean;
  isLoading: boolean;
} {
  const { courses: raw, isLoading: coursesLoading } = useCourses();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { records, loaded, available, isLoading: recallLoading } = useRecallRecords();
  // What a finished reading was worked by: without these a reading only
  // ticked would be read as one read, and drawn then taken back as they land.
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { notes, loaded: notesLoaded, error: notesError } = useNotes();

  const isLoading = coursesLoading || tasksLoading || recallLoading || sessionsLoading;
  const ready = !coursesLoading && !tasksLoading && !sessionsLoading && loaded && (notesLoaded || Boolean(notesError));
  const today = isoDate();
  const courses = useMemo(() => sortCourses(raw), [raw]);

  const reading = useMemo(
    () => (ready ? readRecall({ courses, tasks, records, today, sessions, notes }) : null),
    [ready, courses, tasks, records, today, sessions, notes],
  );

  return { reading, available, isLoading };
}
