import type { DataProvider } from './data-provider';
import type {
  Course,
  Session,
  Task,
  Semester,
  SessionFilters,
  TaskFilters,
  UserSettings,
} from './types';
import { clampSessionSeconds, isLoggableDuration, sanitizeSession } from '@/lib/session-safety';
import {
  clampDailyGoalHours,
  clampWeeklyGoalHours,
  cleanAvatarUrl,
  cleanCourseCode,
  cleanCourseName,
  cleanDisplayName,
  cleanOptionalDate,
  cleanSessionNote,
  cleanTaskTitle,
  cleanText,
  requireIsoDate,
} from '@/lib/planner-safety';

const KEYS = {
  courses: 'lums.courses',
  sessions: 'lums.sessions',
  tasks: 'lums.tasks',
  semester: 'lums.semester',
  onboarding: 'lums.onboardingComplete',
  userSettings: 'lums.userSettings',
} as const;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function remove(key: string): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(key);
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function inDateRange(dateStr: string, range?: [string, string]): boolean {
  if (!range) return true;
  return dateStr >= range[0] && dateStr <= range[1];
}

function sanitizeCourse(course: Course): Course {
  return {
    ...course,
    code: cleanCourseCode(course.code),
    name: cleanCourseName(course.name),
    color: cleanText(course.color, 32) || '#A8B89B',
    tint: course.tint ? cleanText(course.tint, 32) : undefined,
    weeklyGoalHours: clampWeeklyGoalHours(course.weeklyGoalHours),
  };
}

function sanitizeTask(task: Task): Task {
  return {
    ...task,
    courseId: cleanText(task.courseId, 80),
    title: cleanTaskTitle(task.title),
    dueDate: cleanOptionalDate(task.dueDate),
    priority: task.priority === 'high' ? 'high' : 'normal',
    completed: Boolean(task.completed),
    completedAt: task.completed ? task.completedAt : null,
  };
}

export class LocalAdapter implements DataProvider {
  // ---- Courses
  async getCourses(): Promise<Course[]> {
    const list = read<Course[]>(KEYS.courses, [])
      .map(sanitizeCourse)
      .filter((course) => course.code && course.name);
    return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addCourse(input: Omit<Course, 'id' | 'createdAt'>): Promise<Course> {
    const courses = read<Course[]>(KEYS.courses, []);
    const course: Course = sanitizeCourse({
      ...input,
      id: uid(),
      createdAt: nowIso(),
    });
    if (!course.code || !course.name) throw new Error('Course code and name are required');
    courses.push(course);
    write(KEYS.courses, courses);
    return course;
  }

  async updateCourse(id: string, updates: Partial<Course>): Promise<Course> {
    const courses = read<Course[]>(KEYS.courses, []);
    const idx = courses.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Course ${id} not found`);
    courses[idx] = sanitizeCourse({
      ...courses[idx],
      ...updates,
      id,
      createdAt: courses[idx].createdAt,
    });
    if (!courses[idx].code || !courses[idx].name) {
      throw new Error('Course code and name are required');
    }
    write(KEYS.courses, courses);
    return courses[idx];
  }

  async deleteCourse(id: string): Promise<void> {
    const courses = read<Course[]>(KEYS.courses, []).filter((c) => c.id !== id);
    write(KEYS.courses, courses);
    const sessions = read<Session[]>(KEYS.sessions, []).filter((s) => s.courseId !== id);
    write(KEYS.sessions, sessions);
    const tasks = read<Task[]>(KEYS.tasks, []).filter((t) => t.courseId !== id);
    write(KEYS.tasks, tasks);
  }

  // ---- Sessions
  async getSessions(filters?: SessionFilters): Promise<Session[]> {
    let list = read<Session[]>(KEYS.sessions, []).map(sanitizeSession);
    if (filters?.courseId) list = list.filter((s) => s.courseId === filters.courseId);
    if (filters?.dateRange) list = list.filter((s) => inDateRange(s.date, filters.dateRange));
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addSession(input: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
    if (!isLoggableDuration(input.durationSeconds)) {
      throw new Error('Session duration must be greater than zero');
    }
    const courseId = cleanText(input.courseId, 80);
    if (!courseId) throw new Error('Course is required');
    const sessions = read<Session[]>(KEYS.sessions, []);
    const session: Session = {
      ...input,
      courseId,
      taskId: input.taskId ? cleanText(input.taskId, 80) : null,
      date: requireIsoDate(input.date, 'Session date'),
      durationSeconds: clampSessionSeconds(input.durationSeconds),
      note: cleanSessionNote(input.note),
      id: uid(),
      createdAt: nowIso(),
    };
    sessions.push(session);
    write(KEYS.sessions, sessions);
    return session;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    const sessions = read<Session[]>(KEYS.sessions, []);
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Session ${id} not found`);
    const safeUpdates = { ...updates };
    if (updates.durationSeconds !== undefined) {
      if (!isLoggableDuration(updates.durationSeconds)) {
        throw new Error('Session duration must be greater than zero');
      }
      safeUpdates.durationSeconds = clampSessionSeconds(updates.durationSeconds);
    }
    if (updates.courseId !== undefined) {
      safeUpdates.courseId = cleanText(updates.courseId, 80);
      if (!safeUpdates.courseId) throw new Error('Course is required');
    }
    if (updates.taskId !== undefined) safeUpdates.taskId = updates.taskId ? cleanText(updates.taskId, 80) : null;
    if (updates.date !== undefined) safeUpdates.date = requireIsoDate(updates.date, 'Session date');
    if (updates.note !== undefined) safeUpdates.note = cleanSessionNote(updates.note);
    sessions[idx] = { ...sessions[idx], ...safeUpdates, id, createdAt: sessions[idx].createdAt };
    write(KEYS.sessions, sessions);
    return sessions[idx];
  }

