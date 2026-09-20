import type { DayCredit } from './credit';
import type { RunWeek } from './runs';

/**
 * What a week usually looks like for this student, and what this one looks
 * like so far.
 *
 * This is comparison without a target. It states two numbers and stops: no
 * verb, nothing to beat, no praise for being above and no nudge for being
 * below. That restraint is the whole point. A personal best you are pushed to
 * top would make a bigger number the goal, and hours are the single easiest
 * thing in this app to fabricate, so a best-week chase would undo everything
 * the tapers are for.
 *
 * The typical week is a median rather than a mean, so one marathon week
 * before an exam does not quietly redefine "usually" for the rest of term.
 * Every completed week since the first logged one counts, empty ones
 * included, because a fortnight off is part of the shape of a term and
 * leaving it out would flatter the number.
 */

export interface WeekShape {
  /** True seconds logged in the week being lived. */
  thisWeek: number;
  /** The median completed week, in true seconds. */
  typical: number;
  /** How many completed weeks that median is drawn from. */
  weeks: number;
}

/** Fewer than this and there is no "usually" worth claiming. */
const MIN_WEEKS = 3;

export function readWeekShape(weeks: RunWeek[], ledger: DayCredit[]): WeekShape | null {
  const byIso = new Map(ledger.map((entry) => [entry.iso, entry]));
  const secondsIn = (week: RunWeek) =>
    week.days.reduce((acc, day) => acc + (byIso.get(day.iso)?.rawTotal ?? 0), 0);

  const completed = weeks.filter((w) => !w.inProgress);
  if (completed.length < MIN_WEEKS) return null;

  const totals = completed.map(secondsIn).sort((a, b) => a - b);
  const mid = Math.floor(totals.length / 2);
  const typical =
    totals.length % 2 === 1 ? totals[mid] : (totals[mid - 1] + totals[mid]) / 2;

  const living = weeks.find((w) => w.inProgress);

  return {
    thisWeek: living ? secondsIn(living) : 0,
    typical,
    weeks: completed.length,
  };
}
