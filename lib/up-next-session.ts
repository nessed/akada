import type { WeakPoint } from './data/types';
import { HABIT_MIN_BLOCKS, hourLabel, roughMinutes, settled, usualStopOffset, type Habits } from './progression/habits';
import { shiftDate } from './student-day';
import type { UpNextCandidate } from './up-next';
import { shortCode } from './up-next-copy';
import { rankWeakPoints } from './weak-points';

/**
 * How long Up next's session is, and what it starts with.
 *
 * This module decides the length only. It never reorders: the pick comes from
 * the record and the date (./up-next.ts), and the clock is allowed to touch
 * nothing but the figure on the Start button. That is the line that lets the
 * pick hold still all evening while the session under it shrinks to fit.
 *
 * The length is the reader's own before it is anything else: the median of
 * their blocks on the course once there are enough of them, then of all their
 * blocks, then the length they last started from the popover, then 45. It is
 * shortened for three reasons and no others: a reading that needs less than
 * that to finish, an evening that has less than that left in it, and a return
 * after four quiet days, where a short first session is the one that happens.
 * Nothing here knows the daily goal, and nothing here shortens a session for
 * having met it: those would be reward and permission lines, and the session
 * is a plan, not a prize.
 *
 * Pure. `now` comes in as a number, so a test can build the same instants the
 * code does and hold in any time zone.
 */

export const SESSION_FLOOR_MINUTES = 10;
export const USUAL_MIN_MINUTES = 15;
export const USUAL_MAX_MINUTES = 90;
/** The same default the start popover opens on. */
export const DEFAULT_BLOCK_MINUTES = 45;
/** A first session back after RETURNING_QUIET_DAYS: short enough to start. */
export const RETURN_MINUTES = 25;
/** The usual stop only stands while there is this much evening before it. */
const HABIT_STOP_MARGIN_MS = 15 * 60_000;
/** A reading within five minutes of its estimate has already overrun it. */
const READING_LEFT_MIN_SECONDS = 5 * 60;

export { hourLabel };

/**
 * When tonight ends, for sizing. `from: 'habit'` is where this reader's
 * evenings usually stop (usualStopOffset, nine tenths of their placed focus);
 * `from: 'day'` is the end of their day, midnight or the hour they moved it
 * to. `label` is that instant's hour in words ("11pm", "midnight").
 */
export interface Tonight {
  at: number;
  from: 'habit' | 'day';
  label: string;
  minutesLeft: number;
}

/** The local instant `hour` hours into the calendar date `iso`; 24 and past roll into the next day. */
function localHour(iso: string, hour: number): number {
  const d = new Date(`${iso}T00:00:00`);
  d.setHours(hour);
  return d.getTime();
}

/**
 * The end of tonight: the usual stop while there is a quarter of an hour of
 * evening before it, and the end of the day after that, so a reader still at
 * it past their usual eleven is sized to midnight rather than to nothing.
 *
 * The day starts at `today` at the hour it ends (the instant dayStartsAt
 * gives, worked out here from its inputs rather than from storage), and the
 * usual stop is that many wall-clock hours on, set with setHours rather than
 * added as milliseconds, because the hours it was learned from are local
 * clock hours and a daylight-saving night should not move it by one.
 */
export function readTonight(a: { today: string; now: number; dayEndingHour: number; habits: Habits | null }): Tonight {
  const endHour = Number.isFinite(a.dayEndingHour) ? Math.max(0, Math.floor(a.dayEndingHour)) : 0;
  const dayEnd = localHour(shiftDate(a.today, 1), endHour);
  const offset = a.habits ? usualStopOffset(a.habits.hours, a.habits.placedSittings, endHour) : null;
  const habitEnd = offset != null && offset < 24 ? localHour(a.today, endHour + offset) : null;
  const useHabit = habitEnd != null && habitEnd - a.now >= HABIT_STOP_MARGIN_MS;
  const at = useHabit ? (habitEnd as number) : dayEnd;
  return {
    at,
    from: useHabit ? 'habit' : 'day',
    label: hourLabel(new Date(at).getHours()),
    minutesLeft: Math.max(0, Math.floor((at - a.now) / 60_000)),
  };
}

