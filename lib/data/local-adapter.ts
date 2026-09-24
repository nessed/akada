import type { DataProvider } from './data-provider';
import { nextCoursePosition, sortCourses } from './course-order';
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
  NoteRead,
  Task,
  Semester,
  NewSemesterInput,
  SessionFilters,
  TaskFilters,
  UserSettings,
} from './types';
import {
  clampSessionSeconds,
  cleanScore,
  isLoggableDuration,
  sanitizeSegments,
  sanitizeSession,
  totalBreakSeconds,
} from '@/lib/session-safety';
import { seasonLabel } from '@/lib/utils';
import { cleanChecks } from '@/lib/notes/checks';
import { cleanReads } from '@/lib/notes/reads';
import { cleanNoteMarkdown, cleanNoteTitle } from '@/lib/notes/limits';
import {
  clampDailyGoalHours,
  clampWeeklyGoalHours,
  cleanAvatarUrl,
  cleanCourseCode,
  cleanCourseName,
  cleanCredits,
  cleanInstructor,
  cleanMeetingTime,
  cleanSection,
  cleanDisplayName,
  cleanKind,
  cleanOptionalDate,
  cleanPages,
  cleanRecallKey,
  cleanRecallPrompt,
  cleanRecallSource,
  cleanSessionNote,
  cleanTaskTitle,
  cleanText,
  cleanWeight,
  sanitizeAssessments,
  sanitizeGrading,
  sanitizeRecallHistory,
  requireIsoDate,
} from '@/lib/planner-safety';

const KEYS = {
  courses: 'lums.courses',
  sessions: 'lums.sessions',
  tasks: 'lums.tasks',
  semesters: 'lums.semesters',
  activeSemesterId: 'lums.activeSemesterId',
  onboarding: 'lums.onboardingComplete',
  userSettings: 'lums.userSettings',
  recall: 'lums.recall',
  notes: 'lums.notes',
} as const;

/**
 * Courses, tasks and sessions are stored with a semesterId that isn't part
 * of the public Course/Task/Session type, mirrors semester_id being a
 * plain column the Supabase rows carry but the app-facing type doesn't
 * expose, since callers only ever see one semester's worth at a time.
 */
type StoredCourse = Course & { semesterId: string };
type StoredTask = Task & { semesterId: string };
type StoredSession = Session & { semesterId: string };
type StoredRecall = RecallRecord & { semesterId: string };

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

function sanitizeSemester(input: NewSemesterInput): { label: string; startDate: string | null; endDate: string | null } {
  return {
    label: cleanText(input.label ?? '', 60) || seasonLabel(),
    startDate: cleanOptionalDate(input.startDate ?? null),
    endDate: cleanOptionalDate(input.endDate ?? null),
  };
}

function createSemesterRecord(input: NewSemesterInput): Semester {
  const semesters = read<Semester[]>(KEYS.semesters, []);
  const semester: Semester = {
    id: uid(),
    createdAt: nowIso(),
    isActive: false, // isActive is computed at read time, never trusted from storage
    ...sanitizeSemester(input),
  };
  semesters.push(semester);
  write(KEYS.semesters, semesters);
  return semester;
}

/**
 * The semester every course/task/session read and write is scoped to.
 * Self-healing: an account with none yet, the instant onboarding starts, or
 * a very old local session, gets a blank one created and activated rather
 * than being locked out of adding a course.
 */
function activeSemesterId(): string {
  const existing = read<string | null>(KEYS.activeSemesterId, null);
  if (existing) return existing;
  const created = createSemesterRecord({});
  write(KEYS.activeSemesterId, created.id);
  return created.id;
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
    credits: cleanCredits(course.credits),
    section: cleanSection(course.section),
    instructor: cleanInstructor(course.instructor),
    meetingTime: cleanMeetingTime(course.meetingTime),
    position: cleanPosition(course.position),
    assessments: sanitizeAssessments(course.assessments),
    grading: sanitizeGrading(course.grading),
  };
}

/**
 * A course stored before ordering existed simply has none, and
 * lib/data/course-order.ts drops it to the end of the explicitly ordered
 * ones rather than to an arbitrary place. Nothing has to be migrated.
 */
