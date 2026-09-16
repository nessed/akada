import type { Course, Session, Task } from './data';
import { daysBetween, isoDate, startOfWeek, endOfWeek } from './utils';
import { isLoggableDuration } from './session-safety';

/**
 * What the screens actually say, derived in one place.
 *
 * The redesign's pages lead with sentences — "you spent the week on ECON",
 * "112 pages behind, mostly POL", "3 courses quiet this week". Every one of
 * those is a claim about the data, and a claim that is computed inline in JSX
 * is a claim nobody can check. They are all computed here instead, so a page
 * is only ever arranging facts it was handed.
 */

/** Sessions that actually count: long enough to be real, inside the range. */
export function loggable(sessions: Session[]): Session[] {
  return sessions.filter((s) => isLoggableDuration(s.durationSeconds));
}

export function secondsInRange(sessions: Session[], from: string, to: string): number {
  return sessions
    .filter((s) => s.date >= from && s.date <= to)
    .reduce((acc, s) => acc + s.durationSeconds, 0);
}

/** Seconds logged per course over a date range, keyed by course id. */
export function secondsByCourse(
  sessions: Session[],
  from: string,
  to: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    out[s.courseId] = (out[s.courseId] || 0) + s.durationSeconds;
  }
  return out;
}

export function weekBounds(d = new Date()): [string, string] {
  return [isoDate(startOfWeek(d)), isoDate(endOfWeek(d))];
}

/**
 * The single thing most worth doing next: whatever is furthest overdue, or
 * failing that whatever is due soonest, with a high-priority mark breaking a
 * tie. Undated work never wins — the app does not invent urgency.
 */
export function nextUp(tasks: Task[], today = isoDate()): Task | null {
  const open = tasks.filter((t) => !t.completed && t.dueDate);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const byDate = (a.dueDate as string).localeCompare(b.dueDate as string);
    if (byDate !== 0) return byDate;
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  })[0];
}

/** How long ago each course was last opened, in days. Absent means never. */
export function daysQuiet(
  courses: Course[],
  sessions: Session[],
  today = isoDate(),
): Record<string, number | null> {
  const last: Record<string, string> = {};
  for (const s of sessions) {
    if (!last[s.courseId] || s.date > last[s.courseId]) last[s.courseId] = s.date;
  }
  const out: Record<string, number | null> = {};
  for (const course of courses) {
    out[course.id] = last[course.id] ? daysBetween(last[course.id], today) : null;
  }
  return out;
}

/** Courses untouched so far this week. The number the dashboard header says. */
export function quietThisWeek(courses: Course[], sessions: Session[], d = new Date()): Course[] {
  const [from, to] = weekBounds(d);
  const touched = new Set(
    sessions.filter((s) => s.date >= from && s.date <= to).map((s) => s.courseId),
  );
  return courses.filter((c) => !touched.has(c.id));
}

export interface Countdown {
  task: Task;
  course: Course | undefined;
  days: number;
}

/**
 * What is coming and what it is worth. Exams first, then anything carrying a
 * weight, then ordinary dated work — so "Coming" leads with the midterm
 * rather than with tomorrow's problem set.
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
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))
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
export function readingRate(tasks: Task[], sessions: Session[]): number {
  const readingIds = new Set(tasks.filter((t) => t.kind === 'reading').map((t) => t.id));
  const done = tasks.filter((t) => t.completed && t.kind === 'reading');
  const pages = done.reduce((acc, t) => acc + (t.pages || 0), 0);
  const seconds = sessions
    .filter((s) => s.taskId && readingIds.has(s.taskId))
    .reduce((acc, s) => acc + s.durationSeconds, 0);
  if (pages < 20 || seconds < 3600) return 20;
  return Math.round(pages / (seconds / 3600));
}

/**
 * Where a course's grade stands. `marked` is how much of the course has come
 * back, `earned` is the share of that which was actually scored, and
 * `percent` is the mark so far — out of what has been marked, not out of 100,
 * because a student who is 28% of the way through a course has not scored 24.
 */
export function gradeStanding(course: Course) {
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

/* ───────── The day, laid out on a line ───────── */

export interface DayBlock {
  id: string;
  label: string;
  detail: string;
  color: string;
  /** Minutes from midnight. */
  start: number;
  end: number;
  kind: 'class' | 'study';
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Best-effort reading of a stored meeting time.
 *
 * `meetingTime` is a display string that came out of the course catalog
 * ("Mon & Wed, 9:30–10:45", "TueThu 14:00"), not structured data, so this
 * parses what it can and gives up cleanly on the rest. A course it cannot
 * read simply contributes no class block — the day still draws, with the
 * study blocks on it, which is the behaviour that matters.
 */
export function parseMeeting(
  meetingTime: string | null | undefined,
): { days: number[]; start: number; end: number } | null {
  if (!meetingTime) return null;
  const text = meetingTime.toLowerCase();

  const days: number[] = [];
  DAY_NAMES.forEach((name, index) => {
    if (text.includes(name)) days.push(index);
  });
  if (days.length === 0) return null;

  const times = [...text.matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)?/g)];
  if (times.length === 0) return null;

  const toMinutes = (m: RegExpMatchArray) => {
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    if (m[3] === 'pm' && hour < 12) hour += 12;
    if (m[3] === 'am' && hour === 12) hour = 0;
    return hour * 60 + minute;
  };

  const start = toMinutes(times[0]);
  const end = times[1] ? toMinutes(times[1]) : start + 75;
  return { days, start, end: end > start ? end : start + 75 };
}

/**
 * The blocks on today's line: classes the reader has, and the sittings they
 * actually did. A session records when it was written down rather than when
 * it began, so the block is drawn backwards from `createdAt`, which is the
 * moment the timer stopped.
 */
export function dayBlocks(
  courses: Course[],
  sessions: Session[],
  today = isoDate(),
): DayBlock[] {
  const weekday = new Date(today + 'T00:00:00').getDay();
  const blocks: DayBlock[] = [];

  for (const course of courses) {
    const meeting = parseMeeting(course.meetingTime);
    if (!meeting || !meeting.days.includes(weekday)) continue;
    blocks.push({
      id: `class-${course.id}`,
      label: course.code,
      detail: `${formatClock(meeting.start)} · class`,
      color: course.color,
      start: meeting.start,
      end: meeting.end,
      kind: 'class',
    });
  }

  for (const session of sessions.filter((s) => s.date === today)) {
    const stopped = new Date(session.createdAt);
    if (Number.isNaN(stopped.getTime())) continue;
    const end = stopped.getHours() * 60 + stopped.getMinutes();
    const start = Math.max(0, end - Math.round(session.durationSeconds / 60));
    const course = courses.find((c) => c.id === session.courseId);
    blocks.push({
      id: `study-${session.id}`,
      label: course?.code ?? 'Study',
      detail: formatClock(start),
      color: course?.color ?? 'var(--ink)',
      start,
      end,
      kind: 'study',
    });
  }

  return blocks.sort((a, b) => a.start - b.start);
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
