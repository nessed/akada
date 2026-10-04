import type { Assessment, Course, DropRule, Task } from './data';
import { daysBetween, isoDate } from './utils';

/**
 * Claims about grades and readings, computed in one place.
 *
 * Everything here reads the four columns the revert stopped using —
 * `courses.assessments`, `tasks.kind`, `tasks.weight`, `tasks.pages`. A claim
 * computed inline in JSX is a claim nobody can check, and these are the ones
 * the app states as sentences ("72% of your grade is still unmarked"), so
 * they are worth keeping where they can be read on their own.
 */

/**
 * Where a course's grade stands. `marked` is how much of the course has come
 * back, `earned` is the share of that which was actually scored, and
 * `percent` is the mark so far — out of what has been marked, not out of 100,
 * because a student who is 28% of the way through a course has not scored 24.
 */
export function gradeStanding(course: Pick<Course, 'assessments' | 'grading'>) {
  const rows = course.assessments ?? [];
  const counted = countedAssessments(rows, course.grading?.dropRules ?? []);
  const graded = counted.filter((a) => a.score !== null && a.outOf);
  const marked = graded.reduce((acc, a) => acc + a.weight, 0);
  const earned = graded.reduce(
    (acc, a) => acc + a.weight * ((a.score as number) / (a.outOf as number)),
    0,
  );
  const total = counted.reduce((acc, a) => acc + a.weight, 0);
  // `dropped` is the ids the rules excluded, so the card can grey those rows
  // rather than silently showing a piece that is not being counted.
  const countedIds = new Set(counted.map((a) => a.id));
  return {
    rows,
    counted,
    dropped: rows.filter((a) => !countedIds.has(a.id)).map((a) => a.id),
    basis: course.grading?.basis ?? 'absolute',
    total,
    marked,
    earned,
    unmarked: Math.max(0, total - marked),
    percent: marked > 0 ? Math.round((earned / marked) * 100) : null,
  };
}

/**
 * The pieces that actually count, once "best 6 of 7" has been applied.
 *
 * A group always loses exactly `size - keep` pieces, which is what makes seven
 * 5% quizzes keeping six come to 30% rather than 35%. Which pieces go is
 * decided by score, worst first, among the ones that have come back, so "drop
 * my lowest two" takes effect on the two lowest marks already in. A mark that
 * would be the last one counting stays, and any drops left over come off the
 * pieces still to come.
 *
 * A group named by no rule, or a piece in no group, is returned untouched.
 */
function countedAssessments(rows: Assessment[], dropRules: DropRule[]): Assessment[] {
  if (dropRules.length === 0) return rows;
  const rules = new Map(dropRules.map((rule) => [rule.group, rule.keep]));
  const dropped = new Set<string>();

  for (const [group, keep] of rules) {
    const members = rows.filter((row) => row.group === group);
    if (members.length === 0 || keep >= members.length) continue;

    // Exactly `members.length - keep` pieces leave, whatever has come back,
    // so the group always totals what the outline states.
    const marked = members.filter((row) => row.score !== null && row.outOf);
    const outstanding = members.filter((row) => row.score === null || !row.outOf);
    const toDrop = members.length - keep;
    // The worst marks already in go first, as a student reads the rule: the
    // lowest two of what has come back. A later paper that does worse takes
    // its place in the dropped. One mark always stays, so a single quiz is
    // never struck out on its own.
    const byRatio = [...marked].sort(
      (a, b) =>
        (a.score as number) / (a.outOf as number) - (b.score as number) / (b.outOf as number),
    );
    const fromMarked = Math.min(toDrop, Math.max(0, marked.length - 1));
    byRatio.slice(0, fromMarked).forEach((row) => dropped.add(row.id));
    // Any drops left over come off the lightest pieces still to come, so the
    // group's total is always what the outline states.
    [...outstanding]
      .sort((a, b) => a.weight - b.weight)
      .slice(0, toDrop - fromMarked)
      .forEach((row) => dropped.add(row.id));
  }

  return dropped.size === 0 ? rows : rows.filter((row) => !dropped.has(row.id));
}

/**
 * Where a course can still end up, and what the rest has to go like to land
 * on a given mark.
 *
 * Everything is out of what the scheme counts once drop rules are applied,
 * the same `total` gradeStanding uses, so a course whose weights come to 100
 * reads in plain percent. `floor` is the mark if nothing else scored a point,
 * `ceiling` if everything left came back full. A target is solved two ways:
 * as the average every unmarked piece would need, and, when `solveFor` names
 * one piece, as what that piece needs with the others going at `assume` (a
 * fraction, 0.72 for 72%). The second is the "what do I need on the final"
 * question, which only has an answer once the rest is assumed to go somehow.
 *
 * Needed values are fractions and are not clamped: 1.2 means the target
 * would take 120% of what is left, which is the honest way to say it cannot
 * be reached. Nothing here knows a letter. Cutoffs are the outline's.
 */
