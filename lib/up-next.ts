import type { Course, Session, Task } from './data/types';
import { compareTaskOrder } from './data/task-order';
import { compareCourseOrder, sortCourses } from './data/course-order';
import { preparesFor } from './recall';
import { shiftDate, weekOf } from './student-day';
import { daysBetween } from './utils';
import { LIVE_SESSION_PREFIX } from './live-session';
import { DAY_QUALIFY_SECONDS, HABIT_MIN_SITTINGS } from './progression/constants';
import { examName } from './up-next-copy';

/**
 * Up next: the one session Today asks for, chosen by what is at stake.
 *
 * The rule in one line: the logged record and the date decide *what*; the
 * clock decides only *how long* (./up-next-session.ts); the live sitting
 * changes only what the buttons say. So nothing here reads the time of day,
 * the sitting on the clock, recall or weak points. A pick that moved a
 * second after paint because a recall count loaded, or at 9pm because the
 * evening got shorter, would be a pick nobody could trust, and the rail, Today
 * and the MCP briefing would each be able to say something different.
 *
 * What it reads instead, in one pass: what is due and how late, the exams
 * and heavy pieces in the next two weeks and whether a session on their
 * course is owed on a spaced schedule, what the reader was on today or
 * yesterday, what they already gave a full sitting today, the order they
 * dragged each course's list into, and how much of each course's week has
 * been served. Those sort open work into tiers, and the tiers are opinion
 * made explicit:
 *
 * - `eve`: the night before an exam, a session on its course, above
 *   everything, even work due today.
 * - `due-now`: work due tomorrow, today, or one or two days late. Still
 *   tonight's work, and never moved aside for having had time today.
 * - `run-up`: a session owed on a course with an exam or heavy piece one to
 *   two weeks out, lifted onto its best lead-up work. Below due-now, so
 *   tomorrow's closed-book response paper is not pushed out by a midterm
 *   that is still days away.
 * - `week`: dated in the coming week, or three to seven days late.
 * - `catch-up`: undated work the reader marked high priority.
 * - `list`: the top of each course's undated list, one per course, which is
 *   how mastery trackers and undated readings come up when nothing is dated.
 * - `later`: dated eight to twenty-one days out, or more than a week late,
 *   which is a loose end rather than the next thing.
 *
 * Inside a tier the order is: what has not had its full sitting today, what
 * is heavy (outside eve and run-up, where every candidate is there for a
 * major piece and the piece's date decides), what the reader was just on, the
 * nearest date, then the course that has had least of its week, then the
 * student's own order inside a course (see compareCandidates). Weight only
 * ever breaks ties and is never shown.
 *
 * An exam row is never the thing to do: not before its date, not on it, not
 * after. Before it, the work that leads up to it is; after it, an unticked
 * exam stays in Overdue where it can be ticked.
 *
 * Pure. No 'use client', no window, no Date.now(): `today` comes in, so the
 * same record gives the same pick in a test in any time zone, on the server
 * and on the device. What is per device (Not now and a promoted Or row, in
 * ./up-next-day.ts) comes in as data and is simply absent on the server.
 */

/** #106's floor: a timer started and dropped is not work in hand. */
export const CARRY_MIN_SECONDS = 10 * 60;
/** "You were on this" reaches today or yesterday, and no further. */
export const CARRY_WINDOW_DAYS = 1;
/** One or two days late is still tonight's work. */
export const NOW_LATE_DAYS = 2;
export const WEEK_DAYS = 7;
/** More than a week late is a loose end, not the next thing. */
export const STALE_DAYS = 7;
/** Dated further out than this is never a candidate. */
export const LATER_DAYS = 21;
/** RECOMMENDATIONS #1, "an exam two weeks out": how far ahead a piece pulls a run-up. */
export const RUNUP_DAYS = 14;
/**
 * Cepeda et al. 2008: the gap between study sessions that best serves a test
 * is roughly a fixed share of the time left before it, about thirty per cent
 * at these distances. Kept in tenths so the maths is integer and exact.
 */
export const RUNUP_GAP_TENTHS = 3;
/** Twenty minutes on a course in a day counts as that day's session on it. */
export const RUNUP_COUNTS_SECONDS = DAY_QUALIFY_SECONDS;
/** Worth this per cent or more sorts ahead inside a tier. Never shown. */
export const HEAVY_WEIGHT = 10;
export const USUAL_DEFAULT_SECONDS = 45 * 60;
export const USUAL_WINDOW_DAYS = 28;
/** The same threshold the progression layer calls a return (progression/index.ts). */
export const RETURNING_QUIET_DAYS = 4;
export const OTHERS_SHOWN = 2;

