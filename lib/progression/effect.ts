import type { Course } from '../data';
import { MARKS_PER_PAGE } from './constants';
import type { Progression } from './index';
import type { MarkCandidate } from './next-mark';

/**
 * What one sitting did to the record.
 *
 * Read by holding two readings of the term side by side: the one made of
 * logged sessions alone, and the same reading with the sitting on the clock
 * folded in. Whatever differs is what the sitting did. Nothing is stored and
 * nothing is scored; a mark that lands here is the same mark the Record page
 * will show tomorrow, because both are the same arithmetic over the same rows.
 *
 * It is written for two moments. While the clock runs it is the line under
 * the timer, growing as the sitting does: "a mark inked on MATH · today
 * counts · 38 minutes to the next mark". When the clock stops it is the
 * answer to "log this session?", which used to show a duration and a
 * question and nothing about why the duration mattered. The moment of
 * logging is the one place a reader is guaranteed to look, and it said
 * nothing.
 *
 * The voice is the Next Mark voice: lowercase, factual, no praise. A sitting
 * that inked a mark is told a mark was inked. It is not told well done.
 */

export interface SittingEffect {
  courseId: string;
  /** Marks inked on the sitting's course. */
  marks: number;
  /** Pages bound on the sitting's course. */
  pages: number;
  /**
   * How the course's open page should be drawn: how many marks are on it, and
   * how many of those this sitting put there. A page that bound this sitting
   * is drawn full rather than as the empty page behind it, because a full
   * page is the thing that just happened.
   */
  tally: { inked: number; fresh: number };
  /** Lowercase lines, largest thing first, at most three. */
  lines: string[];
  /** The nearest thing after this sitting, or null when nothing is close. */
  next: MarkCandidate | null;
}

const MAX_LINES = 3;

export function readSittingEffect(
  before: Progression,
  after: Progression,
  courses: Course[],
  courseId: string,
  date: string,
): SittingEffect {
  const course = courses.find((c) => c.id === courseId);
  const code = course?.code ?? 'this course';

  const pagesBefore = before.pages.get(courseId);
  const pagesAfter = after.pages.get(courseId);
  const marks = Math.max(0, (pagesAfter?.marks ?? 0) - (pagesBefore?.marks ?? 0));
  const pages = Math.max(0, (pagesAfter?.bound ?? 0) - (pagesBefore?.bound ?? 0));

  const lines: string[] = [];

  // A page joining the record is the largest thing a sitting can do to a
  // course, so it leads and the marks that made it are left to the drawing.
  if (pages > 0) {
    lines.push(
      pages === 1
        ? `page ${(pagesBefore?.bound ?? 0) + 1} of ${code} bound`
        : `${pages} pages of ${code} bound`,
    );
  }

  // The week. The run is the one thing built out of weeks rather than
  // minutes, so a week joining it comes before a mark.
  const weekBefore = before.runs.thisWeek?.counts ?? false;
  const weekAfter = after.runs.thisWeek?.counts ?? false;
  if (!weekBefore && weekAfter) {
    lines.push(
      after.runs.current > 1
        ? `this week joins the run · ${after.runs.current} weeks`
        : 'this week counts',
    );
  }

  if (pages === 0 && marks > 0) {
    lines.push(marks === 1 ? `a mark inked on ${code}` : `${marks} marks inked on ${code}`);
  }

  // The day, said only when the week did not already say it.
  const dayBefore = dayState(before, date);
  const dayAfter = dayState(after, date);
  if (dayBefore !== 'qualified' && dayAfter === 'qualified' && weekBefore === weekAfter) {
    lines.push('today counts');
  }

  // The course's week: on it at all, or its goal reached.
  const weekStart = after.runs.thisWeek?.start ?? null;
  if (weekStart) {
    const secondsBefore = weekSeconds(before, courseId, weekStart);
    const secondsAfter = weekSeconds(after, courseId, weekStart);
    const goal = (course?.weeklyGoalHours ?? 0) * 3600;
    if (goal > 0 && secondsBefore < goal && secondsAfter >= goal) {
      lines.push(`the week on ${code} is done`);
    } else if (secondsBefore === 0 && secondsAfter > 0 && marks === 0 && pages === 0) {
      lines.push(`${code} is on this week`);
    }
  }

  // Impressions. Only the rung struck, in the same words the Record uses.
  for (const ladder of after.ladders) {
    const was = before.impressions.find((i) => i.id === ladder.id)?.struck ?? 0;
    const now = after.impressions.find((i) => i.id === ladder.id)?.struck ?? 0;
    if (now > was) {
      lines.push(`${ladder.name.toLowerCase()} · ${ladder.format(ladder.thresholds[now - 1])} struck`);
    }
  }

  const onPage = pagesAfter?.onPage ?? 0;
  const tally =
    pages > 0 && onPage === 0
      ? { inked: MARKS_PER_PAGE, fresh: Math.min(marks, MARKS_PER_PAGE) }
      : { inked: onPage, fresh: Math.min(marks, onPage) };

  return {
    courseId,
    marks,
    pages,
    tally,
    lines: lines.slice(0, MAX_LINES),
    next: after.nextMark.shown,
  };
}

function dayState(reading: Progression, iso: string): string | null {
  for (const week of reading.runs.weeks) {
    const day = week.days.find((d) => d.iso === iso);
    if (day) return day.state;
  }
  return null;
}

function weekSeconds(reading: Progression, courseId: string, weekStart: string): number {
  let total = 0;
  for (const entry of reading.ledger) {
    if (entry.iso < weekStart || entry.iso > reading.today) continue;
    total += entry.rawByCourse.get(courseId) ?? 0;
  }
  return total;
}