export function gradeProjection(
  course: Pick<Course, 'assessments' | 'grading'>,
  options: { target?: number; solveFor?: string; assume?: number } = {},
) {
  const standing = gradeStanding(course);
  const { total, earned, unmarked } = standing;
  const outstanding = standing.counted.filter((a) => a.score === null || !a.outOf);
  const floor = total > 0 ? (earned / total) * 100 : null;
  const ceiling = total > 0 ? ((earned + unmarked) / total) * 100 : null;

  const verdict = (needed: number | null) =>
    needed === null ? ('decided' as const) : needed <= 0 ? ('secured' as const) : needed > 1 ? ('out_of_reach' as const) : ('reachable' as const);

  let target: { percent: number; neededAverage: number | null; status: ReturnType<typeof verdict> } | null = null;
  let solved: {
    piece: Assessment;
    assume: number;
    needed: number | null;
    status: ReturnType<typeof verdict>;
  } | null = null;

  if (options.target !== undefined && total > 0) {
    const short = (options.target / 100) * total - earned;
    const neededAverage = unmarked > 0 ? short / unmarked : null;
    // With nothing left the target is simply met or missed.
    const status = neededAverage === null ? (short <= 0 ? ('secured' as const) : ('out_of_reach' as const)) : verdict(neededAverage);
    target = { percent: options.target, neededAverage, status };

    const piece = options.solveFor ? outstanding.find((a) => a.id === options.solveFor) : undefined;
    if (piece && piece.weight > 0) {
      // The exact average, not `percent`, which is rounded for the card and
      // would move the answer by the rounding.
      const assume = options.assume ?? (standing.marked > 0 ? earned / standing.marked : options.target / 100);
      const needed = (short - (unmarked - piece.weight) * assume) / piece.weight;
      solved = { piece, assume, needed, status: verdict(needed) };
    }
  }

  return { standing, outstanding, floor, ceiling, target, solved };
}

/** The share of every course's grade still to be decided. */
export function unmarkedShare(courses: Course[]): number | null {
  const withWeighting = courses.filter((c) => (c.assessments?.length ?? 0) > 0);
  if (withWeighting.length === 0) return null;
  const totals = withWeighting.map(gradeStanding);
  const marked = totals.reduce((acc, t) => acc + t.marked, 0);
  const total = totals.reduce((acc, t) => acc + t.marked + t.unmarked, 0);
  if (total === 0) return null;
  return Math.round(((total - marked) / total) * 100);
}

export interface Countdown {
  task: Task;
  course: Course | undefined;
  days: number;
}

/**
 * What is coming and what it is worth. Exams first, then anything carrying a
 * weight — so this leads with the midterm rather than with tomorrow's problem
 * set, which is the whole reason a task has a kind at all.
 */
export function countdowns(
  tasks: Task[],
  courses: Course[],
  today = isoDate(),
  limit = 3,
): Countdown[] {
  const byId = new Map(courses.map((c) => [c.id, c]));
  return tasks
    .filter((t) => !t.completed && t.dueDate && t.dueDate >= today)
    .filter((t) => t.kind === 'exam' || (t.weight ?? 0) > 0)
    .sort((a, b) => {
      const byDate = (a.dueDate as string).localeCompare(b.dueDate as string);
      if (byDate !== 0) return byDate;
      // Same day: the exam outranks the essay, and a heavier piece outranks
      // a lighter one.
      if ((a.kind === 'exam') !== (b.kind === 'exam')) return a.kind === 'exam' ? -1 : 1;
      return (b.weight ?? 0) - (a.weight ?? 0);
    })
    .slice(0, limit)
    .map((task) => ({
      task,
      course: byId.get(task.courseId),
      days: daysBetween(today, task.dueDate as string),
    }));
}

/**
 * Whether a finished task was taken off the list without being done. Nothing
 * that reads a tick as evidence of work (recall, pages, a study day, Finished
 * early) ever counts one.
 */
export function isSkipped(task: Pick<Task, 'completed' | 'completedVia'>): boolean {
  return task.completed && task.completedVia === 'skip';
}

/**
 * The finished tasks that were worked, as against ticked.
 *
 * A tick is one tap and says nothing about whether the thing was read,
 * studied or learned. A finished task is **worked** when time was logged
 * against it: a session on it, or a kept timed read-through of a note studied
 * under it. Everything the app derives about the reader from finished work
 * (pages an hour, study days, Finished early, what recall asks about) reads
 * this set rather than the tick, so every one of them makes the same call.
 * A skipped task is never worked, whatever time went on it: the reader said
 * it was not done.
 *
 * Read at derive time from rows that already exist, so no history has to be
 * migrated for it to hold.
 */
export function workedTaskIds(
  tasks: Pick<Task, 'id' | 'completed' | 'completedVia'>[],
  sessions: { taskId: string | null; durationSeconds: number }[],
  notes: { taskId: string | null; reads?: unknown[] | null }[] = [],
): Set<string> {
  const timed = new Set<string>();
  for (const session of sessions) {
    if (session.taskId && session.durationSeconds > 0) timed.add(session.taskId);
  }
  for (const note of notes) {
    if (note.taskId && (note.reads?.length ?? 0) > 0) timed.add(note.taskId);
  }
  const worked = new Set<string>();
  for (const task of tasks) {
    if (task.completed && !isSkipped(task) && timed.has(task.id)) worked.add(task.id);
  }
  return worked;
}

