import type { Course, Task } from './data/types';
import type { UpNextCandidate, UpNextQuiet } from './up-next';

/**
 * What Up next says about its pick, in words.
 *
 * The ranking in ./up-next.ts decides; this only says what it decided, from
 * the same fields, so the line can never argue with the order the way the
 * old `whyUpNext` did when it had no ten-minute floor and the pick did. Every
 * string here is a plain lowercase clause in the app's factual voice: what the
 * work is for, when it is due, that the reader was on it. None of it counts
 * down, praises, or tells anybody what they should do, and a test holds all
 * of it to that (lib/up-next.test.ts, the copy guard).
 *
 * Pure and deterministic. Dates are worked out at UTC noon from the ISO
 * strings with fixed English names, never from the device's locale or clock,
 * so the same record reads the same on a phone, in a test and over MCP.
 */

/**
 * One run of a line. `text` is plain serif, `figure` a number set in mono
 * (digits are the only thing mono ever sets), and `warn` the overdue tone.
 * The reason line itself carries no figures today: its dates are words, and
 * an overdue count is a warning rather than a tally. `figure` is here so a
 * line that does need one has a way to say so without inventing markup.
 */
export type LinePart = { text: string } | { figure: string } | { warn: string };

const SEP = ' · ';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A calendar date as a UTC-noon instant, so a daylight-saving change cannot move it. */
function noon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Whole days from `today` to `iso`: 1 is tomorrow, -1 yesterday. */
function daysAhead(iso: string, today: string): number {
  return Math.round((noon(iso).getTime() - noon(today).getTime()) / 86_400_000);
}

/**
 * The first word of a course code, the way a student says it out loud:
 * "MATH 101" is MATH. Used inside a clause, where the full code reads like a
 * form field ("nothing on the MATH 101 list"). The full code stays on the
 * course line and in the quiet copy, where it names the course on its own.
 */
export function shortCode(code: string): string {
  return code.trim().split(/\s+/)[0] ?? '';
}

/**
 * What an exam or major piece is called, without the course code a student
 * often types in front of it: "MATH 101 Midterm I" is Midterm I, because the
 * course line directly above already says MATH 101 and "for MATH 101 Midterm
 * I" says it twice. With the course known, its code (or the first word of it)
 * is stripped only when a separator follows, so "Mathematics essay" in a
 * course coded MATH keeps its name. Without the course, only a code-shaped
 * prefix goes ("CS 101 Final" is Final). A title that would be left empty is
 * returned whole.
 */
export function examName(piece: Pick<Task, 'title'>, course?: Pick<Course, 'code'>): string {
  const title = piece.title.trim();
  if (course) {
    const codes = [course.code.trim(), shortCode(course.code)].filter(Boolean);
    for (const code of codes) {
      if (!title.toLowerCase().startsWith(code.toLowerCase())) continue;
      const rest = title.slice(code.length);
      const gap = /^[\s:·–—-]+/.exec(rest);
      if (!gap) continue;
      const name = rest.slice(gap[0].length).trim();
      if (name) return name;
    }
    return title;
  }
  const prefix = /^[A-Z]{2,6}\s?\d{2,4}[A-Z]?[\s:·–—-]+(?=\S)/.exec(title);
  return prefix ? title.slice(prefix[0].length) : title;
}

/**
 * A date said the way a person says it: the weekday while it is inside the
 * coming week ("Thursday", two to six days ahead), and the day and month
 * otherwise ("12 Oct", "11 Sep"). Today and tomorrow are left to the caller,
 * which has its own words for them. English names from fixed arrays at UTC
 * noon, never the device locale, so the MCP briefing and Today agree.
 */
