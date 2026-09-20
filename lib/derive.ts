import type { Assessment, Course, DropRule, Session, Task } from './data';
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
 * Two different things get dropped, and they are decided differently. A
 * group's *total* is the `keep` heaviest pieces in it, which is what makes
 * seven 5% quizzes keeping six come to 30% rather than 35%. Which pieces are
 * kept is decided by score, best first — but only among the ones that have
 * come back, because a quiz that has not happened cannot be the one dropped.
 * Until more than `keep` have been marked, nothing is dropped at all, which
 * is the behaviour a student expects in week three.
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

    // The lightest pieces leave the group's total, so the weight that remains
    // is the one the outline states.
    const byWeight = [...members].sort((a, b) => b.weight - a.weight);
    const surplusWeight = byWeight.slice(keep);

    const marked = members.filter((row) => row.score !== null && row.outOf);
    if (marked.length > keep) {
      // Enough have come back to say which are the worst. Drop those.
      const byRatio = [...marked].sort(
        (a, b) =>
          (b.score as number) / (b.outOf as number) - (a.score as number) / (a.outOf as number),
      );
      byRatio.slice(keep).forEach((row) => dropped.add(row.id));
    } else {
      // Not yet. Trim the group's total instead, taking from the pieces still
      // outstanding so no mark the student already holds is thrown away.
      const markedIds = new Set(marked.map((row) => row.id));
      surplusWeight
        .filter((row) => !markedIds.has(row.id))
        .slice(0, members.length - keep)
        .forEach((row) => dropped.add(row.id));
    }
  }

  return dropped.size === 0 ? rows : rows.filter((row) => !dropped.has(row.id));
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

/**
 * Pages an hour, measured rather than assumed: total pages finished over
 * total hours logged against readings. Falls back to a plain 20 until there
 * is enough history to say anything, and never claims a rate off one session.
 */
export function readingRate(
  tasks: Task[],
  sessions: { taskId: string | null; durationSeconds: number }[],
): number {
  const readingIds = new Set(tasks.filter((t) => t.kind === 'reading').map((t) => t.id));
  const done = tasks.filter((t) => t.completed && t.kind === 'reading');
  const pages = done.reduce((acc, t) => acc + (t.pages || 0), 0);
  const seconds = sessions
    .filter((s) => s.taskId && readingIds.has(s.taskId))
    .reduce((acc, s) => acc + s.durationSeconds, 0);
  if (pages < 20 || seconds < 3600) return 20;
  return Math.round(pages / (seconds / 3600));
}

/** How recently a session has to have happened to count as "just now". */
const RESUME_WINDOW_DAYS = 1;

/**
 * The one task the Today screen puts its weight behind.
 *
 * `in-progress` is the default, and the only rule that answers the question a
 * student actually has when they reopen the app: what was I doing? If a timer
 * ran on a task today or yesterday and that task is still open, it is the
 * answer, whatever its due date — a calculus problem set you were halfway
 * through does not stop being the live work because something else is due
 * sooner. If the task got finished, the course still holds: the next open
 * thing in it comes up rather than throwing the reader somewhere new.
 *
 * `overdue` is the original rule: whatever has waited longest, then what is
 * due today. It is honest but it has a failure mode — four overdue readings
 * in one course means that course is the answer every day, and the courses
 * quietly going untouched never surface at all.
 *
 * `last-done` asks the opposite question to `in-progress`: of the work that is
 * actually due, which course has gone longest without a session? A course
 * never studied sorts first, because "not started" is the longest wait there
 * is. Due date breaks a tie.
 *
 * `overdue` and `last-done` choose from the same pool — overdue first, then
 * due today — so neither reaches past live work for something not yet due.
 * `in-progress` is the exception by design, and only for the one task a timer
 * has actually been run on; with nothing recent it falls back to `last-done`.
 */
export function pickUpNext(
  sort: 'in-progress' | 'last-done' | 'overdue',
  overdueTasks: Task[],
  todayTasks: Task[],
  sessions: Session[] = [],
  openTasks: Task[] = [],
): Task | null {
  const oldestDueFirst = (a: Task, b: Task) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '');

  if (sort === 'overdue') {
    return [...overdueTasks].sort(oldestDueFirst)[0] ?? todayTasks[0] ?? null;
  }

  if (sort === 'in-progress') {
    const resumed = pickResumed(sessions, overdueTasks, todayTasks, openTasks);
    if (resumed) return resumed;
    // Nothing worked on lately, so there is no thread to pick back up and the
    // question falls back to which course has been left alone the longest.
  }

  // Latest session date per course. Sessions carry a taskId, but the question
  // is which *course* has been neglected, so a session on any of its tasks
  // counts as having touched it.
  const lastStudied = new Map<string, string>();
  for (const session of sessions) {
    const seen = lastStudied.get(session.courseId);
    if (!seen || session.date > seen) lastStudied.set(session.courseId, session.date);
  }

  // Overdue still outranks due-today: falling behind is the louder signal.
  // The rotation happens within each tier, not across them.
  const pool = overdueTasks.length ? overdueTasks : todayTasks;
  return (
    [...pool].sort((a, b) => {
      // '' sorts before any ISO date, which is what puts a course with no
      // sessions at the front without a special case.
      const byStudied = (lastStudied.get(a.courseId) ?? '').localeCompare(
        lastStudied.get(b.courseId) ?? '',
      );
      return byStudied !== 0 ? byStudied : oldestDueFirst(a, b);
    })[0] ?? null
  );
}

/**
 * The task a timer was last run on, if it is still open and still recent.
 *
 * Sessions are ordered by `createdAt` rather than `date`, because two
 * sessions logged on the same day are only separable by the timestamp, and
 * "the last thing I did" is exactly that distinction.
 */
function pickResumed(
  sessions: Session[],
  overdueTasks: Task[],
  todayTasks: Task[],
  openTasks: Task[],
): Task | null {
  const today = isoDate();
  const recent = sessions
    .filter((s) => s.date <= today && daysBetween(s.date, today) <= RESUME_WINDOW_DAYS)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  if (recent.length === 0) return null;

  // Every task the reader could still be handed, newest session first.
  const byId = new Map(openTasks.map((t) => [t.id, t]));
  for (const session of recent) {
    if (!session.taskId) continue;
    const task = byId.get(session.taskId);
    if (task) return task;
  }

  // The task is finished, or the session was untargeted. Stay in the course
  // anyway and reach for its most pressing open thing: overdue, then due
  // today, then whatever is next by date.
  const courseId = recent[0].courseId;
  const inCourse = (list: Task[]) =>
    [...list]
      .filter((t) => t.courseId === courseId)
      .sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'))[0] ??
    null;
  return inCourse(overdueTasks) ?? inCourse(todayTasks) ?? inCourse(openTasks);
}
