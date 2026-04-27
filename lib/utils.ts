// ---- Time / date helpers

export function isoDate(d: Date = new Date()): string {
  // Local YYYY-MM-DD (not UTC) so a session at 11pm doesn't get logged tomorrow.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export function isoWeekNumber(d: Date = new Date()): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNo = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNo);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// "Today" / "Tomorrow" / "Xd overdue" / "In Xd" / "Apr 27"
export interface DueLabel {
  text: string;
  tone: 'warn' | 'now' | 'soon' | 'far';
}
export function dueLabel(dueDate: string | null, today = isoDate()): DueLabel | null {
  if (!dueDate) return null;
  const days = daysBetween(today, dueDate);
  if (days < 0) return { text: `${-days}d overdue`, tone: 'warn' };
  if (days === 0) return { text: 'Today', tone: 'now' };
  if (days === 1) return { text: 'Tomorrow', tone: 'soon' };
  if (days < 7) return { text: `In ${days}d`, tone: 'soon' };
  const d = new Date(dueDate + 'T00:00:00');
  return {
    text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tone: 'far',
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

// Muted pastel notebook palette — each entry pairs a strong color with a soft tint
// used for backgrounds, badges, and timer gradients.
export interface Pastel {
  name: string;
  value: string;
  tint: string;
}

export const PASTEL_PALETTE: Pastel[] = [
  { name: 'Sage', value: '#A8B89B', tint: '#E9EEE3' },
  { name: 'Rose', value: '#D4A5A5', tint: '#F1E2E2' },
  { name: 'Lavender', value: '#B5A8C9', tint: '#E8E2F0' },
  { name: 'Peach', value: '#E2B594', tint: '#F4E1D2' },
  { name: 'Sky', value: '#A8BCC9', tint: '#E2EAEF' },
  { name: 'Clay', value: '#C99B7E', tint: '#EFDDCD' },
  { name: 'Butter', value: '#D9C58C', tint: '#F1E9C9' },
  { name: 'Mint', value: '#9FC1B0', tint: '#DCEAE2' },
  { name: 'Slate', value: '#9AA3AB', tint: '#DEE2E6' },
  { name: 'Mauve', value: '#B89BAA', tint: '#E8DCE3' },
];

// Resolve a tint for a course. If the course color matches a palette entry, use
// its paired tint; otherwise fall back to a light wash of the color.
export function resolveTint(color: string, fallbackTint?: string | null): string {
  if (fallbackTint) return fallbackTint;
  const match = PASTEL_PALETTE.find((p) => p.value.toLowerCase() === color.toLowerCase());
  if (match) return match.tint;
  return rgba(color, 0.22);
}

// ---- Aggregation helpers

import type { Course, Session } from './data';

export function totalSeconds(sessions: Session[]): number {
  return sessions.reduce((acc, s) => acc + s.durationSeconds, 0);
}

export function sessionsForDate(sessions: Session[], date: string): Session[] {
  return sessions.filter((s) => s.date === date);
}

export function sessionsThisWeek(sessions: Session[]): Session[] {
  const start = isoDate(startOfWeek());
  const end = isoDate(endOfWeek());
  return sessions.filter((s) => s.date >= start && s.date <= end);
}

export function findCourse(courses: Course[], id: string): Course | undefined {
  return courses.find((c) => c.id === id);
}

export function lastSeenByCourse(sessions: Session[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of sessions) {
    if (!map[s.courseId] || s.date > map[s.courseId]) map[s.courseId] = s.date;
  }
  return map;
}

export function studyStreakDays(sessions: Session[], today: Date = new Date()): number {
  const dates = new Set(sessions.map((s) => s.date));
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
