import type { Course, Session, Task, WeakPoint } from '@/lib/data/types';
import { countdowns, readingBacklog, readingRateDetail } from '@/lib/derive';
import { readHabits } from '@/lib/progression/habits';
import type { CourseRecall, RecallReading } from '@/lib/recall';
import { isLoggableDuration } from '@/lib/session-safety';
import { shiftDate, weekOf } from '@/lib/student-day';
import { readUpNext, type UpNextCandidate } from '@/lib/up-next';
import { orLine, pickLine, plain, whyOf, type UpNextWhy } from '@/lib/up-next-copy';
import { sizeSession } from '@/lib/up-next-session';
import { daysBetween } from '@/lib/utils';

/**
 * Everything Today knows, read in one pass, for a reader that cannot see the
 * screen: the connector's get_briefing.
 *
 * Nothing here is new judgement. Up next is readUpNext, sized by
 * sizeSession and worded by the same lines Today prints under its title; the
 * countdowns are countdowns, the pace is readingRateDetail, recall is
 * whatever readRecall said. What this adds is the join the app never makes in
 * one place: an exam next to how much of its course is settled in recall and
 * how many weak points are open on it, a week's hours next to each course's
 * goal and how long since it was touched, and the loose ends (a quiz waiting
 * to be marked, a grading scheme waiting to be accepted, a course with
 * nothing on its list) that sit on four different screens.
 *
 * Pure, so a test drives it with plain objects, and so it can never read a
 * clock: `today` is the student's, from lib/student-day.ts.
 */

/**
 * The short tag beside Up next. It lives with the rest of Up next's words now
 * (lib/up-next-copy.ts), where it is worked out from the same candidate the
 * pick is, so the tag can no longer disagree with the pick the way the old
 * whyUpNext did when it had no ten-minute floor and the pick had one.
 * Re-exported so a reader of the briefing's types still finds it here.
 */
export type { UpNextWhy };

export interface BriefingQuiz {
  id: string;
  title: string;
  courseId: string | null;
  awaitingMarking: boolean;
  url: string | null;
}

export interface BriefingInput {
  today: string;
  courses: Course[];
  tasks: Task[];
  sessions: Session[];
  recall: RecallReading;
  /** False when the project has nowhere to store recall answers yet. */
  recallStored: boolean;
  /** Open weak points, or null where the table is not there yet. */
  weakPoints: WeakPoint[] | null;
  /** Recent quizzes, or null where the table is not there yet. */
  quizzes: BriefingQuiz[] | null;
}

export interface ComingExam {
  task: Task;
  course: Course | undefined;
  days: number;
  /** The course's recall, which is how much of it would come back today. */
  recall: Pick<CourseRecall, 'kept' | 'settled' | 'due'> | null;
  openWeakPoints: number | null;
  hasScheme: boolean;
}

export interface CourseWeek {
  course: Course;
  hours: number;
  goalHours: number;
  shortBy: number;
  lastStudied: string | null;
  daysSinceStudied: number | null;
  openTasks: number;
}

export interface PracticeRun {
  course: Course;
  papers: number;
  last: { score: number; outOf: number; date: string };
  best: { score: number; outOf: number; date: string };
}

/**
 * One thing Up next offers, as the connector says it: the task, or null for
 * a course offered before its exam (the title then reads "Before Midterm I");
 * the tag and the line Today prints for it; and the length its Start gives.
 */
export interface BriefingUpNextOffer {
  task: Task | null;
  course: Course;
  title: string;
  why: UpNextWhy;
  /** The pick's full line (why · when); an Or row's one clause. */
  reason: string;
  minutes: number;
}

export interface BriefingUpNext extends BriefingUpNextOffer {
  /** The exam or major piece this leads up to, and how many days off it is. */
  prepFor: { task: Task; days: number } | null;
  /** The two Today offers under Or, at most. */
  others: BriefingUpNextOffer[];
}

