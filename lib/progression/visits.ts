'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Course } from '../data';
import { useCourses, useSessions, useTasks } from '../data-hooks';
import { sortCourses } from '../data/course-order';
import { isoDate } from '../utils';
import { readProgression, type Progression } from './index';

/**
 * What the record looked like the last time the reader opened it.
 *
 * Record is read now and then rather than every day, so the useful thing it
 * can say on arrival is what has changed since: the marks inked, the pages
 * bound, the rungs struck and the weeks added while the reader was away. That
 * is also the only honest reason to come back to it, and the nav says so with
 * a quiet ink dot when there is something new, never a count and never red.
 *
 * Kept on the device, the way the Next Mark ledger is. It is a convenience:
 * lose it and the record simply has nothing to say since, until the next
 * visit sets a new baseline. It never changes what the record holds.
 */

const KEY = 'akada.record.lastSeen';
const EVENT = 'akada:record-seen';

export interface RecordSnapshot {
  at: string;
  marks: Record<string, number>;
  bound: Record<string, number>;
  struck: Record<string, number>;
  run: number;
}

export interface RecordNews {
  /** When the reader last looked, for the line that introduces the news. */
  since: string;
  marks: { courseId: string; n: number }[];
  bound: { courseId: string; n: number }[];
  /** Impressions with a rung struck since, by id, with how many. */
  struck: Map<string, number>;
  /** Weeks added to the run since. Zero when it held or broke. */
  run: number;
  any: boolean;
}

export function snapshotOf(progression: Progression): RecordSnapshot {
  const marks: Record<string, number> = {};
  const bound: Record<string, number> = {};
  for (const [id, page] of progression.pages) {
    marks[id] = page.marks;
    bound[id] = page.bound;
  }
  const struck: Record<string, number> = {};
  for (const impression of progression.impressions) struck[impression.id] = impression.struck;
  return { at: new Date().toISOString(), marks, bound, struck, run: progression.runs.current };
}

export function diffRecord(before: RecordSnapshot, now: Progression): RecordNews {
  const marks: RecordNews['marks'] = [];
  const bound: RecordNews['bound'] = [];
  for (const [id, page] of now.pages) {
    // A course added since was not there to compare, so it starts from
    // nothing: its first marks are news like anybody else's.
    const m = page.marks - (before.marks[id] ?? 0);
    if (m > 0) marks.push({ courseId: id, n: m });
    const b = page.bound - (before.bound[id] ?? 0);
    if (b > 0) bound.push({ courseId: id, n: b });
  }
  const struck = new Map<string, number>();
  for (const impression of now.impressions) {
    const s = impression.struck - (before.struck[impression.id] ?? 0);
    if (s > 0) struck.set(impression.id, s);
  }
  const run = Math.max(0, now.runs.current - before.run);
  return {
    since: before.at,
    marks,
    bound,
    struck,
    run,
    any: marks.length > 0 || bound.length > 0 || struck.size > 0 || run > 0,
  };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): RecordSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as RecordSnapshot;
    return value && typeof value.at === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function readSnapshot(): RecordSnapshot | null {
  if (typeof window === 'undefined') return null;
  return parse(readRaw());
}

export function writeSnapshot(snapshot: RecordSnapshot) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Private mode or storage full: the record just has nothing to say since.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Whether anything has been earned since the reader last opened Record, for
 * the dot on the nav. Reads the logged record only, not the sitting on the
 * clock, so the dot means something landed rather than that a timer is
 * running, and the nav is not re-reading the term every second of a sitting.
 */
export function useRecordHasNews(): boolean {
  const { courses: rawCourses, isLoading: a } = useCourses();
  const { sessions, isLoading: b } = useSessions();
  const { tasks, isLoading: c } = useTasks();
  const loading = a || b || c;
  const today = isoDate();
  const logged = useMemo(
    () => (loading ? null : readProgression(sortCourses(rawCourses), sessions, tasks, today)),
    [loading, rawCourses, sessions, tasks, today],
  );
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const [news, setNews] = useState(false);
  useEffect(() => {
    const before = parse(raw);
    setNews(Boolean(before && logged && diffRecord(before, logged).any));
  }, [raw, logged]);
  return news;
}

/** Course code for a news line, falling back to nothing for a deleted course. */
export function codeOf(courses: Course[], id: string): string | null {
  return courses.find((c) => c.id === id)?.code ?? null;
}