export function dayWord(iso: string, today: string): string {
  const d = noon(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const ahead = daysAhead(iso, today);
  if (ahead >= 2 && ahead <= 6) return WEEKDAYS[d.getUTCDay()];
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * Why this one, as a clause, or null when its date says it on its own. The
 * first rule that applies wins, in this order:
 *
 * - A course offered before its exam says that nothing on the list leads up
 *   to it, which is the whole reason a course and not a task is up.
 * - Work lifted for an exam's run-up says what it is for. It sits above
 *   carry, because the lift is why it is here tonight, and "you were on this"
 *   would hide that.
 * - Then that the reader was on it, today or yesterday. Never "just now" or
 *   "twenty minutes ago": a line that changes with the clock is a caption,
 *   and the pick itself never does.
 * - Then what it leads up to, for work that is up on its own date but still
 *   heads towards an exam. Attached whether or not a session is owed, so the
 *   line does not flip the moment one is logged.
 * - Then the top of a list with no dates on it.
 */
function whyClause(c: UpNextCandidate): string | null {
  if (!c.task) return `nothing on the ${shortCode(c.course.code)} list leads up to it`;
  if (c.lifted && c.piece) return `for ${examName(c.piece, c.course)}`;
  if (c.carry === 'today') return 'you were on this earlier today';
  if (c.carry === 'yesterday') return 'you were on this yesterday';
  if (c.piece) return `for ${examName(c.piece, c.course)}`;
  if (c.tier === 'list') return `next on the ${shortCode(c.course.code)} list`;
  return null;
}

/**
 * When, from the task's own date and nothing else: a lifted problem set due
 * Thursday is still due Thursday. One or two to seven days late is a warning;
 * work the ranking has let sink as stale (tier `later` with a date behind it,
 * more than STALE_DAYS late) is only "open since", a loose end said calmly
 * rather than a red number that grows every morning. Reading the tier rather
 * than repeating the threshold keeps the words and the order from drifting
 * apart. Undated work says "no date" only when it is high priority, since
 * that is the reason it came up; a note to self has nothing to add.
 */
function whenPart(c: UpNextCandidate, today: string): LinePart | null {
  const task = c.task;
  if (!task) return null;
  if (!task.dueDate) return task.priority === 'high' ? { text: 'no date' } : null;
  const d = daysAhead(task.dueDate, today);
  if (Number.isNaN(d)) return null;
  if (d === 0) return { text: 'due today' };
  if (d === 1) return { text: 'due tomorrow' };
  if (d > 1) return { text: `due ${dayWord(task.dueDate, today)}` };
  if (c.tier === 'later') return { text: `open since ${dayWord(task.dueDate, today)}` };
  if (d === -1) return { warn: 'a day overdue' };
  return { warn: `${-d} days overdue` };
}

/**
 * The reason, in its halves: why, when, and whether the High tag follows.
 * Weight is never here, and neither is a count of days to the exam: the
 * exam is named by its title only, as what the work is for.
 */
export function reasonParts(
  c: UpNextCandidate,
  today: string,
): { why: string | null; when: LinePart | null; high: boolean } {
  return { why: whyClause(c), when: whenPart(c, today), high: c.task?.priority === 'high' };
}

/** The pick's line: why · when, either half dropped when it has nothing to say. */
export function pickLine(c: UpNextCandidate, today: string): LinePart[] {
  const { why, when } = reasonParts(c, today);
  const parts: LinePart[] = [];
  if (why) parts.push({ text: why });
  if (why && when) parts.push({ text: SEP });
  if (when) parts.push(when);
  return parts;
}

/**
 * The one clause an Or row has room for: its date if it has one, else its
 * reason. The full line appears the moment the row is put up next, so a row
 * never has to explain itself in two halves at 12.5px.
 */
export function orLine(c: UpNextCandidate, today: string): string {
  const { why, when } = reasonParts(c, today);
  if (when) return plain([when]);
  return why ?? '';
}

/** A line's words with the styling taken off, for MCP and for tests. */
export function plain(parts: LinePart[]): string {
  return parts.map((p) => ('text' in p ? p.text : 'figure' in p ? p.figure : p.warn)).join('');
}

/**
 * What Up next says when there is nothing to pick: a heading that says why,
 * and one true line about the course it offers instead. Never "a clean page":
 * the empty state always has a course and a Start, because a screen that
 * says there is nothing to do on the evening a course has gone untouched is
 * wrong on exactly the day it matters.
 */
export function quietCopy(q: UpNextQuiet, today: string): { heading: string; line: LinePart[] | null } {
  if (q.why === 'set-aside') {
    return { heading: 'Everything open is set aside for today.', line: [{ text: 'It comes back tomorrow.' }] };
  }
  const heading =
    q.why === 'far' && q.nextDue
      ? `Nothing on the list is due before ${dayWord(q.nextDue, today)}.`
      : 'Nothing open on the list.';
  return { heading, line: quietLine(q) };
}

function quietLine(q: UpNextQuiet): LinePart[] | null {
  const code = q.course.code;
  switch (q.line) {
    case 'piece':
      return q.piece ? [{ text: `${code} is next, for ${examName(q.piece, q.course)}` }] : null;
    case 'least-week':
      return [{ text: `${code} has had the least of its week so far` }];
    case 'never':
      return [{ text: `${code} has no session yet this term` }];
    case 'longest':
      return [{ text: `${code} has gone longest without a session` }];
    default:
      return null;
  }
}

/**
 * The short tag the MCP briefing has always carried beside Up next, extended
 * rather than renamed so an assistant reading the old values still reads
 * them right. `exam prep` is new, for work lifted into an exam's run-up and
 * for a course offered before its exam; `in progress` now has the same
 * ten-minute floor the pick has; `due soon` is the coming week and `due
 * later` past it; `next on the list` is the top of an undated list.
 */
export type UpNextWhy =
  | 'in progress'
  | 'overdue'
  | 'due today'
  | 'due soon'
  | 'high priority, no date'
  | 'exam prep'
  | 'next on the list'
  | 'due later';

export function whyOf(c: UpNextCandidate, today: string): UpNextWhy {
  if (!c.task || c.lifted) return 'exam prep';
  if (c.carry) return 'in progress';
  const due = c.task.dueDate;
  if (due) {
    const d = daysAhead(due, today);
    if (d < 0) return 'overdue';
    if (d === 0) return 'due today';
    if (d <= 7) return 'due soon';
    return 'due later';
  }
  if (c.tier === 'catch-up' || c.task.priority === 'high') return 'high priority, no date';
  return 'next on the list';
}