const USUAL_MIN_SECONDS = 20 * 60;
const USUAL_MAX_SECONDS = 90 * 60;
const UNDATED = '9999-12-31';

export type UpNextTier = 'eve' | 'due-now' | 'run-up' | 'week' | 'catch-up' | 'list' | 'later';
export const TIER_ORDER: readonly UpNextTier[] = ['eve', 'due-now', 'run-up', 'week', 'catch-up', 'list', 'later'];

/**
 * The tiers a full sitting today can move a task aside in. Not eve and not
 * due-now: work due by tomorrow does not stop being due because it had an
 * hour, and the eve of an exam is the eve whatever was done at lunch.
 */
const STEPPABLE: ReadonlySet<UpNextTier> = new Set<UpNextTier>(['run-up', 'week', 'catch-up', 'list', 'later']);

export interface UpNextCandidate {
  /** task.id, or `runup:${courseId}` for a course offered before its exam. */
  key: string;
  task: Task | null;
  course: Course;
  /** task.title, or `Before ${examName(piece, course)}`. */
  title: string;
  tier: UpNextTier;
  /** True when the tier came from the eve/run-up lift rather than the task's own date. */
  lifted: boolean;
  /**
   * The work an owed run-up settled on, lifted or not: a problem set due
   * tomorrow already outranks the lift and keeps its own tier, but it is still
   * the course's session before its exam tonight. A course key is its own run-up.
   */
  runUp: boolean;
  /**
   * The nearest major piece (preparesFor) 1..14 days out in this course that
   * this work leads up to. Attached whether or not a session is owed; null
   * when this task IS the piece.
   */
  piece: Task | null;
  pieceDays: number | null;
  /** Latest >= 10-min session on the task: today, yesterday, or none. Course key: untargeted sessions on the course. */
  carry: 'today' | 'yesterday' | null;
  /** Already had a usual-length session today (only set in tiers run-up..later). */
  steppedAside: boolean;
  /** Logged today on the task (on the course, for a course key). */
  todaySeconds: number;
  /** Logged on the task, all time (0 for a course key). */
  spentSeconds: number;
  /** Date of the newest session on the task. */
  lastSat: string | null;
}

/**
 * One Not now. `also` carries what answering it answered too: setting aside
 * the work a run-up settled on sets aside its course's run-up, so passing on
 * MATH prep does not hand over the next MATH task a moment later.
 */
export interface UpNextSetAside {
  key: string;
  also: readonly string[];
}

export interface UpNextInput {
  today: string;
  courses: Course[];
  tasks: Task[];
  /** Logged record. `live:` rows, future dates and zero lengths are dropped defensively. */
  sessions: Session[];
  /** Per device, per day (lib/up-next-day.ts). Omitted on the server. */
  setAside?: readonly UpNextSetAside[];
  chosen?: string | null;
}

export interface UpNextQuiet {
  course: Course;
  why: 'set-aside' | 'nothing-open' | 'far';
  /** Which true line the quiet copy uses. */
  line: 'piece' | 'least-week' | 'never' | 'longest' | null;
  /** A preparesFor piece 1..21 days out in that course. */
  piece: Task | null;
  lastStudied: string | null;
  /** The earliest open non-exam dueDate beyond LATER_DAYS. */
  nextDue: string | null;
  setAside: number;
}

export interface UpNextReading {
  pick: UpNextCandidate | null;
  /** At most OTHERS_SHOWN. */
  others: UpNextCandidate[];
  /** Every candidate, after set-aside and chosen: for tests and the list dedupe. */
  ranked: UpNextCandidate[];
  /** input.chosen when it is still a candidate. */
  chosen: string | null;
  /** Set-aside entries that still stand for open work. */
  setAside: number;
  /** Only when pick is null and courses exist. */
  quiet: UpNextQuiet | null;
  /** usualSittingSeconds(sessions, today). */
  usualSeconds: number;
  returning: boolean;
}

