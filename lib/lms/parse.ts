import type { SakaiContentItem, SakaiSite } from './types';

/**
 * Turning what LUMS's Sakai sends into shapes the app can use.
 *
 * Every function here is pure and takes the raw payload as its argument, so
 * none of this depends on how the data was fetched. That matters: the same
 * parsing has to work whether the JSON arrived from a browser extension
 * riding the student's own session or from somewhere else later.
 */

/** A course site title, taken apart. */
export interface ParsedSiteTitle {
  /** "2601". Sorts lexicographically into term order, see `isCurrentTerm`. */
  term: string;
  /** "SSE", "SDSB", "SHSS". The school that owns the course. */
  school: string;
  /** "Calculus I", as the site names it. Not the registrar's title. */
  title: string;
  /** "MATH 101", whitespace already collapsed. Absent on non-course sites. */
  code?: string;
  /** "S5". */
  section?: string;
  /** "Lecture", "Lab", "Recitation". */
  component?: string;
}

/**
 * Course sites are titled `2601 SSE Calculus I (MATH  101 S5-Lecture)`:
 * term, school, title, then code, section and component in brackets.
 *
 * The bracketed half is not reliably spaced. Real titles carry both
 * `MATH  101` and `ECON 240`, so the code is rebuilt from its parts rather
 * than sliced out of the string.
 *
 * Returns null for anything that is not shaped like a course site, which
 * covers project sites and the student's own workspace.
 */
export function parseSiteTitle(raw: string): ParsedSiteTitle | null {
  const text = raw.trim().replace(/\s+/g, ' ');

  const outer = text.match(/^(\d{4})\s+([A-Z]{2,6})\s+(.+?)(?:\s+\((.+)\))?$/);
  if (!outer) return null;

  const [, term, school, title, bracket] = outer;
  const parsed: ParsedSiteTitle = { term, school, title: title.trim() };
  if (!bracket) return parsed;

  const inner = bracket.match(
    /^([A-Za-z]{2,6})\s*(\d{2,4}[A-Za-z]?)\s+([A-Za-z0-9]+)(?:\s*-\s*(.+))?$/,
  );
  if (!inner) return parsed;

  const [, subject, number, section, component] = inner;
  parsed.code = `${subject.toUpperCase()} ${number.toUpperCase()}`;
  parsed.section = section.toUpperCase();
  if (component) parsed.component = component.trim();

  return parsed;
}

/**
 * The newest term among the sites a student is in.
 *
 * Term codes are four digits that increase over time, `2501` then `2503`
 * then `2601`, so the current term is just the largest one present. Reading
 * it off the data avoids hard-coding a term anywhere, and avoids having to
 * decide what the middle digits mean, which the codes alone do not say.
 */
export function currentTerm(titles: ParsedSiteTitle[]): string | null {
  let latest: string | null = null;
  for (const { term } of titles) {
    if (latest === null || term > latest) latest = term;
  }
  return latest;
}

/**
 * Sakai's content timestamps are `YYYYMMDDHHmmssSSS` with no separators and
 * no zone, which no Date constructor accepts. They are read as UTC, the same
 * assumption the portal makes when it renders them.
 *
 * Returns null rather than an Invalid Date, so a malformed timestamp on one
 * file cannot poison a whole listing.
 */
export function parseSakaiTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;

  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, ms] = match.map(Number) as unknown as number[];
  const time = Date.UTC(year, month - 1, day, hour, minute, second, ms);

  return Number.isNaN(time) ? null : new Date(time);
}

/** A file or folder in a course's Resources, normalized. */
export interface CourseMaterial {
  /** What the instructor named it. Safe to display. */
  title: string;
  /** The download URL exactly as Sakai gave it. Never rebuilt from `title`. */
  url: string;
  /**
   * The stored filename, decoded out of `url`, and null for a folder, which
   * has no file behind it. Routinely disagrees with `title`.
   */
  filename: string | null;
  /** MIME type, or null for a folder. */
  mimeType: string | null;
  isFolder: boolean;
  /** Bytes. Null for folders, whose `size` field means something else. */
  bytes: number | null;
  uploadedAt: Date | null;
}

