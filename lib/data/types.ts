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
