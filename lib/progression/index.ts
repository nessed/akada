import type { Course, Session, Task } from '../data';
import { isoDate, startOfWeek } from '../utils';
import { readCredit, type DayCredit } from './credit';
import { impressionOf, readLadders, type Impression, type Ladder } from './impressions';
import { readInk } from './ink';
import { readNextMark, type NextMarkReading } from './next-mark';
import { marksToday, readPages, type CoursePages } from './pages';
import { readRuns, type RunReading } from './runs';
import { readWeekShape, type WeekShape } from './week-shape';

/**
 * The progression layer, read in one pass.
 *
 * Everything here is derived from courses, sessions and tasks at read time.
 * Nothing is stored, so there is no state to migrate, nothing to backfill for
 * an account that has been logging all term, and no way for this layer to
 * disagree with Stats about what happened. That property is the reason the
 * old stamps file was safe to replace wholesale, and it is worth keeping.
 *
 * It is also what lets the sitting on the clock be read the same way. The
 * client folds the running timer in as one more session (lib/live-session.ts)
 * and calls this again, so every distance moves while the reader sits, and
 * the difference between the two readings is what the sitting has done so far
 * (./effect.ts). Nothing on the server ever sees the synthetic row.
 *
 * The one thing that accumulates is an accurate picture of the semester.
 * There is nothing to spend and nothing to collect, so faking any of it
 * produces a false picture of your own term, which is worth nothing to the
 * person who faked it. That is the whole integrity model, and it is why
 * nothing in this folder scores anomalies or asks anybody to be honest.
 */

export * from './constants';
export type { DayCredit } from './credit';
export type { CoursePages } from './pages';
export type { RunDay, RunReading, RunWeek } from './runs';
export type { Impression, Ladder } from './impressions';
export type { WeekShape } from './week-shape';
export type { MarkCandidate, MarkKind, NextMarkReading } from './next-mark';
export type { SittingEffect } from './effect';
export { describeWeek } from './runs';
export { impressionOf, readLadders } from './impressions';
export { readSittingEffect } from './effect';

export interface Progression {
  ledger: DayCredit[];
  /** Marks and bound pages, by course id. */
  pages: Map<string, CoursePages>;
  /** Ink density 0 to 1, by course id. Null for a course that opted out. */
  ink: Map<string, number | null>;
  runs: RunReading;
  /** This week beside a typical one. Null until there is a usually to claim. */
  weekShape: WeekShape | null;
  nextMark: NextMarkReading;
  ladders: Ladder[];
  impressions: Impression[];
  /** Whether today's claimed effort hit a taper, so the copy can say so. */
  taperedToday: boolean;
  /** Days since anything was logged. Zero on a day with something on it. */
  quietDays: number;
  /** Days from the first logged day to today, for the trust pulse cadence. */
  termDays: number;
  today: string;
}

export function readProgression(
  courses: Course[],
  sessions: Session[],
  tasks: Task[],
  today = isoDate(),
): Progression {
  const ledger = readCredit(courses, sessions, tasks);
  const pages = readPages(courses, ledger, today);
  const runs = readRuns(courses, ledger, today);
  const ladders = readLadders(courses, sessions, tasks, ledger, pages, runs);

  const lastActive = [...ledger].reverse().find((d) => d.rawTotal > 0)?.iso ?? null;
  const quietDays = lastActive ? daysApart(lastActive, today) : 0;

  const nextMark = readNextMark({
    courses,
    tasks,
    ledger,
    pages,
    today,
    weekStart: isoDate(startOfWeek(new Date(today + 'T12:00:00'))),
    markedToday: marksToday(pages),
    returning: quietDays >= 4,
    thisWeek: runs.thisWeek,
    runCurrent: runs.current,
  });

  return {
    ledger,
    pages,
    ink: readInk(courses, ledger, today),
    runs,
    weekShape: readWeekShape(runs.weeks, ledger),
    nextMark,
    ladders,
    impressions: ladders.map(impressionOf),
    taperedToday: ledger.find((d) => d.iso === today)?.tapered ?? false,
    quietDays,
    termDays: ledger.length > 0 ? daysApart(ledger[0].iso, today) + 1 : 0,
    today,
  };
}

function daysApart(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000,
  );
}
