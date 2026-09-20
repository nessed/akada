'use client';

import { createClient } from '../supabase';
import type { MarkCandidate, NextMarkReading } from './next-mark';

/**
 * What the ranking did, recorded so it can be judged later.
 *
 * Next Mark picks between candidates with a hand written order of
 * preference. That order is a guess. The only way to find out whether it is a
 * good guess is to keep the candidates it passed over next to the one it
 * showed, and whether a session followed. This costs nothing today and it
 * cannot be collected retroactively, which is the entire argument for writing
 * it before anyone asks for it.
 *
 * Everything here fails silently. A planner that cannot draw Today because
 * its own telemetry table is missing would be a considerably worse product
 * than one that never learns anything.
 */

const SEEN_KEY = 'akada.progression.seen.v1';
const PENDING_KEY = 'akada.progression.pending.v1';
/** A session started within the hour is taken as following the line. */
const FOLLOW_WINDOW_MS = 60 * 60 * 1000;

interface Pending {
  rowId: string;
  at: number;
}

function slim(candidate: MarkCandidate) {
  return {
    id: candidate.id,
    kind: candidate.kind,
    tier: candidate.tier,
    remaining: Math.round(candidate.remaining),
    deadlineDays: candidate.deadlineDays,
  };
}

/**
 * Record one impression of the line, at most once per surface per shown
 * candidate per day. The same line seen three times in an afternoon is one
 * fact, not three, and writing it three times would quietly weight the log
 * toward whoever leaves a tab open.
 */
export async function logImpression(surface: string, reading: NextMarkReading): Promise<void> {
  if (typeof window === 'undefined') return;
  const stamp = `${surface}:${reading.shown?.id ?? reading.silence ?? 'none'}:${new Date().toDateString()}`;

  try {
    const seen = JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]') as string[];
    if (seen.includes(stamp)) return;
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.slice(-40), stamp]));
  } catch {
    // No storage means no de-duplication. One row too many beats no rows.
  }

  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('mark_candidates')
      .insert({
        surface,
        shown_id: reading.shown?.id ?? null,
        candidates: reading.candidates.map(slim),
      })
      .select('id')
      .single();

    if (data?.id) {
      const pending: Pending = { rowId: data.id as string, at: Date.now() };
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    }
  } catch {
    // Not configured, signed out, or the table has not been created yet.
  }
}

/**
 * Called when a session starts. Marks the most recent impression as followed,
 * if one was shown inside the window.
 */
export async function logSessionFollowed(): Promise<void> {
  if (typeof window === 'undefined') return;
  let pending: Pending | null = null;
  try {
    pending = JSON.parse(window.localStorage.getItem(PENDING_KEY) || 'null');
  } catch {
    return;
  }
  if (!pending || Date.now() - pending.at > FOLLOW_WINDOW_MS) return;
  window.localStorage.removeItem(PENDING_KEY);

  try {
    const supabase = createClient();
    await supabase
      .from('mark_candidates')
      .update({ followed_at: new Date().toISOString() })
      .eq('id', pending.rowId);
  } catch {
    // As above. The log is allowed to be incomplete; the app is not allowed
    // to break over it.
  }
}
