'use client';

import { useMemo } from 'react';
import { pickUpNext } from '@/lib/derive';
import { useSessions, useTasks } from '@/lib/data-hooks';
import { usePreferences, type Preferences } from '@/lib/preferences';
import { isLoggableDuration } from '@/lib/session-safety';
import { isoDate } from '@/lib/utils';
import type { Session, Task } from '@/lib/data/types';

/**
 * The one task the app asks for next.
 *
 * Today's Up next and the rail's start both read it, so the two can never
 * offer different tasks. The pool is the reader's open work, split the way
 * pickUpNext wants it: overdue, due today, and everything still open (the
 * resumed task can sit outside the first two).
 */
export function upNextFrom(
  tasks: Task[],
  sessions: Session[],
  sort: Preferences['upNextSort'],
  today: string = isoDate(),
): Task | null {
  const open = tasks.filter((t) => !t.completed);
  const dueToday = open.filter((t) => t.dueDate === today);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  return pickUpNext(sort, overdue, dueToday, sessions, open);
}

/** Up next from anywhere, read off the logged record rather than the clock. */
export function useUpNext(): Task | null {
  const { tasks } = useTasks();
  const { sessions } = useSessions();
  const [prefs] = usePreferences();
  return useMemo(
    () =>
      upNextFrom(
        tasks,
        sessions.filter((s) => isLoggableDuration(s.durationSeconds)),
        prefs.upNextSort,
      ),
    [tasks, sessions, prefs.upNextSort],
  );
}
