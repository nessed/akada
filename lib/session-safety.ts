import type { Session, SessionSegment } from './data';

export const MAX_SESSION_SECONDS = 18 * 60 * 60;

export function clampSessionSeconds(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor(seconds)));
}

export function sanitizeSession<T extends Pick<Session, 'durationSeconds'>>(session: T): T {
  return {
    ...session,
    durationSeconds: clampSessionSeconds(session.durationSeconds),
  };
}

export function isLoggableDuration(value: unknown): boolean {
  return clampSessionSeconds(value) > 0;
}

/**
 * The ceiling on one break inside a continuous sitting.
 *
 * A session can run to 18 hours because a reader genuinely can sit for a long
 * day. A *break* cannot: a timer left on "break" while its owner goes to bed
 * should close the sitting out at the last believable moment rather than
 * record eight hours of rest as though it were considered. Mirrored by the
 * session_segments_seconds_range check in supabase/schema.sql.
 */
export const MAX_BREAK_SECONDS = 45 * 60;

/** The break lengths the timer offers, in minutes. */
export const BREAK_LENGTHS = [5, 10, 15] as const;

export function clampBreakSeconds(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(MAX_BREAK_SECONDS, Math.max(0, Math.floor(seconds)));
}

/**
 * A chain of segments, trusted no further than the totals derived from it.
 *
 * The chain arrives from localStorage, which anyone can edit and a half-written
 * write can truncate, and goes straight into a table with check constraints on
 * it. Anything malformed is dropped rather than rejected whole: losing the
 * shape of a sitting is a worse outcome than losing its hours, and refusing the
 * write loses both.
 */
export function sanitizeSegments(value: unknown): SessionSegment[] {
  if (!Array.isArray(value)) return [];
  const out: SessionSegment[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<SessionSegment>;
    const kind = item.kind === 'break' ? 'break' : item.kind === 'focus' ? 'focus' : null;
    if (!kind) continue;
    const seconds =
      kind === 'break' ? clampBreakSeconds(item.seconds) : clampSessionSeconds(item.seconds);
    if (seconds <= 0) continue;
    const startedAt = new Date(String(item.startedAt ?? ''));
    const target = Number(item.targetSeconds);
    out.push({
      kind,
      // The stored ordinal is a hint; the position in the surviving chain is
      // the fact, so a dropped stretch cannot leave a gap in the numbering.
      ordinal: out.length + 1,
      startedAt: Number.isNaN(startedAt.getTime())
        ? new Date().toISOString()
        : startedAt.toISOString(),
      seconds,
      targetSeconds:
        Number.isFinite(target) && target > 0
          ? kind === 'break'
            ? clampBreakSeconds(target)
            : clampSessionSeconds(target)
          : null,
    });
  }
  return out;
}

/** Rest across a whole chain, which is what `sessions.break_seconds` holds. */
export function totalBreakSeconds(segments: SessionSegment[]): number {
  return clampSessionSeconds(
    segments.reduce((sum, s) => (s.kind === 'break' ? sum + s.seconds : sum), 0),
  );
}
