import type { CatalogCourse, CatalogSection } from '../catalog/types';
import type { LmsCourse } from './parse';

/**
 * Joining a Sakai course site to the registrar catalog.
 *
 * The two describe the same course from different ends. Sakai knows the
 * student is in `MATH 101 S5` and who teaches it; the catalog knows when and
 * where S5 meets, its credits and its department. Matching them is what lets
 * a synced course arrive already knowing its own timetable.
 *
 * The catalog is passed in rather than imported. `lib/catalog/fall-2026.ts`
 * is several hundred courses and the app deliberately loads it on demand,
 * so nothing in here should drag it into a bundle by importing it eagerly.
 */

export interface CatalogMatch {
  course: CatalogCourse;
  /** The specific section, when the site named one the catalog also lists. */
  section?: CatalogSection;
}

/** "MATH 101" / "math-101" / "MATH  101" all collapse to "math101". */
function normalizeCode(value: string): string {
  return value.toLowerCase().replace(/[\s-]/g, '');
}

/**
 * The catalog entry for a synced course, or null when there is none.
 *
 * A miss is ordinary rather than exceptional: the catalog covers one term,
 * and a student's site list spans every term they have ever enrolled in, so
 * most of their older courses will not be in it. Callers should treat null
 * as "no timetable known" and keep the course.
 */
export function matchCatalog(
  lmsCourse: LmsCourse,
  catalog: CatalogCourse[],
): CatalogMatch | null {
  if (!lmsCourse.code) return null;

  const wanted = normalizeCode(lmsCourse.code);
  const course = catalog.find((entry) => normalizeCode(entry.code) === wanted);
  if (!course) return null;

  if (!lmsCourse.section || !course.sections) return { course };

  const wantedSection = lmsCourse.section.toUpperCase();
  const section = course.sections.find(
    (entry) => entry.id.toUpperCase() === wantedSection,
  );

  return section ? { course, section } : { course };
}
