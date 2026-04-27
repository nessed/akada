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

export class LocalAdapter implements DataProvider {
  // ---- Courses
  async getCourses(): Promise<Course[]> {
    const list = read<Course[]>(KEYS.courses, []);
    return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addCourse(input: Omit<Course, 'id' | 'createdAt'>): Promise<Course> {
    const courses = read<Course[]>(KEYS.courses, []);
    const course: Course = { ...input, id: uid(), createdAt: nowIso() };
    courses.push(course);
    write(KEYS.courses, courses);
    return course;
  }

  async updateCourse(id: string, updates: Partial<Course>): Promise<Course> {
    const courses = read<Course[]>(KEYS.courses, []);
    const idx = courses.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Course ${id} not found`);
    courses[idx] = { ...courses[idx], ...updates, id, createdAt: courses[idx].createdAt };
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
    let list = read<Session[]>(KEYS.sessions, []);
    if (filters?.courseId) list = list.filter((s) => s.courseId === filters.courseId);
    if (filters?.dateRange) list = list.filter((s) => inDateRange(s.date, filters.dateRange));
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addSession(input: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
    const sessions = read<Session[]>(KEYS.sessions, []);
    const session: Session = { ...input, id: uid(), createdAt: nowIso() };
    sessions.push(session);
    write(KEYS.sessions, sessions);
    return session;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    const sessions = read<Session[]>(KEYS.sessions, []);
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Session ${id} not found`);
    sessions[idx] = { ...sessions[idx], ...updates, id, createdAt: sessions[idx].createdAt };
    write(KEYS.sessions, sessions);
    return sessions[idx];
  }

  async deleteSession(id: string): Promise<void> {
    const sessions = read<Session[]>(KEYS.sessions, []).filter((s) => s.id !== id);
    write(KEYS.sessions, sessions);
  }

  // ---- Tasks
  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    let list = read<Task[]>(KEYS.tasks, []);
    if (filters?.courseId) list = list.filter((t) => t.courseId === filters.courseId);
    if (typeof filters?.completed === 'boolean') {
      list = list.filter((t) => t.completed === filters.completed);
    }
    return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addTask(
    input: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt'>
  ): Promise<Task> {
    const tasks = read<Task[]>(KEYS.tasks, []);
    const task: Task = {
      ...input,
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
    tasks[idx] = { ...tasks[idx], ...updates, id, createdAt: tasks[idx].createdAt };
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
    return read<UserSettings | null>(KEYS.userSettings, null);
  }

  async updateUserSettings(settings: Partial<UserSettings>): Promise<void> {
    const current = read<UserSettings>(KEYS.userSettings, { displayName: '', dailyGoalHours: 4, avatarUrl: '' });
    write(KEYS.userSettings, { ...current, ...settings });
  }
}
