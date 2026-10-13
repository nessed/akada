import type { Session, SessionSegment } from './data';
import { liveSession } from './live-session';
import { clampSessionSeconds, sanitizeSegments } from './session-safety';

/**
 * The sitting on the clock, written to the server so the connector can see it.
 *
 * The timer lives in the browser, and a sitting only reached the database as
 * a session once it was finished and logged. Three hours into a sitting with
 * two breaks behind it, an assistant asked "how am I doing today" read zero,
 * and one asked to log the time would log it a second time on top of what the
 * app logs at the end.
 *
 * So the app writes this snapshot onto `user_settings.live_sitting` at the
 * moments the sitting changes shape (it starts, it is held or let go, a break
 * starts or ends, the block's note is written, it stops) and every ten
 * minutes while it is open, and writes null once it is logged or thrown away.
 * It is not written every second, and does not need to be: it carries when
 * the stretch in progress started running, so the reader works the time out
 * to the second from that, the same arithmetic the timer face does.
 *
 * Nothing here is a record. The session row the app writes at the end is the
 * record; this is overwritten in place and gone the moment that row exists.
 */

/** How often an open sitting is written when nothing about it has changed. */
export const LIVE_SITTING_HEARTBEAT_MS = 10 * 60 * 1000;

/**
 * Past this with no write, a sitting said to be running is read as of its
 * last write rather than run on to now. Two heartbeats and change: one write
 * lost to a flaky connection is not a reason to doubt it, but a laptop that
 * was shut is, and counting the hours it sat shut would be making them up.
 */
export const LIVE_SITTING_QUIET_MS = 25 * 60 * 1000;

/** A sitting not heard from, or stopped and never logged, stops being mentioned after this. */
const UNLOGGED_SHELF_MS = 48 * 60 * 60 * 1000;

const NOTE_MAX = 200;

export interface LiveSittingSnapshot {
  v: 1;
  /** The timer's own id for the sitting, stable for its life. */
  id: string;
  course_id: string;
  task_id: string | null;
  /** The planner date the sitting started on, which is the date it logs to. */
  date: string;
  /** `stopped` is finished on the clock and waiting on the log sheet. */
  phase: 'focus' | 'break' | 'stopped';
  paused: boolean;
  started_at: string;
  /** When the stretch in progress began, pauses included. Null once stopped. */
  stretch_started_at: string | null;
  /** When the stretch in progress last started counting, or null while held. */
  running_since: string | null;
  /** What the stretch in progress had counted before `running_since`. */
  stretch_seconds: number;
  /** The block's target, null for an open block. */
  target_seconds: number | null;
  /** How long this sitting's breaks run, null when it takes none. */
  break_target_seconds: number | null;
  /** Stretches already finished, oldest first, with any note on a block. */
  segments: SessionSegment[];
  /** Only for `stopped`: what the log sheet is holding. */
  focus_seconds?: number;
  break_seconds?: number;
  written_at: string;
}

/** The timer's fields this reads. Structural, so the timer keeps its own type. */
export interface RunningSittingState {
  sessionId: string;
  courseId: string;
  taskId: string | null;
  startedDate: string;
  phase: 'focus' | 'break';
  isPaused: boolean;
  startedAt: number;
  accumulatedMs: number;
  sittingStartedAt: number;
  stretchStartedAt: number;
  targetSeconds: number | null;
  breakSeconds: number | null;
  segments: SessionSegment[];
}

