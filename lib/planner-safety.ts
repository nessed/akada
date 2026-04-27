const COURSE_CODE_MAX = 18;
const COURSE_NAME_MAX = 90;
const TASK_TITLE_MAX = 140;
const SESSION_NOTE_MAX = 800;
const DISPLAY_NAME_MAX = 60;
const AVATAR_URL_MAX = 250_000;

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

export function cleanTaskTitle(value: unknown): string {
  return cleanText(value, TASK_TITLE_MAX);
}

export function cleanSessionNote(value: unknown): string {
  return cleanText(value, SESSION_NOTE_MAX);
}

export function cleanAvatarUrl(value: unknown): string {
  return String(value ?? '').slice(0, AVATAR_URL_MAX);
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
