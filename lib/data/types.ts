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
   * Where this course sits in the order the student dragged their dashboard
   * into, smallest first. Optional: a row written before the column existed,
   * or a project that has not re-run supabase/schema.sql, has none and falls
   * back to the implicit oldest-first order. See lib/data/course-order.ts.
   */
  position?: number;
}

export interface Session {
  id: string;
  courseId: string;
  taskId: string | null;
  date: string;
  durationSeconds: number;
  note: string;
  createdAt: string;
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
