import type {
  Course,
  Session,
  Task,
  Semester,
  SessionFilters,
  TaskFilters,
} from './types';

export interface DataProvider {
  // Courses
  getCourses(): Promise<Course[]>;
  addCourse(course: Omit<Course, 'id' | 'createdAt'>): Promise<Course>;
  updateCourse(id: string, updates: Partial<Course>): Promise<Course>;
  deleteCourse(id: string): Promise<void>;

  // Sessions
  getSessions(filters?: SessionFilters): Promise<Session[]>;
  addSession(session: Omit<Session, 'id' | 'createdAt'>): Promise<Session>;

  // Tasks
  getTasks(filters?: TaskFilters): Promise<Task[]>;
  addTask(task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt'>): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Semester
  getSemester(): Promise<Semester | null>;
  setSemester(semester: Semester): Promise<void>;

  // Onboarding
  isOnboardingComplete(): Promise<boolean>;
  setOnboardingComplete(): Promise<void>;

  // Dev / debugging
  resetAll(): Promise<void>;
}
