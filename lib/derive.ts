import type { Course, Task } from './data';
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
export function gradeStanding(course: Pick<Course, 'assessments'>) {
  const rows = course.assessments ?? [];
  const graded = rows.filter((a) => a.score !== null && a.outOf);
  const marked = graded.reduce((acc, a) => acc + a.weight, 0);
  const earned = graded.reduce(
    (acc, a) => acc + a.weight * ((a.score as number) / (a.outOf as number)),
    0,
  );
  const total = rows.reduce((acc, a) => acc + a.weight, 0);
  return {
    rows,
    total,
    marked,
    earned,
    unmarked: Math.max(0, total - marked),
    percent: marked > 0 ? Math.round((earned / marked) * 100) : null,
  };
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
