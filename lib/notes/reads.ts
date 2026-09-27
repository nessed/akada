import type { NoteRead, StudyNote } from '@/lib/data/types';

/** Reads kept per note. Enough for a median, not so many the row grows. */
export const MAX_READS = 30;
/** A read-through shorter than this was a scroll, not a read. */
export const MIN_READ_SECONDS = 60;
/**
 * Faster than this is skimming, or a jump to the end. Careful readers of
 * study material sit well under it, so a read past it is not kept.
 */
export const MAX_WORDS_PER_MINUTE = 600;
/**
 * Slower than this, the clock was running on something other than reading:
 * the note left open on a desk while the kettle boiled.
 */
export const MIN_WORDS_PER_MINUTE = 40;
/** What a reader is assumed to manage before they have timed anything. */
export const DEFAULT_WORDS_PER_MINUTE = 200;
/** Timed reads before the reader's own pace replaces the default. */
export const PACE_MIN_READS = 2;

const MAX_SECONDS = 6 * 3600;

export function wordsPerMinute(read: NoteRead) {
  return read.words / (read.seconds / 60);
}

/** Whether a read is one worth keeping. */
export function isKeepableRead(read: NoteRead) {
  return (
    read.seconds >= MIN_READ_SECONDS &&
    read.seconds <= MAX_SECONDS &&
    read.words > 0 &&
    wordsPerMinute(read) <= MAX_WORDS_PER_MINUTE &&
    wordsPerMinute(read) >= MIN_WORDS_PER_MINUTE
  );
}

/* ── A read-through in progress ─────────────────────────────────────── */

/** How far down a run has to be seen passing, on its way to the end. */
export const CHECKPOINTS = [0.25, 0.5, 0.75] as const;
/** The least time a reader can have spent between one checkpoint and the next. */
export const CHECKPOINT_GAP_SECONDS = 10;
/** At or above the top of the note. */
export const AT_TOP = 0.03;
/** Read to the end. */
export const AT_END = 0.98;

/**
 * A read-through being timed. `seenSeconds` counts only the seconds the note
 * was actually in front of the reader (page visible, on the note, the sitting
 * in focus rather than on a break); `marks` is the seenSeconds at which each
 * checkpoint was first passed.
 */
export interface ReadRun {
  sessionId: string;
  seenSeconds: number;
  marks: (number | null)[];
}

export function startRun(sessionId: string): ReadRun {
  return { sessionId, seenSeconds: 0, marks: CHECKPOINTS.map(() => null) };
}

/**
 * The run after `seconds` more of reading at `progress` down the note.
 * Seconds that did not count (hidden page, a break, off the note) are simply
 * not passed in; the checkpoints are marked either way, since scrolling past
 * one while not counting still passes it.
 */
export function advanceRun(run: ReadRun, progress: number, seconds: number): ReadRun {
  const seenSeconds = run.seenSeconds + Math.max(0, seconds);
  const marks = run.marks.map((mark, i) => (mark == null && progress >= CHECKPOINTS[i] ? seenSeconds : mark));
  return { ...run, seenSeconds, marks };
}

/**
 * Whether a run that reached the end passed through the note on the way: each
 * checkpoint seen, in order, with time spent between them. A jump from the top
 * to the end, or a flick through in seconds, never was a read.
 */
export function passedThrough(run: ReadRun): boolean {
  const points = [0, ...run.marks, run.seenSeconds];
  if (run.marks.some((mark) => mark == null)) return false;
  for (let i = 1; i < points.length; i++) {
    if ((points[i] as number) - (points[i - 1] as number) < CHECKPOINT_GAP_SECONDS) return false;
  }
  return true;
}

/** The read a finished run is worth keeping as, or null. */
export function finishRun(run: ReadRun, words: number, at: string): NoteRead | null {
  if (!passedThrough(run)) return null;
  const read: NoteRead = { seconds: Math.round(run.seenSeconds), words, at };
  return isKeepableRead(read) ? read : null;
}

/** Whatever the database or the connector hands back, as reads the app trusts. */
export function cleanReads(value: unknown): NoteRead[] {
  if (!Array.isArray(value)) return [];
  const reads: NoteRead[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const seconds = Math.round(Number(raw.seconds));
    const words = Math.round(Number(raw.words));
    const at = typeof raw.at === 'string' && !Number.isNaN(Date.parse(raw.at)) ? raw.at : '';
    if (!Number.isFinite(seconds) || !Number.isFinite(words) || !at) continue;
    const read = { seconds, words, at };
    if (isKeepableRead(read)) reads.push(read);
  }
  return reads.sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_READS);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface ReadingPace {
  /** Words a minute this reader reads at, or the default. */
  wpm: number;
  /** Whether wpm is theirs rather than the default. */
  personal: boolean;
  /** Read-throughs behind it. */
  timed: number;
  /** Notes with at least one timed read. */
  notesTimed: number;
  /** Median minutes a timed read-through took, 0 with none. */
  medianMinutes: number;
  /** Per course, only where the course has enough reads of its own. */
  byCourse: Map<string, { wpm: number; timed: number }>;
}

/**
 * How fast this reader actually gets through a note, from every read-through
 * they timed from the top. A median, so one distracted evening does not move
 * it, and withheld until there are PACE_MIN_READS of them.
 */
export function readingPace(notes: Pick<StudyNote, 'courseId' | 'reads'>[]): ReadingPace {
  const all: NoteRead[] = [];
  const byCourseReads = new Map<string, NoteRead[]>();
  let notesTimed = 0;
  for (const note of notes) {
    if (!note.reads.length) continue;
    notesTimed += 1;
    all.push(...note.reads);
    if (note.courseId) byCourseReads.set(note.courseId, [...(byCourseReads.get(note.courseId) ?? []), ...note.reads]);
  }
  const personal = all.length >= PACE_MIN_READS;
  const byCourse = new Map<string, { wpm: number; timed: number }>();
  for (const [courseId, reads] of byCourseReads) {
    if (reads.length >= PACE_MIN_READS) byCourse.set(courseId, { wpm: median(reads.map(wordsPerMinute)), timed: reads.length });
  }
  return {
    wpm: personal ? median(all.map(wordsPerMinute)) : DEFAULT_WORDS_PER_MINUTE,
    personal,
    timed: all.length,
    notesTimed,
    medianMinutes: all.length ? median(all.map((r) => r.seconds / 60)) : 0,
    byCourse,
  };
}

/**
 * Minutes a whole read of this note should take this reader. A note they
 * have timed goes by the median of its own reads, each scaled to what the
 * note says now, since the same pages are the best guess at the same pages
 * and one distracted evening should not move it; otherwise by their pace on
 * its course, then their pace overall, then the default.
 */
export function minutesForNote(
  note: Pick<StudyNote, 'courseId' | 'reads'>,
  words: number,
  pace: ReadingPace,
): number {
  if (note.reads.length) {
    const scaled = note.reads.map((read) => (read.seconds / 60) * (words / Math.max(1, read.words)));
    return Math.max(1, Math.round(median(scaled)));
  }
  const wpm = (note.courseId && pace.byCourse.get(note.courseId)?.wpm) || pace.wpm;
  return Math.max(1, Math.round(words / wpm));
}
