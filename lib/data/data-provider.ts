import type {
  Course,
  RecallRecord,
  RecallRecordInput,
  RecallRecords,
  Session,
  StudyNote,
  StudyNoteInput,
  StudyNotes,
  NoteCheckResult,
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
   * the list that asked for the move puts the cards back and says the order
   * did not save.
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

  // Recall, scoped to the active semester, same rule as courses.
  /**
   * Everything kept for recall that has a row. A finished reading has none
   * until it is first answered or let go (see lib/recall). Against a
   * database that has not run the latest supabase/schema.sql this resolves
   * with `available: false` rather than throwing, because the readings can
   * still be read off the tasks; it is only writing that needs the table.
   */
  getRecall(): Promise<RecallRecords>;
  /**
   * Writes one kept thing whole, by its key: a first answer, a later one, a
   * let go. Rejects with a sentence the reader can act on when the table is
   * not there yet.
   */
  saveRecall(input: RecallRecordInput): Promise<RecallRecord>;
  /**
   * Keeps things without touching anything they already have. A key with no
   * row gets one as given; a key that has a row keeps its answers, and is
   * brought back if it was let go. Keeping is never a reason to lose a
   * history, whatever the screen that asked believed was stored.
   */
  keepRecall(inputs: RecallRecordInput[]): Promise<RecallRecord[]>;
  /**
   * Removes a row outright. Only undo uses it, to put a finished reading that
   * had never been answered back to having no row at all.
   */
  deleteRecall(key: string): Promise<void>;

  // Notes. Not semester-scoped: every note the student has, newest first.
  /**
   * Resolves with `available: false` rather than throwing against a database
   * that has not run the latest supabase/schema.sql.
   */
  getNotes(): Promise<StudyNotes>;
  /** Creates a note, or writes over one by id. Undo puts a deleted note back through this. */
  saveNote(input: StudyNoteInput): Promise<StudyNote>;
  /** Writes a note's check results whole. */
  setNoteChecks(id: string, checks: Record<string, NoteCheckResult>): Promise<void>;
  deleteNote(id: string): Promise<void>;

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
