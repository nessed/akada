/**
 * Reading a LUMS Sakai account into shapes the planner understands.
 *
 * What LUMS's Sakai actually holds is narrower than its tool list suggests.
 * Assignments, Gradebook and Tests & Quizzes are switched on for every
 * course and left empty; Resources is the one tool instructors use. So this
 * module is built around course sites and their files, and any deadline has
 * to come out of the course outline document rather than an API.
 */

export type {
  SakaiSite,
  SakaiSitePage,
  SakaiContentItem,
  SakaiSiteResponse,
  SakaiContentResponse,
} from './types';

export type { ParsedSiteTitle, CourseMaterial, LmsCourse } from './parse';

export {
  parseSiteTitle,
  currentTerm,
  parseSakaiTimestamp,
  parseMaterials,
  findCourseOutline,
  parseCourses,
} from './parse';

export type { CatalogMatch } from './catalog-match';
export { matchCatalog } from './catalog-match';
