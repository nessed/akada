'use client';

import { useCallback, useEffect, useState } from 'react';
import { isoDate, startOfWeek } from './utils';
import { readPreferences } from './preferences';

/**
 * Closing a week.
 *
 * Review is a ritual, not a dashboard: a week is written up, you read it back,
 * you answer one question, and then you close it. What the app has to remember
 * is which weeks have been closed, and that is the whole of this module.
 *
 * It lives in localStorage rather than in Postgres because closing a week is a
 * gesture about a reader's own attention, not a record about their study, and
 * because a nudge that follows you across devices is a notification — which is
 * exactly the kind of thing readmedesign.md says this app does not do.
 */

const CLOSED_KEY = 'akada.review.closed.v1';
const NOTE_KEY = 'akada.review.notes.v1';

/** The Monday of the week a date falls in. The key a week is filed under. */
export function weekKey(d: Date = new Date()): string {
  return isoDate(startOfWeek(d));
}

/** The Monday of the week before the one `d` falls in. */
export function lastWeekKey(d: Date = new Date()): string {
  const start = startOfWeek(d);
  start.setDate(start.getDate() - 7);
  return isoDate(start);
}

/** Which week of the term a date falls in, counting the start date as week 1. */
export function termWeek(startDate: string | null, d: Date = new Date()): number | null {
  if (!startDate) return null;
  const from = startOfWeek(new Date(startDate + 'T00:00:00')).getTime();
  const to = startOfWeek(d).getTime();
  const weeks = Math.round((to - from) / (7 * 24 * 3600 * 1000)) + 1;
  return weeks >= 1 ? weeks : null;
}

function readSet(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function readNotes(): Record<string, { answer: string; felt: string[] }> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(NOTE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * Whether a week is sitting unread. True only once the week has actually
 * ended (or reached the day the reader chose to read it back on), only if
 * there is something in it worth reading, and only until they close it.
 */
export function isWeekWaiting(hasSessions: boolean, now = new Date()): boolean {
  const prefs = readPreferences();
  if (!prefs.sundayNudge || prefs.reviewDay < 0) return false;
  if (!hasSessions) return false;
  // getDay() is 0 for Sunday, which is also how reviewDay is stored.
  const reached = prefs.reviewDay === 0 ? now.getDay() === 0 : now.getDay() >= prefs.reviewDay;
  if (!reached) return false;
  return !readSet(CLOSED_KEY).includes(lastWeekKey(now));
}

export function useReview(week: string) {
  const [closed, setClosed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [felt, setFelt] = useState<string[]>([]);

  useEffect(() => {
    setClosed(readSet(CLOSED_KEY).includes(week));
    const note = readNotes()[week];
    setAnswer(note?.answer || '');
    setFelt(Array.isArray(note?.felt) ? note.felt : []);
  }, [week]);

  const save = useCallback(
    (next: { answer?: string; felt?: string[] }) => {
      if (next.answer !== undefined) setAnswer(next.answer);
      if (next.felt !== undefined) setFelt(next.felt);
      try {
        const notes = readNotes();
        notes[week] = {
          answer: next.answer ?? answer,
          felt: next.felt ?? felt,
        };
        window.localStorage.setItem(NOTE_KEY, JSON.stringify(notes));
      } catch {
        // A week that cannot be written down is still a week you can read.
      }
    },
    [week, answer, felt],
  );

  const close = useCallback(() => {
    setClosed(true);
    try {
      const all = readSet(CLOSED_KEY);
      if (!all.includes(week)) {
        window.localStorage.setItem(CLOSED_KEY, JSON.stringify([...all, week].slice(-60)));
      }
    } catch {
      // ignore quota / private mode
    }
  }, [week]);

  const reopen = useCallback(() => {
    setClosed(false);
    try {
      window.localStorage.setItem(
        CLOSED_KEY,
        JSON.stringify(readSet(CLOSED_KEY).filter((w) => w !== week)),
      );
    } catch {
      // ignore
    }
  }, [week]);

  return { closed, answer, felt, save, close, reopen };
}