/**
 * The reading you are behind on, longest overdue first, with the page counts
 * that turn it from vague guilt into a number of hours.
 */
export function readingBacklog(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.completed && t.kind === 'reading')
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function backlogPages(tasks: Task[]): number {
  return readingBacklog(tasks).reduce((acc, t) => acc + (t.pages || 0), 0);
}

/** The plain rate a reader is given until their own history says otherwise. */
export const DEFAULT_PAGES_PER_HOUR = 20;
/**
 * The bounds on any one reading's pace. Past 120 pages an hour a book was
 * skimmed or the clock was not on it; under 2, the clock ran through dinner.
 * Either way that pair says nothing about how fast this reader reads.
 */
export const PACE_MAX_PAGES_PER_HOUR = 120;
export const PACE_MIN_PAGES_PER_HOUR = 2;
/** How many worked readings it takes before a pace is called the reader's own. */
export const PACE_MIN_PAIRS = 3;

/** One finished reading with its own pages over its own logged time. */
export interface ReadingPair {
  taskId: string;
  courseId: string;
  pages: number;
  seconds: number;
  pagesPerHour: number;
}

/**
 * The readings a pace can honestly be read off: finished, with a page count,
 * and worked (see workedTaskIds), each paired with the time logged on that
 * very task. A tick with a page count on it is not a reading timed; a
 * session on a different reading is not time on this one.
 */
export function readingPairs(
  tasks: Pick<Task, 'id' | 'courseId' | 'kind' | 'completed' | 'completedVia' | 'pages'>[],
  sessions: { taskId: string | null; durationSeconds: number }[],
  notes: { taskId: string | null; reads?: { seconds: number }[] | null }[] = [],
): ReadingPair[] {
  const worked = workedTaskIds(tasks, sessions, notes);
  const sessionSeconds = new Map<string, number>();
  for (const s of sessions) {
    if (s.taskId && s.durationSeconds > 0) {
      sessionSeconds.set(s.taskId, (sessionSeconds.get(s.taskId) ?? 0) + s.durationSeconds);
    }
  }
  const readSeconds = new Map<string, number>();
  for (const note of notes) {
    if (!note.taskId) continue;
    const total = (note.reads ?? []).reduce((acc, r) => acc + (r.seconds || 0), 0);
    if (total > 0) readSeconds.set(note.taskId, (readSeconds.get(note.taskId) ?? 0) + total);
  }
  const pairs: ReadingPair[] = [];
  for (const task of tasks) {
    if (task.kind !== 'reading' || !task.pages || !worked.has(task.id)) continue;
    // The sessions on it where there are any; a read-through kept on its
    // note otherwise, since that too was timed on the task's clock.
    const seconds = sessionSeconds.get(task.id) ?? readSeconds.get(task.id) ?? 0;
    if (seconds <= 0) continue;
    pairs.push({
      taskId: task.id,
      courseId: task.courseId,
      pages: task.pages,
      seconds,
      pagesPerHour: clampPace(task.pages / (seconds / 3600)),
    });
  }
  return pairs;
}

function clampPace(rate: number): number {
  return Math.min(PACE_MAX_PAGES_PER_HOUR, Math.max(PACE_MIN_PAGES_PER_HOUR, rate));
}

/**
 * The pace a set of readings says, as the median of each one's own rate
 * rather than one pooled ratio: a pooled ratio lets one 200-page tick with
 * five minutes on it speak for the whole term. Null with nothing to read.
 */
export function medianPace(pairs: Pick<ReadingPair, 'pagesPerHour'>[]): number | null {
  if (pairs.length === 0) return null;
  const rates = pairs.map((p) => p.pagesPerHour).sort((a, b) => a - b);
  const mid = Math.floor(rates.length / 2);
  const median = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
  return Math.round(clampPace(median));
}

/**
 * The same rate with what it stands on, for a caller that has to say whether
 * the number is the reader's own or the default. The connector does: "at
 * your pace" off a default of 20 would be a claim about someone it has never
 * watched read. `measured` needs PACE_MIN_PAIRS worked readings, each with
 * its own pages and its own time; one session on one reading is not a pace.
 */
export function readingRateDetail(
  tasks: Pick<Task, 'id' | 'courseId' | 'kind' | 'completed' | 'completedVia' | 'pages'>[],
  sessions: { taskId: string | null; durationSeconds: number }[],
  notes: { taskId: string | null; reads?: { seconds: number }[] | null }[] = [],
) {
  const pairs = readingPairs(tasks, sessions, notes);
  const measured = pairs.length >= PACE_MIN_PAIRS;
  return {
    pagesPerHour: measured ? (medianPace(pairs) ?? DEFAULT_PAGES_PER_HOUR) : DEFAULT_PAGES_PER_HOUR,
    measured,
    pagesRead: pairs.reduce((acc, p) => acc + p.pages, 0),
    hoursRead: pairs.reduce((acc, p) => acc + p.seconds, 0) / 3600,
    readings: pairs.length,
  };
}