/**
 * Whether a session on a course is owed before a piece `days` away, given
 * the last day the course had a counted session (RUNUP_COUNTS_SECONDS).
 *
 * The gap is about three tenths of the time left, rounded up and never under
 * a day: one day at one to three days out, two at four to six, three at seven
 * to ten, four at eleven to thirteen, five at fourteen. Any counted session on
 * the course settles it, so tonight's MATH problem set is tonight's MATH
 * session. It stops being owed the moment one is logged and comes back at the
 * spaced interval, which is what keeps the run-up from becoming a pin that
 * sits on top of the screen for a fortnight.
 */
export function runUpOwed(lastCounted: string | null, today: string, days: number): boolean {
  const gap = Math.max(1, Math.ceil((days * RUNUP_GAP_TENTHS) / 10));
  return lastCounted === null || daysBetween(lastCounted, today) >= gap;
}

/** Sessions the ranking can read: logged, dated by today, with time on them. */
function loggedBy(sessions: Session[], today: string): Session[] {
  return sessions.filter(
    (s) => !s.id.startsWith(LIVE_SESSION_PREFIX) && s.date <= today && s.durationSeconds > 0,
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How long one of this reader's sittings usually runs, from the last four
 * weeks: the median of their sittings of ten minutes or more, once there are
 * HABIT_MIN_SITTINGS of them, held between twenty and ninety minutes. Before
 * that, forty-five. It is what "a full session today" means when a task steps
 * aside for having had one.
 *
 * Read from the sessions alone rather than from the habits layer, so Today,
 * the rail and the MCP briefing reach the same figure without any of them
 * loading more than the record. A sitting closed for the reader (held after
 * no input, recovered, cut at a ceiling) is left out, the same way every
 * habit median leaves it out: it is not a length they chose.
 */
export function usualSittingSeconds(sessions: Session[], today: string): number {
  const lengths = loggedBy(sessions, today)
    .filter(
      (s) =>
        !s.recovery &&
        s.durationSeconds >= CARRY_MIN_SECONDS &&
        daysBetween(s.date, today) < USUAL_WINDOW_DAYS,
    )
    .map((s) => s.durationSeconds);
  if (lengths.length < HABIT_MIN_SITTINGS) return USUAL_DEFAULT_SECONDS;
  return Math.min(USUAL_MAX_SECONDS, Math.max(USUAL_MIN_SECONDS, median(lengths)));
}

/**
 * What a Not now on this candidate sets aside: its own key, and for the task
 * a run-up settled on the run-up itself, since passing on the run-up's pick
 * answers the run-up too. Lifted or not: whether tonight's MATH problem set
 * is due Thursday or tomorrow, passing it is passing MATH prep.
 */
export function setAsideKeys(c: UpNextCandidate): UpNextSetAside {
  return { key: c.key, also: c.runUp && c.task ? [`runup:${c.course.id}`] : [] };
}

/**
 * A stable partition putting `courseId`'s entries first, for RecallDeck: when
 * the pick's course has cards waiting, the card directly under Up next is one
 * of them, and the plan's "Start with" can point straight down at it. The
 * order within each half is kept, so recall's own ranking still holds.
 */
export function recallFirst<T extends { courseId: string }>(queue: T[], courseId: string | null): T[] {
  if (!courseId) return [...queue];
  return [...queue.filter((q) => q.courseId === courseId), ...queue.filter((q) => q.courseId !== courseId)];
}

/** What the comparator needs beyond the two candidates. */
export interface UpNextOrder {
  today: string;
  /** Logged this week over the weekly goal; Infinity when the goal is 0. */
  weekShare: ReadonlyMap<string, number>;
  /** Newest session date per course. */
  lastStudied: ReadonlyMap<string, string>;
}

const tierIndex = (tier: UpNextTier | null): number => (tier ? TIER_ORDER.indexOf(tier) : TIER_ORDER.length);

/** The tiers where every candidate is there for a major piece. */
const leadsUp = (tier: UpNextTier): boolean => tier === 'eve' || tier === 'run-up';

/**
 * Its weight. In eve and run-up it is the piece's (or its own, when the work
 * is the piece), because that is what the candidate is there for: a lead-up
 * task's own weight beside a course key's piece weight would be comparing two
 * different things. Elsewhere, its own.
 */
const weightOf = (c: UpNextCandidate): number =>
  (leadsUp(c.tier) ? (c.piece ?? c.task)?.weight : c.task ? c.task.weight : c.piece?.weight) ?? 0;

/** The date it sorts by: an exam's run-up sorts by the exam, undated work last. */
function dateOf(c: UpNextCandidate): string {
  if (c.tier === 'eve' || c.tier === 'run-up') return c.piece?.dueDate ?? c.task?.dueDate ?? UNDATED;
  return c.task?.dueDate ?? UNDATED;
}

const CARRY_RANK = { today: 0, yesterday: 1 } as const;
const carryRank = (c: UpNextCandidate): number => (c.carry ? CARRY_RANK[c.carry] : 2);

/**
 * The order of candidates, the first difference winning:
 *
 * 1. The tier.
 * 2. Inside due-now, due or late before tomorrow; inside later, what is
 *    still ahead before what went stale.
 * 3. Not stepped aside before stepped aside.
 * 4. Heavy (HEAVY_WEIGHT or more) before light, except in eve and run-up:
 *    every piece that lifts is major, so heaviness there would only say
 *    which course had a lead-up task on its list, and let a final thirteen
 *    days out beat a midterm in three. Its date decides instead.
 * 5. What the reader was on today, then yesterday, then the rest. A
 *    tie-break, not an override: the old "carry on" rule pinned a task for
 *    as long as a timer had touched it, whatever else came due.
 * 6. The date, soonest first; a run-up by its exam's date, undated last.
 * 7. Weight, heaviest first (the piece's, in eve and run-up).
 * 8. High priority first.
 * 9. The course with least of its week served first. Compared, never
 *    subtracted, because the share is Infinity for a course with no goal.
 * 10. The course studied longest ago first, never studied before all.
 * 11. The student's course order, then the course id: every step from here
 *     on is inside one course.
 * 12. The student's own order in that course (compareTaskOrder).
 * 13. Oldest first, then the key.
 *
 * Every step reads one candidate's value or one course's, and the course
 * steps all come before the order inside a course, so the order is total and
 * transitive: the pick does not depend on the order the tasks arrived in, and
 * drag order always holds inside a course. With the student's order compared
 * before the courses were settled, two tied courses could go in a circle.
 */
export function compareCandidates(a: UpNextCandidate, b: UpNextCandidate, order: UpNextOrder): number {
  const tier = tierIndex(a.tier) - tierIndex(b.tier);
  if (tier !== 0) return tier;

  const sub = subBucket(a, order.today) - subBucket(b, order.today);
  if (sub !== 0) return sub;

  if (a.steppedAside !== b.steppedAside) return a.steppedAside ? 1 : -1;

  // One tier by here, so one test says whether both lead up to a piece.
  if (!leadsUp(a.tier)) {
    const heavyA = weightOf(a) >= HEAVY_WEIGHT;
    const heavyB = weightOf(b) >= HEAVY_WEIGHT;
    if (heavyA !== heavyB) return heavyA ? -1 : 1;
  }

  const carry = carryRank(a) - carryRank(b);
  if (carry !== 0) return carry;

  const date = dateOf(a).localeCompare(dateOf(b));
  if (date !== 0) return date;

  const weight = weightOf(b) - weightOf(a);
  if (weight !== 0) return weight;

  const highA = a.task?.priority === 'high';
  const highB = b.task?.priority === 'high';
  if (highA !== highB) return highA ? -1 : 1;

  const shareA = order.weekShare.get(a.course.id) ?? Infinity;
  const shareB = order.weekShare.get(b.course.id) ?? Infinity;
  if (shareA < shareB) return -1;
  if (shareA > shareB) return 1;

  const studied = (order.lastStudied.get(a.course.id) ?? '').localeCompare(order.lastStudied.get(b.course.id) ?? '');
  if (studied !== 0) return studied;

  if (a.course.id !== b.course.id) {
    const course = compareCourseOrder(a.course, b.course);
    if (course !== 0) return course;
    return a.course.id < b.course.id ? -1 : 1;
  }

  if (a.task && b.task) {
    const own = compareTaskOrder(a.task, b.task);
    if (own !== 0) return own;
  }

  const created = createdOf(a).localeCompare(createdOf(b));
  if (created !== 0) return created;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function subBucket(c: UpNextCandidate, today: string): number {
  const due = c.task?.dueDate;
  if (!due) return 0;
  const d = daysBetween(today, due);
  if (c.tier === 'due-now') return d <= 0 ? 0 : 1;
  if (c.tier === 'later') return d > 0 ? 0 : 1;
  return 0;
}

const createdOf = (c: UpNextCandidate): string => c.task?.createdAt ?? c.piece?.createdAt ?? '';

/**
 * The tier a task has on its own, from its date or, undated, its priority.
 * Null for work dated past LATER_DAYS, which is never a candidate, and for an
 * undated note to self, which can only come up as the top of its course's
 * list (`listable`).
 */
function ownTier(task: Task, today: string): UpNextTier | null {
  if (!task.dueDate) return task.priority === 'high' ? 'catch-up' : null;
  const d = daysBetween(today, task.dueDate);
  if (d < -STALE_DAYS) return 'later';
  if (d < -NOW_LATE_DAYS) return 'week';
  if (d <= 1) return 'due-now';
  if (d <= WEEK_DAYS) return 'week';
  if (d <= LATER_DAYS) return 'later';
  // Past the horizon, or a date that does not parse (NaN fails every test).
  return null;
}

/** What one pass over the logged record says, keyed the way the ranking asks. */
interface Tally {
  todayByTask: Map<string, number>;
  todayByCourse: Map<string, number>;
  spent: Map<string, number>;
  lastSat: Map<string, string>;
  weekByCourse: Map<string, number>;
  lastStudied: Map<string, string>;
  /** Newest date of a >= 10-minute session, by task id or `course:${id}` for untargeted ones. */
  carryDate: Map<string, string>;
  /** The latest day each course had a counted session. */
  lastCounted: Map<string, string>;
  /** Task ids worked, by `course|date`. */
  workedOn: Map<string, Set<string>>;
  newest: string | null;
}

const bump = (map: Map<string, number>, key: string, by: number) => map.set(key, (map.get(key) ?? 0) + by);
const latest = (map: Map<string, string>, key: string, date: string) => {
  const held = map.get(key);
  if (!held || date > held) map.set(key, date);
};

function tally(sessions: Session[], today: string): Tally {
  const week = weekOf(today);
  const t: Tally = {
    todayByTask: new Map(),
    todayByCourse: new Map(),
    spent: new Map(),
    lastSat: new Map(),
    weekByCourse: new Map(),
    lastStudied: new Map(),
    carryDate: new Map(),
    lastCounted: new Map(),
    workedOn: new Map(),
    newest: null,
  };
  const dayTotals = new Map<string, number>();

  for (const s of sessions) {
    const secs = s.durationSeconds;
    if (s.date === today) {
      bump(t.todayByCourse, s.courseId, secs);
      if (s.taskId) bump(t.todayByTask, s.taskId, secs);
    }
    if (s.taskId) {
      bump(t.spent, s.taskId, secs);
      latest(t.lastSat, s.taskId, s.date);
    }
    if (s.date >= week.from && s.date <= week.to) bump(t.weekByCourse, s.courseId, secs);
    latest(t.lastStudied, s.courseId, s.date);
    bump(dayTotals, `${s.courseId}|${s.date}`, secs);
    if (secs >= CARRY_MIN_SECONDS && daysBetween(s.date, today) <= CARRY_WINDOW_DAYS) {
      latest(t.carryDate, s.taskId ?? `course:${s.courseId}`, s.date);
    }
    if (s.taskId) {
      const day = `${s.courseId}|${s.date}`;
      const set = t.workedOn.get(day) ?? new Set<string>();
      set.add(s.taskId);
      t.workedOn.set(day, set);
    }
    if (!t.newest || s.date > t.newest) t.newest = s.date;
  }

  for (const [key, secs] of dayTotals) {
    if (secs < RUNUP_COUNTS_SECONDS) continue;
    const bar = key.lastIndexOf('|');
    latest(t.lastCounted, key.slice(0, bar), key.slice(bar + 1));
  }
  return t;
}

/** A task on its way to being a candidate, while the tiers are settled. */
interface Draft {
  task: Task;
  /** The tier from its own date or priority, before any lift. */
  own: UpNextTier | null;
  /** Undated and normal priority: it can take its course's one list slot. */
  listable: boolean;
  tier: UpNextTier | null;
  lifted: boolean;
  runUp: boolean;
  piece: Task | null;
  pieceDays: number | null;
  /** Had a usual-length session today. */
  full: boolean;
}

/** The nearer of two pieces: the earlier date, then the heavier, then the older. */
function nearerPiece(a: Task, b: Task): boolean {
  const date = (a.dueDate as string).localeCompare(b.dueDate as string);
  if (date !== 0) return date < 0;
  const weight = (a.weight ?? 0) - (b.weight ?? 0);
  if (weight !== 0) return weight > 0;
  const created = a.createdAt.localeCompare(b.createdAt);
  if (created !== 0) return created < 0;
  return a.id < b.id;
}

/**
 * The nearest major piece per course inside `horizon` days (1 at the least,
 * so an exam on its own day pulls nothing: the day of the exam is for the
 * exam). A piece is what recall prepares for (preparesFor): worth a fifth of
 * the course, or an unweighted exam that calls itself a midterm, final or
 * exam. A weekly quiz marked as an exam pulls nothing, exactly as in recall.
 */
function piecesWithin(open: Task[], today: string, horizon: number): Map<string, { task: Task; days: number }> {
  const pieces = new Map<string, { task: Task; days: number }>();
  for (const task of open) {
    if (!task.dueDate || !preparesFor(task)) continue;
    const days = daysBetween(today, task.dueDate);
    if (!(days >= 1 && days <= horizon)) continue;
    const held = pieces.get(task.courseId);
    if (!held || nearerPiece(task, held.task)) pieces.set(task.courseId, { task, days });
  }
  return pieces;
}

export function readUpNext(input: UpNextInput): UpNextReading {
  const { today } = input;
  const courses = input.courses;
  const byId = new Map(courses.map((c) => [c.id, c]));

  // Step 1: the record. What this device set aside today is one set of keys,
  // whichever entry put them there.
  const sessions = loggedBy(input.sessions, today);
  const passed = new Set<string>();
  for (const entry of input.setAside ?? []) {
    passed.add(entry.key);
    for (const key of entry.also) passed.add(key);
  }
  const open = input.tasks.filter((t) => !t.completed && byId.has(t.courseId));
  // An exam row is never the thing to do. Before it, the work leading up to
  // it is; after it, it waits in Overdue to be ticked.
  const work = open.filter((t) => t.kind !== 'exam');

  // Step 2: one pass over the sessions.
  const rec = tally(sessions, today);
  const usualSeconds = usualSittingSeconds(sessions, today);
  const yesterday = shiftDate(today, -1);
  const carryOf = (key: string): UpNextCandidate['carry'] => {
    const date = rec.carryDate.get(key);
    return date === today ? 'today' : date === yesterday ? 'yesterday' : null;
  };
  const returning =
    rec.newest !== null &&
    daysBetween(rec.newest, today) >= RETURNING_QUIET_DAYS &&
    !sessions.some((s) => s.date === today);

  // Step 3: each task's own tier.
  const drafts: Draft[] = [];
  for (const task of work) {
    if (passed.has(task.id)) continue;
    const own = ownTier(task, today);
    const listable = !task.dueDate && task.priority !== 'high';
    if (!own && !listable) continue;
    drafts.push({
      task,
      own,
      listable,
      tier: own,
      lifted: false,
      runUp: false,
      piece: null,
      pieceDays: null,
      full: (rec.todayByTask.get(task.id) ?? 0) >= usualSeconds,
    });
  }

  // Step 4: pieces and the run-up lift.
  const courseKeys: UpNextCandidate[] = [];
  for (const [courseId, { task: piece, days }] of piecesWithin(open, today, RUNUP_DAYS)) {
    const course = byId.get(courseId) as Course;
    const pieceDue = piece.dueDate as string;
    // What leads up to it: the course's undated work, and its dated work due
    // by the piece and not yet stale. A task due after the exam is not prep
    // for it, and a month-old loose end is not either.
    const leadsTo = (t: Task) =>
      t.courseId === courseId &&
      (t.dueDate == null || (t.dueDate <= pieceDue && daysBetween(today, t.dueDate) >= -STALE_DAYS));
    const pool = drafts.filter((x) => leadsTo(x.task));
    // Always, owed or not, so the reason ("for Midterm I") never flips the
    // moment a session is logged.
    for (const x of pool) {
      if (x.task.id === piece.id) continue;
      x.piece = piece;
      x.pieceDays = days;
    }
    // Not now on the run-up (or on a heavy piece that is itself on the list)
    // answered it for today.
    if (passed.has(`runup:${courseId}`) || passed.has(piece.id)) continue;
    const lastCounted = rec.lastCounted.get(courseId) ?? null;
    if (!runUpOwed(lastCounted, today, days)) continue;

    const lift: UpNextTier = days === 1 ? 'eve' : 'run-up';
    const worked = lastCounted ? rec.workedOn.get(`${courseId}|${lastCounted}`) : undefined;
    const target = [...pool].sort((a, b) => {
      // Dated work that already leads up to it first, by its own tier; all
      // undated work after, as one group, so the rotation below can move
      // between a high-priority tracker and the next thing on the list.
      const ra = a.task.dueDate ? tierIndex(a.own) : TIER_ORDER.length;
      const rb = b.task.dueDate ? tierIndex(b.own) : TIER_ORDER.length;
      if (ra !== rb) return ra - rb;
      // Rotation: away from what the last counted day already worked, so
      // three run-up sessions are three different things.
      const wa = worked?.has(a.task.id) ?? false;
      const wb = worked?.has(b.task.id) ?? false;
      if (wa !== wb) return wa ? 1 : -1;
      if (a.full !== b.full) return a.full ? 1 : -1;
      return compareTaskOrder(a.task, b.task);
    })[0];

    if (target) {
      // Work that already outranks the lift (due tomorrow, say) is left
      // where it is: it is already the course's session tonight, and passing
      // on it passes the run-up all the same.
      target.runUp = true;
      if (tierIndex(target.own) > tierIndex(lift)) {
        target.tier = lift;
        target.lifted = true;
      }
    } else if (!work.some((t) => passed.has(t.id) && leadsTo(t))) {
      // The course key says nothing on the list leads up to it, so it stands
      // only while that is true. Work that does, set aside today, was a pass
      // on this run-up whichever way it came to be passed.
      courseKeys.push({
        key: `runup:${courseId}`,
        task: null,
        course,
        title: `Before ${examName(piece, course)}`,
        tier: lift,
        lifted: true,
        runUp: true,
        piece,
        pieceDays: days,
        carry: carryOf(`course:${courseId}`),
        steppedAside: false,
        todaySeconds: rec.todayByCourse.get(courseId) ?? 0,
        spentSeconds: 0,
        lastSat: null,
      });
    }
  }

  // Step 5: the top of each course's undated list, one per course. The rest
  // are notes to self and stay on the course page. A task that had its full
  // sitting today gives the slot to the next one down.
  const listed = new Map<string, Draft[]>();
  for (const x of drafts) {
    if (!x.listable || x.tier) continue;
    const list = listed.get(x.task.courseId) ?? [];
    list.push(x);
    listed.set(x.task.courseId, list);
  }
  for (const list of listed.values()) {
    list.sort((a, b) => (a.full !== b.full ? (a.full ? 1 : -1) : compareTaskOrder(a.task, b.task)));
    list[0].tier = 'list';
  }

  // Step 6: order.
  const candidates: UpNextCandidate[] = [...courseKeys];
  for (const x of drafts) {
    if (!x.tier) continue;
    candidates.push({
      key: x.task.id,
      task: x.task,
      course: byId.get(x.task.courseId) as Course,
      title: x.task.title,
      tier: x.tier,
      lifted: x.lifted,
      runUp: x.runUp,
      piece: x.piece,
      pieceDays: x.pieceDays,
      carry: carryOf(x.task.id),
      steppedAside: x.full && STEPPABLE.has(x.tier),
      todaySeconds: rec.todayByTask.get(x.task.id) ?? 0,
      spentSeconds: rec.spent.get(x.task.id) ?? 0,
      lastSat: rec.lastSat.get(x.task.id) ?? null,
    });
  }
  const weekShare = new Map<string, number>();
  for (const course of courses) {
    const goal = Number.isFinite(course.weeklyGoalHours) ? course.weeklyGoalHours : 0;
    weekShare.set(course.id, goal > 0 ? (rec.weekByCourse.get(course.id) ?? 0) / (goal * 3600) : Infinity);
  }
  const order: UpNextOrder = { today, weekShare, lastStudied: rec.lastStudied };
  const ranked = candidates.sort((a, b) => compareCandidates(a, b, order));

  // Step 7: a promoted Or row leads. Set aside wins over chosen, because the
  // set-aside key never reached `ranked`.
  let chosen: string | null = null;
  if (input.chosen) {
    const at = ranked.findIndex((c) => c.key === input.chosen);
    if (at >= 0) {
      chosen = input.chosen;
      const [picked] = ranked.splice(at, 1);
      ranked.unshift(picked);
    }
  }

  const pick = ranked[0] ?? null;
  const others = pick ? othersFor(ranked, pick, chosen !== null) : [];

  // Step 9: the set-aside entries that still stand for something open.
  const openIds = new Set(open.map((t) => t.id));
  const setAside = (input.setAside ?? []).filter(
    (s) => openIds.has(s.key) || (s.key.startsWith('runup:') && byId.has(s.key.slice('runup:'.length))),
  ).length;

  // Step 10: nothing to pick.
  let quiet: UpNextQuiet | null = null;
  if (!pick && courses.length > 0) {
    const unset =
      setAside > 0 && readUpNext({ ...input, setAside: [], chosen: null }).pick !== null;
    quiet = readQuiet({ today, courses, open, work, rec, weekShare, setAside, unset });
  }

  return { pick, others, ranked, chosen, setAside, quiet, usualSeconds, returning };
}

/**
 * The two offered under Or. With a promoted row up, the first is what would
 * have been up without it, so nothing is hidden by promoting. Otherwise the
 * first comes from a course other than the pick's, and the second from a
 * course other than both, before anything fills in by rank: three MATH tasks
 * in a row are one choice offered three times.
 */
function othersFor(ranked: UpNextCandidate[], pick: UpNextCandidate, promoted: boolean): UpNextCandidate[] {
  const rest = ranked.slice(1);
  const out: UpNextCandidate[] = [];
  const used = new Set([pick.course.id]);
  if (promoted && rest[0]) {
    out.push(rest[0]);
    used.add(rest[0].course.id);
  }
  for (const c of rest) {
    if (out.length >= OTHERS_SHOWN) break;
    if (out.includes(c) || used.has(c.course.id)) continue;
    out.push(c);
    used.add(c.course.id);
  }
  for (const c of rest) {
    if (out.length >= OTHERS_SHOWN) break;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * Which course the quiet state offers, and the one true thing it says about
 * it: the course with an exam or major piece coming up within three weeks,
 * nearest first; else the course with least of its weekly goal served, when
 * some goal is still short; else the course left longest, never studied
 * first. "Longest" is only said where another course has had a session
 * since: two courses both studied today are tied, and neither has gone
 * longest. Ties fall to the student's own course order.
 */
function readQuiet(a: {
  today: string;
  courses: Course[];
  open: Task[];
  work: Task[];
  rec: Tally;
  weekShare: Map<string, number>;
  setAside: number;
  unset: boolean;
}): UpNextQuiet {
  const sorted = sortCourses(a.courses);
  const beyond = a.work
    .filter((t) => t.dueDate && daysBetween(a.today, t.dueDate) > LATER_DAYS)
    .map((t) => t.dueDate as string)
    .sort();
  const nextDue = beyond[0] ?? null;
  const far = a.work.length > 0 && beyond.length === a.work.length;
  const why: UpNextQuiet['why'] = a.unset ? 'set-aside' : far ? 'far' : 'nothing-open';

  const pieces = piecesWithin(a.open, a.today, LATER_DAYS);
  let course: Course | null = null;
  let line: UpNextQuiet['line'] = null;
  let piece: Task | null = null;

  for (const c of sorted) {
    const held = pieces.get(c.id);
    if (!held) continue;
    if (!piece || nearerPiece(held.task, piece)) {
      course = c;
      piece = held.task;
    }
  }
  if (course) {
    line = 'piece';
  } else {
    let least: Course | null = null;
    for (const c of sorted) {
      if (!(c.weeklyGoalHours > 0)) continue;
      const share = a.weekShare.get(c.id) ?? Infinity;
      if (share < 1 && (!least || share < (a.weekShare.get(least.id) ?? Infinity))) least = c;
    }
    if (least) {
      course = least;
      line = 'least-week';
    } else {
      let oldest = sorted[0];
      for (const c of sorted) {
        if ((a.rec.lastStudied.get(c.id) ?? '') < (a.rec.lastStudied.get(oldest.id) ?? '')) oldest = c;
      }
      course = oldest;
      const never = !a.rec.lastStudied.has(oldest.id);
      const at = a.rec.lastStudied.get(oldest.id) ?? '';
      const longer = sorted.some((c) => (a.rec.lastStudied.get(c.id) ?? '') > at);
      line = never ? 'never' : longer ? 'longest' : null;
    }
  }

  return {
    course,
    why,
    line,
    piece,
    lastStudied: a.rec.lastStudied.get(course.id) ?? null,
    nextDue,
    setAside: a.setAside,
  };
}
