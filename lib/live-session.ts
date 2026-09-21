import type { Session } from './data';
import { clampSessionSeconds, isLoggableDuration } from './session-safety';

/**
 * The sitting on the clock, read as the session it is about to become.
 *
 * Every hour count in the app used to read logged sessions and nothing else,
 * which meant a line saying "20 minutes to the next mark" sat there saying
 * twenty for the whole forty minutes the timer ran underneath it. The
 * distance only moved once the sitting was logged, at which point the reader
 * had already stood up. A prompt that does not move while you act on it is
 * not a prompt; it is a caption.
 *
 * So the running sitting is folded in as one more session, marked so nothing
 * can mistake it for a record. It has the shape it will have when logged: the
 * course, the task, the date it started on, and the focus time so far with
 * the breaks left out. Nothing is written anywhere; the moment the clock is
 * discarded it is gone, and the moment it is logged the real row takes its
 * place and every reading stays exactly where it was.
 */

export const LIVE_SESSION_PREFIX = 'live:';

export interface LiveSitting {
  courseId: string;
  taskId: string | null;
  /** The planner date the sitting started on, which is the date it logs to. */
  date: string;
  /** Focus so far, breaks excluded. */
  focusSeconds: number;
  /** Stable for the life of the sitting, so the synthetic row keeps its id. */
  key: string;
}

export function liveSession(sitting: LiveSitting | null): Session | null {
  if (!sitting) return null;
  const durationSeconds = clampSessionSeconds(sitting.focusSeconds);
  if (!isLoggableDuration(durationSeconds)) return null;
  return {
    id: `${LIVE_SESSION_PREFIX}${sitting.key}`,
    courseId: sitting.courseId,
    taskId: sitting.taskId,
    date: sitting.date,
    durationSeconds,
    note: '',
    createdAt: `${sitting.date}T00:00:00.000Z`,
  };
}

export function isLiveSession(session: Pick<Session, 'id'>): boolean {
  return session.id.startsWith(LIVE_SESSION_PREFIX);
}

/** The logged sessions with the sitting on the clock added on the end. */
export function withLiveSession(sessions: Session[], live: Session | null): Session[] {
  return live ? [...sessions, live] : sessions;
}
