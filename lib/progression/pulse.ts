'use client';

import { createClient } from '../supabase';
import { isoDate } from '../utils';

/**
 * The trust pulse.
 *
 * One question, asked occasionally: does this term still feel like an honest
 * record of your work?
 *
 * It is a primary metric rather than a nicety. Every input this app has is
 * unverifiable self report, so the thing that can actually go wrong here is
 * not that people cheat, it is that the product starts manufacturing false
 * records that feel good. Retention would rise while this answer fell. If
 * that ever happens, the progression layer gets rolled back, and it will only
 * be visible if the question was being asked all along.
 *
 * Asked no more than once a fortnight, and never in the first fortnight: a
 * student with four days of history has no term to judge yet.
 */

const ASKED_KEY = 'akada.progression.pulse.v1';
const EVERY_DAYS = 14;
const MIN_TERM_DAYS = 14;

export type PulseAnswer = 'yes' | 'mostly' | 'no';

interface Asked {
  iso: string;
}

function lastAsked(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(ASKED_KEY) || 'null') as Asked | null;
    return stored?.iso ?? null;
  } catch {
    return null;
  }
}

/** Whether to put the question on screen, given how long the term has run. */
export function pulseIsDue(termDays: number, today = isoDate()): boolean {
  if (typeof window === 'undefined') return false;
  if (termDays < MIN_TERM_DAYS) return false;
  const last = lastAsked();
  if (!last) return true;
  const gap = (new Date(today + 'T12:00:00').getTime() - new Date(last + 'T12:00:00').getTime()) / 86_400_000;
  return gap >= EVERY_DAYS;
}

/**
 * Record an answer, or a dismissal.
 *
 * A dismissal is stored as a null answer rather than thrown away. A question
 * everybody closes is a question nobody wants asked, and that is worth
 * knowing too.
 */
export async function answerPulse(answer: PulseAnswer | null, today = isoDate()): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ASKED_KEY, JSON.stringify({ iso: today } satisfies Asked));
  } catch {
    // Without storage the question comes back sooner than it should. It is
    // still only one line, and it is still dismissible.
  }

  try {
    const supabase = createClient();
    await supabase
      .from('trust_pulse')
      .upsert({ asked_on: today, answer }, { onConflict: 'user_id,asked_on' });
  } catch {
    // Not configured, signed out, or the table has not been created yet.
  }
}
