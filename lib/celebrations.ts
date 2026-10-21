/**
 * The goals and lines a reader can cross, and which of them they just did.
 *
 * Everything here is read off the logged record, the same rows Today, Stats
 * and the Record draw from, so a celebration can never claim a goal the
 * hours above it do not show. What the device remembers is only which ones
 * it has already celebrated (`akada.celebrated.v1`), the way the Record
 * remembers what it showed last visit: a convenience, never part of the
 * record, and cleared with everything else under `akada.` on sign-out.
 *
 * A crossing is celebrated wherever the session came from: the timer's log
 * sheet, Log time, or a sitting Claude logged while the app was closed,
 * which is met the next time the app opens.
 */

import type { Course, Session, Task } from './data';
import { isLoggableDuration } from './session-safety';
import { MILESTONES, MILESTONE_NAMES } from './stats-reading';
import { weekOf } from './student-day';
import { formatHM } from './utils';
import type { Ladder } from './progression';

export type CelebrationKind = 'week' | 'hours' | 'stamp' | 'course-week' | 'day';

export interface Celebration {
  /** Stable for as long as the thing it marks stays true. */
  key: string;
  kind: CelebrationKind;
  /** What the rubber stamp says, a word or three. */
  stamp: string;
  /** The serif line under it. */
  title: string;
  /** The figures, as they stand. */
  detail: string;
  /** A course's colour when the thing belongs to one course. */
  color?: string;
}

/** Largest first: when one sitting crosses several, the first one leads. */
const ORDER: CelebrationKind[] = ['week', 'hours', 'stamp', 'course-week', 'day'];

/**
 * Ladders that are already a celebration of their own here. Hours in the
 * term is the milestone line under another name, and celebrating both would
 * stamp the same ten hours twice.
 */
const LADDERS_SKIPPED = new Set(['hours']);

export function readAchievements({
  sessions,
  courses,
  dailyGoalHours,
  today,
  termKey,
  ladders,
}: {
  sessions: Session[];
  courses: Course[];
  dailyGoalHours: number;
  /** The reader's own day, `isoDate()`. */
  today: string;
  /** The active semester, so a new term's first hour is its own. */
  termKey: string;
  ladders: Ladder[];
}): Celebration[] {
  const logged = sessions.filter((s) => isLoggableDuration(s.durationSeconds));
  const { from: monday, to: sunday } = weekOf(today);
  const found: Celebration[] = [];

  // The day.
  const daySeconds = logged.filter((s) => s.date === today).reduce((a, s) => a + s.durationSeconds, 0);
  if (dailyGoalHours > 0 && daySeconds >= dailyGoalHours * 3600) {
    found.push({
      key: `day:${today}`,
      kind: 'day',
      stamp: 'Day done',
      title: 'Today’s goal is in.',
      detail: `${formatHM(daySeconds)} of ${dailyGoalHours}h`,
    });
  }

  // The week, as a whole and course by course. The week's goal is only ever
  // the course goals added up, so it is the same sum Today draws its line at.
  const weekByCourse = new Map<string, number>();
  for (const s of logged) {
    if (s.date < monday || s.date > sunday) continue;
    weekByCourse.set(s.courseId, (weekByCourse.get(s.courseId) ?? 0) + s.durationSeconds);
  }
  const weekSeconds = [...weekByCourse.values()].reduce((a, n) => a + n, 0);
  const weekGoal = courses.reduce((a, c) => a + (c.weeklyGoalHours || 0), 0);
  if (weekGoal > 0 && weekSeconds >= weekGoal * 3600) {
    found.push({
      key: `week:${monday}`,
      kind: 'week',
      stamp: 'Week done',
      title: 'The week’s goal is in.',
      detail: `${formatHM(weekSeconds)} of ${weekGoal}h`,
    });
  }
  // With one course carrying a goal, its week is the week, and saying both
  // is saying it twice.
  const withGoals = courses.filter((c) => (c.weeklyGoalHours || 0) > 0);
  for (const course of withGoals.length > 1 ? withGoals : []) {
    const goal = course.weeklyGoalHours || 0;
    const seconds = weekByCourse.get(course.id) ?? 0;
    if (goal > 0 && seconds >= goal * 3600) {
      found.push({
        key: `course-week:${course.id}:${monday}`,
        kind: 'course-week',
        stamp: `${course.code} done`,
        title: `The week on ${course.code} is done.`,
        detail: `${formatHM(seconds)} of ${goal}h`,
        color: course.color,
      });
    }
  }

  // The term's hours, at the round numbers Stats counts toward.
  const termHours = logged.reduce((a, s) => a + s.durationSeconds, 0) / 3600;
  for (const line of MILESTONES) {
    if (termHours < line) break;
    found.push({
      key: `hours:${termKey}:${line}`,
      kind: 'hours',
      stamp: `${line} ${line === 1 ? 'hour' : 'hours'}`,
      title: line === 1 ? 'The first hour of the term.' : `${line} hours this term.`,
      detail: line === 1 ? 'the term is under way' : (MILESTONE_NAMES[line] ?? `${line} hours`),
    });
  }

  // The Record's stamps, a rung at a time, in the Record's own words.
  for (const ladder of ladders) {
    if (LADDERS_SKIPPED.has(ladder.id)) continue;
    ladder.thresholds.forEach((threshold, i) => {
      if (ladder.value < threshold) return;
      found.push({
        key: `stamp:${termKey}:${ladder.id}:${i + 1}`,
        kind: 'stamp',
        stamp: ladder.format(threshold),
        title: `${ladder.name} · ${ladder.format(threshold)}`,
        detail: 'a new stamp on the Record',
      });
    });
  }

  return found;
}

