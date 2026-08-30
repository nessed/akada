/**
 * Shape of the course catalog that backs the add-course autocomplete.
 *
 * This is deliberately the smallest set of fields the UI actually renders.
 * A registrar export carries far more (description, prerequisites, final
 * exam slot, capacity, enrolment); none of it belongs here, because none of
 * it is shown. Keeping the type narrow is what stops the catalog turning
 * into a browsable database.
 */

export interface CatalogSection {
  /** Short label as printed in the catalog, e.g. "L1", "S2". */
  id: string;
  instructor?: string;
  /** Human-readable, already formatted, e.g. "Mon/Wed 10:00". */
  meets?: string;
}

export interface CatalogCourse {
  /** Catalog code as displayed, e.g. "CS 200". */
  code: string;
  title: string;
  credits?: number;
  /** Subject / department, searchable but not displayed in results. */
  department?: string;
  /**
   * Optional. When a course has sections the picker offers them in a small
   * select; when it has none the section field stays a free-text box, so a
   * catalog without section data still works.
   */
  sections?: CatalogSection[];
}
