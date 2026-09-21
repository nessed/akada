'use client';

import { createClient } from '../supabase';
import { LEARN_MAX_SHIFT, LEARN_MIN_IMPRESSIONS } from './constants';
import type { MarkCandidate, MarkKind, NextMarkReading } from './next-mark';

/**
 * What the ranking did, recorded so it can be judged, and now read back so
 * it can learn.
 *
 * Next Mark picks between candidates with a hand written order of
 * preference. That order is a guess. The only way to find out whether it is a
 * good guess is to keep the candidates it passed over next to the one it
 * showed, and whether a session followed. For a long time that was written
 * to a table and never read. It is now also kept on the device, and the
 * ranking reads it: a kind of line this reader acts on moves up, a kind they
 * walk past moves down, by at most half a tier (see LEARN_* in constants).
 *
 * The ledger is seeded from the server the first time it is read. The table
 * has been collecting impressions since the day it was created, and the
 * device's own log starts the day the learning shipped, so without the seed
 * the ranking would begin its education from nothing while a term of
 * evidence sat in the database unread. That is the whole point of having
 * written it before anyone asked for it.
 *
 * Everything here fails silently. A planner that cannot draw Today because
 * its own telemetry table is missing would be a considerably worse product
 * than one that never learns anything.
 */

const SEEN_KEY = 'akada.progression.seen.v1';
const PENDING_KEY = 'akada.progression.pending.v1';
const LEDGER_KEY = 'akada.progression.ledger.v1';
/** How many times the one-off seed from the server may be attempted, ever. */
const SEED_KEY = 'akada.progression.seeded.v1';
const SEED_TRIES = 3;
/** A session started within the hour is taken as following the line. */
const FOLLOW_WINDOW_MS = 60 * 60 * 1000;
/** Impressions kept on the device. Enough for a term, small enough to parse. */
const LEDGER_MAX = 240;

interface Pending {
  rowId: string;
  at: number;
}

/** One line shown, and whether a sitting followed it. */
export interface LedgerEntry {
  id: string;
  kind: MarkKind;
  at: number;
  followed: boolean;
}

/** The kinds a stored row may claim. Anything else is not read back. */
const KINDS: ReadonlySet<string> = new Set<MarkKind>([
  'course-mark',
  'course-page',
  'week-goal',
  'week-counts',
  'untouched-course',
  'day-threshold',
]);

function slim(candidate: MarkCandidate) {
  return {
    id: candidate.id,
    kind: candidate.kind,
    tier: Math.round(candidate.tier * 100) / 100,
    remaining: Math.round(candidate.remaining),
    deadlineDays: candidate.deadlineDays,
  };
}

function readLedger(): LedgerEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(LEDGER_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is LedgerEntry =>
        e && typeof e === 'object' && typeof e.kind === 'string' && typeof e.at === 'number',
    );
  } catch {
    return [];
  }
}

