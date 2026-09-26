import type { CatalogCourse } from './types';
import {
  MEETING_TIME_MAX,
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
} from '@/lib/planner-safety';

export type { CatalogCourse, CatalogSection } from './types';

/**
 * The light half of the catalog: everything here is safe to import eagerly.
 * The term data and the search over it live in `./search`, which the picker
 * pulls in on demand, keep this module free of any import from there.
 */

/**
 * Manual fallback. Someone who types a course and submits without picking a
 * suggestion still gets a normal course, so the picker never becomes a
 * required step.
 *
 * Splits a leading catalog-style code off the front:
 *   "CS 200 Programming Fundamentals" -> { code: "CS 200", name: "Programming…" }
 *   "CS200"                           -> { code: "CS 200", name: "" }
 *   "Organic Chemistry"               -> { code: "",        name: "Organic Chemistry" }
 * A missing name is the one thing the UI asks for; a missing code is derived
 * by `deriveCourseCode` rather than asked for.
 */
export function parseCourseInput(raw: string): { code: string; name: string } {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return { code: '', name: '' };

  const match = text.match(/^([A-Za-z]{2,6})\s*-?\s*(\d{2,4}[A-Za-z]?)\b\s*(.*)$/);
  if (match) {
    const [, subject, number, rest] = match;
    return { code: `${subject.toUpperCase()} ${number.toUpperCase()}`, name: rest.trim() };
  }

  return { code: '', name: text };
}

/** Words that carry no weight in an initialism. */
const FILLER_WORDS = new Set([
  'a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with',
]);

/**
 * A short code for a course typed without one, so nothing has to be asked for
 * twice: "Organic Chemistry" -> "OC", "history of modern art" -> "HMA",
 * "Mathematics" -> "MATHEM". Only the course card ever shows it.
 */
export function deriveCourseCode(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const significant = words.filter((word) => !FILLER_WORDS.has(word.toLowerCase()));
  const source = significant.length > 0 ? significant : words;

  if (source.length === 0) return '';
  if (source.length === 1) return source[0].slice(0, 6).toUpperCase();
  return source.slice(0, 4).map((word) => word[0]).join('').toUpperCase();
}

/**
 * A course as the planner stores it, from a catalog pick and the section
 * chosen under it. Onboarding and Today's add-course sheet both read this, so
 * a course added on the first day and one added in week eight carry the same
 * instructor, time and credits.
 */
export function courseFromCatalog(course: CatalogCourse, sectionId: string) {
  const chosen = course.sections?.find((sec) => sec.id === sectionId);
  const withRoom = [chosen?.meets, chosen?.room].filter(Boolean).join(' · ');
  return {
    code: cleanCourseCode(course.code),
    name: cleanCourseName(course.title),
    credits: course.credits ?? 4,
    section: sectionId || null,
    instructor: chosen?.instructor ?? null,
    // The room earns its place only when it does not push the line past
    // what the field holds; the time is the half that must survive.
    meetingTime: (withRoom.length <= MEETING_TIME_MAX ? withRoom : chosen?.meets) || null,
  };
}

/** Two hours a week per credit hour, the usual rule for work outside class. */
export function weeklyGoalForCredits(credits: number | null | undefined): number {
  return clampWeeklyGoalHours(typeof credits === 'number' && credits > 0 ? credits * 2 : 8);
}