function cleanPosition(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function sanitizeTask(task: Task): Task {
  return {
    ...task,
    courseId: cleanText(task.courseId, 80),
    title: cleanTaskTitle(task.title),
    description: cleanText(task.description ?? '', 5000),
    subtasks: Array.isArray(task.subtasks) ? task.subtasks.slice(0, 50).map((item) => ({ id: cleanText(item.id, 80), title: cleanText(item.title, 300), completed: Boolean(item.completed) })).filter((item) => item.id && item.title) : [],
    dueDate: cleanOptionalDate(task.dueDate),
    priority: task.priority === 'high' ? 'high' : 'normal',
    completed: Boolean(task.completed),
    completedAt: task.completed ? task.completedAt : null,
    kind: cleanKind(task.kind),
    weight: cleanWeight(task.weight),
    pages: cleanPages(task.pages),
  };
}

function sanitizeRecall(record: RecallRecord): RecallRecord {
  return {
    id: record.id,
    key: cleanRecallKey(record.key),
    courseId: cleanText(record.courseId, 80),
    prompt: cleanRecallPrompt(record.prompt),
    source: cleanRecallSource(record.source),
    ref: record.ref ? cleanText(record.ref, 200) : null,
    history: sanitizeRecallHistory(record.history),
    letGo: Boolean(record.letGo),
    createdAt: record.createdAt,
  };
}

export class LocalAdapter implements DataProvider {
  // ---- Courses
  // Always scoped to the active semester, see getCoursesForSemester for
  // reading a specific (usually past) one instead.

  async getCourses(): Promise<Course[]> {
    const activeId = activeSemesterId();
    const list = read<StoredCourse[]>(KEYS.courses, [])
      .filter((course) => course.semesterId === activeId)
      .map(sanitizeCourse)
      .filter((course) => course.code && course.name);
    return sortCourses(list);
  }

  async getCoursesForSemester(semesterId: string): Promise<Course[]> {
    const list = read<StoredCourse[]>(KEYS.courses, [])
      .filter((course) => course.semesterId === semesterId)
      .map(sanitizeCourse)
      .filter((course) => course.code && course.name);
    return sortCourses(list);
  }

  async addCourse(input: Omit<Course, 'id' | 'createdAt'>): Promise<Course> {
    const courses = read<StoredCourse[]>(KEYS.courses, []);
    const semesterId = activeSemesterId();
    const draft: StoredCourse = {
      ...input,
      id: uid(),
      createdAt: nowIso(),
      semesterId,
      // Lands at the bottom of whatever order this semester is already in,
      // the same rule the Supabase adapter follows.
      position:
        input.position ??
        nextCoursePosition(courses.filter((c) => c.semesterId === semesterId)),
    };
    const course: StoredCourse = { ...sanitizeCourse(draft), semesterId: draft.semesterId };
    if (!course.code || !course.name) throw new Error('Course code and name are required');
    courses.push(course);
    write(KEYS.courses, courses);
    return course;
  }

  async updateCourse(id: string, updates: Partial<Course>): Promise<Course> {
    const courses = read<StoredCourse[]>(KEYS.courses, []);
    const idx = courses.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Course ${id} not found`);
    const draft: StoredCourse = {
      ...courses[idx],
      ...updates,
      id,
      createdAt: courses[idx].createdAt,
    };
    courses[idx] = { ...sanitizeCourse(draft), semesterId: draft.semesterId };
    if (!courses[idx].code || !courses[idx].name) {
      throw new Error('Course code and name are required');
    }
    write(KEYS.courses, courses);
    return courses[idx];
  }

  async reorderCourses(orderedIds: string[]): Promise<void> {
    if (orderedIds.length === 0) return;
    const rank = new Map(orderedIds.map((id, index) => [id, index]));
    const courses = read<StoredCourse[]>(KEYS.courses, []).map((course) => {
      const position = rank.get(course.id);
      return position === undefined ? course : { ...course, position };
    });
    write(KEYS.courses, courses);
  }

  async deleteCourse(id: string): Promise<void> {
    const courses = read<Course[]>(KEYS.courses, []).filter((c) => c.id !== id);
    write(KEYS.courses, courses);
    const sessions = read<Session[]>(KEYS.sessions, []).filter((s) => s.courseId !== id);
    write(KEYS.sessions, sessions);
    const tasks = read<Task[]>(KEYS.tasks, []).filter((t) => t.courseId !== id);
    write(KEYS.tasks, tasks);
    // What recall_items' foreign key cascades in Postgres.
    const recall = read<StoredRecall[]>(KEYS.recall, []).filter((r) => r.courseId !== id);
    write(KEYS.recall, recall);
  }

  // ---- Sessions
  // Always scoped to the active semester. A new session inherits its
  // semesterId from the course it's logged against, mirroring what the
  // sessions_set_semester_id trigger does in Postgres.

  async getSessions(filters?: SessionFilters): Promise<Session[]> {
    const activeId = activeSemesterId();
    let list = read<StoredSession[]>(KEYS.sessions, [])
      .filter((s) => s.semesterId === activeId)
      .map(sanitizeSession);
    if (filters?.courseId) list = list.filter((s) => s.courseId === filters.courseId);
    if (filters?.dateRange) list = list.filter((s) => inDateRange(s.date, filters.dateRange));
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getSessionsForSemester(semesterId: string): Promise<Session[]> {
    const list = read<StoredSession[]>(KEYS.sessions, [])
      .filter((s) => s.semesterId === semesterId)
      .map(sanitizeSession);
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }

  async addSession(input: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
    if (!isLoggableDuration(input.durationSeconds)) {
      throw new Error('Session duration must be greater than zero');
    }
    const courseId = cleanText(input.courseId, 80);
    if (!courseId) throw new Error('Course is required');
    const sessions = read<StoredSession[]>(KEYS.sessions, []);
    const course = read<StoredCourse[]>(KEYS.courses, []).find((c) => c.id === courseId);
    const segments = sanitizeSegments(input.segments);
    // Checked here rather than trusted from the spread: a score is both halves
    // or none, and never more than it was out of.
    const { score: _score, scoreOutOf: _scoreOutOf, ...plain } = input;
    const practice = cleanScore(input.score, input.scoreOutOf);
    const session: StoredSession = {
      ...plain,
      ...(practice ? { score: practice.score, scoreOutOf: practice.outOf } : {}),
      courseId,
      taskId: input.taskId ? cleanText(input.taskId, 80) : null,
      date: requireIsoDate(input.date, 'Session date'),
      durationSeconds: clampSessionSeconds(input.durationSeconds),
      note: cleanSessionNote(input.note),
      breakSeconds: segments.length
        ? totalBreakSeconds(segments)
        : clampSessionSeconds(input.breakSeconds ?? 0),
      segments,
      id: uid(),
      createdAt: nowIso(),
      semesterId: course?.semesterId ?? activeSemesterId(),
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
  // Always scoped to the active semester, same inheritance rule as Sessions.

  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    const activeId = activeSemesterId();
    let list = read<StoredTask[]>(KEYS.tasks, [])
      .filter((task) => task.semesterId === activeId)
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
    const tasks = read<StoredTask[]>(KEYS.tasks, []);
    const course = read<StoredCourse[]>(KEYS.courses, []).find((c) => c.id === courseId);
    const task: StoredTask = {
      ...input,
      courseId,
      title,
      description: cleanText(input.description ?? '', 5000),
      subtasks: Array.isArray(input.subtasks) ? input.subtasks : [],
      dueDate: cleanOptionalDate(input.dueDate),
      priority: input.priority === 'high' ? 'high' : 'normal',
      id: uid(),
      createdAt: nowIso(),
      completed: false,
      completedAt: null,
      semesterId: course?.semesterId ?? activeSemesterId(),
    };
    tasks.push(task);
    write(KEYS.tasks, tasks);
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const tasks = read<StoredTask[]>(KEYS.tasks, []);
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
    if (updates.description !== undefined) safeUpdates.description = cleanText(updates.description, 5000);
    if (updates.subtasks !== undefined) safeUpdates.subtasks = updates.subtasks;
    if (updates.dueDate !== undefined) safeUpdates.dueDate = cleanOptionalDate(updates.dueDate);
    if (updates.priority !== undefined) {
      safeUpdates.priority = updates.priority === 'high' ? 'high' : 'normal';
    }
    const draft: StoredTask = { ...tasks[idx], ...safeUpdates, id, createdAt: tasks[idx].createdAt };
    tasks[idx] = { ...sanitizeTask(draft), semesterId: draft.semesterId };
    write(KEYS.tasks, tasks);
    return tasks[idx];
  }

  async deleteTask(id: string): Promise<void> {
    const tasks = read<Task[]>(KEYS.tasks, []).filter((t) => t.id !== id);
    write(KEYS.tasks, tasks);
    // notes.task_id is `on delete set null` in Postgres.
    const notes = read<StudyNote[]>(KEYS.notes, []);
    if (notes.some((n) => n.taskId === id)) write(KEYS.notes, notes.map((n) => (n.taskId === id ? { ...n, taskId: null } : n)));
  }

  // ---- Recall
  // Scoped to the active semester, inheriting it from the course the way the
  // recall_items_set_semester_id trigger does in Postgres.

  async getRecall(): Promise<RecallRecords> {
    const activeId = activeSemesterId();
    const records = read<StoredRecall[]>(KEYS.recall, [])
      .filter((record) => record.semesterId === activeId)
      .map(({ semesterId: _semesterId, ...record }) => sanitizeRecall(record))
      .filter((record) => record.key && record.courseId && record.prompt);
    return { records, available: true };
  }

  async saveRecall(input: RecallRecordInput): Promise<RecallRecord> {
    const clean = sanitizeRecall({ ...input, id: '', createdAt: '' });
    if (!clean.key || !clean.courseId || !clean.prompt) {
      throw new Error('A kept thing needs a course and something to recall.');
    }
    const records = read<StoredRecall[]>(KEYS.recall, []);
    const idx = records.findIndex((record) => record.key === clean.key);
    const course = read<StoredCourse[]>(KEYS.courses, []).find((c) => c.id === clean.courseId);
    const saved: StoredRecall =
      idx === -1
        ? { ...clean, id: uid(), createdAt: nowIso(), semesterId: course?.semesterId ?? activeSemesterId() }
        : { ...records[idx], ...clean, id: records[idx].id, createdAt: records[idx].createdAt };
    if (idx === -1) records.push(saved);
    else records[idx] = saved;
    write(KEYS.recall, records);
    const { semesterId: _semesterId, ...record } = saved;
    return record;
  }

  async keepRecall(inputs: RecallRecordInput[]): Promise<RecallRecord[]> {
    const records = read<StoredRecall[]>(KEYS.recall, []);
    const courses = read<StoredCourse[]>(KEYS.courses, []);
    const kept: RecallRecord[] = [];
    for (const input of inputs) {
      const clean = sanitizeRecall({ ...input, id: '', createdAt: '' });
      if (!clean.key || !clean.courseId || !clean.prompt) {
        throw new Error('A kept thing needs a course and something to recall.');
      }
      const idx = records.findIndex((record) => record.key === clean.key);
      // Already there: its answers stay, and it comes back if it was let go.
      const saved: StoredRecall =
        idx === -1
          ? {
              ...clean,
              letGo: false,
              id: uid(),
              createdAt: nowIso(),
              semesterId:
                courses.find((c) => c.id === clean.courseId)?.semesterId ?? activeSemesterId(),
            }
          : { ...records[idx], letGo: false };
      if (idx === -1) records.push(saved);
      else records[idx] = saved;
      const { semesterId: _semesterId, ...record } = saved;
      kept.push(record);
    }
    write(KEYS.recall, records);
    return kept;
  }

  async deleteRecall(key: string): Promise<void> {
    write(
      KEYS.recall,
      read<StoredRecall[]>(KEYS.recall, []).filter((record) => record.key !== key),
    );
  }

  // ---- Semesters
  async getActiveSemester(): Promise<Semester | null> {
    const activeId = read<string | null>(KEYS.activeSemesterId, null);
    if (!activeId) return null;
    const found = read<Semester[]>(KEYS.semesters, []).find((s) => s.id === activeId);
    return found ? { ...found, isActive: true } : null;
  }

  async getSemesters(): Promise<Semester[]> {
    const activeId = read<string | null>(KEYS.activeSemesterId, null);
    const list = read<Semester[]>(KEYS.semesters, []).map((s) => ({
      ...s,
      isActive: s.id === activeId,
    }));
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createSemester(input: NewSemesterInput): Promise<Semester> {
    const created = createSemesterRecord(input);
    write(KEYS.activeSemesterId, created.id);
    return { ...created, isActive: true };
  }

  async updateSemester(id: string, updates: NewSemesterInput): Promise<Semester> {
    const semesters = read<Semester[]>(KEYS.semesters, []);
    const idx = semesters.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Semester ${id} not found`);
    semesters[idx] = {
      ...semesters[idx],
      ...sanitizeSemester({
        label: updates.label ?? semesters[idx].label,
        startDate: updates.startDate !== undefined ? updates.startDate : semesters[idx].startDate,
        endDate: updates.endDate !== undefined ? updates.endDate : semesters[idx].endDate,
      }),
    };
    write(KEYS.semesters, semesters);
    const activeId = read<string | null>(KEYS.activeSemesterId, null);
    return { ...semesters[idx], isActive: semesters[idx].id === activeId };
  }

  async deleteSemester(id: string): Promise<void> {
    const semesters = read<Semester[]>(KEYS.semesters, []);
    if (!semesters.some((semester) => semester.id === id)) {
      throw new Error('Semester not found.');
    }
    const remaining = semesters.filter((semester) => semester.id !== id);
    if (remaining.length === 0) {
      throw new Error('Start another semester before deleting your only semester.');
    }

    write(KEYS.semesters, remaining);
    if (read<string | null>(KEYS.activeSemesterId, null) === id) {
      const nextActive = [...remaining].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      write(KEYS.activeSemesterId, nextActive.id);
    }
    write(KEYS.courses, read<StoredCourse[]>(KEYS.courses, []).filter((course) => course.semesterId !== id));
    write(KEYS.tasks, read<StoredTask[]>(KEYS.tasks, []).filter((task) => task.semesterId !== id));
    write(KEYS.sessions, read<StoredSession[]>(KEYS.sessions, []).filter((session) => session.semesterId !== id));
    write(KEYS.recall, read<StoredRecall[]>(KEYS.recall, []).filter((record) => record.semesterId !== id));
  }

  // ---- Onboarding
  async isOnboardingComplete(): Promise<boolean> {
    return read<boolean>(KEYS.onboarding, false);
  }

  async setOnboardingComplete(): Promise<void> {
    write(KEYS.onboarding, true);
  }

  // ---- Notes
  async getNotes(): Promise<StudyNotes> {
    // Notes written before tasks and reads existed carry neither.
    const notes = read<StudyNote[]>(KEYS.notes, [])
      .map((n) => ({ ...n, taskId: n.taskId ?? null, reads: cleanReads(n.reads) }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { notes, available: true };
  }

  async saveNote(input: StudyNoteInput): Promise<StudyNote> {
    const notes = read<StudyNote[]>(KEYS.notes, []);
    const markdown = cleanNoteMarkdown(input.markdown);
    if (!markdown.trim()) throw new Error('A note needs something in it.');
    const now = new Date().toISOString();
    const existing = input.id ? notes.find((n) => n.id === input.id) : undefined;
    const note: StudyNote = {
      id: input.id || uid(),
      courseId: input.courseId !== undefined ? input.courseId || null : existing?.courseId ?? null,
      title: cleanNoteTitle(input.title, markdown),
      markdown,
      checks: input.checks ? cleanChecks(input.checks) : existing?.checks ?? {},
      source: input.source ?? existing?.source ?? 'app',
      taskId: input.taskId !== undefined ? input.taskId || null : existing?.taskId ?? null,
      reads: input.reads ? cleanReads(input.reads) : existing?.reads ?? [],
      createdAt: input.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    };
    write(KEYS.notes, [note, ...notes.filter((n) => n.id !== note.id)]);
    return note;
  }

  async setNoteChecks(id: string, checks: Record<string, NoteCheckResult>): Promise<void> {
    const notes = read<StudyNote[]>(KEYS.notes, []);
    write(KEYS.notes, notes.map((n) => (n.id === id ? { ...n, checks: cleanChecks(checks) } : n)));
  }

  async setNoteStudy(id: string, patch: { taskId?: string | null; courseId?: string | null }): Promise<void> {
    const notes = read<StudyNote[]>(KEYS.notes, []);
    write(KEYS.notes, notes.map((n) => (n.id === id ? {
      ...n,
      ...(patch.taskId !== undefined ? { taskId: patch.taskId || null } : {}),
      ...(patch.courseId !== undefined ? { courseId: patch.courseId || null } : {}),
    } : n)));
  }

  async setNoteReads(id: string, reads: NoteRead[]): Promise<void> {
    const notes = read<StudyNote[]>(KEYS.notes, []);
    write(KEYS.notes, notes.map((n) => (n.id === id ? { ...n, reads: cleanReads(reads) } : n)));
  }

  async deleteNote(id: string): Promise<void> {
    write(KEYS.notes, read<StudyNote[]>(KEYS.notes, []).filter((n) => n.id !== id));
  }

  async resetAll(): Promise<void> {
    Object.values(KEYS).forEach(remove);
  }

  async deleteAccount(): Promise<void> {
    // Local mode has no account behind the data, so erasing the data is the
    // whole of it.
    await this.resetAll();
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
