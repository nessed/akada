import type { Session, SessionSegment } from './types';
import { sanitizeSegments } from '@/lib/session-safety';

/**
 * The shape of each sitting, read back.
 *
 * Continuous mode has written every block and break to session_segments
 * since it arrived, and the app never read them again: a sitting came back
 * from the database as a duration and nothing else. Everything that reads
 * `session.segments` (the habits layer's block lengths, how long the first
 * block runs before a break, the Stats journal's chain) therefore saw only
 * the sittings logged in the current page load, and after a reload fell back
 * to reading every sitting as one unbroken stretch, which is the coarse
 * reading meant for sittings timed before continuous mode existed.
 *
 * These are the pure halves of reading them back: the window worth asking
 * for, what to do when the read stops short, and the rows sorted onto the
 * sittings they belong to. The read itself is SupabaseAdapter.withSegments.
 */

interface SegmentRow {
  session_id?: unknown;
  kind?: unknown;
  ordinal?: unknown;
  started_at?: unknown;
  seconds?: unknown;
  target_seconds?: unknown;
  note?: unknown;
}

/**
 * The earliest moment a segment of any of these sittings could have started.
 *
 * A session's `date` is the reader's own day, and a segment's `started_at` is
 * a UTC instant, so the window opens two days before the earliest date: wide
 * enough for any timezone and for a sitting that ran past midnight into the
 * day it is logged against, narrow enough that a long account does not read
 * every term it ever had.
 */
export function segmentWindowStart(sessions: Pick<Session, 'date'>[]): string | null {
  if (sessions.length === 0) return null;
  const earliest = sessions.reduce((min, s) => (s.date < min ? s.date : min), sessions[0].date);
  const d = new Date(`${earliest}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString();
}

/**
 * The rows, minus the one sitting a read that stopped short may have caught
 * halfway.
 *
 * Rows are read newest first, so when a read ends before the total, every
 * sitting older than the cut is simply absent, and is read as the one
 * stretch it would have been read as anyway. Exactly one sitting straddles
 * the cut: the owner of the oldest row that did arrive. Half a chain would
 * tell the habits layer a two-hour sitting was one forty-minute block, which
 * is worse than no chain, so that sitting's rows go as well.
 */
export function dropCutChain(rows: unknown[]): unknown[] {
  let oldest: { at: number; id: string } | null = null;
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as SegmentRow;
    if (typeof row.session_id !== 'string' || typeof row.started_at !== 'string') continue;
    const at = Date.parse(row.started_at);
    if (Number.isNaN(at)) continue;
    if (!oldest || at < oldest.at) oldest = { at, id: row.session_id };
  }
  if (!oldest) return rows;
  const cut = oldest.id;
  return rows.filter(
    (raw) => !(raw && typeof raw === 'object' && (raw as SegmentRow).session_id === cut),
  );
}

/**
 * Sittings with their chains attached. A sitting that already carries one,
 * the one just logged in this page load, keeps it; one with no rows keeps
 * none and is read as the stretch it always was. Rows for sittings not in the
 * list are ignored, which is what makes the date window safe to be generous.
 */
export function attachSegments(sessions: Session[], rows: unknown[]): Session[] {
  const bySession = new Map<string, SegmentRow[]>();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as SegmentRow;
    const id = typeof row.session_id === 'string' ? row.session_id : null;
    if (!id) continue;
    const chain = bySession.get(id) ?? [];
    chain.push(row);
    bySession.set(id, chain);
  }
  if (bySession.size === 0) return sessions;

  return sessions.map((session) => {
    if (session.segments && session.segments.length > 0) return session;
    const chain = bySession.get(session.id);
    if (!chain) return session;
    const segments: SessionSegment[] = sanitizeSegments(
      [...chain]
        .sort((a, b) => Number(a.ordinal) - Number(b.ordinal))
        .map((row) => ({
          kind: row.kind,
          ordinal: row.ordinal,
          startedAt: row.started_at,
          seconds: row.seconds,
          targetSeconds: row.target_seconds,
          note: typeof row.note === 'string' ? row.note : '',
        })),
    );
    return segments.length > 0 ? { ...session, segments } : session;
  });
}
