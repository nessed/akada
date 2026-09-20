import type { Course } from '../data';
import {
  DAY_QUALIFY_PAGES,
  DAY_QUALIFY_SECONDS,
  GRACE_BANK_MAX,
  WEEK_BREADTH_COURSES,
  WEEK_BREADTH_DAYS,
  WEEK_CONSISTENT_DAYS,
} from './constants';
import type { DayCredit } from './credit';

/**
 * Continuity, measured in weeks.
 *
 * The word streak does not appear in this module or anywhere it renders. A
 * daily streak asks a student to study on the Saturday of a wedding, and then
 * punishes them for the wedding. University work does not move a day at a
 * time; it moves a week at a time, and so does this.
 *
 * Two layers keep the cliff off, and both are needed. Grace days absorb the
 * single bad day silently. The best run stays printed beside the current one
 * for good, so breaking a run costs you your position and never your history,
 * which is what makes the whole thing safe to lose.
 */

export type DayState = 'qualified' | 'margin' | 'blank' | 'future';

export interface RunDay {
  iso: string;
  state: DayState;
  /** True seconds logged. Used to rank which blank day grace protects. */
  seconds: number;
}

export interface RunWeek {
  /** Monday, ISO. */
  start: string;
  days: RunDay[];
  /** Days the student actually qualified on. Never includes margin days. */
  studyDays: number;
  /** Blank days a banked grace day covered. Counted, never claimed as study. */
  marginDays: number;
  /** Distinct courses touched, for the breadth route. */
  courses: number;
  counts: boolean;
  /** Which route carried it, for the detail line. */
  route: 'consistent' | 'breadth' | 'margin' | null;
  /** Still being lived, so it has not been settled and spends no grace yet. */
  inProgress: boolean;
}

export interface RunReading {
  weeks: RunWeek[];
  /** Counting weeks up to now. The week in progress extends it, never breaks it. */
  current: number;
  /** The longest run ever. Printed permanently beside the current one. */
  best: number;
  /** Grace days banked and unspent. */
  grace: number;
  /** The week being lived, for the "where this week stands" line. */
  thisWeek: RunWeek | null;
}

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoOf(d);
}

function shift(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

/**
 * Whether a day counts at all.
 *
 * Deliberately three routes, not one. A day spent reading a printed book,
 * logged as pages against a task, is a study day; an app that only counts its
 * own timer is an app that quietly tells you paper does not count.
 *
 * This reads *true* logged seconds, not credited ones. The tapers exist to
 * keep the pages from rewarding a walked-away timer twice, not to take a day
 * away from somebody who studied.
 */
function qualifies(entry: DayCredit | undefined): boolean {
  if (!entry) return false;
  if (entry.rawTotal >= DAY_QUALIFY_SECONDS) return true;
  for (const ticks of entry.ticksByCourse.values()) if (ticks > 0) return true;
  return entry.pages >= DAY_QUALIFY_PAGES;
}

export function readRuns(
  courses: Course[],
  ledger: DayCredit[],
  today: string,
): RunReading {
  const byIso = new Map(ledger.map((entry) => [entry.iso, entry]));
  const thisMonday = mondayOf(today);
  const firstMonday = ledger.length > 0 ? mondayOf(ledger[0].iso) : thisMonday;

  const breadthTarget = Math.min(WEEK_BREADTH_COURSES, Math.max(1, courses.length));

  const weeks: RunWeek[] = [];
  for (let start = firstMonday; start <= thisMonday; start = shift(start, 7)) {
    const inProgress = start === thisMonday;
    const touched = new Set<string>();
    const days: RunDay[] = [];

    for (let i = 0; i < 7; i++) {
      const iso = shift(start, i);
      const entry = byIso.get(iso);
      for (const courseId of entry?.rawByCourse.keys() ?? []) touched.add(courseId);
      days.push({
        iso,
        state: iso > today ? 'future' : qualifies(entry) ? 'qualified' : 'blank',
        seconds: entry?.rawTotal ?? 0,
      });
    }

    const studyDays = days.filter((d) => d.state === 'qualified').length;
    const consistent = studyDays >= WEEK_CONSISTENT_DAYS;
    const breadth = studyDays >= WEEK_BREADTH_DAYS && touched.size >= breadthTarget;

    weeks.push({
      start,
      days,
      studyDays,
      marginDays: 0,
      courses: touched.size,
      counts: consistent || breadth,
      route: consistent ? 'consistent' : breadth ? 'breadth' : null,
      inProgress,
    });
  }

  // Grace, settled oldest week first so the bank is a fact about the past and
  // never depends on what happens next. A week cannot fund itself: the day it
  // earns is banked after its own shortfall has been covered.
  //
  // The week being lived is never settled. It is not short of days yet; it is
  // simply not over, and spending a grace day on a Wednesday to rescue a week
  // the student may well finish themselves is how a safety net turns into a
  // thing that quietly eats the safety net.
  let grace = 0;
  for (const week of weeks) {
    if (week.inProgress) break;
    if (!week.counts) {
      const short = WEEK_CONSISTENT_DAYS - week.studyDays;
      if (short > 0 && short <= grace) {
        // Spend on the days that came closest, which are the days the student
        // very nearly made. Ties break to the earlier date so the answer does
        // not move when a later session is logged.
        const nearest = week.days
          .filter((d) => d.state === 'blank')
          .sort((a, b) => b.seconds - a.seconds || a.iso.localeCompare(b.iso))
          .slice(0, short);
        for (const day of nearest) day.state = 'margin';
        week.marginDays = nearest.length;
        week.counts = true;
        week.route = 'margin';
        grace -= short;
      }
    }
    if (week.counts) grace = Math.min(GRACE_BANK_MAX, grace + 1);
  }

  // The current run, walked back from the last completed week. A week still
  // being lived extends the run if it already counts and is simply not part
  // of it yet if it does not, exactly as a Monday morning should behave.
  const settled = weeks.filter((w) => !w.inProgress);
  let current = 0;
  for (let i = settled.length - 1; i >= 0 && settled[i].counts; i--) current += 1;
  const thisWeek = weeks.find((w) => w.inProgress) ?? null;
  if (thisWeek?.counts) current += 1;

  let best = 0;
  let run = 0;
  for (const week of weeks) {
    run = week.counts ? run + 1 : 0;
    if (run > best) best = run;
  }

  return { weeks, current, best: Math.max(best, current), grace, thisWeek };
}

/** "5 study days, 1 margin day". Never "6". */
export function describeWeek(week: RunWeek): string {
  const parts = [`${week.studyDays} study ${week.studyDays === 1 ? 'day' : 'days'}`];
  if (week.marginDays > 0) {
    parts.push(`${week.marginDays} margin ${week.marginDays === 1 ? 'day' : 'days'}`);
  }
  return parts.join(', ');
}
