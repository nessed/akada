import type { RecallSource, RecallVerdict } from '../data';
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

/**
 * The three answers, as the buttons say them. `clear`, `hazy` and `gone`
 * stay the data and the summary words ("2 clear · 1 hazy" on a course's
 * standing line); what a reader taps reads as an answer to the question the
 * card just asked.
 */
export const VERDICT_WORDS: Record<RecallVerdict, string> = {
  clear: 'Got it',
  hazy: 'Roughly',
  gone: 'Blank',
};

/** What each answer means, for a screen reader and a pointer's title. */
export const VERDICT_MEANING: Record<RecallVerdict, string> = {
  clear: 'Got it: had it, without looking',
  hazy: 'Roughly: part of it, or with a nudge',
  gone: 'Blank: could not',
};

/**
 * The card's question, which is also the whole explanation of recall: when
 * the thing was finished, and what to give back without looking. "You
 * finished Mankiw Ch 2 two days ago. Without opening it, what was the
 * argument?" The thing itself is returned apart so it can be set in ink.
 */
export function recallQuestion(
  state: { source: RecallSource; prompt: string; origin: string },
  today: string,
): { lead: string; thing: string; tail: string } {
  // Spelled out in a sentence, the way anybody would say it aloud.
  const when = daysAgoWords(state.origin, today).replace(
    /^(\d) days ago$/,
    (_, n: string) => `${['', '', 'two', 'three', 'four', 'five', 'six'][Number(n)]} days ago`,
  );
  switch (state.source) {
    case 'reading':
      return {
        lead: 'You finished ',
        thing: state.prompt,
        tail: ` ${when}. Without opening it, what was the argument?`,
      };
    case 'task':
    case 'step':
      return {
        lead: 'You finished ',
        thing: state.prompt,
        tail: ` ${when}. With nothing in front of you, could you do one fresh?`,
      };
    default:
      return {
        lead: `You kept this ${when}: `,
        thing: state.prompt,
        tail: '. Can you say it back without your notes?',
      };
  }
}
