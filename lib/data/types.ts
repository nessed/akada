export interface Course {
  id: string;
  code: string;
  name: string;
  color: string;
  tint?: string;
  weeklyGoalHours: number;
  createdAt: string;
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

export interface Task {
  id: string;
  courseId: string;
  title: string;
  dueDate: string | null;
  priority: TaskPriority;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
}

export interface Semester {
  startDate: string;
  endDate: string;
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
