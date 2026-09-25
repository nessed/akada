export interface Course {
  id: string;
  code: string;
  name: string;
  color: string;
  tint?: string;
  weeklyGoalHours: number;
  createdAt: string;
  /**
   * Filled in from the course catalog when one is picked in the add-course
   * search, blank for a manually typed course. All optional, a course is
   * complete without any of them, and the card only shows what exists.
   */
  credits?: number | null;
  section?: string | null;
  instructor?: string | null;
  /** Already formatted for display, e.g. "Mon/Wed 10:00". */
  meetingTime?: string | null;
  /**
   * How the course is marked. Empty for a course nobody has told the app
   * about, in which case the grade panels simply do not draw.
   */
  assessments?: Assessment[];
  /**
   * How it is marked beyond the list of pieces: the basis, any drop rules,
   * and a scheme proposed through the connector that is waiting to be
   * accepted. Absent for a course nobody has told the app about.
   */
  grading?: CourseGrading;
  /**
   * Where this course sits in the order the student dragged their courses
   * into, smallest first. It is set from the dashboard's stack of cards and
   * from the list in Settings, and read by every screen that lists courses. Optional: a row written before the column existed,
   * or a project that has not re-run supabase/schema.sql, has none and falls
   * back to the implicit oldest-first order. See lib/data/course-order.ts.
   */
  position?: number;
}

/**
 * One stretch of a continuous sitting: a focus block, or the break after it.
 *
 * `ordinal` numbers the stretches of one sitting in the order they happened,
 * focus and break sharing the run, so 1-2-3 is block, break, block.
 * `targetSeconds` is what the stretch was armed for and `seconds` is what it
 * actually ran; a break set to five minutes that took nineteen is the pair
 * worth having, and a total on its own cannot tell you about it.
 */
export interface SessionSegment {
  kind: 'focus' | 'break';
  ordinal: number;
  /** When the stretch began, ISO 8601. */
  startedAt: string;
  seconds: number;
  /** Null for an open block, or a break the reader ended by hand. */
  targetSeconds: number | null;
  /**
   * What this block covered, written while the break after it runs.
   *
   * A sitting's own note is written at the end, by which point the first
   * block is two hours and two breaks ago and gets remembered as "algorithms,
   * I think". This is the same question asked where the answer is still
   * there. Breaks do not carry one.
   */
  note?: string;
}

export interface Session {
  id: string;
  courseId: string;
  taskId: string | null;
  date: string;
  /**
   * Focus time only. Rest never lands here: the weekly goal, the streak and
   * every hour count in the app read this field, so counting breaks in it
   * would inflate all of them at once.
   */
  durationSeconds: number;
  note: string;
  createdAt: string;
  /**
   * Rest taken during the sitting. Optional for the same reason
   * `Course.position` is: a row written before continuous mode existed, or a
   * project still on an older schema, has none and reads as zero.
   */
  breakSeconds?: number;
  /**
   * The shape of the sitting, oldest first: written when a continuous session
   * is logged, and read back onto the sitting with it (lib/data/segment-rows).
   * Absent for a sitting timed before continuous mode, logged by hand, or
   * reported through the connector, which the habits layer reads as the one
   * stretch the record says it was. Over MCP, get_focus_pattern reads the same
   * rows.
   */
  segments?: SessionSegment[];
  /**
   * What a practice paper done in this sitting scored, and out of what. Both
   * or neither, and most sittings have neither. The one figure in the record
   * that is an outcome rather than time put in, so it is only ever what the
   * reader wrote down, never inferred. See cleanScore.
   */
  score?: number;
  scoreOutOf?: number;
}

export type TaskPriority = 'high' | 'normal';

/**
 * What a row on the list actually is.
 *
 * The redesign stopped treating every line as the same kind of thing. A
 * reading has a page count and belongs in the backlog lane; an exam is
 * circled on the month and counted down to; a plain task is neither. The
 * default is `task`, so nothing written before this existed changes meaning.
 */
export type TaskKind = 'task' | 'reading' | 'exam';

/**
 * One marked piece of a course: a quiz, the midterm, the final.
 *
 * `weight` is what it is worth as a percentage of the course. `score` and
 * `outOf` are filled in once it comes back — until then the row shows a dash
 * and counts toward the part of the grade still unmarked, which is the number
 * the Term screen leads with.
 */
export interface Assessment {
  id: string;
  label: string;
  weight: number;
  score: number | null;
  outOf: number | null;
  /**
   * Which drop group this piece belongs to, if any. Seven quizzes where only
   * the best six count all carry the same `group`, and the matching rule in
   * `CourseGrading.dropRules` says how many of them are kept. A piece with no
   * group always counts, which is every piece written before this existed.
   */
  group?: string;
}