export interface StoppedSittingState {
  courseId: string;
  taskId: string | null;
  date: string;
  durationSeconds: number;
  breakSeconds: number;
  segments: SessionSegment[];
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function snapshotRunning(state: RunningSittingState, now: number): LiveSittingSnapshot {
  return {
    v: 1,
    id: state.sessionId,
    course_id: state.courseId,
    task_id: state.taskId,
    date: state.startedDate,
    phase: state.phase,
    paused: state.isPaused,
    started_at: iso(state.sittingStartedAt),
    stretch_started_at: iso(state.stretchStartedAt),
    running_since: state.isPaused ? null : iso(state.startedAt),
    stretch_seconds: clampSessionSeconds(state.accumulatedMs / 1000),
    target_seconds: state.targetSeconds,
    break_target_seconds: state.breakSeconds,
    segments: state.segments,
    written_at: iso(now),
  };
}

export function snapshotStopped(log: StoppedSittingState, now: number): LiveSittingSnapshot {
  const first = log.segments[0]?.startedAt;
  return {
    v: 1,
    id: `stopped-${log.date}-${log.courseId}`,
    course_id: log.courseId,
    task_id: log.taskId,
    date: log.date,
    phase: 'stopped',
    paused: false,
    started_at: first ?? iso(now),
    stretch_started_at: null,
    running_since: null,
    stretch_seconds: 0,
    target_seconds: null,
    break_target_seconds: null,
    segments: log.segments,
    focus_seconds: clampSessionSeconds(log.durationSeconds),
    break_seconds: clampSessionSeconds(log.breakSeconds),
    written_at: iso(now),
  };
}

/**
 * What decides whether the server needs a fresh copy. Everything the reader
 * can change by hand is in it; the clock's own ticking and the heartbeat the
 * timer writes into its state are not, so a running sitting is not written
 * every time the page notices the reader moved the mouse.
 */
export function snapshotKey(snapshot: LiveSittingSnapshot | null): string {
  if (!snapshot) return 'none';
  const { written_at: _w, ...rest } = snapshot;
  void _w;
  return JSON.stringify(rest);
}

/** What the connector says about the sitting on the clock. */
export interface LiveSittingReading {
  id: string;
  course_id: string;
  task_id: string | null;
  date: string;
  /** `focus`, `break` or `paused` while open; `stopped` when it waits on the log sheet. */
  state: 'focus' | 'break' | 'paused' | 'stopped';
  started_at: string;
  focus_seconds: number;
  break_seconds: number;
  /** The stretch on the clock: this block, or this break. Absent once stopped. */
  current_stretch_seconds?: number;
  current_stretch_target_seconds?: number | null;
  blocks_done: number;
  breaks_taken: number;
  /** What the reader wrote about each finished block, in order, blank ones left out. */
  block_notes: string[];
  last_synced_at: string;
  /**
   * True when the app has not been heard from in a while and the figures are
   * as of `last_synced_at` rather than now: the page was likely closed, and
   * the app will settle the sitting the next time it is opened.
   */
  quiet: boolean;
}

function readTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * The stored snapshot, worked out to `now`. Null for anything that is not a
 * snapshot, a stopped sitting left unlogged for days, or one that counts
 * nothing yet.
 */
export function readLiveSitting(raw: unknown, now: number): LiveSittingReading | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = readString(row.id);
  const courseId = readString(row.course_id);
  const date = readString(row.date);
  const writtenAt = readTime(row.written_at);
  const phase = row.phase;
  if (!id || !courseId || !date || writtenAt == null) return null;
  if (phase !== 'focus' && phase !== 'break' && phase !== 'stopped') return null;
  const segments = sanitizeSegments(row.segments);
  const finished = (kind: SessionSegment['kind']) =>
    segments.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.seconds, 0);
  const blockNotes = segments
    .filter((s) => s.kind === 'focus')
    .map((s) => (s.note ?? '').trim().slice(0, NOTE_MAX))
    .filter(Boolean);
  const base = {
    id,
    course_id: courseId,
    task_id: readString(row.task_id),
    date,
    started_at: readString(row.started_at) ?? new Date(writtenAt).toISOString(),
    blocks_done: segments.filter((s) => s.kind === 'focus').length,
    breaks_taken: segments.filter((s) => s.kind === 'break').length,
    block_notes: blockNotes,
    last_synced_at: new Date(writtenAt).toISOString(),
  };

  if (phase === 'stopped') {
    if (now - writtenAt > UNLOGGED_SHELF_MS) return null;
    const focus = clampSessionSeconds(row.focus_seconds ?? finished('focus'));
    if (focus <= 0) return null;
    return {
      ...base,
      state: 'stopped',
      focus_seconds: focus,
      break_seconds: clampSessionSeconds(row.break_seconds ?? finished('break')),
      quiet: false,
    };
  }

  // A page shut on a running clock is settled by the app the next time it
  // opens; until then it is reported as quiet, and after two days not at all.
  if (now - writtenAt > UNLOGGED_SHELF_MS) return null;
  const paused = row.paused === true;
  const runningSince = paused ? null : readTime(row.running_since);
  const quiet = now - writtenAt > LIVE_SITTING_QUIET_MS;
  // A quiet page is read as of its last word, not run on through the hours
  // it may have sat shut. A clock skewed ahead of the server never counts
  // backwards either.
  const until = quiet ? writtenAt : Math.max(now, writtenAt);
  const running = runningSince == null ? 0 : Math.max(0, (until - runningSince) / 1000);
  const stretch = clampSessionSeconds(clampSessionSeconds(row.stretch_seconds) + running);
  const target = (value: unknown) => {
    const n = Number(value);
    return value != null && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  return {
    ...base,
    state: paused ? 'paused' : phase,
    focus_seconds: clampSessionSeconds(finished('focus') + (phase === 'focus' ? stretch : 0)),
    break_seconds: clampSessionSeconds(finished('break') + (phase === 'break' ? stretch : 0)),
    current_stretch_seconds: stretch,
    current_stretch_target_seconds: target(phase === 'break' ? row.break_target_seconds : row.target_seconds),
    quiet,
  };
}

/**
 * The reading as the session it is about to become, so a tool that counts
 * hours counts it the way the app's screens do (lib/live-session.ts).
 */
export function liveSittingSession(reading: LiveSittingReading | null): Session | null {
  if (!reading) return null;
  return liveSession({
    courseId: reading.course_id,
    taskId: reading.task_id,
    date: reading.date,
    focusSeconds: reading.focus_seconds,
    key: reading.id,
  });
}