export interface Briefing {
  today: string;
  upNext: BriefingUpNext | null;
  overdue: Task[];
  /** Due today and over the next week, soonest first. */
  dueSoon: Task[];
  coming: ComingExam[];
  week: { from: string; to: string; daysLeft: number; hours: number; goalHours: number; todayHours: number; courses: CourseWeek[] };
  recall: { stored: boolean; due: number; queue: number; byCourse: CourseRecall[] };
  reading: { readings: number; pages: number; withoutPages: number; hours: number; pagesPerHour: number; measured: boolean };
  weakPoints: { available: boolean; open: number; byCourse: Map<string, number> };
  quizzesAwaitingMarking: BriefingQuiz[];
  gradingWaiting: Course[];
  withoutScheme: Course[];
  emptyCourses: Course[];
  /** No exam anywhere in the term, done or not: the countdown has nothing. */
  noExams: boolean;
  habits: {
    sittingsLast28: number;
    studyDaysLast28: number;
    medianSittingMinutes: number | null;
    /** The four full weeks before this one, oldest first, in hours. */
    weeklyHours: number[];
    practice: PracticeRun[];
  };
}

/** How far ahead "due soon" and the exam readiness reach. */
const SOON_DAYS = 7;
const COMING_LIMIT = 5;

const hoursOf = (seconds: number) => Math.round((seconds / 3600) * 10) / 10;

