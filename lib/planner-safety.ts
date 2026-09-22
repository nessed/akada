import type {
  Assessment,
  CourseGrading,
  DropRule,
  GradingBasis,
  PendingScheme,
  RecallAnswer,
  RecallSource,
  RecallVerdict,
  TaskKind,
} from './data/types';
import { RECALL_HISTORY_MAX, RECALL_PROMPT_MAX } from './recall/constants';

const COURSE_CODE_MAX = 18;
const COURSE_NAME_MAX = 90;
const TASK_TITLE_MAX = 140;
export const SESSION_NOTE_MAX = 800;
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

const TASK_KINDS: TaskKind[] = ['task', 'reading', 'exam'];

/** A row's kind. Anything unrecognised is a plain task, which is the default. */
export function cleanKind(value: unknown): TaskKind {
  return TASK_KINDS.includes(value as TaskKind) ? (value as TaskKind) : 'task';
}

/**
 * A percentage, or null. Numbers arrive as strings from PostgREST's `numeric`,
 * so this parses rather than assumes.
 */
export function cleanWeight(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
}

export function cleanPages(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(10000, Math.round(n)) : null;
}

/**
 * The weighting a course is marked on. Kept to a sane length and to numbers
 * that are actually percentages, because this drives a headline figure ("72%
 * of your grade is still unmarked") and a row of bad data would make the app
 * state something untrue rather than merely look wrong.
 */
export function sanitizeAssessments(value: unknown): Assessment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<Assessment>;
    const id = cleanText(String(row.id ?? ''), 80);
    const label = cleanText(String(row.label ?? ''), 120);
    if (!id || !label) return [];
    const weight = Number(row.weight);
    const score = row.score === null || row.score === undefined ? null : Number(row.score);
    const outOf = row.outOf === null || row.outOf === undefined ? null : Number(row.outOf);
    const group = cleanText(String(row.group ?? ''), 80);
    return [
      {
        id,
        label,
        weight: Number.isFinite(weight) ? Math.min(100, Math.max(0, weight)) : 0,
        score: Number.isFinite(score as number) ? (score as number) : null,
        outOf: Number.isFinite(outOf as number) && (outOf as number) > 0 ? (outOf as number) : null,
        // Omitted rather than written as '' so a piece in no group keeps the
        // exact shape it had before drop rules existed.
        ...(group ? { group } : {}),
      },
    ];
  });
}

/**
 * One drop group's rule, e.g. "of the seven quizzes, keep the best six".
 *
 * `keep` of 0 would silently delete a whole group's worth of weight from the
 * course, so it is floored at 1. It is not capped against the group's size
 * here because the rule and the pieces are sanitized independently; the
 * clamping that matters happens in gradeStanding, where both are in hand.
 */
function sanitizeDropRules(value: unknown): DropRule[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<DropRule>;
    const group = cleanText(String(row.group ?? ''), 80);
    const keep = Number(row.keep);
    if (!group || seen.has(group) || !Number.isFinite(keep)) return [];
    seen.add(group);
    return [{ group, keep: Math.max(1, Math.trunc(keep)) }];
  });
}

function sanitizeBasis(value: unknown): GradingBasis | undefined {
  return value === 'relative' || value === 'absolute' ? value : undefined;
}

function sanitizePendingScheme(value: unknown): PendingScheme | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<PendingScheme>;
  const assessments = sanitizeAssessments(row.assessments);
  // A proposal with nothing in it is not a proposal. Dropping it here means
  // the card never has to render an empty review state.
  if (assessments.length === 0) return null;
  const createdAt = cleanText(String(row.createdAt ?? ''), 40);
  return {
    assessments,
    basis: sanitizeBasis(row.basis) ?? 'absolute',
    dropRules: sanitizeDropRules(row.dropRules),
    source: cleanText(String(row.source ?? ''), 200),
    note: cleanText(String(row.note ?? ''), 600),
    createdAt: createdAt || new Date().toISOString(),
  };
}

/**
 * How a course is marked, beyond the list of pieces.
 *
 * Returns undefined rather than an empty object when there is nothing to say,
 * so a course that has never been told anything keeps writing no grading at
 * all and the column stays at its `{}` default.
 */
export function sanitizeGrading(value: unknown): CourseGrading | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Partial<CourseGrading>;
  const basis = sanitizeBasis(row.basis);
  const dropRules = sanitizeDropRules(row.dropRules);
  const pending = sanitizePendingScheme(row.pending);
  if (!basis && dropRules.length === 0 && !pending) return undefined;
  const grading: CourseGrading = {};
  if (basis) grading.basis = basis;
  if (dropRules.length > 0) grading.dropRules = dropRules;
  if (pending) grading.pending = pending;
  return grading;
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

// ---- Recall

const RECALL_VERDICTS: readonly RecallVerdict[] = ['clear', 'hazy', 'gone'];
const RECALL_SOURCES: readonly RecallSource[] = ['reading', 'task', 'step', 'note', 'own'];
const RECALL_KEY_MAX = 200;

export function cleanRecallVerdict(value: unknown): RecallVerdict | null {
  return RECALL_VERDICTS.includes(value as RecallVerdict) ? (value as RecallVerdict) : null;
}

export function cleanRecallSource(value: unknown): RecallSource {
  return RECALL_SOURCES.includes(value as RecallSource) ? (value as RecallSource) : 'own';
}

export function cleanRecallPrompt(value: unknown): string {
  return cleanText(value, RECALL_PROMPT_MAX);
}

export function cleanRecallKey(value: unknown): string {
  return cleanText(value, RECALL_KEY_MAX);
}

/**
 * A recall history as the schedule can trust it: real dates, real verdicts,
 * oldest first, and no more than the most recent RECALL_HISTORY_MAX. Anything
 * else in the document is dropped rather than guessed at, because a schedule
 * built on one invented answer is wrong for every recall after it.
 */
export function sanitizeRecallHistory(value: unknown): RecallAnswer[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const verdict = cleanRecallVerdict(row.verdict);
      const on = isIsoDate(row.on) ? row.on : null;
      return verdict && on ? [{ on, verdict }] : [];
    })
    .sort((a, b) => a.on.localeCompare(b.on))
    .slice(-RECALL_HISTORY_MAX);
}
