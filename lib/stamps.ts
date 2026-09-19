import type { Course, Session, Task } from './data';
import { isLoggableDuration } from './session-safety';
import { isoDate, startOfWeek, totalSeconds } from './utils';

/**
 * Stamps.
 *
 * The gamified reading of the same sessions every other screen counts. A
 * stamp is earned or it is not; an unearned one shows how far off it is, so
 * the collection is a page of things within reach rather than a wall of grey.
 *
 * Nothing here writes. Every stamp is derived from sessions and tasks on
 * read, which means there is no state to migrate, nothing to backfill for an
 * account that has been logging for a term already, and no way for the page
 * to disagree with Stats about what happened.
 */

/** A day counts toward the streak once this much is logged on it. */
export const STREAK_MINUTES = 25;

export interface StampDef {
  id: string;
  /** What is printed inside the ring. */
  mark: string;
  name: string;
  /** One line, shown under the name on an unearned stamp. */
  goal: string;
}

export interface Stamp extends StampDef {
  earned: boolean;
  /** Set on an earned stamp: when, and what earned it. */
  detail?: string;
  /** Set on an unearned one: "3 / 4", "9 left". */
  progress?: string;
}

export interface StreakReading {
  /** Consecutive qualifying days up to and including today. */
  days: number;
  best: number;
  /** ISO date the current run started, or null if there is no run. */
  since: string | null;
  /** The last 21 days, oldest first, each marked qualifying or not. */
  recent: { iso: string; qualified: boolean; isToday: boolean }[];
}

function dayTotals(sessions: Session[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (!isLoggableDuration(s.durationSeconds)) continue;
    map.set(s.date, (map.get(s.date) ?? 0) + s.durationSeconds);
  }
  return map;
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/**
 * The streak, plus the three weeks behind it that the page draws.
 *
 * Today not qualifying *yet* does not break a run that is otherwise intact:
 * a streak that reset itself every morning until you sat down would be a
 * worse thing to look at than no streak at all. Yesterday is what the run is
 * measured back from when today is still empty.
 */
export function readStreak(sessions: Session[], today = isoDate()): StreakReading {
  const totals = dayTotals(sessions);
  const qualifies = (iso: string) => (totals.get(iso) ?? 0) >= STREAK_MINUTES * 60;

  let cursor = qualifies(today) ? today : shiftIso(today, -1);
  let days = 0;
  let since: string | null = null;
  while (qualifies(cursor)) {
    days += 1;
    since = cursor;
    cursor = shiftIso(cursor, -1);
  }

  // The best run ever, walked over the qualifying days in order rather than
  // day by day from today, so an account with two years of history costs one
  // pass over its sessions and not seven hundred lookups.
  const qualifying = [...totals.entries()]
    .filter(([, secs]) => secs >= STREAK_MINUTES * 60)
    .map(([iso]) => iso)
    .sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const iso of qualifying) {
    run = prev && shiftIso(prev, 1) === iso ? run + 1 : 1;
    if (run > best) best = run;
    prev = iso;
  }

  const recent = Array.from({ length: 21 }, (_, i) => {
    const iso = shiftIso(today, i - 20);
    return { iso, qualified: qualifies(iso), isToday: iso === today };
  });

  return { days, best: Math.max(best, days), since, recent };
}

export interface ChallengeReading {
  name: string;
  description: string;
  /** Courses still untouched this week, for the "start on this one" button. */
  remaining: Course[];
  done: Course[];
  daysLeft: number;
}

/**
 * This week's challenge. There is one, "four corners": log a session on every
 * course inside the week. It is the challenge because it is the one that
 * moves the thing the app is actually for, which is the course that has gone
 * quiet while the loud one eats the week.
 */
export function readChallenge(
  courses: Course[],
  sessions: Session[],
  today = isoDate(),
): ChallengeReading {
  const weekStart = isoDate(startOfWeek());
  const touched = new Set(
    sessions
      .filter((s) => s.date >= weekStart && isLoggableDuration(s.durationSeconds))
      .map((s) => s.courseId),
  );
  const d = new Date(today + 'T12:00:00').getDay();
  // Monday is day one of the week here, matching startOfWeek.
  const throughSunday = 7 - ((d + 6) % 7) - 1;

  return {
    name: 'Four corners',
    description: 'Log a session on every course in one week.',
    done: courses.filter((c) => touched.has(c.id)),
    remaining: courses.filter((c) => !touched.has(c.id)),
    daysLeft: Math.max(0, throughSunday),
  };
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00')
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    .toUpperCase();
}

/**
 * The collection. Twelve stamps, each read off the same three lists.
 *
 * Every entry decides for itself whether it is earned and what to say either
 * way, so adding one is a single object rather than a change in three places.
 */
