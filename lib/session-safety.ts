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
 * The most a practice paper can be out of. A problem set worth 170 points is
 * a real total; four digits of one is a slip of the thumb.
 */
export const MAX_SCORE_OUT_OF = 1000;

function scoreNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  // "4,5" is how half the world writes four and a half.
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * A practice score as it may be kept: what was scored and what it was out of,
 * both or neither. A score over its total, a total of nothing or of more than
 * MAX_SCORE_OUT_OF, or anything that is not a number, is no score at all
 * rather than a clamped guess at one, since the whole worth of the figure is
 * that it is what the paper actually said. Two decimal places is a quarter
 * mark and then some. Mirrored by sessions_score_range in supabase/schema.sql.
 */
export function cleanScore(score: unknown, outOf: unknown): { score: number; outOf: number } | null {
  const got = scoreNumber(score);
  const total = scoreNumber(outOf);
  if (got === null || total === null) return null;
  if (total <= 0 || total > MAX_SCORE_OUT_OF || got < 0 || got > total) return null;
  return { score: Math.round(got * 100) / 100, outOf: Math.round(total * 100) / 100 };
}

/** "6/8", "4.5/8": a score as it is written in the margin, in mono. */
export function scoreFace(score: number, outOf: number): string {
  return `${score}/${outOf}`;
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

/**
 * A block note is a phrase, not the session's own note. It is written on a
 * break with one hand, and if it is running past a couple of hundred
 * characters the reader wants the note field at the end of the sitting.
 */
export const BLOCK_NOTE_MAX = 200;

function cleanBlockNote(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Collapsed to one line: this is written into a single-line field and read
  // back in a row, and a pasted paragraph of newlines would break both.
  return value.replace(/\s+/g, ' ').trim().slice(0, BLOCK_NOTE_MAX);
}

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
      // Only a block is ever asked what it covered, so a note that somehow
      // arrives on a break is dropped rather than stored and never shown.
      note: kind === 'focus' ? cleanBlockNote(item.note) : '',
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