/**
 * Whether the course is marked against a fixed scale or against the class.
 *
 * Akada never guesses a letter either way; the distinction is recorded
 * because a projected percentage means something different under a curve,
 * and an outline almost always says which one it is.
 */
export type GradingBasis = 'absolute' | 'relative';

/**
 * "Best 6 of 7." `keep` pieces out of the group count, and the rest are
 * dropped once enough of them have come back to say which are the rest.
 */
export interface DropRule {
  group: string;
  keep: number;
}

/**
 * A scheme somebody proposed but nobody has accepted yet.
 *
 * This is the whole reason grading is its own field rather than more columns:
 * a proposal has to be able to sit beside the accepted scheme without being
 * read by anything that projects a grade. `gradeStanding` never looks here,
 * so a pending scheme cannot move a number on any screen. Accepting copies it
 * over the live fields and clears this; discarding only clears it.
 */
export interface PendingScheme {
  assessments: Assessment[];
  basis: GradingBasis;
  dropRules: DropRule[];
  /** Where it came from, shown on the card so an accept is an informed one. */
  source: string;
  /** Anything the parse was unsure about, shown under the rows. */
  note: string;
  createdAt: string;
}

/**
 * Everything about how a course is marked that is not the list of pieces.
 *
 * `courses.assessments` stays exactly what it was — the accepted pieces — so
 * every existing read keeps working untouched. This rides alongside it in one
 * jsonb column for the same reason assessments is one column: it is only ever
 * read and written whole, with the course.
 */
export interface CourseGrading {
  basis?: GradingBasis;
  dropRules?: DropRule[];
  pending?: PendingScheme | null;
}

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  courseId: string;
  title: string;
  /** Optional longer context shown in the task reading view. */
  description?: string;
  subtasks?: TaskSubtask[];
  dueDate: string | null;
  priority: TaskPriority;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  /** Plain task unless said otherwise, and `'task'` when absent. See TaskKind. */
  kind?: TaskKind;
  /**
   * What this piece is worth, as a percentage of the course: 0 to 100, or
   * null when nobody has said. Bounds in lib/planner-safety.ts, matching the
   * check constraint on `tasks.weight`.
   */
  weight?: number | null;
  /**
   * Pages, for a reading: a whole number from 1 to 10000, or null. What turns
   * the backlog into hours. Bounds match the check on `tasks.pages`.
   */
  pages?: number | null;
  /**
   * Where this task sits in its course's list, smallest first, once the
   * student has dragged it there or the MCP has placed it. Optional the way
   * Course.position is: an unplaced task follows the placed ones in the
   * "what matters" order. See lib/data/task-order.ts.
   */
  position?: number;
}

/**
 * How a recall went, in the reader's own honest word.
 *
 * `clear` is had it, without looking. `hazy` is part of it, or only with a
 * nudge. `gone` is could not. Three rather than a scale because the question
 * is asked with a book shut, and a reader can tell those three apart without
 * deliberating; a five point scale asks them to grade their own grading.
 */
export type RecallVerdict = 'clear' | 'hazy' | 'gone';

/**
 * Where a thing kept for recall came from.
 *
 * `reading` is a finished reading, which is kept without being asked: the
 * app reads the course's finished readings into recall on its own, which is
 * what lets a term that started before recall existed arrive with its
 * material already in it. `task` is any other finished task kept by hand,
 * `step` one ticked step of a task, `note` a line written on the log sheet at
 * the end of a sitting, `own` a line written on the course page or handed in
 * through the connector.
 */
export type RecallSource = 'reading' | 'task' | 'step' | 'note' | 'own';

/** One recall, on the reader's own day. */
export interface RecallAnswer {
  on: string;
  verdict: RecallVerdict;
}

/**
 * A thing being kept, as stored.
 *
 * `key` is what identifies it across devices and across the connector:
 * `task:<taskId>` for a whole task, reading or otherwise, `step:<taskId>:
 * <subtaskId>` for one step, and `note:` or `own:` with a random tail for a
 * line somebody wrote. A finished reading has no row at all until it is
 * first answered or let go; until then it is read straight off the task.
 *
 * There is no stored due date. When a thing next comes up is worked out from
 * its answers on every read, like everything in lib/progression, so there is
 * no schedule to drift out of step with the history that produced it.
 */
export interface RecallRecord {
  id: string;
  key: string;
  courseId: string;
  prompt: string;
  source: RecallSource;
  /** The task, or `taskId:subtaskId` for a step. Null for a written line. */
  ref: string | null;
  history: RecallAnswer[];
  /** Taken out of recall on purpose. Kept rather than deleted, so a finished reading stays out. */
  letGo: boolean;
  createdAt: string;
}

