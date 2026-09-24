import type { Session } from './data';
import { clampSessionSeconds, isLoggableDuration } from './session-safety';
import { isoDate, startOfWeek } from './utils';
import type { Habits } from './progression';

/**
 * The Stats page's own readings: the things to chase.
 *
 * Everything else on that page says how much was studied. These say what
 * the next sitting would change: a record it would break, last week it would
 * pass, the hour count it would carry over a line. All of it is read off the
 * logged sessions on every render and nothing is stored, same as the
 * progression layer, so the page can never disagree with the log under it.
 */

const DAY_MS = 86_400_000;

function logged(sessions: Session[]): Session[] {
  return sessions.filter((s) => isLoggableDuration(s.durationSeconds));
}

function byDay(sessions: Session[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of logged(sessions)) {
    out.set(s.date, (out.get(s.date) ?? 0) + clampSessionSeconds(s.durationSeconds));
  }
  return out;
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/* ------------------------------------------------------------------ */
/* Records                                                              */
/* ------------------------------------------------------------------ */

export interface Best {
  /** The best there has been. */
  best: number;
  /** When it was set: an iso day, or the Monday of the week. */
  at: string | null;
  /** The one in progress that could take it. */
  current: number;
  /** The current one is the record, and it was set inside the last week. */
  fresh: boolean;
}

export interface Records {
  sitting: Best;
  day: Best;
  week: Best;
  /** Days in a row. */
  run: Best;
}

export function readRecords(sessions: Session[], today = isoDate()): Records {
  const rows = logged(sessions);
  const weekAgo = shiftIso(today, -6);

  // Longest sitting, against the longest one today.
  let sitting: Best = { best: 0, at: null, current: 0, fresh: false };
  for (const s of rows) {
    const sec = clampSessionSeconds(s.durationSeconds);
    if (sec > sitting.best) sitting = { ...sitting, best: sec, at: s.date };
    if (s.date === today && sec > sitting.current) sitting.current = sec;
  }
  sitting.fresh = sitting.best > 0 && sitting.at !== null && sitting.at >= weekAgo;

  // Biggest day, against today.
  const days = byDay(rows);
  const day: Best = { best: 0, at: null, current: days.get(today) ?? 0, fresh: false };
  for (const [iso, sec] of days) {
    if (sec > day.best) {
      day.best = sec;
      day.at = iso;
    }
  }
  day.fresh = day.best > 0 && day.at !== null && day.at >= weekAgo;

  // Best week, against this one.
  const thisWeek = isoDate(startOfWeek(new Date(today + 'T12:00:00')));
  const weeks = new Map<string, number>();
  for (const [iso, sec] of days) {
    const monday = isoDate(startOfWeek(new Date(iso + 'T12:00:00')));
    weeks.set(monday, (weeks.get(monday) ?? 0) + sec);
  }
  const week: Best = { best: 0, at: null, current: weeks.get(thisWeek) ?? 0, fresh: false };
  for (const [monday, sec] of weeks) {
    if (sec > week.best) {
      week.best = sec;
      week.at = monday;
    }
  }
  week.fresh = week.best > 0 && week.at === thisWeek;

  // Longest run of days, against the one going now. A run still counts on a
  // day that has not been studied yet: it is not broken until the day is over.
  const sorted = Array.from(days.keys()).sort();
  const run: Best = { best: 0, at: null, current: 0, fresh: false };
  let length = 0;
  let prev: string | null = null;
  for (const iso of sorted) {
    length = prev && shiftIso(prev, 1) === iso ? length + 1 : 1;
    if (length > run.best) {
      run.best = length;
      run.at = iso;
    }
    prev = iso;
  }
  if (prev && (prev === today || prev === shiftIso(today, -1))) run.current = length;
  run.fresh = run.best > 1 && run.current === run.best;

  return { sitting, day, week, run };
}

/* ------------------------------------------------------------------ */
/* The race against last week                                          */
/* ------------------------------------------------------------------ */

export interface Pace {
  /** Running totals, Monday first, seven of them. */
  thisWeek: number[];
  lastWeek: number[];
  /** Monday is 0. */
  todayIndex: number;
  /** Seconds ahead of last week by this point in it. Negative is behind. */
  lead: number;
  /** What last week came to in all. */
  lastTotal: number;
}

export function readPace(sessions: Session[], today = isoDate()): Pace {
  const days = byDay(sessions);
  const monday = startOfWeek(new Date(today + 'T12:00:00'));
  const mondayIso = isoDate(monday);
  const lastMondayIso = shiftIso(mondayIso, -7);
  const todayIndex = Math.round(
    (new Date(today + 'T12:00:00').getTime() - new Date(mondayIso + 'T12:00:00').getTime()) /
      DAY_MS,
  );

  const running = (from: string) => {
    const out: number[] = [];
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      sum += days.get(shiftIso(from, i)) ?? 0;
      out.push(sum);
    }
    return out;
  };

  const thisWeek = running(mondayIso);
  const lastWeek = running(lastMondayIso);
  return {
    thisWeek,
    lastWeek,
    todayIndex,
    lead: thisWeek[todayIndex] - lastWeek[todayIndex],
    lastTotal: lastWeek[6],
  };
}

