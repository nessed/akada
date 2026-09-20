import type { Course, Task } from '../data';
import { DAY_QUALIFY_SECONDS, PLAIN_MARKS_PER_DAY, REACHABLE_SECONDS } from './constants';
import type { DayCredit } from './credit';
import type { CoursePages } from './pages';

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
  /** Lower sorts first. See the ranking note below. */
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
  /**
   * True when nothing has been logged for several days. Returning after a gap
   * gets the smallest sensible next action rather than the best ranked one,
   * and no line anywhere counts what was lost.
   */
  returning: boolean;
}

export function readNextMark(input: NextMarkInput): NextMarkReading {
  const { courses, tasks, ledger, pages, today, weekStart, markedToday, returning } = input;
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
    if (courseId === justWorked) return 0;
    if (deadlineByCourse.has(courseId)) return 1;
    if (untouched.has(courseId)) return 2;
    if (behind && courseId === behind.id) return 3;
    return 5;
  };

  /* ── The candidates ──────────────────────────────────────────────────── */

  const candidates: MarkCandidate[] = [];
  const push = (c: Omit<MarkCandidate, 'tier' | 'deadlineDays'>) => {
    candidates.push({
      ...c,
      tier: c.kind === 'day-threshold' ? 4 : tierFor(c.courseId),
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
    } else if (record.marks > 0) {
      push({
        id: `mark:${course.id}`,
        kind: 'course-mark',
        courseId: course.id,
        line: `${minutesLabel(record.toNextMark)} to the next mark on ${course.code}`,
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
  if (todayShort > 0) {
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
    .filter((c) => c.remaining > 0 && c.remaining <= REACHABLE_SECONDS)
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

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000,
  );
}
