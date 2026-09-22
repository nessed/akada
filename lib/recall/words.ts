import type { RecallSource } from '../data';
import { daysBetween } from '../utils';

/**
 * How recall says when, in the app's lowercase voice: "yesterday", "4 days
 * ago", "on thursday", "on oct 2". Written out rather than dated, because a
 * card that says a reading was finished "Sep 16" makes the reader do the
 * arithmetic the app already did.
 */

export function daysAgoWords(iso: string, today: string): string {
  const n = daysBetween(iso, today);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 7) return `${n} days ago`;
  if (n < 14) return 'a week ago';
  if (n < 60) return `${Math.floor(n / 7)} weeks ago`;
  return 'a while ago';
}

export function whenWords(iso: string, today: string): string {
  const n = daysBetween(today, iso);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  const date = new Date(iso + 'T12:00:00');
  if (n < 7) return `on ${date.toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase()}`;
  return `on ${date
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toLowerCase()}`;
}

/** What the reader did with a thing on the day it entered memory. */
export function originVerb(source: RecallSource): string {
  switch (source) {
    case 'reading':
      return 'read';
    case 'task':
      return 'finished';
    default:
      return 'kept';
  }
}

/** The button that sends the reader back to the material after it slipped. */
export function studyWords(source: RecallSource): string {
  switch (source) {
    case 'reading':
      return 'reread it';
    case 'step':
    case 'task':
      return 'work on it';
    default:
      return 'go over it';
  }
}
