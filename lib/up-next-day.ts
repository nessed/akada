import type { UpNextSetAside } from './up-next';

/**
 * What this device said to Up next today: what it set aside with Not now,
 * and which Or row it put up instead.
 *
 * It is a convenience for one evening on one device and nothing more. It
 * never writes a task, never moves a date, and never decides anything beyond
 * today: a stored day that is not today reads as empty, so a task set aside
 * tonight comes back tomorrow in its honest tier, and a task due today that
 * was passed over reads as a day overdue. That is the fix for the old
 * Tomorrow button, which rewrote the due date of whatever it was pressed on,
 * pulled far deadlines earlier, gave undated work a date and could not be
 * undone. The MCP briefing and other devices never see any of this, which is
 * the one place they can differ from Today, and MCP_SETUP says so.
 *
 * No 'use client': the pure helpers are imported by tests under node, and
 * every touch of storage checks for a window first and is wrapped, with a
 * module-level copy standing in whenever storage refuses (a private window,
 * a full quota, a blocked origin), so Not now still works for the session
 * even where it cannot be remembered.
 */

const KEY = 'akada.upNext.day.v1';

export interface UpNextDay {
  day: string;
  passes: readonly UpNextSetAside[];
  chosen: string | null;
}

/** The empty day: nothing set aside, nothing promoted. Also the server snapshot. */
export const EMPTY_DAY: UpNextDay = { day: '', passes: [], chosen: null };

const emptyFor = (today: string): UpNextDay => ({ day: today, passes: [], chosen: null });

function cleanPass(value: unknown): UpNextSetAside | null {
  if (!value || typeof value !== 'object') return null;
  const { key, also } = value as { key?: unknown; also?: unknown };
  if (typeof key !== 'string' || !key) return null;
  const rest = Array.isArray(also) ? also.filter((k): k is string => typeof k === 'string' && k.length > 0) : [];
  return { key, also: rest };
}

/**
 * The stored day, read for `today`. Another date, malformed JSON, or nothing
 * at all is an empty day for today: yesterday's Not now does not reach into
 * this evening, and a corrupt row costs nothing but the set-aside list.
 */
export function parseUpNextDay(raw: string | null, today: string): UpNextDay {
  if (!raw) return emptyFor(today);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return emptyFor(today);
  }
  if (!value || typeof value !== 'object') return emptyFor(today);
  const { day, passes, chosen } = value as { day?: unknown; passes?: unknown; chosen?: unknown };
  if (day !== today) return emptyFor(today);
  const seen = new Set<string>();
  const kept: UpNextSetAside[] = [];
  for (const pass of Array.isArray(passes) ? passes : []) {
    const clean = cleanPass(pass);
    if (!clean || seen.has(clean.key)) continue;
    seen.add(clean.key);
    kept.push(clean);
  }
  return { day: today, passes: kept, chosen: typeof chosen === 'string' && chosen ? chosen : null };
}

/**
 * Set a key aside, with whatever it answers as well. Idempotent: a second
 * Not now on the same key adds only what is new in `also`. A promoted row
 * that is set aside stops being promoted, so the next pick is the natural one.
 */
export function withSetAside(d: UpNextDay, key: string, also: readonly string[]): UpNextDay {
  const at = d.passes.findIndex((p) => p.key === key);
  const merged = at >= 0 ? [...new Set([...d.passes[at].also, ...also])] : [...new Set(also)];
  const entry: UpNextSetAside = { key, also: merged };
  const passes = at >= 0 ? d.passes.map((p, i) => (i === at ? entry : p)) : [...d.passes, entry];
  const chosen = d.chosen !== null && (d.chosen === key || merged.includes(d.chosen)) ? null : d.chosen;
  return { ...d, passes, chosen };
}

/** Undo one Not now. */
export function withoutSetAside(d: UpNextDay, key: string): UpNextDay {
  return { ...d, passes: d.passes.filter((p) => p.key !== key) };
}

/** Put a row up next. A key that was set aside and is chosen again is brought back. */
export function withChosen(d: UpNextDay, key: string | null): UpNextDay {
  return { ...d, chosen: key, passes: key ? d.passes.filter((p) => p.key !== key) : d.passes };
}

/** Bring everything back. The promoted row, if any, stays up. */
export function cleared(d: UpNextDay): UpNextDay {
  return { ...d, passes: [] };
}

/* ── Storage ──────────────────────────────────────────────────────────── */

/** What was last written, while storage is refusing to hold it. */
let memory: string | null = null;
let refused = false;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  if (refused) return memory;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return memory;
  }
}

function writeRaw(raw: string): void {
  memory = raw;
  refused = true;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, raw);
      refused = false;
    } catch {
      // Private mode or a full quota: the module copy carries today.
    }
  }
  for (const fn of listeners) fn();
}

let cache: { raw: string | null; today: string; day: UpNextDay } | null = null;

/**
 * Today's snapshot. The same object comes back until the stored string or
 * the date changes, which is what useSyncExternalStore needs from it.
 */
export function readUpNextDay(today: string): UpNextDay {
  const raw = readRaw();
  if (cache && cache.raw === raw && cache.today === today) return cache.day;
  const day = parseUpNextDay(raw, today);
  cache = { raw, today, day };
  return day;
}

function update(today: string, change: (d: UpNextDay) => UpNextDay): void {
  writeRaw(JSON.stringify(change(readUpNextDay(today))));
}

export function setAside(today: string, key: string, also: readonly string[]): void {
  update(today, (d) => withSetAside(d, key, also));
}

export function takeBack(today: string, key: string): void {
  update(today, (d) => withoutSetAside(d, key));
}

export function bringBackAll(today: string): void {
  update(today, cleared);
}

export function choose(today: string, key: string | null): void {
  update(today, (d) => withChosen(d, key));
}

/**
 * Changes from this tab, and from another tab of the app through the storage
 * event, so Not now on Today reaches the rail's start at once.
 */
export function subscribeUpNextDay(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return;
    // Another tab could write, so storage holds the newer day.
    refused = false;
    fn();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