/* ------------------------------------------------------------------ */
/* The next line in the hour count                                      */
/* ------------------------------------------------------------------ */

const MILESTONES = [1, 5, 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];

const MILESTONE_NAMES: Partial<Record<number, string>> = {
  1: 'the first hour',
  5: 'a working morning',
  10: 'double digits',
  25: 'a quarter century',
  50: 'half a century',
  75: 'three quarters of a century',
  100: 'the century',
  150: 'a century and a half',
  200: 'the double century',
  500: 'five hundred',
  1000: 'a thousand hours',
};

export interface Milestone {
  /** The line already crossed, in hours. 0 before the first. */
  from: number;
  /** The next one. */
  to: number;
  name: string;
  /** Seconds still to go. */
  remaining: number;
}

export function readMilestone(totalSeconds: number): Milestone {
  const hours = totalSeconds / 3600;
  let to = MILESTONES.find((m) => m > hours);
  if (to === undefined) to = (Math.floor(hours / 250) + 1) * 250;
  const from = [...MILESTONES].reverse().find((m) => m <= hours) ?? 0;
  const start = to > 1000 ? to - 250 : from;
  return {
    from: start,
    to,
    name: MILESTONE_NAMES[to] ?? `${to} hours`,
    remaining: Math.max(0, to * 3600 - totalSeconds),
  };
}

/* ------------------------------------------------------------------ */
/* What the hours come to                                               */
/* ------------------------------------------------------------------ */

const EQUIVALENTS: { hours: number; one: string; many: string }[] = [
  { hours: 22 / 60, one: 'a sitcom episode', many: 'sitcom episodes' },
  { hours: 1.5, one: 'a feature film', many: 'feature films' },
  { hours: 3.5, one: 'a marathon, run slowly', many: 'marathons, run slowly' },
  { hours: 7, one: 'a flight from london to new york', many: 'flights from london to new york' },
  { hours: 8, one: 'a full night of sleep', many: 'full nights of sleep' },
  { hours: 11.4, one: 'the extended lord of the rings', many: 'runs of the extended lord of the rings' },
  { hours: 24, one: 'a whole day, no sleep', many: 'whole days, no sleep' },
  { hours: 62, one: 'all of breaking bad', many: 'rewatches of breaking bad' },
  { hours: 168, one: 'a full week, awake the entire time', many: 'full weeks, awake the entire time' },
];

/**
 * The hours set beside something anybody can picture. Only the comparisons
 * that come out between one and a few dozen are offered, since "0.2 flights"
 * and "340 sitcom episodes" are both harder to see than the hours were, and
 * the pick turns over with the date so the note reads differently tomorrow.
 */
export function hoursLookLike(totalSeconds: number, today = isoDate()): string | null {
  const hours = totalSeconds / 3600;
  if (hours < 0.5) return null;
  const fits = EQUIVALENTS.map((e) => ({ e, n: hours / e.hours })).filter(
    ({ n }) => n >= 1 && n < 40,
  );
  if (fits.length === 0) return null;
  const seed = Number(today.replace(/-/g, '')) % fits.length;
  const { e, n } = fits[seed];
  const whole = Math.floor(n);
  if (whole === 1) return `that's ${n >= 1.4 ? 'more than ' : ''}${e.one}`;
  return `that's ${whole} ${e.many}`;
}

/* ------------------------------------------------------------------ */
/* The kind of studier                                                  */
/* ------------------------------------------------------------------ */

export interface Persona {
  /** "a night owl". */
  title: string;
  /** One more thing, in the margin. */
  aside: string | null;
}

export function readPersona(habits: Habits): Persona | null {
  if (!habits.peak) return null;
  const start = habits.peak.start;
  const title =
    start >= 5 && start < 9
      ? 'an early bird'
      : start >= 9 && start < 12
        ? 'a morning person'
        : start >= 12 && start < 17
          ? 'an afternoon grinder'
          : start >= 17 && start < 21
            ? 'an evening regular'
            : 'a night owl';

  const total = habits.weekdays.reduce((a, b) => a + b, 0);
  const weekend = habits.weekdays[0] + habits.weekdays[6];
  const median = habits.sittings.median;

  let aside: string | null = null;
  if (total > 0 && weekend / total >= 0.4) aside = 'and a weekend warrior';
  else if (habits.sittings.n >= 5 && median >= 90 * 60) aside = 'who sits for the long haul';
  else if (habits.sittings.n >= 5 && median > 0 && median <= 25 * 60) aside = 'who works in short sprints';
  else if (habits.fullestDay !== null) {
    const names = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
    aside = `who lives for ${names[habits.fullestDay]}`;
  }
  return { title, aside };
}
