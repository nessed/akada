import type { Course, Task } from '../data';
import {
  DAY_QUALIFY_SECONDS,
  PLAIN_MARKS_PER_DAY,
  WEEK_BREADTH_COURSES,
  WEEK_BREADTH_DAYS,
  WEEK_CONSISTENT_DAYS,
} from './constants';
import type { DayCredit } from './credit';
import type { CoursePages } from './pages';
import type { RunWeek } from './runs';

/**
 * Next Mark.
 *
 * One quiet line that names the nearest true thing the student is close to
 * finishing. Finish it and the state moves and something else becomes
 * nearest. That is the entire progression surface; everything else in this
 * folder exists to make this line honest.
 *
 * Two rules it must not break.
 *
 * It never invents an estimate the app cannot compute. Akada does not know
 * how long an essay has left, so Next Mark never says. Every candidate here
 * is a distance in credited minutes or a count of marks, both of which are
 * arithmetic over things already recorded.
 *
 * And raw duration alone does not keep generating marks all day. Once a
 * couple of plain marks have been inked, the time served candidates stop
 * offering themselves, and anything further has to come out of course or week
 * structure or nothing is shown at all. A line that is always there is
 * wallpaper, and wallpaper is not a prompt.
 */

export type MarkKind =
  | 'course-mark'
  | 'course-page'
  | 'week-goal'
  | 'week-counts'
  | 'untouched-course'
  | 'day-threshold';

export interface MarkCandidate {
  id: string;
  kind: MarkKind;
  courseId: string | null;
  /** The line as it renders. Lowercase, factual, no deadline, no urgency. */
  line: string;
  /** Credited seconds still to go. */
  remaining: number;
  /**
   * Lower sorts first. See the ranking note below. A whole number from the
   * hand written table, moved by a fraction of a tier by what this reader
   * has done with lines of this kind before (`bias`).
   */
  tier: number;
  /** Days to the graded work that steered this candidate, if any. */
  deadlineDays: number | null;
}

export interface NextMarkReading {
  /** The one line to render, or null when nothing is close enough to name. */
  shown: MarkCandidate | null;
  /** Everything considered, best first. The ones not shown are worth logging. */
  candidates: MarkCandidate[];
  /** Why nothing is shown, for the log rather than for the screen. */
  silence: 'none-close' | 'plain-marks-spent' | 'no-courses' | null;
}

