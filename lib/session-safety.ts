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
 * The most a practice paper can be out of. A problem set worth 170 points and
 * an SAT out of 1600 are real totals; five digits of one is a slip.
 */
export const MAX_SCORE_OUT_OF = 10000;

/**
 * A number as someone writes a mark down: "6", "4.5", ".5", "4,5" for four
 * and a half, "1,350" for thirteen hundred and fifty. Nothing else, so "1e2",
 * "0x10" and "six" are not numbers here, and a comma followed by exactly three
 * digits is read as a thousands mark rather than a decimal point.
 */
function scoreNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  let plain: string;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) plain = text.replace(/,/g, '');
  else if (/^\d+,\d+$/.test(text)) plain = text.replace(',', '.');
  else if (/^(\d+\.?\d*|\.\d+)$/.test(text)) plain = text;
  else return null;
  const n = Number(plain);
  return Number.isFinite(n) ? n : null;
}

/**
 * A practice score as it may be kept: what was scored and what it was out of,
 * both or neither. A score over its total, a total of nothing or of more than
 * MAX_SCORE_OUT_OF, or anything that is not a number, is no score at all
 * rather than a clamped guess at one, since the whole worth of the figure is
 * that it is what the paper actually said. Two decimal places is a quarter
 * mark and then some, and the pair is checked after it is rounded to them, so
 * what passes here is exactly what gets stored. Mirrored by
 * sessions_score_range in supabase/schema.sql.
 */
export function cleanScore(score: unknown, outOf: unknown): { score: number; outOf: number } | null {
  const got = scoreNumber(score);
  const total = scoreNumber(outOf);
  if (got === null || total === null) return null;
  const rounded = { score: Math.round(got * 100) / 100 + 0, outOf: Math.round(total * 100) / 100 };
  if (rounded.outOf <= 0 || rounded.outOf > MAX_SCORE_OUT_OF) return null;
  if (rounded.score < 0 || rounded.score > rounded.outOf) return null;
  return rounded;
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
