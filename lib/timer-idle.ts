/**
 * When a running sitting has gone quiet, and where it went quiet.
 *
 * The timer's own heartbeat keeps a tab alive while it is open, so "the page
 * was seen" says nothing about whether anybody was at it: a laptop left open
 * on the timer through dinner used to log an eight-hour sitting, which then
 * set the longest-sitting record, struck "One sitting 3h" and made its reader
 * a night owl. Input is the better witness. The timer keeps `lastInputAt`
 * (a pointer, a key, a scroll, a touch, the page coming back into view, any
 * timer action) apart from `lastSeenAt`, and these rules read it.
 *
 * Tripping never throws a sitting away. It is held, and the log sheet opens
 * pre-trimmed to the quiet point with a way to keep the full time instead.
 */

/** A block that has run past its target with no input for this long is held. */
export const IDLE_AFTER_BLOCK_MS = 20 * 60 * 1000;
/** An untimed sitting with no input for this long is held. */
export const IDLE_OPEN_MS = 60 * 60 * 1000;
/** A quiet stretch shorter than this is not worth offering to trim. */
export const QUIET_MIN_MS = 5 * 60 * 1000;
/** Any sitting longer than this gets asked "is this right?" on the log sheet. */
export const LONG_SITTING_SECONDS = 4 * 60 * 60;

export interface IdleState {
  phase: 'focus' | 'break';
  isPaused: boolean;
  targetSeconds: number | null;
  lastInputAt: number;
  /** When the current stretch's clock last started running. */
  startedAt: number;
  /** What the current stretch had banked before `startedAt`, in ms. */
  accumulatedMs: number;
}

/** When the running block reached its target, or null for an open one. */
export function blockEndAt(state: IdleState): number | null {
  if (state.targetSeconds == null || state.phase !== 'focus') return null;
  return state.startedAt + Math.max(0, state.targetSeconds * 1000 - state.accumulatedMs);
}

/**
 * Whether the rule has tripped at `now`. Only a running focus stretch can go
 * quiet: a pause counts nothing already, and a break has its own ceiling.
 */
export function idleTripped(state: IdleState, now: number): boolean {
  if (state.isPaused || state.phase !== 'focus') return false;
  const quietFor = now - state.lastInputAt;
  const end = blockEndAt(state);
  if (end != null) return now >= end && quietFor >= IDLE_AFTER_BLOCK_MS;
  return quietFor >= IDLE_OPEN_MS;
}

/**
 * Where a sitting stopped at `stoppedAt` most believably ended: the last
 * input, or for a block the moment its target was reached if that came
 * later, since a block the reader set is its own evidence and only the
 * overrun past it is in doubt. Null when there is nothing worth trimming.
 */
export function quietPoint(state: IdleState, stoppedAt: number): number | null {
  if (state.phase !== 'focus') return null;
  const end = blockEndAt(state);
  // Never before the current stretch's clock started: a timer action (a
  // resume, a break ending) is itself input, so this only guards bad data.
  const at = Math.max(state.startedAt, state.lastInputAt, end != null && end < stoppedAt ? end : 0);
  return stoppedAt - at >= QUIET_MIN_MS ? at : null;
}
