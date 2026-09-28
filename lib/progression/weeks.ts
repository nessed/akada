import type { Task } from '../data';
import { MARKS_PER_PAGE } from './constants';
import type { DayCredit } from './credit';
import { marksFor } from './pages';
import type { RunWeek } from './runs';

/**
 * The term as a ledger, a line a week.
 *
 * The run says which weeks counted. This says what each of them held: the
 * true hours, the tallies they inked and the pages they bound on each
 * course, and what came off the list. Tallies are read off the credited
 * running total per course, week by week, so a week's tallies here always
 * add up to the marks on the course pages above it.
 */

export interface LedgerCourse {
  courseId: string;
  /** True seconds logged, untapered. */
  seconds: number;
  /** Tallies inked on this course's page during the week. */
  marks: number;
  /** Pages it bound during the week. */
  bound: number;
}

export interface LedgerWeek {
  /** Monday, ISO. */
  start: string;
  /** Counted from the first week anything was logged. */
  n: number;
  run: RunWeek;
  /** True seconds, every course. */
  seconds: number;
  marks: number;
  bound: number;
  tasksDone: number;
  /** Heaviest first. Only courses the week touched. */
  courses: LedgerCourse[];
  /** The week's biggest day, if it had one. */
  bestDay: { iso: string; seconds: number } | null;
}

function sundayOf(monday: string): string {
  const d = new Date(monday + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function readWeekLedger(ledger: DayCredit[], weeks: RunWeek[], tasks: Task[]): LedgerWeek[] {
  // Credited seconds per course, banked up to the end of each week.
  const running = new Map<string, number>();
  let cursor = 0;
  const sorted = [...ledger].sort((a, b) => a.iso.localeCompare(b.iso));

  const done = new Map<string, number>();
  for (const t of tasks) {
    if (!t.completed || !t.completedAt || t.completedVia === 'skip') continue;
    const iso = t.completedAt.slice(0, 10);
    done.set(iso, (done.get(iso) ?? 0) + 1);
  }

  return weeks.map((run, index) => {
    const end = sundayOf(run.start);
    const before = new Map(running);
    const raw = new Map<string, number>();
    let bestDay: LedgerWeek['bestDay'] = null;
    let seconds = 0;
    while (cursor < sorted.length && sorted[cursor].iso <= end) {
      const entry = sorted[cursor];
      if (entry.iso >= run.start) {
        for (const [id, sec] of entry.rawByCourse) raw.set(id, (raw.get(id) ?? 0) + sec);
        seconds += entry.rawTotal;
        if (entry.rawTotal > 0 && (!bestDay || entry.rawTotal > bestDay.seconds)) {
          bestDay = { iso: entry.iso, seconds: entry.rawTotal };
        }
      }
      for (const [id, sec] of entry.byCourse) running.set(id, (running.get(id) ?? 0) + sec);
      cursor += 1;
    }

    const ids = new Set([...raw.keys(), ...running.keys()]);
    const courses: LedgerCourse[] = [];
    for (const id of ids) {
      const from = marksFor(before.get(id) ?? 0);
      const to = marksFor(running.get(id) ?? 0);
      const sec = raw.get(id) ?? 0;
      if (sec === 0 && to === from) continue;
      courses.push({
        courseId: id,
        seconds: sec,
        marks: to - from,
        bound: Math.floor(to / MARKS_PER_PAGE) - Math.floor(from / MARKS_PER_PAGE),
      });
    }
    courses.sort((a, b) => b.seconds - a.seconds);

    let tasksDone = 0;
    for (const day of run.days) tasksDone += done.get(day.iso) ?? 0;

    return {
      start: run.start,
      n: index + 1,
      run,
      seconds,
      marks: courses.reduce((a, c) => a + c.marks, 0),
      bound: courses.reduce((a, c) => a + c.bound, 0),
      tasksDone,
      courses,
      bestDay,
    };
  });
}