function writeLedger(entries: LedgerEntry[]): void {
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(entries.slice(-LEDGER_MAX)));
  } catch {
    // Without storage nothing is learned. The line still shows.
  }
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

  if (reading.shown) {
    writeLedger([
      ...readLedger(),
      { id: reading.shown.id, kind: reading.shown.kind, at: Date.now(), followed: false },
    ]);
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

  const ledger = readLedger();
  const last = ledger[ledger.length - 1];
  if (last && !last.followed && Date.now() - last.at <= FOLLOW_WINDOW_MS) {
    writeLedger([...ledger.slice(0, -1), { ...last, followed: true }]);
  }

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

/** Shown and followed, by kind of line, from the device's own ledger. */
/**
 * Pull the impressions the server already holds into the device's ledger,
 * once.
 *
 * Returns true when the ledger changed, so the caller can re-read the bias
 * it has already computed. Rows the device logged itself are kept over the
 * server's copy of the same impression: only the device knows whether a
 * sitting followed one it wrote after the last sync.
 *
 * Bounded to a few attempts ever, so an account with no Supabase behind it
 * does not run a doomed query on every load, and a bad afternoon on the
 * network does not lose the seed permanently.
 */
export async function seedLedgerFromServer(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  let tries = 0;
  try {
    const raw = window.localStorage.getItem(SEED_KEY);
    if (raw === 'done') return false;
    tries = Number(raw) || 0;
    if (tries >= SEED_TRIES) return false;
    window.localStorage.setItem(SEED_KEY, String(tries + 1));
  } catch {
    // No storage means no ledger to seed into.
    return false;
  }

  let rows: unknown[] = [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('mark_candidates')
      .select('shown_at, shown_id, candidates, followed_at')
      .not('shown_id', 'is', null)
      .order('shown_at', { ascending: false })
      .limit(LEDGER_MAX);
    if (error) return false;
    rows = data ?? [];
  } catch {
    // Not configured, signed out, or the table has not been created yet.
    // The attempt counter above stops this becoming a query on every load.
    return false;
  }

  const fromServer = ledgerEntriesFromRows(rows);

  try {
    window.localStorage.setItem(SEED_KEY, 'done');
  } catch {
    // As above.
  }
  if (fromServer.length === 0) return false;

  const mine = readLedger();
  const merged = mergeLedgers(mine, fromServer);
  if (merged.length === mine.length) return false;
  writeLedger(merged);
  return true;
}

/**
 * Stored impression rows, read back as ledger entries.
 *
 * A row keeps every candidate it ranked, so the kind wanted is the one that
 * was actually shown. Anything the row cannot answer for — a shown id that
 * is not among its own candidates, a kind this version does not know, an
 * unreadable timestamp — is dropped rather than guessed at.
 */
export function ledgerEntriesFromRows(rows: unknown[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const raw of rows) {
    const row = raw as {
      shown_at?: string;
      shown_id?: string;
      candidates?: unknown;
      followed_at?: string | null;
    };
    if (!row.shown_id || !Array.isArray(row.candidates)) continue;
    const shown = (row.candidates as { id?: string; kind?: string }[]).find(
      (c) => c && c.id === row.shown_id,
    );
    if (!shown?.kind || !KINDS.has(shown.kind)) continue;
    const at = Date.parse(String(row.shown_at ?? ''));
    if (Number.isNaN(at)) continue;
    out.push({
      id: row.shown_id,
      kind: shown.kind as MarkKind,
      at,
      followed: Boolean(row.followed_at),
    });
  }
  return out;
}

/**
 * The device's ledger and the server's, as one.
 *
 * Keyed on the impression itself, so the same one arriving from both sides
 * is one fact rather than two. The device's copy wins: it may carry a follow
 * the server has not been told about, and a follow is the only part of this
 * that is worth anything.
 */
export function mergeLedgers(mine: LedgerEntry[], fromServer: LedgerEntry[]): LedgerEntry[] {
  const merged = new Map<string, LedgerEntry>();
  for (const entry of fromServer) merged.set(`${entry.id}:${entry.at}`, entry);
  for (const entry of mine) merged.set(`${entry.id}:${entry.at}`, entry);
  return [...merged.values()].sort((a, b) => a.at - b.at).slice(-LEDGER_MAX);
}

export function readFollowRates(): Map<MarkKind, { shown: number; followed: number }> {
  const out = new Map<MarkKind, { shown: number; followed: number }>();
  for (const entry of readLedger()) {
    const row = out.get(entry.kind) ?? { shown: 0, followed: 0 };
    row.shown += 1;
    if (entry.followed) row.followed += 1;
    out.set(entry.kind, row);
  }
  return out;
}

/**
 * How far each kind of line moves in the ranking, from what this reader has
 * done with it. Negative moves a kind up. Only kinds shown enough times take
 * part, and only once at least two kinds have, because a rate needs
 * something to be a rate against.
 */
export function rankingBias(
  rates: Map<MarkKind, { shown: number; followed: number }>,
): Partial<Record<MarkKind, number>> {
  const eligible = [...rates.entries()].filter(([, r]) => r.shown >= LEARN_MIN_IMPRESSIONS);
  if (eligible.length < 2) return {};
  // Smoothed so a kind followed six times in six is very good rather than
  // perfect, and one followed never is poor rather than hopeless.
  const rate = (r: { shown: number; followed: number }) => (r.followed + 1) / (r.shown + 2);
  const mean = eligible.reduce((acc, [, r]) => acc + rate(r), 0) / eligible.length;
  const out: Partial<Record<MarkKind, number>> = {};
  for (const [kind, r] of eligible) {
    const shift = -(rate(r) - mean) * 2;
    out[kind] = Math.max(-LEARN_MAX_SHIFT, Math.min(LEARN_MAX_SHIFT, shift));
  }
  return out;
}

export function readRankingBias(): Partial<Record<MarkKind, number>> {
  return rankingBias(readFollowRates());
}