export type RecallRecordInput = Omit<RecallRecord, 'id' | 'createdAt'>;

/**
 * What a read of the recall table found.
 *
 * `available` is false against a database that has not run the latest
 * supabase/schema.sql, where the table is simply not there. Recall still
 * reads finished readings off the tasks in that case; it just has nowhere to
 * write an answer, and says so when asked to.
 */
export interface RecallRecords {
  records: RecallRecord[];
  available: boolean;
}

/** Where a note came from: written here, opened from a file, or sent by an assistant. */
export type NoteSource = 'app' | 'import' | 'mcp';

/** How a "Check yourself" went, keyed by the check's position in the note. */
export type NoteCheckResult = 'got' | 'miss';

/**
 * One read-through of a note, timed on its task's clock from the top to the
 * end. Only a read started from the top counts, since half a note says
 * nothing about how long the whole one takes.
 */
export interface NoteRead {
  seconds: number;
  words: number;
  at: string;
}

/**
 * A study note, the markdown Markd used to keep in the browser. Not scoped to
 * a semester: a note on a course outlives the term it was written in, and
 * `courseId` goes null rather than taking the note with it when the course is
 * deleted.
 */
export interface StudyNote {
  id: string;
  courseId: string | null;
  title: string;
  markdown: string;
  checks: Record<string, NoteCheckResult>;
  source: NoteSource;
  /** The task the note is studied under, when it has one. */
  taskId: string | null;
  /** Timed read-throughs, oldest first. See NoteRead. */
  reads: NoteRead[];
  createdAt: string;
  updatedAt: string;
}

export interface StudyNoteInput {
  /** Present to write over a note that exists, or to put one back after undo. */
  id?: string;
  courseId?: string | null;
  title: string;
  markdown: string;
  source?: NoteSource;
  /** Left out, a note keeps the results it has. */
  checks?: Record<string, NoteCheckResult>;
  /** Left out, a note keeps the task it has; null unlinks it. */
  taskId?: string | null;
  /** Left out, a note keeps its reads. Only undo writes them whole. */
  reads?: NoteRead[];
  createdAt?: string;
}

/** `available` is false against a database without the notes table yet. */
export interface StudyNotes {
  notes: StudyNote[];
  available: boolean;
}

/**
 * One question. A multiple-choice one has `options` and `answer`, the index
 * of the right option, and is marked on the spot. A written one (`kind:
 * 'open'`) has no options and `answer` -1; the student writes an answer and
 * the assistant marks it later against `modelAnswer`, out of `marks`.
 */
export interface QuizQuestion {
  kind?: 'mcq' | 'open';
  prompt: string;
  options: string[];
  answer: number;
  explain?: string;
  modelAnswer?: string;
  marks?: number;
}

/** The assistant's mark on one written answer. */
export interface QuizWrittenMark {
  score: number;
  outOf: number;
  feedback: string;
}

/**
 * One sitting of a quiz. `picks` is what was chosen for each question (-1
 * blank, and always -1 on a written one); `score` and `total` are the
 * multiple-choice mark alone, which is known the moment it is handed in.
 * `written` holds what was written, by question index, and `marks` the
 * assistant's marks on those answers, by the same index, once it has marked
 * them.
 */
export interface QuizAttempt {
  at: string;
  picks: number[];
  score: number;
  total: number;
  written?: Record<string, string>;
  marks?: Record<string, QuizWrittenMark>;
  markedAt?: string;
}

/**
 * A multiple-choice quiz an assistant sent over MCP, filed under a course and
 * optionally the task (a chapter, a reading) or the note it tests. Attempts
 * are kept oldest first, so the latest mark is the last one.
 */
export interface Quiz {
  id: string;
  courseId: string | null;
  taskId: string | null;
  noteId: string | null;
  title: string;
  context: string;
  questions: QuizQuestion[];
  attempts: QuizAttempt[];
  createdAt: string;
  updatedAt: string;
}

/** `available` is false against a database without the quizzes table yet. */
export interface Quizzes {
  quizzes: Quiz[];
  available: boolean;
}

export interface Semester {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  /** Whether this is the semester Dashboard, Tasks and Timer currently write into. */
  isActive: boolean;
}

export interface NewSemesterInput {
  label?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface SessionFilters {
  courseId?: string;
  dateRange?: [string, string];
}

export interface TaskFilters {
  courseId?: string;
  completed?: boolean;
}

export interface UserSettings {
  displayName: string;
  dailyGoalHours: number;
  avatarUrl: string;
}
