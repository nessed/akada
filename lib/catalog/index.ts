import type { CatalogCourse } from './types';
import { FALL_2026 } from './fall-2026';

export type { CatalogCourse, CatalogSection } from './types';

/**
 * The catalog the add-course picker searches. Swapping terms is a one-line
 * change here — see the header of `fall-2026.ts`.
 */
const ACTIVE_CATALOG: CatalogCourse[] = FALL_2026;

export const MAX_CATALOG_RESULTS = 5;

/** "CS 200" / "cs-200" / "cs200" all collapse to "cs200" for comparison. */
function normalizeCode(value: string): string {
  return value.toLowerCase().replace(/[\s-]/g, '');
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Ranked catalog search. Lower score sorts first:
 *   0  exact course-code match
 *   1  course-code prefix
 *   2  title starts with the query
 *   3  anything else matching title or department
 * Ties break on code so results don't jitter between keystrokes.
 */
export function searchCatalog(
  rawQuery: string,
  limit = MAX_CATALOG_RESULTS,
): CatalogCourse[] {
  const query = normalize(rawQuery);
  if (query.length < 2) return [];

  const codeQuery = normalizeCode(query);

  const scored: { course: CatalogCourse; score: number }[] = [];

  for (const course of ACTIVE_CATALOG) {
    const code = normalizeCode(course.code);
    const title = normalize(course.title);
    const department = normalize(course.department ?? '');

    let score: number | null = null;

    if (code === codeQuery) score = 0;
    else if (code.startsWith(codeQuery)) score = 1;
    else if (title.startsWith(query)) score = 2;
    else if (title.includes(query) || department.includes(query)) score = 3;

    if (score !== null) scored.push({ course, score });
  }

  scored.sort((a, b) => a.score - b.score || a.course.code.localeCompare(b.course.code));
  return scored.slice(0, limit).map((entry) => entry.course);
}

/**
 * Manual fallback. Someone who types a course and submits without picking a
 * suggestion still gets a normal course, so the picker never becomes a
 * required step.
 *
 * Splits a leading catalog-style code off the front:
 *   "CS 200 Programming Fundamentals" -> { code: "CS 200", name: "Programming…" }
 *   "CS200"                           -> { code: "CS 200", name: "" }
 *   "Organic Chemistry"               -> { code: "",        name: "Organic Chemistry" }
 * Whichever half comes back empty is the one the UI asks for.
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
