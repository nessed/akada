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
   * The shape of the sitting, oldest first. Written when a continuous session
   * is logged and not read back by the app, which has the totals above; it is
   * read over MCP, where the pattern questions get asked.
   */
  segments?: SessionSegment[];
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
  /** Plain task unless said otherwise. See TaskKind. */
  kind?: TaskKind;
  /** What this piece is worth, as a percentage of the course. */
  weight?: number | null;
  /** Pages, for a reading. What turns the backlog into hours. */
  pages?: number | null;
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
