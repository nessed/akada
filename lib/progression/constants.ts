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

/**
 * Nothing is named unless it is this close. Roughly one sitting, and once
 * the term has taught the app what one of *this reader's* sittings is, that
 * is the figure used instead (see ./habits.ts, `reach`), bounded below so a
 * student of short sittings still gets the first mark and the day named, and
 * above so a marathon reader is not offered a two hour distance as "close".
 */
export const REACHABLE_SECONDS = 50 * MINUTE;
export const REACH_MIN_SECONDS = 30 * MINUTE;
export const REACH_MAX_SECONDS = 2 * HOUR;

/* ── What the term teaches ─────────────────────────────────────────────── */

/**
 * How much evidence a habit needs before it is stated. Every figure in
 * ./habits.ts is a median over the reader's own sittings, and a median of
 * three is a coincidence with a number on it. Below these, the panel says
 * the habit has not taken shape yet, which is itself information: the app
 * gets to know you as you use it, and says so.
 */
export const HABIT_MIN_SITTINGS = 5;
export const HABIT_MIN_BLOCKS = 4;
export const HABIT_MIN_WEEKS = 3;
export const HABIT_MIN_TAGGED = 4;

/** A peak has to actually be one: this share of all focus inside three hours. */
export const PEAK_MIN_SHARE = 0.4;

/**
 * The ranking learns. Each Next Mark line shown is logged with whether a
 * sitting followed within the hour (./log.ts). Once a kind of line has been
 * shown this many times, its follow rate against the others moves it up or
 * down the ranking by at most half a tier: enough to prefer the lines this
 * reader acts on, never enough to jump a course with an exam over one without.
 */
export const LEARN_MIN_IMPRESSIONS = 6;
export const LEARN_MAX_SHIFT = 0.5;

/**
 * Raw duration alone must not keep generating marks all day. Once this many
 * marks have been inked today, Next Mark stops offering the plain time-served
 * candidates and only speaks if there is course or week structure behind it.
 */
export const PLAIN_MARKS_PER_DAY = 2;