  async deleteSession(id: string): Promise<void> {
    const sessions = read<Session[]>(KEYS.sessions, []).filter((s) => s.id !== id);
    write(KEYS.sessions, sessions);
  }

  // ---- Tasks
  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    let list = read<Task[]>(KEYS.tasks, [])
      .map(sanitizeTask)
      .filter((task) => task.courseId && task.title);
    if (filters?.courseId) list = list.filter((t) => t.courseId === filters.courseId);
    if (typeof filters?.completed === 'boolean') {
      list = list.filter((t) => t.completed === filters.completed);
    }
    return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addTask(
    input: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt'>
  ): Promise<Task> {
    const courseId = cleanText(input.courseId, 80);
    const title = cleanTaskTitle(input.title);
    if (!courseId) throw new Error('Course is required');
    if (!title) throw new Error('Task title is required');
    const tasks = read<Task[]>(KEYS.tasks, []);
    const task: Task = {
      ...input,
      courseId,
      title,
      dueDate: cleanOptionalDate(input.dueDate),
      priority: input.priority === 'high' ? 'high' : 'normal',
      id: uid(),
      createdAt: nowIso(),
      completed: false,
      completedAt: null,
    };
    tasks.push(task);
    write(KEYS.tasks, tasks);
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const tasks = read<Task[]>(KEYS.tasks, []);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Task ${id} not found`);
    const safeUpdates = { ...updates };
    if (updates.courseId !== undefined) {
      safeUpdates.courseId = cleanText(updates.courseId, 80);
      if (!safeUpdates.courseId) throw new Error('Course is required');
    }
    if (updates.title !== undefined) {
      safeUpdates.title = cleanTaskTitle(updates.title);
      if (!safeUpdates.title) throw new Error('Task title is required');
    }
    if (updates.dueDate !== undefined) safeUpdates.dueDate = cleanOptionalDate(updates.dueDate);
    if (updates.priority !== undefined) {
      safeUpdates.priority = updates.priority === 'high' ? 'high' : 'normal';
    }
    tasks[idx] = sanitizeTask({ ...tasks[idx], ...safeUpdates, id, createdAt: tasks[idx].createdAt });
    write(KEYS.tasks, tasks);
    return tasks[idx];
  }

  async deleteTask(id: string): Promise<void> {
    const tasks = read<Task[]>(KEYS.tasks, []).filter((t) => t.id !== id);
    write(KEYS.tasks, tasks);
  }

  // ---- Semester
  async getSemester(): Promise<Semester | null> {
    return read<Semester | null>(KEYS.semester, null);
  }

  async setSemester(semester: Semester): Promise<void> {
    write(KEYS.semester, semester);
  }

  // ---- Onboarding
  async isOnboardingComplete(): Promise<boolean> {
    return read<boolean>(KEYS.onboarding, false);
  }

  async setOnboardingComplete(): Promise<void> {
    write(KEYS.onboarding, true);
  }

  async resetAll(): Promise<void> {
    Object.values(KEYS).forEach(remove);
  }

  // ---- User settings
  async getUserSettings(): Promise<UserSettings | null> {
    const settings = read<UserSettings | null>(KEYS.userSettings, null);
    if (!settings) return null;
    return {
      displayName: cleanDisplayName(settings.displayName),
      dailyGoalHours: clampDailyGoalHours(settings.dailyGoalHours),
      avatarUrl: cleanAvatarUrl(settings.avatarUrl),
    };
  }

  async updateUserSettings(settings: Partial<UserSettings>): Promise<void> {
    const current = read<UserSettings>(KEYS.userSettings, { displayName: '', dailyGoalHours: 4, avatarUrl: '' });
    write(KEYS.userSettings, {
      ...current,
      ...settings,
      displayName:
        settings.displayName !== undefined
          ? cleanDisplayName(settings.displayName)
          : cleanDisplayName(current.displayName),
      dailyGoalHours:
        settings.dailyGoalHours !== undefined
          ? clampDailyGoalHours(settings.dailyGoalHours)
          : clampDailyGoalHours(current.dailyGoalHours),
      avatarUrl:
        settings.avatarUrl !== undefined
          ? cleanAvatarUrl(settings.avatarUrl)
          : cleanAvatarUrl(current.avatarUrl),
    });
  }
}
