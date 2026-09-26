import type { Quiz, SessionSegment, StudyNote, Task } from './data';

/**
 * Lines the log sheet offers under "What did you do?", read off what the
 * record says happened while the clock ran: a quiz handed in, a note read
 * through or written, a task ticked off. The app already knows most of the
 * answer to that question by the time it asks it, so it says so and lets the
 * reader take the lines with a tap rather than typing them out again.
 *
 * Pure, so the sheet and the tests read it the same way. `startedQuizIds` is
 * the quizzes with a half-filled paper on this device, which is the only
 * trace a quiz leaves before it is handed in.
 */

/** Slack either side of the sitting, for a paper handed in as the clock was stopped. */
const GRACE_MS = 2 * 60 * 1000;
const MAX_SUGGESTIONS = 6;

export interface SittingWindow {
  start: number;
  end: number;
}

/** When the sitting ran, from its own stretches. Null when it has none to read. */
export function sittingWindow(segments: SessionSegment[]): SittingWindow | null {
  let start = Infinity;
  let end = -Infinity;
  for (const segment of segments) {
    const at = Date.parse(segment.startedAt);
    if (!Number.isFinite(at)) continue;
    start = Math.min(start, at);
    end = Math.max(end, at + Math.max(0, segment.seconds) * 1000);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

interface Input {
  window: SittingWindow | null;
  courseId: string;
  task?: Task | null;
  quizzes?: Quiz[];
  notes?: StudyNote[];
  tasks?: Task[];
  startedQuizIds?: ReadonlySet<string>;
}

function within(iso: string | null | undefined, window: SittingWindow): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= window.start - GRACE_MS && at <= window.end + GRACE_MS;
}

function onCourse(courseId: string | null, sitting: string): boolean {
  return courseId === null || courseId === sitting;
}

export function sittingSuggestions({
  window,
  courseId,
  task = null,
  quizzes = [],
  notes = [],
  tasks = [],
  startedQuizIds = new Set(),
}: Input): string[] {
  const lines: string[] = [];
  const add = (line: string) => {
    const clean = line.replace(/\s+/g, ' ').trim();
    if (clean && !lines.includes(clean)) lines.push(clean);
  };

  if (window) {
    for (const quiz of quizzes) {
      if (!onCourse(quiz.courseId, courseId)) continue;
      const attempt = [...quiz.attempts].reverse().find((item) => within(item.at, window));
      if (attempt) {
        add(attempt.total > 0 ? `Did the ${quiz.title} quiz, ${attempt.score}/${attempt.total}` : `Did the ${quiz.title} quiz`);
      } else if (startedQuizIds.has(quiz.id)) {
        add(`Started the ${quiz.title} quiz`);
      }
    }

    for (const note of notes) {
      if (!onCourse(note.courseId, courseId)) continue;
      if (note.reads.some((read) => within(read.at, window))) add(`Read through ${note.title}`);
      else if (note.source === 'app' && within(note.createdAt, window)) add(`Wrote notes on ${note.title}`);
      else if (within(note.updatedAt, window) && note.updatedAt !== note.createdAt) add(`Worked on ${note.title}`);
    }

    for (const item of tasks) {
      if (item.courseId !== courseId || !item.completed) continue;
      if (within(item.completedAt, window)) add(`Finished ${item.title}`);
    }
  } else {
    // No clock to read against, so only a paper still half done is worth saying.
    for (const quiz of quizzes) {
      if (onCourse(quiz.courseId, courseId) && startedQuizIds.has(quiz.id)) add(`Started the ${quiz.title} quiz`);
    }
  }

  if (task && !lines.some((line) => line.endsWith(task.title))) add(`Worked on ${task.title}`);

  return lines.slice(0, MAX_SUGGESTIONS);
}
