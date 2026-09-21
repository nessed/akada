'use client';

import { useMemo } from 'react';
import type { Session } from './data';
import { liveSession } from './live-session';
import { useTimer } from './timer-context';

/**
 * The sitting on the clock, or the one waiting on the log sheet, as a
 * session. Null when neither exists.
 *
 * A sitting that has been stopped but not yet saved counts too: the log
 * sheet is the one place the reader is asked to look at what the sitting
 * did, and the answer has to include the sitting itself.
 *
 * Recomputed once a second while the clock runs, because `focusSeconds` is.
 * That is the cost of a line that moves, and it is a small one: the whole
 * progression layer is a few passes over a term's worth of rows.
 */
export function useLiveSession(): Session | null {
  const { active, pendingLog, focusSeconds } = useTimer();

  return useMemo(() => {
    if (active) {
      return liveSession({
        courseId: active.courseId,
        taskId: active.taskId,
        date: active.startedDate,
        focusSeconds,
        key: active.sessionId,
      });
    }
    if (pendingLog) {
      return liveSession({
        courseId: pendingLog.courseId,
        taskId: pendingLog.taskId,
        date: pendingLog.date,
        focusSeconds: pendingLog.durationSeconds,
        key: `pending-${pendingLog.date}-${pendingLog.courseId}`,
      });
    }
    return null;
  }, [active, pendingLog, focusSeconds]);
}
