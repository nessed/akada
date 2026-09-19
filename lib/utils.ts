// ---- Time / date helpers

export function isoDate(d?: Date): string {
  // Explicit dates are calendar dates (calendar grids / due dates). The
  // implicit "today" honors the user's chosen late-night day boundary.
  const date = new Date(d ?? new Date());
  if (!d && typeof window !== 'undefined') {
    try {
      const stored = JSON.parse(window.localStorage.getItem('akada.preferences.v1') || '{}');
      const cutoff = Number(stored.dayEndingHour);
      if (Number.isFinite(cutoff) && cutoff > 0 && cutoff <= 6) date.setHours(date.getHours() - cutoff);
    } catch { /* a normal calendar day is a safe fallback */ }
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * "Spring 2026" / "Fall 2026"-style label from a date. Mirrors the season
 * cutoffs supabase/schema.sql uses when guessing a label for a semester
 * migrated from before semesters had names of their own.
 */
export function seasonLabel(d: Date = new Date()): string {
  const month = d.getMonth(); // 0-11
  const season = month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall';
  return `${season} ${d.getFullYear()}`;
}

export function startOfWeek(d: Date = new Date()): Date {
  // Monday as start of week
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

export function endOfWeek(d: Date = new Date()): Date {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function daysAgo(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
}

export function formatHHMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatHours(totalSeconds: number, digits = 1): string {
  const hrs = totalSeconds / 3600;
  return hrs.toFixed(digits);
}

// "1h 30m" / "30m" / "1h"
export function formatHM(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatRelativeDate(iso: string): string {
  const today = isoDate();
  const yesterday = isoDate(daysAgo(new Date(), 1));
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  const date = new Date(iso + 'T00:00:00');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime();
  const db = new Date(b + 'T00:00:00').getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

// "Today" / "Tomorrow" / "Xd overdue" / "In Xd" / "Apr 27"
export type DueCategory = 'overdue' | 'today' | 'tomorrow' | 'upcoming';

export interface DueLabel {
  text: string;
  tone: 'warn' | 'now' | 'soon' | 'far';
  category: DueCategory;
  days: number;
  formattedDate: string;
}
export function dueLabel(dueDate: string | null, today = isoDate()): DueLabel | null {
  if (!dueDate || !isIsoDate(dueDate)) return null;
  const days = daysBetween(today, dueDate);
  const d = new Date(dueDate + 'T00:00:00');
  const formattedDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  if (days < 0) {
    return {
      text: `${-days}d overdue`,
      tone: 'warn',
      category: 'overdue',
      days,
      formattedDate,
    };
  }
  if (days === 0) {
    return {
      text: 'Today',
      tone: 'now',
      category: 'today',
      days,
      formattedDate,
    };
  }
  if (days === 1) {
    return {
      text: 'Tomorrow',
      tone: 'soon',
      category: 'tomorrow',
      days,
      formattedDate,
    };
  }
  if (days < 7) {
    return {
      text: `In ${days}d`,
      tone: 'soon',
      category: 'upcoming',
      days,
      formattedDate,
    };
  }
  return {
    text: formattedDate,
    tone: 'far',
    category: 'upcoming',
    days,
    formattedDate,
  };
}

// ---- Color helpers

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Muted pastel notebook palette, each entry pairs a strong color with a soft tint
// used for backgrounds, badges, and timer gradients.
export interface Pastel {
  name: string;
  value: string;
  /**
   * The daylight wash. This is the value a course record stores, and it is
   * what the colour picker shows, but nothing should paint with it directly,
   * see `token` and resolveTint below.
   */
  tint: string;
  /**
   * The same wash as a custom property. globals.css carries the daylight
   * value and NIGHT_TOKENS in lib/preferences.ts swaps in the dark one, so
   * anything that fills with the token follows the paper the reader chose
   * while `value`, the colour the course owns, stays the same object.
   */
  token: string;
}

export const PASTEL_PALETTE: Pastel[] = [
  { name: 'Sage', value: '#A8B89B', tint: '#E9EEE3', token: 'var(--sage-tint)' },
  { name: 'Rose', value: '#D4A5A5', tint: '#F1E2E2', token: 'var(--rose-tint)' },
  { name: 'Lavender', value: '#B5A8C9', tint: '#E8E2F0', token: 'var(--lav-tint)' },
  { name: 'Peach', value: '#E2B594', tint: '#F4E1D2', token: 'var(--peach-tint)' },
  { name: 'Sky', value: '#A8BCC9', tint: '#E2EAEF', token: 'var(--sky-tint)' },
  { name: 'Clay', value: '#C99B7E', tint: '#EFDDCD', token: 'var(--clay-tint)' },
  { name: 'Butter', value: '#D9C58C', tint: '#F1E9C9', token: 'var(--butter-tint)' },
  { name: 'Mint', value: '#9FC1B0', tint: '#DCEAE2', token: 'var(--mint-tint)' },
  { name: 'Slate', value: '#9AA3AB', tint: '#DEE2E6', token: 'var(--slate-tint)' },
  { name: 'Mauve', value: '#B89BAA', tint: '#E8DCE3', token: 'var(--mauve-tint)' },
];

/**
 * The wash to fill with for a course, in the light the reader is working in.
 *
 * A course record stores a daylight hex in its `tint` column, written when the
 * colour was picked. Painting with that hex directly is what broke the night
 * paper: the wash stayed a near-white while `--ink` became cream, so every
 * course chip, the play button on a course card and the week's challenge were
 * pale blocks with invisible writing on them. The stored hex is therefore only
 * ever used to recognise which pastel was meant; what comes back is that
 * pastel's custom property, which the night tone already redefines.
 *
 * A colour that is not one of the ten is washed with its own alpha instead, so
 * it composites over whichever paper is underneath rather than over an assumed
 * white one.
 */
export function resolveTint(color: string, storedTint?: string | null): string {
  const lower = (color || '').toLowerCase();
  const byColor = PASTEL_PALETTE.find((p) => p.value.toLowerCase() === lower);
  if (byColor) return byColor.token;
  if (storedTint) {
    const stored = storedTint.toLowerCase();
    const byTint = PASTEL_PALETTE.find((p) => p.tint.toLowerCase() === stored);
    if (byTint) return byTint.token;
    // A wash nobody in the app can currently pick. Left alone rather than
    // guessed at, since it is the only record of what was chosen.
    return storedTint;
  }
  return color ? rgba(color, 0.22) : 'var(--bg-tint)';
}

// ---- Aggregation helpers

import type { Course, Session } from './data';
import { clampSessionSeconds, isLoggableDuration } from './session-safety';
import { isIsoDate } from './planner-safety';

export function totalSeconds(sessions: Session[]): number {
  return sessions.reduce((acc, s) => acc + clampSessionSeconds(s.durationSeconds), 0);
}

export function sessionsForDate(sessions: Session[], date: string): Session[] {
  return sessions.filter((s) => s.date === date && isLoggableDuration(s.durationSeconds));
}

export function sessionsThisWeek(sessions: Session[]): Session[] {
  const start = isoDate(startOfWeek());
  const end = isoDate(endOfWeek());
  return sessions.filter(
    (s) => s.date >= start && s.date <= end && isLoggableDuration(s.durationSeconds),
  );
}

export function findCourse(courses: Course[], id: string): Course | undefined {
  return courses.find((c) => c.id === id);
}

export function lastSeenByCourse(sessions: Session[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of sessions.filter((session) => isLoggableDuration(session.durationSeconds))) {
    if (!map[s.courseId] || s.date > map[s.courseId]) map[s.courseId] = s.date;
  }
  return map;
}

export function studyStreakDays(sessions: Session[], today: Date = new Date()): number {
  const dates = new Set(
    sessions.filter((s) => isLoggableDuration(s.durationSeconds)).map((s) => s.date),
  );
  let streak = 0;
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);
  const todayIso = isoDate(cursor);

  while (true) {
    const currentIso = isoDate(cursor);
    if (!dates.has(currentIso)) {
      if (streak === 0 && currentIso === todayIso) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
