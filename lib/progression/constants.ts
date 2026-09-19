/**
 * Every number the progression layer turns on, in one file.
 *
 * They are gathered here because the whole design rests on a single claim:
 * the game layer saturates well before a real study day does. That claim is
 * only checkable if the thresholds can be read together on one screen. A
 * constant that drifts out into the module that uses it is a constant nobody
 * will ever weigh against the others again.
 *
 * Nothing here is a reward and nothing here is spendable. These are the
 * distances at which a mark, a page or a week is declared, chosen so that
 * fabricating them is dull work for a false picture of your own term.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/* ── What a day of claimed effort is worth ─────────────────────────────── */

/**
 * Credit is tapered, never walled. A marathon day earns less per hour than a
 * normal one; it never earns nothing per hour, because a wall punishes the
 * one student in fifty who genuinely sat there for nine hours in order to
 * inconvenience a faker who will simply stop at the wall.
 *
 * Read as: full rate up to `full`, then `secondRate` across the next `span`,
 * then `tailRate` forever.
 */
export interface Taper {
  full: number;
  span: number;
  secondRate: number;
  tailRate: number;
}

/** One course, one day. Three genuine hours on a single course is a lot. */
export const COURSE_TAPER: Taper = {
  full: 3 * HOUR,
  span: 3 * HOUR,
  secondRate: 1 / 3,
  tailRate: 0.1,
};

/** Everything, one day. Five hours across all courses is a hard day. */
export const DAY_TAPER: Taper = {
  full: 5 * HOUR,
  span: 4 * HOUR,
  secondRate: 1 / 3,
  tailRate: 0.1,
};

/* ── The cheap inputs ──────────────────────────────────────────────────── */

/**
 * Ticking a task is one click, so it is worth minutes rather than a mark, and
 * only the first few in a day on a course count at all.
 */
export const TASK_TICK_SECONDS = 8 * MINUTE;
export const TASK_TICKS_PER_COURSE_PER_DAY = 3;

/**
 * Typed page counts are the cheapest thing in the app to fabricate, so they
 * are worth a twelfth of a minute a page and are bounded twice: by the day's
 * ceiling below, and by the time actually logged against that very task. A
 * reading nobody logged a session against feeds the pages with nothing.
 */
export const PAGE_SECONDS = 12;
export const PAGE_CREDIT_CEILING_PER_DAY = 20 * MINUTE;

/* ── Marks and pages ───────────────────────────────────────────────────── */

/** Credited time that inks one mark in a course's margin. */
export const MARK_SECONDS = 40 * MINUTE;

/**
 * The first mark on a course is shorter so a course added today is reachable
 * today. The distance is shortened; no progress is pre-filled, because
 * nothing fake is ever allowed into the ledger.
 */
export const FIRST_MARK_SECONDS = 15 * MINUTE;

/** Three gates of five. Enough marks bind the page and a fresh one opens. */
export const MARKS_PER_PAGE = 15;

/* ── Days and weeks ────────────────────────────────────────────────────── */

/** A day counts on this much logged, or on a ticked task, or on pages read. */
export const DAY_QUALIFY_SECONDS = 20 * MINUTE;
export const DAY_QUALIFY_PAGES = 10;

/** The consistency route: this many qualifying days makes the week count. */
export const WEEK_CONSISTENT_DAYS = 4;

/**
 * The breadth route, for a week that is lumpy rather than thin. Fewer days,
 * but spread across courses, which is the shape a week takes when three
 * deadlines land on it.
 */
export const WEEK_BREADTH_DAYS = 3;
export const WEEK_BREADTH_COURSES = 3;

/** Earned one per counting week, banked no deeper than this. */
export const GRACE_BANK_MAX = 3;

/* ── Ink ───────────────────────────────────────────────────────────────── */

/**
 * How much of yesterday's density survives a day with nothing on it. About a
 * nine day half life: long enough that a quiet weekend is invisible, short
 * enough that a course dropped for a fortnight looks it.
 */
export const INK_DAILY_HOLD = 0.93;

/** Ink never fades past this, so a course page is always legible. */
export const INK_FLOOR = 0.12;

/* ── Next Mark ─────────────────────────────────────────────────────────── */

/** Nothing is named unless it is this close. Roughly one sitting. */
export const REACHABLE_SECONDS = 50 * MINUTE;

/**
 * Raw duration alone must not keep generating marks all day. Once this many
 * marks have been inked today, Next Mark stops offering the plain time-served
 * candidates and only speaks if there is course or week structure behind it.
 */
export const PLAIN_MARKS_PER_DAY = 2;