/** The `container` of a site's own root collection, which holds everything else. */
const CONTENT_ROOT = '/content/group/';

/**
 * Resources listings, cleaned up.
 *
 * Two things are dropped. Hidden items, because Sakai serves them to the API
 * but the portal does not show them, and a planner that surfaced files the
 * LMS itself hides would be showing students what their instructor withdrew.
 * And the site's own root collection, which Sakai returns as the first entry
 * of its own listing: it is the folder being listed, not something in it.
 */
export function parseMaterials(items: SakaiContentItem[]): CourseMaterial[] {
  const materials: CourseMaterial[] = [];

  for (const item of items) {
    if (item.hidden || item.visible === false) continue;
    if (item.container === CONTENT_ROOT) continue;

    const isFolder = item.type === 'collection';

    materials.push({
      title: item.title,
      url: item.url,
      filename: isFolder ? null : filenameFromUrl(item.url),
      mimeType: isFolder ? null : item.type,
      bytes: isFolder ? null : item.size,
      uploadedAt: parseSakaiTimestamp(item.modifiedDate),
      isFolder,
    });
  }

  return materials;
}

/** The last path segment of a content URL, percent-decoding survived. */
function filenameFromUrl(url: string): string {
  const path = url.split('?')[0].replace(/\/+$/, '');
  const last = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * The course outline, if it was posted.
 *
 * This is the file that matters most. LUMS instructors leave Assignments,
 * Gradebook and Tests & Quizzes empty, so the LMS holds no structured
 * deadlines at all; what deadlines exist are written out in the outline
 * document, along with the grade breakdown. Finding it is the first step of
 * getting anything dated out of a course.
 *
 * Matched on the title rather than the filename because the title is what
 * the instructor curated, and folders are skipped so an "Outlines" folder
 * cannot be mistaken for the document inside it.
 */
export function findCourseOutline(materials: CourseMaterial[]): CourseMaterial | null {
  const pattern = /course\s*outline|course\s*info|syllabus|outline/i;

  for (const material of materials) {
    if (material.isFolder) continue;
    if (pattern.test(material.title)) return material;
    if (material.filename && pattern.test(material.filename)) return material;
  }

  return null;
}

/** A course site, normalized, with the raw Sakai identifiers kept. */
export interface LmsCourse {
  siteId: string;
  term: string;
  school: string;
  title: string;
  code?: string;
  section?: string;
  component?: string;
  instructorName: string | null;
  instructorEmail: string | null;
  /** Tool names the course turned on, e.g. "Resources", "Gradebook". */
  tools: string[];
}

/**
 * The course sites out of `/direct/site.json`.
 *
 * Sakai returns every site a student has ever been in, across all terms,
 * mixed with project sites and their own workspace. Only published course
 * sites with a parseable title survive.
 */
export function parseCourses(sites: SakaiSite[]): LmsCourse[] {
  const courses: LmsCourse[] = [];

  for (const site of sites) {
    if (site.type !== 'course' || site.softlyDeleted || !site.published) continue;

    const parsed = parseSiteTitle(site.title);
    if (!parsed) continue;

    courses.push({
      siteId: site.id,
      ...parsed,
      instructorName: cleanContactName(site.contactName),
      instructorEmail: site.contactEmail,
      tools: (site.sitePages ?? []).map((page) => page.title),
    });
  }

  return courses;
}

/**
 * Sakai prefixes the contact's display name with their login, so a site
 * reports "burki Abid Aman Burki" where the instructor is Abid Aman Burki.
 * The login is dropped when the rest of the string still names somebody.
 */
function cleanContactName(raw: string | null): string | null {
  if (!raw) return null;

  const text = raw.trim().replace(/\s+/g, ' ');
  const [first, ...rest] = text.split(' ');
  if (rest.length === 0) return text;

  // A login is lowercase and may carry a dot; a real first name is capitalized.
  if (/^[a-z][a-z0-9._-]*$/.test(first)) return rest.join(' ');

  return text;
}
