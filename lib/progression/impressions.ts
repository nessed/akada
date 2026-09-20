import type { Course, Session, Task } from '../data';
import { isLoggableDuration } from '../session-safety';
import type { DayCredit } from './credit';
import type { CoursePages } from './pages';
import type { RunReading } from './runs';

/**
 * Impressions.
 *
 * The old stamps were binary: twelve things you either had or did not, so a
 * term in you were staring at a wall of grey with nothing near. These are
 * ladders instead. Every ladder has a next rung, the sheet only ever names
 * the next reachable one, and the rungs behind it stay struck in the record.
 *
 * Two of the old stamps are gone rather than laddered. "Zero overdue tasks"
 * was earned by deleting work, and shamed a student whose backlog was real
 * and legitimate. "Finish a task in one sitting" paid for writing artificially
 * small tasks. Neither measured studying.
 *
 * No impression confers any mechanical benefit. None of them feeds the pages,
 * the runs or Next Mark. They are a record of what happened, which is the only
 * reward this design has.
 */

export interface Ladder {
  id: string;
  name: string;
  /** What is being counted, for the line under the name. */
  unit: string;
  thresholds: number[];
  /** Where the student stands, in the same unit. */
  value: number;
  /** How a threshold prints inside the ring. */
  format: (n: number) => string;
}

export interface Impression {
  id: string;
  name: string;
  /** What prints inside the ring. */
  mark: string;
  /** How many rungs of this ladder are struck. */
  struck: number;
  rungs: number;
  /** Set on the next rung: the distance left, e.g. "31 / 50 hours". */
  progress: string | null;
  /** Set when the ladder is finished: nothing further to reach. */
  complete: boolean;
}

function hoursLabel(n: number) {
  return `${n}h`;
}
function plainLabel(n: number) {
  return String(n);
}
function weekLabel(n: number) {
  return `${n}w`;
}

export function readLadders(
  courses: Course[],
  sessions: Session[],
  tasks: Task[],
  ledger: DayCredit[],
  pages: Map<string, CoursePages>,
  runs: RunReading,
): Ladder[] {
  const logged = sessions.filter((s) => isLoggableDuration(s.durationSeconds));

  // True hours, not credited ones. An impression is part of the record, and
  // the record always reports what actually happened.
  const termHours = ledger.reduce((acc, d) => acc + d.rawTotal, 0) / 3600;
  const longestHours = logged.reduce((acc, s) => Math.max(acc, s.durationSeconds), 0) / 3600;
  const bound = [...pages.values()].reduce((acc, p) => acc + p.bound, 0);
  const activeDays = runs.weeks.reduce(
    (acc, w) => acc + w.days.filter((d) => d.state === 'qualified').length,
    0,
  );

  // A week in which every course was touched. Zero courses is not a full
  // week, it is an empty planner.
  const breadthWeeks =
    courses.length === 0 ? 0 : runs.weeks.filter((w) => w.courses >= courses.length).length;

  const early = tasks.filter((t) => {
    if (!t.completed || !t.completedAt || !t.dueDate) return false;
    const done = new Date(t.completedAt.slice(0, 10) + 'T12:00:00').getTime();
    const due = new Date(t.dueDate + 'T12:00:00').getTime();
    return (due - done) / 86_400_000 >= 3;
  }).length;

  return [
    {
      id: 'hours',
      name: 'Hours in the term',
      unit: 'hours logged',
      thresholds: [10, 25, 50, 100, 200],
      value: Math.floor(termHours),
      format: hoursLabel,
    },
    {
      id: 'run',
      name: 'Weeks in a row',
      unit: 'weeks, best run',
      thresholds: [2, 4, 8, 12],
      value: runs.best,
      format: weekLabel,
    },
    {
      id: 'pages',
      name: 'Pages bound',
      unit: 'pages across every course',
      thresholds: [1, 3, 6, 12, 24],
      value: bound,
      format: plainLabel,
    },
    {
      id: 'breadth',
      name: 'Every course in a week',
      unit: 'weeks with nothing left out',
      thresholds: [1, 3, 6, 12],
      value: breadthWeeks,
      format: plainLabel,
    },
    {
      id: 'sitting',
      name: 'One sitting',
      unit: 'hours, longest session',
      thresholds: [1, 2, 3],
      value: Math.floor(longestHours),
      format: hoursLabel,
    },
    {
      id: 'early',
      name: 'Finished early',
      unit: 'tasks done three days ahead',
      thresholds: [1, 3, 10],
      value: early,
      format: plainLabel,
    },
    {
      id: 'days',
      name: 'Days that counted',
      unit: 'study days in the term',
      thresholds: [10, 30, 75, 150],
      value: activeDays,
      format: plainLabel,
    },
  ];
}

/**
 * One ladder read as the single impression it is currently offering.
 *
 * Only the next rung is ever named. A student two hours into the term is not
 * shown that two hundred hours exists, because a distance nobody can picture
 * is not a goal, it is a discouragement with a number on it.
 */
export function impressionOf(ladder: Ladder): Impression {
  const struck = ladder.thresholds.filter((t) => ladder.value >= t).length;
  const next = ladder.thresholds[struck];
  const complete = next === undefined;
  return {
    id: ladder.id,
    name: ladder.name,
    mark: ladder.format(complete ? ladder.thresholds[ladder.thresholds.length - 1] : next),
    struck,
    rungs: ladder.thresholds.length,
    progress: complete ? null : `${ladder.value} / ${next}`,
    complete,
  };
}
