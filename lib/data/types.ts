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
