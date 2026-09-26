import type { Task, WeakPoint } from '@/lib/data/types';
import { daysBetween } from '@/lib/utils';

/**
 * Weak points: what a student keeps getting wrong in a course, one row per
 * distinct confusion. The assistant writes them after marking a quiz; the
 * same confusion found again counts against the row already there instead of
 * adding a second one. The rules for "the same", and for the order they are
 * read back in, live here so the connector and the app agree on both.
 */

export const WEAK_POINT_SUMMARY_MAX = 300;
export const WEAK_POINT_CONFUSION_MAX = 200;
export const WEAK_POINT_REF_MAX = 40;

/** Lowercase words only, so "Core values vs. objectives!" and "core values vs objectives" read alike. */
export function normalizeWeakText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * A confusion names two things mixed up, and which one is said first doesn't
 * change what it is: "objectives vs core values" is "core values vs objectives".
 */
export function confusionKey(confusion: string): string {
  const sides = confusion
    .split(/\s+(?:vs\.?|versus)\s+|\s*\/\s*/i)
    .map(normalizeWeakText)
    .filter(Boolean);
  if (sides.length < 2) return normalizeWeakText(confusion);
  return sides.sort().join(' vs ');
}

function words(text: string): Set<string> {
  return new Set(normalizeWeakText(text).split(' ').filter(Boolean));
}

/**
 * Two summaries are the same weak point when they say the same thing in
 * nearly the same words: equal once normalised, or sharing nearly every word
 * when both are long enough for that to mean something. Short ones have to
 * match outright, since "sign error" and "unit error" share half their words
 * and are different mistakes.
 */
export function nearlySameSummary(a: string, b: string): boolean {
  const na = normalizeWeakText(a);
  const nb = normalizeWeakText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = words(a);
  const wb = words(b);
  if (wa.size < 4 || wb.size < 4) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared) >= 0.8;
}

type Comparable = Pick<WeakPoint, 'summary' | 'confusion'>;

/**
 * The row an incoming weak point belongs to, if the course has one: the same
 * confusion first, then a near-identical summary. Fixed rows count, so a
 * confusion that comes back after being fixed reopens where it was.
 */
export function findSameWeakPoint<T extends Comparable>(existing: T[], item: Comparable): T | undefined {
  const key = item.confusion.trim() ? confusionKey(item.confusion) : '';
  if (key) {
    const byConfusion = existing.find((row) => row.confusion.trim() && confusionKey(row.confusion) === key);
    if (byConfusion) return byConfusion;
  }
  return existing.find((row) => nearlySameSummary(row.summary, item.summary));
}

/** Most often missed first, then most recently. */
export function rankWeakPoints<T extends Pick<WeakPoint, 'timesMissed' | 'lastSeenAt'>>(list: T[]): T[] {
  return [...list].sort((a, b) => b.timesMissed - a.timesMissed || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/** "1.2" before "1.10" before "2", and anything with no section last. */
export function compareSections(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Whether a row sits in a section or under it: "1" takes "1.3", "1.3" takes "1.3.2". */
export function inSection(rowSection: string, wanted: string): boolean {
  const row = rowSection.trim().toLowerCase();
  const want = wanted.trim().toLowerCase();
  return row === want || row.startsWith(`${want}.`);
}

/** Ranked weak points in section order, each section's rows most-missed first. */
export function groupBySection<T extends Pick<WeakPoint, 'section' | 'timesMissed' | 'lastSeenAt'>>(list: T[]): { section: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of rankWeakPoints(list)) {
    const key = item.section.trim();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].sort(([a], [b]) => compareSections(a, b)).map(([section, items]) => ({ section, items }));
}

/**
 * The nearest unfinished exam in each course that falls between today and
 * `days` from now, nearest first: the courses whose weak points are worth
 * putting in front of the reader on Today.
 */
export function examsWithin<T extends Pick<Task, 'courseId' | 'kind' | 'completed' | 'dueDate'>>(tasks: T[], today: string, days = 7): { exam: T; days: number }[] {
  const nearest = new Map<string, T>();
  for (const task of tasks) {
    if (task.kind !== 'exam' || task.completed || !task.dueDate) continue;
    const away = daysBetween(today, task.dueDate);
    if (away < 0 || away > days) continue;
    const seen = nearest.get(task.courseId);
    if (!seen || (task.dueDate as string) < (seen.dueDate as string)) nearest.set(task.courseId, task);
  }
  return [...nearest.values()]
    .map((exam) => ({ exam, days: daysBetween(today, exam.dueDate as string) }))
    .sort((a, b) => a.days - b.days);
}
