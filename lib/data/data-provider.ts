import type {
  Course,
  Session,
  Task,
  Semester,
  NewSemesterInput,
  SessionFilters,
  TaskFilters,
  UserSettings,
} from './types';

export interface DataProvider {
  // Courses, always scoped to the active semester. Use getCoursesForSemester
  // to read a past (non-active) semester's courses for the read-only archive
  // view.
  getCourses(): Promise<Course[]>;
  addCourse(course: Omit<Course, 'id' | 'createdAt'>): Promise<Course>;
  updateCourse(id: string, updates: Partial<Course>): Promise<Course>;
  deleteCourse(id: string): Promise<void>;
  /**
   * Writes the order the student dragged their courses into. `orderedIds` is
   * the whole visible list, first card first; anything not named keeps the
   * position it had. Ordering is a preference rather than a fact, so this is
   * the one course write that is allowed to be unavailable: against a
   * database that has not run the latest supabase/schema.sql it throws, and
   * the dashboard rolls the cards back and says the order did not save.
   */
  reorderCourses(orderedIds: string[]): Promise<void>;

  // Sessions, scoped to the active semester, same rule as courses.
  getSessions(filters?: SessionFilters): Promise<Session[]>;
  addSession(session: Omit<Session, 'id' | 'createdAt'>): Promise<Session>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session>;
  deleteSession(id: string): Promise<void>;

  // Tasks, scoped to the active semester, same rule as courses.
  getTasks(filters?: TaskFilters): Promise<Task[]>;
  addTask(task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt'>): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Semesters
  /** The semester Dashboard/Tasks/Timer currently write into, or null before onboarding finishes it. */
  getActiveSemester(): Promise<Semester | null>;
  /** Every semester the user has, newest first. */
  getSemesters(): Promise<Semester[]>;
  /** Creates a new semester and makes it active. Existing courses/tasks/sessions stay exactly where they were, they just stop being the default view. */
  createSemester(input: NewSemesterInput): Promise<Semester>;
  updateSemester(id: string, updates: NewSemesterInput): Promise<Semester>;
  deleteSemester(id: string): Promise<void>;
  /** Read-only archive lookups for a specific (usually non-active) semester. */
  getCoursesForSemester(semesterId: string): Promise<Course[]>;
  getSessionsForSemester(semesterId: string): Promise<Session[]>;

  // Onboarding
  isOnboardingComplete(): Promise<boolean>;
  setOnboardingComplete(): Promise<void>;

  // User settings
  getUserSettings(): Promise<UserSettings | null>;
  updateUserSettings(settings: Partial<UserSettings>): Promise<void>;

  // Dev / debugging
  resetAll(): Promise<void>;
  /**
   * Erase the account itself, not just its contents: the auth record goes
   * too, and the database cascades everything else with it.
   */
  deleteAccount(): Promise<void>;
}