export function readBriefing({ today, courses, tasks, sessions, recall, recallStored, weakPoints, quizzes }: BriefingInput): Briefing {
  const logged = sessions.filter((s) => isLoggableDuration(s.durationSeconds));
  const open = tasks.filter((t) => !t.completed);
  const overdue = open
    .filter((t) => t.dueDate && t.dueDate < today)
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
  const horizon = shiftDate(today, SOON_DAYS);
  const dueSoon = open
    .filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= horizon)
    .sort(
      (a, b) =>
        (a.dueDate as string).localeCompare(b.dueDate as string) ||
        Number(b.priority === 'high') - Number(a.priority === 'high'),
    );

  // Up next, read the way Today reads it, from the same record and the same
  // date, so the connector and the screen name the same thing for the same
  // reason. What Today also reads and this cannot is all per device: what
  // was set aside with Not now and which Or row was put up instead (per day,
  // and the server has no device), and the length last started from the
  // popover, which only matters before the reader's blocks have settled and
  // is 45 here until they do. The clock is left out on purpose: it only ever
  // shortens Today's session to fit what is left of the evening, and a
  // server's evening is nobody's. So the pick and its line are Today's, and
  // the length is the one Today starts from before the evening trims it.
  const up = readUpNext({ today, courses, tasks, sessions: logged });
  const pace = readingRateDetail(tasks, logged);
  const habits = readHabits(courses, logged, tasks);
  const minutesFor = (c: UpNextCandidate) =>
    sizeSession(c, { habits, pace, tonight: null, lastUsedMinutes: null, returning: up.returning }).minutes;
  const offer = (c: UpNextCandidate, reason: string): BriefingUpNextOffer => ({
    task: c.task,
    course: c.course,
    title: c.title,
    why: whyOf(c, today),
    reason,
    minutes: minutesFor(c),
  });
  const pick = up.pick;
  const upNext: BriefingUpNext | null = pick
    ? {
        ...offer(pick, plain(pickLine(pick, today))),
        prepFor: pick.piece && pick.pieceDays != null ? { task: pick.piece, days: pick.pieceDays } : null,
        others: up.others.map((c) => offer(c, orLine(c, today))),
      }
    : null;

  const openWeak = new Map<string, number>();
  for (const point of weakPoints ?? []) {
    if (point.status !== 'open') continue;
    openWeak.set(point.courseId, (openWeak.get(point.courseId) ?? 0) + 1);
  }

  const coming = countdowns(tasks, courses, today, COMING_LIMIT).map(({ task, course, days }) => {
    const kept = recall.byCourse.get(task.courseId);
    return {
      task,
      course,
      days,
      recall: kept ? { kept: kept.kept, settled: kept.settled, due: kept.due } : null,
      openWeakPoints: weakPoints ? openWeak.get(task.courseId) ?? 0 : null,
      hasScheme: (course?.assessments?.length ?? 0) > 0,
    };
  });

  // The week, per course, beside each course's goal and its last sitting.
  const week = weekOf(today);
  const lastStudied = new Map<string, string>();
  const weekSeconds = new Map<string, number>();
  let todaySeconds = 0;
  for (const s of logged) {
    const seen = lastStudied.get(s.courseId);
    if (s.date <= today && (!seen || s.date > seen)) lastStudied.set(s.courseId, s.date);
    if (s.date >= week.from && s.date <= week.to) weekSeconds.set(s.courseId, (weekSeconds.get(s.courseId) ?? 0) + s.durationSeconds);
    if (s.date === today) todaySeconds += s.durationSeconds;
  }
  const courseWeeks: CourseWeek[] = courses.map((course) => {
    const hours = hoursOf(weekSeconds.get(course.id) ?? 0);
    const goalHours = Number(course.weeklyGoalHours) || 0;
    const last = lastStudied.get(course.id) ?? null;
    return {
      course,
      hours,
      goalHours,
      shortBy: Math.max(0, Math.round((goalHours - hours) * 10) / 10),
      lastStudied: last,
      daysSinceStudied: last ? daysBetween(last, today) : null,
      openTasks: open.filter((t) => t.courseId === course.id).length,
    };
  });

  const backlog = readingBacklog(tasks);
  const pages = backlog.reduce((acc, t) => acc + (t.pages || 0), 0);

  // The last four weeks and the last 28 days, which is what "how does this
  // student actually work" rests on.
  const since28 = shiftDate(today, -27);
  const recent = logged.filter((s) => s.date >= since28 && s.date <= today);
  const lengths = recent.map((s) => s.durationSeconds).sort((a, b) => a - b);
  const mid = Math.floor(lengths.length / 2);
  const median = lengths.length === 0 ? null : lengths.length % 2 ? lengths[mid] : (lengths[mid - 1] + lengths[mid]) / 2;
  const weeklyHours = [-4, -3, -2, -1].map((offset) => {
    const { from, to } = weekOf(today, offset);
    return hoursOf(logged.filter((s) => s.date >= from && s.date <= to).reduce((acc, s) => acc + s.durationSeconds, 0));
  });

  // Practice papers are the one measure of what came out rather than what
  // went in, and until now nothing read them back but a chart.
  const practice: PracticeRun[] = courses.flatMap((course) => {
    const papers = logged
      .filter((s) => s.courseId === course.id && typeof s.score === 'number' && typeof s.scoreOutOf === 'number' && s.scoreOutOf > 0)
      .map((s) => ({ score: s.score as number, outOf: s.scoreOutOf as number, date: s.date, at: s.createdAt }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
    if (papers.length === 0) return [];
    const best = papers.reduce((top, p) => (p.score / p.outOf > top.score / top.outOf ? p : top));
    const last = papers[papers.length - 1];
    return [{
      course,
      papers: papers.length,
      last: { score: last.score, outOf: last.outOf, date: last.date },
      best: { score: best.score, outOf: best.outOf, date: best.date },
    }];
  });

  return {
    today,
    upNext,
    overdue,
    dueSoon,
    coming,
    week: {
      from: week.from,
      to: week.to,
      daysLeft: daysBetween(today, week.to) + 1,
      hours: hoursOf([...weekSeconds.values()].reduce((a, b) => a + b, 0)),
      goalHours: courseWeeks.reduce((acc, c) => acc + c.goalHours, 0),
      todayHours: hoursOf(todaySeconds),
      courses: courseWeeks,
    },
    recall: {
      stored: recallStored,
      due: recall.due.length,
      queue: recall.queue.length,
      byCourse: [...recall.byCourse.values()],
    },
    reading: {
      readings: backlog.length,
      pages,
      withoutPages: backlog.filter((t) => !t.pages).length,
      hours: Math.round((pages / pace.pagesPerHour) * 10) / 10,
      pagesPerHour: pace.pagesPerHour,
      measured: pace.measured,
    },
    weakPoints: {
      available: weakPoints !== null,
      open: [...openWeak.values()].reduce((a, b) => a + b, 0),
      byCourse: openWeak,
    },
    quizzesAwaitingMarking: (quizzes ?? []).filter((q) => q.awaitingMarking),
    gradingWaiting: courses.filter((c) => Boolean(c.grading?.pending)),
    withoutScheme: courses.filter((c) => (c.assessments?.length ?? 0) === 0),
    emptyCourses: courses.filter((c) => !tasks.some((t) => t.courseId === c.id)),
    noExams: courses.length > 0 && !tasks.some((t) => t.kind === 'exam'),
    habits: {
      sittingsLast28: recent.length,
      studyDaysLast28: new Set(recent.map((s) => s.date)).size,
      medianSittingMinutes: median === null ? null : Math.round(median / 60),
      weeklyHours,
      practice,
    },
  };
}
