const COURSE_CODE_MAX = 18;
const COURSE_NAME_MAX = 90;
const TASK_TITLE_MAX = 140;
const SESSION_NOTE_MAX = 800;
const DISPLAY_NAME_MAX = 60;
// Avatars are resized client-side to 160x160 JPEG at 0.7 quality, which lands
// around 3-8 KB of base64. 64 KB is generous headroom and still keeps a row
// small; the old 250,000-character ceiling let a quarter-megabyte blob per
// user straight into Postgres.
const AVATAR_URL_MAX = 64_000;

const AVATAR_DATA_URL = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
// (?!\/) rejects protocol-relative "//evil.com/x.png", which is off-origin.
const AVATAR_RELATIVE_PATH = /^\/(?!\/)[A-Za-z0-9._~\-/]*$/;

export function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function cleanDisplayName(value: unknown): string {
  return cleanText(value, DISPLAY_NAME_MAX);
}

export function cleanCourseCode(value: unknown): string {
  return cleanText(value, COURSE_CODE_MAX).toUpperCase();
}

export function cleanCourseName(value: unknown): string {
  return cleanText(value, COURSE_NAME_MAX);
}

const SECTION_MAX = 24;
const INSTRUCTOR_MAX = 80;
export const MEETING_TIME_MAX = 60;

/** Optional catalog fields: empty string collapses to null so a blank never
 *  round-trips as a meaningless "" on the course card. */
export function cleanOptionalText(value: unknown, maxLength: number): string | null {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

export function cleanSection(value: unknown): string | null {
  return cleanOptionalText(value, SECTION_MAX);
}

export function cleanInstructor(value: unknown): string | null {
  return cleanOptionalText(value, INSTRUCTOR_MAX);
}

export function cleanMeetingTime(value: unknown): string | null {
  return cleanOptionalText(value, MEETING_TIME_MAX);
}

/** Credits are 0-12 in half steps; anything else is treated as "not set". */
export function cleanCredits(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(12, Math.round(parsed * 2) / 2);
}

export function cleanTaskTitle(value: unknown): string {
  return cleanText(value, TASK_TITLE_MAX);
}

export function cleanSessionNote(value: unknown): string {
  return cleanText(value, SESSION_NOTE_MAX);
}

/**
 * Avatars are stored as a URL string in Postgres and rendered into an <img>.
 * Only three shapes are allowed: an https: URL, a base64 image data URL, and
 * a same-origin relative path such as /default-avatar.svg. Everything else
 * (javascript:, data:text/html, http:, an oversized blob) is rejected.
 *
 * Returns '' for anything invalid, so a bad value read back out of the
 * database degrades to the default avatar rather than rendering.
 */
export function cleanAvatarUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > AVATAR_URL_MAX) return '';
  if (AVATAR_DATA_URL.test(raw)) return raw;
  if (AVATAR_RELATIVE_PATH.test(raw)) return raw;
  try {
    if (new URL(raw).protocol === 'https:') return raw;
  } catch {
    // Not parseable as an absolute URL.
  }
  return '';
}

/**
 * Write-path counterpart to cleanAvatarUrl. Silently blanking an avatar the
 * user just picked looks like the save failed for no reason, so on the way
 * into the database we throw a message the UI can show instead.
 */
export function assertAvatarUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.length > AVATAR_URL_MAX) {
    throw new Error('That image is too large. Please choose a smaller one.');
  }
  const cleaned = cleanAvatarUrl(raw);
  if (!cleaned) {
    throw new Error('That image could not be used. Please choose a different one.');
  }
  return cleaned;
}

export function clampStepNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  step = 0.5,
): number {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  const stepped = Math.round(safe / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

export function clampWeeklyGoalHours(value: unknown): number {
  return clampStepNumber(value, 0.5, 40, 6);
}

export function clampDailyGoalHours(value: unknown): number {
  return clampStepNumber(value, 0.5, 16, 4);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}` === value;
}

export function cleanOptionalDate(value: unknown): string | null {
  if (!value) return null;
  return isIsoDate(value) ? value : null;
}

export function requireIsoDate(value: unknown, label: string): string {
  if (!isIsoDate(value)) throw new Error(`${label} must be a valid date`);
  return value;
}

export function requireNonEmpty(value: unknown, label: string, maxLength: number): string {
  const cleaned = cleanText(value, maxLength);
  if (!cleaned) throw new Error(`${label} is required`);
  return cleaned;
}

export function hasDuplicateCourseCodes(courses: { code: string }[]): boolean {
  const seen = new Set<string>();
  for (const course of courses) {
    const code = cleanCourseCode(course.code);
    if (!code) continue;
    if (seen.has(code)) return true;
    seen.add(code);
  }
  return false;
}