export function readStamps(
  courses: Course[],
  sessions: Session[],
  tasks: Task[],
  today = isoDate(),
): Stamp[] {
  const logged = sessions.filter((s) => isLoggableDuration(s.durationSeconds));
  const streak = readStreak(logged, today);
  const challenge = readChallenge(courses, logged, today);
  const termSeconds = totalSeconds(logged);
  const termHours = termSeconds / 3600;

  const weekStart = isoDate(startOfWeek());
  const weekSeconds = totalSeconds(logged.filter((s) => s.date >= weekStart));
  const weeklyGoal = courses.reduce((a, c) => a + (c.weeklyGoalHours || 0), 0) || 20;

  const first = [...logged].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  const longest = logged.reduce<Session | null>(
    (acc, s) => (acc == null || s.durationSeconds > acc.durationSeconds ? s : acc),
    null,
  );
  const longestHours = longest ? longest.durationSeconds / 3600 : 0;
  const overdue = tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < today).length;

  // A task finished three or more days before it was due.
  const early = tasks.find((t) => {
    if (!t.completed || !t.completedAt || !t.dueDate) return false;
    const done = t.completedAt.slice(0, 10);
    return (
      (new Date(t.dueDate + 'T12:00:00').getTime() - new Date(done + 'T12:00:00').getTime()) /
        86_400_000 >=
      3
    );
  });

  // A week in which every one of the seven days qualified.
  const fullWeek = (() => {
    for (let back = 0; back < 20; back++) {
      const start = new Date(startOfWeek());
      start.setDate(start.getDate() - back * 7);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return isoDate(d);
      });
      const all = days.every(
        (iso) =>
          totalSeconds(logged.filter((s) => s.date === iso)) >= STREAK_MINUTES * 60,
      );
      if (all) return days[0];
    }
    return null;
  })();

  const courseCode = (id: string) => courses.find((c) => c.id === id)?.code ?? '';

  return [
    {
      id: 'first-light',
      mark: '1st',
      name: 'First light',
      goal: 'Log your first session',
      earned: Boolean(first),
      detail: first ? `${fmtDate(first.date)} · ${courseCode(first.courseId)}` : undefined,
      progress: first ? undefined : 'Not yet',
    },
    {
      id: 'long-haul',
      mark: '2h+',
      name: 'Long haul',
      goal: 'One sitting of two hours',
      earned: longestHours >= 2,
      detail:
        longest && longestHours >= 2
          ? `${fmtDate(longest.date)} · ${courseCode(longest.courseId)}`
          : undefined,
      progress: longestHours >= 2 ? undefined : `${longestHours.toFixed(1)} / 2h`,
    },
    {
      id: 'full-week',
      mark: 'vii',
      name: 'Full week',
      goal: 'Seven days out of seven',
      earned: Boolean(fullWeek),
      detail: fullWeek ? `WEEK OF ${fmtDate(fullWeek)} · 7 / 7 DAYS` : undefined,
      progress: fullWeek ? undefined : `${streak.days} / 7 days`,
    },
    {
      id: 'deep-read',
      mark: '✓',
      name: 'Deep read',
      goal: 'Finish a task inside one sitting',
      earned: Boolean(longest?.taskId),
      detail: longest?.taskId ? `${fmtDate(longest.date)} · IN ONE GO` : undefined,
      progress: longest?.taskId ? undefined : 'Not yet',
    },
    {
      id: 'fortnight',
      mark: 'x14',
      name: 'Fortnight',
      goal: '14 day streak',
      earned: streak.best >= 14,
      detail: streak.best >= 14 ? `BEST ${streak.best} DAY STREAK` : undefined,
      progress: streak.best >= 14 ? undefined : `${streak.days} / 14`,
    },
    {
      id: 'quarter-hundred',
      mark: '25h',
      name: 'Quarter hundred',
      goal: '25 hours in a term',
      earned: termHours >= 25,
      detail: termHours >= 25 ? `${termHours.toFixed(0)}H IN TERM` : undefined,
      progress: termHours >= 25 ? undefined : `${termHours.toFixed(0)} / 25h`,
    },
    {
      id: 'four-corners',
      mark: `${challenge.done.length} / ${courses.length || 1}`,
      name: 'Four corners',
      goal: 'All courses in one week',
      earned: courses.length > 0 && challenge.remaining.length === 0,
      detail: challenge.remaining.length === 0 ? 'THIS WEEK' : undefined,
      progress:
        challenge.remaining.length === 0
          ? undefined
          : `${challenge.done.length} / ${courses.length}`,
    },
    {
      id: 'clean-slate',
      mark: overdue === 0 ? '0' : String(overdue),
      name: 'Clean slate',
      goal: 'Zero overdue tasks',
      earned: overdue === 0 && tasks.length > 0,
      detail: overdue === 0 && tasks.length > 0 ? 'NOTHING OVERDUE' : undefined,
      progress: overdue > 0 ? `${overdue} left` : undefined,
    },
    {
      id: 'goal-week',
      mark: `${Math.round(weekSeconds / 3600)}h`,
      name: 'Goal week',
      goal: 'Hit the weekly goal',
      earned: weekSeconds / 3600 >= weeklyGoal,
      detail: weekSeconds / 3600 >= weeklyGoal ? 'THIS WEEK' : undefined,
      progress:
        weekSeconds / 3600 >= weeklyGoal
          ? undefined
          : `${(weekSeconds / 3600).toFixed(0)} / ${weeklyGoal}h`,
    },
    {
      id: 'thirty',
      mark: 'x30',
      name: 'Thirty',
      goal: '30 day streak',
      earned: streak.best >= 30,
      detail: streak.best >= 30 ? `BEST ${streak.best} DAYS` : undefined,
      progress: streak.best >= 30 ? undefined : `${streak.days} / 30`,
    },
    {
      id: 'hundred',
      mark: '100h',
      name: 'Hundred',
      goal: '100 hours in a term',
      earned: termHours >= 100,
      detail: termHours >= 100 ? `${termHours.toFixed(0)}H IN TERM` : undefined,
      progress: termHours >= 100 ? undefined : `${termHours.toFixed(0)} / 100h`,
    },
    {
      id: 'early-bird',
      mark: '3d',
      name: 'Early bird',
      goal: 'Finish a task 3 days early',
      earned: Boolean(early),
      detail: early?.completedAt ? fmtDate(early.completedAt.slice(0, 10)) : undefined,
      progress: early ? undefined : '0 / 1',
    },
  ];
}
