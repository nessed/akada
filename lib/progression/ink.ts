import type { Course } from '../data';
import { INK_DAILY_HOLD, INK_FLOOR } from './constants';
import type { DayCredit } from './credit';

/**
 * How dark a course's ink sits, from its recent activity alone.
 *
 * This is the one thing in the app that changes while nobody is looking, and
 * it is deliberately never announced. There is no notification, no badge and
 * no sentence anywhere in the product saying a value went down. Faded ink you
 * happen to find when you open a course is a fact about your term. The same
 * fact pushed at you as an alert is a nag, and this app does not nag.
 *
 * It rises the moment you work and falls over about nine days, so a quiet
 * weekend is invisible and a course dropped for a fortnight looks dropped.
 *
 * A course with no weekly goal has opted out: there is nothing to be behind
 * on, so it is always drawn at full strength and returns null.
 */

export function readInk(
  courses: Course[],
  ledger: DayCredit[],
  today: string,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const byIso = new Map(ledger.map((entry) => [entry.iso, entry]));
  const first = ledger[0]?.iso ?? today;

  for (const course of courses) {
    if (!course.weeklyGoalHours || course.weeklyGoalHours <= 0) {
      out.set(course.id, null);
      continue;
    }

    // A day's worth of the weekly goal is what full ink costs for one day.
    const perDay = (course.weeklyGoalHours * 3600) / 7;
    let density = 0;
    const cursor = new Date(first + 'T12:00:00');
    const end = new Date(today + 'T12:00:00');

    while (cursor <= end) {
      const iso = isoOf(cursor);
      const seconds = byIso.get(iso)?.rawByCourse.get(course.id) ?? 0;
      const target = Math.min(1, seconds / perDay);
      // Up in one step, down over many. Attack and release, not an average.
      density = target >= density ? target : density * INK_DAILY_HOLD + target * (1 - INK_DAILY_HOLD);
      cursor.setDate(cursor.getDate() + 1);
    }

    out.set(course.id, Math.max(INK_FLOOR, density));
  }

  return out;
}

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
