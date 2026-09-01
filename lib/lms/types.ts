/**
 * The shapes LUMS's Sakai returns from its Entity Broker, at `/direct/`.
 *
 * Only the fields we actually read are declared. Sakai sends far more per
 * entity (realm locks, edit state, a dozen nulls) and none of it is worth
 * carrying, so these are deliberately partial views of the real payloads
 * rather than faithful mirrors of them.
 *
 * Everything here is what the server sends, untouched. The normalized
 * shapes the app works with live in `./parse`.
 */

/** One entry of `/direct/site.json`'s `site_collection`. */
export interface SakaiSite {
  id: string;
  /** "2601 SSE Calculus I (MATH  101 S5-Lecture)". Parsed by `parseSiteTitle`. */
  title: string;
  /** "course" for real courses; project and workspace sites use other values. */
  type: string | null;
  /** The instructor, or whoever the site lists as its contact. */
  contactEmail: string | null;
  contactName: string | null;
  /** Epoch milliseconds, unlike the timestamps `content` uses. */
  createdDate: number | null;
  published: boolean;
  softlyDeleted: boolean;
  /** Which tools the course actually turned on, in portal order. */
  sitePages?: SakaiSitePage[];
}

export interface SakaiSitePage {
  id: string;
  /** "Resources", "Gradebook", "Tests & Quizzes". */
  title: string;
  url: string;
}

/** One entry of `/direct/content/site/{siteId}.json`'s `content_collection`. */
export interface SakaiContentItem {
  /** "collection" for a folder, otherwise the file's MIME type. */
  type: string | null;
  /**
   * Display name, which the instructor can rename at will. It routinely
   * disagrees with the filename in `url`, so it is safe to show and unsafe
   * to build a URL from.
   */
  title: string;
  /** The real download URL. Use it verbatim; see `title`. */
  url: string;
  /** `YYYYMMDDHHmmssSSS`, not epoch. Parsed by `parseSakaiTimestamp`. */
  modifiedDate: string | null;
  /** Bytes for a file. For a folder this is the child count, not a size. */
  size: number | null;
  /** Set on folders. */
  numChildren?: number | null;
  /** Parent path, e.g. "/content/group/{siteId}/". */
  container: string | null;
  hidden: boolean;
  visible: boolean;
}

/**
 * The envelopes the two endpoints we read come wrapped in. Entity Broker
 * names the array after the entity prefix rather than using a shared key,
 * so there is no one generic envelope type to share here.
 */
export interface SakaiSiteResponse {
  entityPrefix: string;
  site_collection: SakaiSite[];
}

export interface SakaiContentResponse {
  entityPrefix: string;
  content_collection: SakaiContentItem[];
}
