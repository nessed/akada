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
  /**
   * What kind of meeting this section is, "Lab", "Recitation", for the
   * ones that enrol separately from the lecture. Omitted for lectures, which
   * are the default and would only add noise.
   */
  component?: string;
  instructor?: string;
  /** Human-readable, already formatted, e.g. "Mon & Wed, 9:30 AM - 10:45 AM". */
  meets?: string;
  /** Where it meets, as the catalog prints it: "A-1 · Academic Block". */
  room?: string;
  /**
   * How often the section meets and for how long, "Twice a week - 75 min".
   * Set only where `meets` is absent, which is most sections: the registrar
   * publishes a slot on the timetable for a minority of courses, and this is
   * the nearest thing the rest can say about when they run.
   */
  cadence?: string;
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