/** Biggest thing first, and within a kind the higher line first. */
export function rankCelebrations(list: Celebration[]): Celebration[] {
  return [...list].sort((a, b) => {
    const byKind = ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind);
    if (byKind !== 0) return byKind;
    // Two milestones crossed at once (a long first sitting can pass 1 and
    // 5): the larger leads.
    return b.key.localeCompare(a.key, undefined, { numeric: true });
  });
}

/**
 * Only the highest line of each ladder in one go. A first sitting that runs
 * past five hours has crossed the first hour as well, and two stamps saying
 * so is one too many.
 */
function highestPerLine(list: Celebration[]): Celebration[] {
  const kept = new Map<string, Celebration>();
  for (const c of rankCelebrations(list)) {
    const line =
      c.kind === 'hours' ? 'hours' : c.kind === 'stamp' ? c.key.split(':').slice(0, 3).join(':') : c.key;
    if (!kept.has(line)) kept.set(line, c);
  }
  return [...kept.values()];
}

/* ── What this device has already celebrated ───────────────────────────── */

const STORAGE_KEY = 'akada.celebrated.v1';
/** Enough for a term of days and weeks with room over. */
const MAX_KEYS = 400;

interface Ledger {
  keys: string[];
  /**
   * The record the keys were read against, as a fingerprint of its sessions
   * and finished tasks. A goal that comes true without a session changing (the daily goal moved
   * below today's hours) is noted without a celebration: lowering the bar is
   * not clearing it.
   */
  record: string;
}

export function recordFingerprint(sessions: Session[], tasks: Task[]): string {
  let sum = 0;
  for (const s of sessions) sum += s.durationSeconds;
  const done = tasks.filter((t) => t.completed).length;
  return `${sessions.length}:${sum}:${done}`;
}

function readLedger(): Ledger | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Ledger>;
    if (!Array.isArray(parsed.keys)) return null;
    return {
      keys: parsed.keys.filter((k): k is string => typeof k === 'string'),
      record: typeof parsed.record === 'string' ? parsed.record : '',
    };
  } catch {
    return null;
  }
}

function writeLedger(ledger: Ledger): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ keys: ledger.keys.slice(-MAX_KEYS), record: ledger.record }),
    );
  } catch {
    // Without storage a crossing is simply not celebrated twice in one
    // visit; the component keeps its own copy for that.
  }
}

/**
 * What to celebrate now, and the ledger written so it is not celebrated
 * again. On a device that has never kept a ledger everything already true is
 * taken as seen: a reader opening the app for the first time since this
 * shipped is not owed a term's worth of stamps at once. The baseline waits
 * for there to be something in it.
 */
export function takeNewCelebrations(achieved: Celebration[], record: string): Celebration[] {
  const ledger = readLedger();
  const keys = achieved.map((c) => c.key);
  if (!ledger) {
    // Nothing true yet is no baseline at all: written now, a record that
    // only looked empty (sessions still on their way, a failed fetch) would
    // have every line in the term come up as new the moment it arrived.
    if (keys.length > 0) writeLedger({ keys, record });
    return [];
  }
  const seen = new Set(ledger.keys);
  const fresh = achieved.filter((c) => !seen.has(c.key));
  if (fresh.length === 0 && ledger.record === record) return [];
  writeLedger({ keys: [...ledger.keys, ...fresh.map((c) => c.key)], record });
  if (ledger.record === record) return [];
  return highestPerLine(fresh);
}