/** "20 minutes" / "1 hour" / "1 hour 5 minutes". Spelled out, never "20m". */
function minutesLabel(seconds: number): string {
  const total = Math.max(1, Math.round(seconds / 60));
  if (total < 60) return `${total} ${total === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const head = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return rest === 0 ? head : `${head} ${rest} ${rest === 1 ? 'minute' : 'minutes'}`;
}

export interface NextMarkInput {
  courses: Course[];
  tasks: Task[];
  ledger: DayCredit[];
  pages: Map<string, CoursePages>;
  today: string;
  weekStart: string;
  /** Marks inked today across all courses. */
  markedToday: number;
  /** The week being lived, from the run reading. Null before anything is logged. */
  thisWeek: RunWeek | null;
  /** Counting weeks up to now, this week included only if it already counts. */
  runCurrent: number;
  /**
   * How far away a thing can be and still be named, in credited seconds.
   * Roughly one sitting: the shipped figure until the term has shown what
   * one of this reader's sittings is, then that. See habits.ts.
   */
  reach: number;
  /**
   * Fractions of a tier, by kind, learned from the device's own log of
   * which lines were followed by a sitting. Negative moves a kind up. Empty
   * until enough lines have been shown to say anything. See log.ts.
   */
  bias: Partial<Record<MarkKind, number>>;
  /**
   * True when nothing has been logged for several days. Returning after a gap
   * gets the smallest sensible next action rather than the best ranked one,
   * and no line anywhere counts what was lost.
   */
  returning: boolean;
}

export function readNextMark(input: NextMarkInput): NextMarkReading {
  const {
    courses,
    tasks,
    ledger,
    pages,
    today,
    weekStart,
    markedToday,
    returning,
    thisWeek,
    runCurrent,
    reach,
    bias,
  } = input;
  if (courses.length === 0) return { shown: null, candidates: [], silence: 'no-courses' };

  const week = ledger.filter((d) => d.iso >= weekStart && d.iso <= today);
  const todayEntry = ledger.find((d) => d.iso === today);

  const weekSecondsFor = (courseId: string) =>
    week.reduce((acc, d) => acc + (d.rawByCourse.get(courseId) ?? 0), 0);

  /* ── What steers the ranking ─────────────────────────────────────────── */

  // The course just worked. Two days of memory, so the line does not jump to
  // another course the morning after a long evening on this one.
  const recent = [...ledger].reverse().find((d) => d.rawByCourse.size > 0);
  const justWorked =
    recent && daysBetween(recent.iso, today) <= 2
      ? [...recent.rawByCourse.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      : undefined;

  // Graded work coming up, by course. This steers which candidate is picked
  // and never appears in the copy: a planner that says "three days to the
  // midterm" beside a progress line is a planner selling anxiety.
  const deadlineByCourse = new Map<string, number>();
  for (const task of tasks) {
    if (task.completed || !task.dueDate || task.dueDate < today) continue;
    if (task.kind !== 'exam' && !(task.weight ?? 0)) continue;
    const days = daysBetween(today, task.dueDate);
    if (days > 10) continue;
    const held = deadlineByCourse.get(task.courseId);
    if (held === undefined || days < held) deadlineByCourse.set(task.courseId, days);
  }

  const untouched = new Set(courses.filter((c) => weekSecondsFor(c.id) === 0).map((c) => c.id));

  // The course furthest behind its weekly goal, as a share of that goal. Only
  // a course that set a goal can be behind one.
  const behind = courses
    .filter((c) => c.weeklyGoalHours > 0)
    .map((c) => ({ id: c.id, share: weekSecondsFor(c.id) / (c.weeklyGoalHours * 3600) }))
    .sort((a, b) => a.share - b.share)[0];

  const tierFor = (courseId: string | null): number => {
    if (!courseId) return 4;
    // The one thing that speaks for the whole week outranks any single
    // course: it is the largest true thing on the board and the only one
    // that moves the run. The course just worked ties with it at the top
    // and the shorter distance decides.
    if (courseId === WEEK) return 0;
    if (courseId === justWorked) return 0;
    if (deadlineByCourse.has(courseId)) return 1;
    if (untouched.has(courseId)) return 2;
    if (behind && courseId === behind.id) return 3;
    return 5;
  };

  /* ── The candidates ──────────────────────────────────────────────────── */

  const candidates: MarkCandidate[] = [];
  const push = (c: Omit<MarkCandidate, 'tier' | 'deadlineDays'>) => {
    const base =
      c.kind === 'day-threshold' ? 4 : c.kind === 'week-counts' ? tierFor(WEEK) : tierFor(c.courseId);
    candidates.push({
      ...c,
      tier: base + (bias[c.kind] ?? 0),
      deadlineDays: c.courseId ? (deadlineByCourse.get(c.courseId) ?? null) : null,
    });
  };

  for (const course of courses) {
    const record = pages.get(course.id);
    if (!record) continue;

    if (record.toBind === 1) {
      // One mark from binding. A page joins the course record permanently,
      // which is a bigger thing than a mark, so on this course it speaks
      // instead of the plain mark rather than alongside it.
      push({
        id: `page:${course.id}`,
        kind: 'course-page',
        courseId: course.id,
        line: `${minutesLabel(record.toNextMark)} binds this page of ${course.code}`,
        remaining: record.toNextMark,
      });
    } else {
      // The first mark is the short one, and it is short precisely so that
      // it can be named on the day the course is added. A course with no
      // marks used to get no line at all, which left the one course most in
      // need of a first foothold as the one course never offered one.
      push({
        id: `mark:${course.id}`,
        kind: 'course-mark',
        courseId: course.id,
        line:
          record.marks === 0
            ? `${minutesLabel(record.toNextMark)} to the first mark on ${course.code}`
            : `${minutesLabel(record.toNextMark)} to the next mark on ${course.code}`,
        remaining: record.toNextMark,
      });
    }

    if (untouched.has(course.id)) {
      push({
        id: `untouched:${course.id}`,
        kind: 'untouched-course',
        courseId: course.id,
        line: `${minutesLabel(DAY_QUALIFY_SECONDS)} puts ${course.code} on this week`,
        remaining: DAY_QUALIFY_SECONDS,
      });
    } else if (course.weeklyGoalHours > 0) {
      const left = course.weeklyGoalHours * 3600 - weekSecondsFor(course.id);
      if (left > 0) {
        push({
          id: `week:${course.id}`,
          kind: 'week-goal',
          courseId: course.id,
          line: `${minutesLabel(left)} to the week on ${course.code}`,
          remaining: left,
        });
      }
    }
  }

  const todayShort = DAY_QUALIFY_SECONDS - (todayEntry?.rawTotal ?? 0);

  // The week. When today is the day that would make this week count, that is
  // the thing to name, because it is the only candidate here that moves the
  // run, and the run is the one thing in the app that is built out of weeks
  // rather than minutes. Today counting is then part of the same sentence
  // rather than a second line saying a smaller version of the same thing.
  const weekCounts = weekWouldCount(thisWeek, today, courses.length);
  if (weekCounts && todayShort > 0) {
    push({
      id: 'week',
      kind: 'week-counts',
      courseId: null,
      line:
        runCurrent > 0
          ? `${minutesLabel(todayShort)} makes it ${runCurrent + 1} weeks running`
          : `${minutesLabel(todayShort)} makes this week count`,
      remaining: todayShort,
    });
  } else if (todayShort > 0) {
    push({
      id: 'day',
      kind: 'day-threshold',
      courseId: null,
      line: `${minutesLabel(todayShort)} until today counts`,
      remaining: todayShort,
    });
  }

  /* ── Which one speaks ────────────────────────────────────────────────── */

  const plainSpent = markedToday >= PLAIN_MARKS_PER_DAY;
  const eligible = candidates
    .filter((c) => c.remaining > 0 && c.remaining <= reach)
    .filter((c) => !plainSpent || (c.kind !== 'day-threshold' && c.kind !== 'course-mark'))
    .sort((a, b) =>
      // Coming back from a gap, the nearest thing wins outright. The ranking
      // exists to pick between things a student is already among; it is the
      // wrong tool for the first sitting after a fortnight, where the only
      // useful answer is the smallest one.
      returning
        ? a.remaining - b.remaining
        : a.tier - b.tier ||
          (a.deadlineDays ?? 99) - (b.deadlineDays ?? 99) ||
          a.remaining - b.remaining,
    );

  const ranked = [...candidates].sort((a, b) => a.tier - b.tier || a.remaining - b.remaining);

  return {
    shown: eligible[0] ?? null,
    candidates: ranked,
    silence: eligible.length > 0 ? null : plainSpent ? 'plain-marks-spent' : 'none-close',
  };
}

/** A stand-in course id for the week itself, so the tier table can rank it. */
const WEEK = '\u0000week';

/**
 * Whether today qualifying would be the day that makes this week count, by
 * either route. Breadth reads the courses already touched this week; the
 * twenty minutes might land on a new course or an old one and the line does
 * not know which, so it only speaks when the spread is already there.
 */
function weekWouldCount(week: RunWeek | null, today: string, courseCount: number): boolean {
  if (!week || week.counts) return false;
  if (week.days.find((d) => d.iso === today)?.state === 'qualified') return false;
  const withToday = week.studyDays + 1;
  if (withToday >= WEEK_CONSISTENT_DAYS) return true;
  const breadthTarget = Math.min(WEEK_BREADTH_COURSES, Math.max(1, courseCount));
  return withToday >= WEEK_BREADTH_DAYS && week.courses >= breadthTarget;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000,
  );
}
