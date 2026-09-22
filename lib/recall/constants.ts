/**
 * Every number recall turns on, in one file, for the reason the progression
 * layer keeps its own that way: the schedule is only checkable if its
 * intervals can be read side by side.
 */

/**
 * Days until the next recall, by how many times in a row the reader has had
 * it clear. The first recall is the day after a thing was learned; then three
 * days, a week, a little over two weeks, five weeks.
 *
 * Expanding gaps rather than even ones because the gap that does the most
 * good grows with how long the thing has to be kept, and a university term is
 * weeks long: something read in week three has to survive to a final in week
 * fifteen. A thing recalled clear five times in a row is being asked about
 * roughly once a month, which is about as rarely as anything worth keeping
 * should go unasked.
 */
export const RECALL_INTERVALS = [1, 3, 7, 16, 35] as const;

/**
 * Clear this many times running, each on a later day than the last, and a
 * thing is settled. One clear recall a day after reading is a good sign and
 * not yet a thing kept: the criterion that holds up on exams is recalling it
 * correctly across several spaced sittings, about three, not once. Readiness
 * counts settled things apart from things clear once, so the picture a week
 * before an exam is not flattered by a single good morning.
 */
export const RECALL_SETTLED_BOX = 3;

/**
 * How many recalls Today asks for in one day, at most.
 *
 * A reader who has finished a term's worth of readings before this existed
 * would otherwise open the app to thirty things due at once, which is a
 * backlog, and a backlog is the one shape this app refuses to draw. Five is a
 * few honest minutes. The rest wait for tomorrow and are no worse for it;
 * a course page will still take its own due ones on request.
 */
export const RECALL_PER_DAY = 5;

/** How many of the day's five may come from one course, so the day mixes. */
export const RECALL_PER_COURSE_PER_DAY = 3;

/**
 * An exam this close pulls its course's recall forward, so that everything
 * kept for it comes up at least once in the days before rather than landing
 * the week after on its ordinary schedule. Graded work steers the order and
 * the timing and never appears in the copy, the same rule Next Mark keeps.
 */
export const RECALL_EXAM_WINDOW_DAYS = 21;

/** A piece worth at least this much of a course counts as one to prepare for. */
export const RECALL_EXAM_MIN_WEIGHT = 10;

/** Answers kept per item. A term of daily recall is well under this. */
export const RECALL_HISTORY_MAX = 60;

/** The longest thing a recall prompt holds, the same as a subtask title. */
export const RECALL_PROMPT_MAX = 300;