export interface UpNextSession {
  minutes: number;
  /**
   * Why that length. `usual` the reader's own blocks; `last` the length last
   * started, before blocks settle; `return` capped for a first session back;
   * `finishes` what the reading has left; `fits` what the evening has left.
   */
  basis: 'usual' | 'last' | 'return' | 'finishes' | 'fits';
  /** "11pm", "midnight": when basis is 'fits' and the session ends by then. */
  stopLabel: string | null;
  reading: {
    pages: number;
    pagesLeft: number;
    pagesThisSession: number;
    pagesPerHour: number;
    /** The reader's own pace (the course's, or measured overall), not the shipped default. */
    measured: boolean;
    finishes: boolean;
  } | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const ceil5 = (n: number) => Math.ceil(n / 5) * 5;
const floor5 = (n: number) => Math.floor(n / 5) * 5;

/**
 * The session for one candidate.
 *
 * 1. The usual length: the course's settled block median, else the settled
 *    median of every block, else the last length started (45 before any),
 *    rounded to five and held between 15 and 90. The same source the start
 *    popover opens on, so the two do not offer different lengths.
 * 2. A first session back is capped at 25. No copy names the gap.
 * 3. A paged reading knows what it has left: its pages at the reader's pace,
 *    less the time already on it. One within five minutes of its estimate has
 *    overrun it, and gets no estimate rather than a wrong one.
 * 4. Tonight, when known, caps it at the evening left, to the five below.
 * 5. The shortest of those, never under ten. `finishes` when the reading's
 *    time left is what set it (a tie with the usual or the evening goes to
 *    finishing, since the session does finish it and saying so is the more
 *    useful thing); `fits` when the evening alone set it. The stop is named
 *    only when the session ends by it: with under ten minutes left the floor
 *    runs past it, and "before midnight" beside a ten-minute Start would be
 *    false. The basis stays `fits`, so no other reason is claimed either.
 *
 * Nothing but a paged reading gets an estimate: steps are mastery trackers,
 * and the app does not know how long a problem set takes.
 */
export function sizeSession(
  c: Pick<UpNextCandidate, 'task' | 'course' | 'spentSeconds'>,
  ctx: {
    habits: Habits | null;
    pace: { pagesPerHour: number; measured: boolean };
    tonight: Tonight | null;
    lastUsedMinutes: number | null;
    returning: boolean;
  },
): UpNextSession {
  const own = ctx.habits?.byCourse.get(c.course.id) ?? null;

  let seconds: number;
  let basis: UpNextSession['basis'];
  if (own && settled(own.blocks, HABIT_MIN_BLOCKS)) {
    seconds = own.blocks.median;
    basis = 'usual';
  } else if (ctx.habits && settled(ctx.habits.blocks, HABIT_MIN_BLOCKS)) {
    seconds = ctx.habits.blocks.median;
    basis = 'usual';
  } else {
    seconds = (ctx.lastUsedMinutes ?? DEFAULT_BLOCK_MINUTES) * 60;
    basis = 'last';
  }
  let usualMin = clamp(roughMinutes(seconds), USUAL_MIN_MINUTES, USUAL_MAX_MINUTES);
  if (ctx.returning) {
    usualMin = Math.min(usualMin, RETURN_MINUTES);
    basis = 'return';
  }

  let leftMin: number | null = null;
  let reading: {
    pages: number;
    pagesLeft: number;
    pagesPerHour: number;
    measured: boolean;
  } | null = null;
  const task = c.task;
  if (task && task.kind === 'reading' && task.pages) {
    const pph = own?.pagesPerHour ?? ctx.pace.pagesPerHour;
    if (Number.isFinite(pph) && pph > 0) {
      const spent = Math.max(0, c.spentSeconds);
      const leftSec = (task.pages / pph) * 3600 - spent;
      if (leftSec >= READING_LEFT_MIN_SECONDS) {
        reading = {
          pages: task.pages,
          pagesLeft: Math.max(1, Math.round(task.pages - (spent / 3600) * pph)),
          pagesPerHour: pph,
          measured: own?.pagesPerHour != null || ctx.pace.measured,
        };
        leftMin = ceil5(leftSec / 60);
      }
    }
  }

  const fitMin = ctx.tonight ? floor5(ctx.tonight.minutesLeft) : null;
  const left = leftMin ?? Infinity;
  const fit = fitMin ?? Infinity;
  const minutes = Math.max(SESSION_FLOOR_MINUTES, Math.min(usualMin, left, fit));
  if (leftMin != null && leftMin <= usualMin && leftMin <= fit) basis = 'finishes';
  else if (fitMin != null && fitMin < usualMin && fitMin < left) basis = 'fits';

  return {
    minutes,
    basis,
    stopLabel: basis === 'fits' && ctx.tonight && minutes <= fit ? ctx.tonight.label : null,
    reading: reading
      ? {
          ...reading,
          pagesThisSession: Math.min(reading.pagesLeft, Math.round((reading.pagesPerHour * minutes) / 60)),
          finishes: basis === 'finishes',
        }
      : null,
  };
}

/**
 * One line of the plan under the facts. `recall` names the course's cards in
 * today's recall queue (`code` is the course's short code, "MATH", ready for
 * the clause); `weak-point` one thing the reader keeps getting wrong in the
 * course, with where it is and no count; `pages` how far into a reading this
 * session goes, `spent` when some of it has already been read.
 */
export type PlanMove =
  | { kind: 'recall'; count: number; code: string }
  | { kind: 'weak-point'; summary: string; where: string | null }
  | { kind: 'pages'; reading: NonNullable<UpNextSession['reading']>; spent: boolean };

const PLAN_MOVES = 2;

/**
 * What the session starts with, at most two lines, in this order.
 *
 * Recall first, because retrieval is the best supported thing a session can
 * open with and the cards are right below. Then, when the work leads up to an
 * exam, one weak point to go at: the one tied to this task if there is one,
 * else the course's most missed, with its section and page and never how
 * many times, since a miss count beside the exam's name is the anxiety line
 * the design rules out. Then, for a reading, how many pages.
 *
 * These shape the session and never the order: the pick is settled before
 * any of them loads, so a recall queue arriving late cannot move it.
 */
export function planFor(
  c: UpNextCandidate,
  s: UpNextSession,
  ctx: { recallQueue: { courseId: string }[]; weakPoints: WeakPoint[] | null },
): PlanMove[] {
  const moves: PlanMove[] = [];

  const count = ctx.recallQueue.filter((q) => q.courseId === c.course.id).length;
  if (count > 0) moves.push({ kind: 'recall', count, code: shortCode(c.course.code) });

  if (c.piece && ctx.weakPoints) {
    const course = rankWeakPoints(ctx.weakPoints.filter((w) => w.status === 'open' && w.courseId === c.course.id));
    const taskId = c.task?.id ?? null;
    const top = (taskId ? course.find((w) => w.taskId === taskId) : undefined) ?? course[0];
    if (top) {
      const where = [top.section && `§ ${top.section}`, top.pageRef].filter(Boolean).join(', ');
      moves.push({ kind: 'weak-point', summary: top.summary, where: where || null });
    }
  }

  if (s.reading) {
    moves.push({ kind: 'pages', reading: s.reading, spent: c.spentSeconds > 0 && s.reading.pagesLeft < s.reading.pages });
  }

  return moves.slice(0, PLAN_MOVES);
}
