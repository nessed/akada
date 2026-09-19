import { createClient } from '@/lib/supabase';
import type { DataProvider } from './data-provider';
import { sortCourses } from './course-order';
import type {
  Course,
  Session,
  Task,
  TaskSubtask,
  Semester,
  NewSemesterInput,
  SessionFilters,
  TaskFilters,
  UserSettings,
} from './types';
import { clampSessionSeconds, isLoggableDuration, sanitizeSession } from '@/lib/session-safety';
import { seasonLabel } from '@/lib/utils';
import {
  clampDailyGoalHours,
  clampWeeklyGoalHours,
  assertAvatarUrl,
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
  cleanSessionNote,
  cleanTaskTitle,
  cleanText,
  cleanWeight,
  sanitizeAssessments,
  sanitizeGrading,
  requireIsoDate,
} from '@/lib/planner-safety';

// ---- Row → model mappers ----

interface CourseRow {
  id: string;
  code: string;
  name: string;
  color: string;
  tint: string | null;
  weekly_goal_hours: number;
  created_at: string;
  credits: number | null;
  section: string | null;
  instructor: string | null;
  meeting_time: string | null;
  /**
   * Absent entirely against a database that has not run the latest
   * supabase/schema.sql, which is why the reads below never `.order()` on it
   * and sort in memory instead: PostgREST would reject the whole query for an
   * unknown column and the dashboard would show nothing at all.
   */
  sort_order?: number | null;
  /** Absent for the same reason, and for the same handling. */
  assessments?: unknown;
  /** Absent for the same reason, and for the same handling. */
  grading?: unknown;
}

interface SessionRow {
  id: string;
  course_id: string;
  task_id: string | null;
  date: string;
  duration_seconds: number;
  note: string;
  created_at: string;
}

interface TaskRow {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  subtasks: unknown;
  due_date: string | null;
  priority: 'high' | 'normal';
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  /** Added after the fact, so absent on a database still on an older schema. */
  kind?: string | null;
  weight?: number | string | null;
  pages?: number | string | null;
}

interface SemesterRow {
  id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

function rowToCourse(r: CourseRow): Course {
  return {
    id: r.id,
    code: cleanCourseCode(r.code),
    name: cleanCourseName(r.name),
    color: cleanText(r.color, 32) || '#A8B89B',
    tint: r.tint ? cleanText(r.tint, 32) : undefined,
    weeklyGoalHours: clampWeeklyGoalHours(r.weekly_goal_hours),
    createdAt: r.created_at,
    credits: cleanCredits(r.credits),
    section: cleanSection(r.section),
    instructor: cleanInstructor(r.instructor),
    meetingTime: cleanMeetingTime(r.meeting_time),
    position: typeof r.sort_order === 'number' ? r.sort_order : undefined,
    assessments: sanitizeAssessments(r.assessments),
    grading: sanitizeGrading(r.grading),
  };
}

function rowToSession(r: SessionRow): Session {
  return sanitizeSession({
    id: r.id,
    courseId: r.course_id,
    taskId: r.task_id,
    date: r.date,
    durationSeconds: r.duration_seconds,
    note: r.note,
    createdAt: r.created_at,
  });
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    courseId: cleanText(r.course_id, 80),
    title: cleanTaskTitle(r.title),
    description: cleanText(r.description ?? '', 5000),
    subtasks: sanitizeSubtasks(r.subtasks),
    dueDate: cleanOptionalDate(r.due_date),
    priority: r.priority === 'high' ? 'high' : 'normal',
    completed: Boolean(r.completed),
    completedAt: r.completed_at,
    createdAt: r.created_at,
    kind: cleanKind(r.kind),
    weight: cleanWeight(r.weight),
    pages: cleanPages(r.pages),
  };
}

function sanitizeSubtasks(value: unknown): TaskSubtask[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<TaskSubtask>;
    const id = cleanText(String(row.id ?? ''), 80);
    const title = cleanText(String(row.title ?? ''), 300);
    return id && title ? [{ id, title, completed: Boolean(row.completed) }] : [];
  });
}

function rowToSemester(r: SemesterRow, activeId: string | null): Semester {
  return {
    id: r.id,
    label: cleanText(r.label, 60) || seasonLabel(new Date(r.created_at)),
    startDate: cleanOptionalDate(r.start_date),
    endDate: cleanOptionalDate(r.end_date),
    createdAt: r.created_at,
    isActive: r.id === activeId,
  };
}

/**
 * Postgres 23505 is a unique-constraint violation. The only unique constraint
 * on courses is (user_id, semester_id, upper(code)), so this is always a
 * duplicate course code within the same semester, say so instead of
 * surfacing the raw constraint name. The same code in a different semester
 * (e.g. retaking CS101) is allowed and won't hit this.
 */
function courseWriteError(error: { code?: string }, code: string): Error {
  if (error.code === '23505') {
    return new Error(`You already have a course with the code ${code} this semester.`);
  }
  return error as unknown as Error;
}

/**
 * Postgres 42703 is "column does not exist". The only optional column the app
 * writes is courses.sort_order, which a project that has not re-run
 * supabase/schema.sql will not have, so this is how the course order degrades
 * to "everything else still works" rather than taking the page down with it.
 */
function isMissingOrderColumn(error: { code?: string; message?: string }): boolean {
  return error?.code === '42703' || Boolean(error?.message?.includes('sort_order'));
}

/**
 * The columns a task only sometimes has. Sent as a spread rather than as
 * fixed keys so a plain, undated, unweighted task writes exactly the insert
 * it always did — which is also what keeps it working against a project that
 * has not re-run supabase/schema.sql, since the columns are never mentioned.
 */
function taskExtras(input: Partial<Task>): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (input.kind && input.kind !== 'task') extras.kind = cleanKind(input.kind);
  const weight = cleanWeight(input.weight);
  if (weight !== null) extras.weight = weight;
  const pages = cleanPages(input.pages);
  if (pages !== null) extras.pages = pages;
  return extras;
}

const COURSE_ORDER_UNAVAILABLE =
  'Course order could not be saved. Run the latest supabase/schema.sql once and try again.';

export class SupabaseAdapter implements DataProvider {
  private supabase = createClient();

  /**
   * Who is signed in, and which term they are studying, answered once.
   *
   * Every read on this adapter used to start with `auth.getSession()` and a
   * `user_settings` lookup of its own. A dashboard opens six reads at once,
   * so that was six identical `user_settings` queries plus six trips through
   * Supabase's auth lock, which serializes them — courses, tasks, sessions
   * and semesters queueing one behind the other, about seven seconds to
   * first paint.
   *
   * The promise is cached rather than the value, so six callers in the same
   * tick share one request instead of racing to fill the cache. A rejection
   * is never kept: a read that failed because the network was down has to be
   * allowed to succeed on the next try.
   */
  private cachedUserId: Promise<string> | null = null;
  private cachedSemesterId: Promise<string> | null = null;
  private cachedSemesterFor: string | null = null;

  constructor() {
    // A user id that outlived its session would read one account's rows
    // under another's, so any change in who is signed in throws both away.
    // A token refresh is the same person and keeps them.
    this.supabase.auth.onAuthStateChange((event) => {
      if (event !== 'TOKEN_REFRESHED') this.forget();
    });
  }

  private forget() {
    this.cachedUserId = null;
    this.cachedSemesterId = null;
    this.cachedSemesterFor = null;
  }

  /** Remembers a semester this adapter just made active, saving a re-read. */
  private rememberSemester(uid: string, semesterId: string) {
    this.cachedSemesterFor = uid;
    this.cachedSemesterId = Promise.resolve(semesterId);
  }

  private userId(): Promise<string> {
    if (this.cachedUserId) return this.cachedUserId;
    const pending = this.readUserId();
    this.cachedUserId = pending;
    pending.catch(() => {
      if (this.cachedUserId === pending) this.cachedUserId = null;
    });
    return pending;
  }

  private async readUserId(): Promise<string> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session?.user) return session.user.id;

    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    return user.id;
  }

  /** Reads user_settings.active_semester_id without creating anything. */
  private async readActiveSemesterId(uid: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('active_semester_id')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    return data?.active_semester_id ?? null;
  }

  /**
   * The semester every course/task/session read and write is scoped to.
   * Self-healing: an account that somehow has none yet, the instant
   * onboarding starts, or an old account mid-migration, gets a blank one
   * created and activated rather than being locked out of adding a course.
   */
  private activeSemesterId(uid: string): Promise<string> {
    if (this.cachedSemesterId && this.cachedSemesterFor === uid) return this.cachedSemesterId;
    const pending = this.resolveActiveSemesterId(uid);
    this.cachedSemesterFor = uid;
    this.cachedSemesterId = pending;
    pending.catch(() => {
      if (this.cachedSemesterId === pending) this.forgetSemester();
    });
    return pending;
  }

  private forgetSemester() {
    this.cachedSemesterId = null;
    this.cachedSemesterFor = null;
  }

  private async resolveActiveSemesterId(uid: string): Promise<string> {
    const existing = await this.readActiveSemesterId(uid);
    if (existing) return existing;
    const created = await this.createSemesterFor(uid, {});
    return created.id;
  }

  // ---- Courses ----
  // Always scoped to the active semester, see getCoursesForSemester for
  // reading a specific (usually past) one instead.

  async getCourses(): Promise<Course[]> {
    const uid = await this.userId();
    const semesterId = await this.activeSemesterId(uid);
    const { data, error } = await this.supabase
      .from('courses')
      .select('*')
      .eq('user_id', uid)
      .eq('semester_id', semesterId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    // Sorted here rather than in the query: .order('sort_order') would be a
    // hard error against a database that has not run the latest schema, and
    // created_at is already the tie-break the ordering falls back to.
    return sortCourses((data as CourseRow[]).map(rowToCourse));
  }

  async getCoursesForSemester(semesterId: string): Promise<Course[]> {
    const uid = await this.userId();
    const { data, error } = await this.supabase
      .from('courses')
      .select('*')
      .eq('user_id', uid)
      .eq('semester_id', semesterId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    // Sorted here rather than in the query: .order('sort_order') would be a
    // hard error against a database that has not run the latest schema, and
    // created_at is already the tie-break the ordering falls back to.
    return sortCourses((data as CourseRow[]).map(rowToCourse));
  }

  async addCourse(input: Omit<Course, 'id' | 'createdAt'>): Promise<Course> {
    const uid = await this.userId();
    const semesterId = await this.activeSemesterId(uid);
    const code = cleanCourseCode(input.code);
    const name = cleanCourseName(input.name);
    if (!code || !name) throw new Error('Course code and name are required');
    const position = await this.nextCoursePosition(uid, semesterId);
    const { data, error } = await this.supabase
      .from('courses')
      .insert({
        user_id: uid,
        semester_id: semesterId,
        code,
        name,
        color: cleanText(input.color, 32) || '#A8B89B',
        tint: input.tint ? cleanText(input.tint, 32) : null,
        weekly_goal_hours: clampWeeklyGoalHours(input.weeklyGoalHours),
        credits: cleanCredits(input.credits),
        section: cleanSection(input.section),
        instructor: cleanInstructor(input.instructor),
        meeting_time: cleanMeetingTime(input.meetingTime),
        // Both of these are omitted entirely when they carry nothing, which
        // is what lets the insert still run against a database that has not
        // re-run supabase/schema.sql: an unmentioned column cannot be
        // rejected as unknown. A new course lands at the bottom of whatever
        // order the student has already arranged.
        ...(position === null ? {} : { sort_order: position }),
        ...(input.assessments?.length
          ? { assessments: sanitizeAssessments(input.assessments) }
          : {}),
      })
      .select()
      .single();
    if (error) throw courseWriteError(error, code);
    return rowToCourse(data as CourseRow);
  }

  /**
   * The position a new course should take, or null when this database has no
   * sort_order column yet. Never throws: a course being added matters, the
   * order it lands in does not.
   */
  private async nextCoursePosition(
    uid: string,
    semesterId: string,
  ): Promise<number | null> {
    const { data, error } = await this.supabase
      .from('courses')
      .select('sort_order')
      .eq('user_id', uid)
      .eq('semester_id', semesterId);
    if (error) return null;
    const rows = (data as { sort_order?: number | null }[] | null) ?? [];
    let top = -1;
    for (const row of rows) {
      if (typeof row.sort_order === 'number' && row.sort_order > top) top = row.sort_order;
    }
    // A semester whose courses all predate the backfill has no positions at
    // all; counting them keeps the newcomer behind them rather than in front.
    return Math.max(top + 1, rows.length);
  }

  async reorderCourses(orderedIds: string[]): Promise<void> {
    if (orderedIds.length === 0) return;
    const uid = await this.userId();
    const results = await Promise.all(
      orderedIds.map((id, index) =>
        this.supabase
          .from('courses')
          .update({ sort_order: index })
          .eq('id', id)
          .eq('user_id', uid),
      ),
    );
    const failure = results.find((result) => result.error)?.error;
    if (failure) {
      throw isMissingOrderColumn(failure)
        ? new Error(COURSE_ORDER_UNAVAILABLE)
        : (failure as unknown as Error);
    }
  }

  async updateCourse(id: string, updates: Partial<Course>): Promise<Course> {
    const uid = await this.userId();
    // Build a snake_case patch
    const patch: Record<string, unknown> = {};
    if (updates.code !== undefined) {
      const code = cleanCourseCode(updates.code);
      if (!code) throw new Error('Course code is required');
      patch.code = code;
    }
    if (updates.name !== undefined) {
      const name = cleanCourseName(updates.name);
      if (!name) throw new Error('Course name is required');
      patch.name = name;
    }
    if (updates.color !== undefined) patch.color = cleanText(updates.color, 32) || '#A8B89B';
    if (updates.assessments !== undefined) patch.assessments = sanitizeAssessments(updates.assessments);
    // `{}` rather than null when there is nothing to say, to match the column
    // default — a null would violate the not-null constraint.
    if (updates.grading !== undefined) patch.grading = sanitizeGrading(updates.grading) ?? {};
    if (updates.tint !== undefined) patch.tint = updates.tint ? cleanText(updates.tint, 32) : null;
    if (updates.weeklyGoalHours !== undefined) {
      patch.weekly_goal_hours = clampWeeklyGoalHours(updates.weeklyGoalHours);
    }
    if (updates.credits !== undefined) patch.credits = cleanCredits(updates.credits);
    if (updates.section !== undefined) patch.section = cleanSection(updates.section);
    if (updates.instructor !== undefined) patch.instructor = cleanInstructor(updates.instructor);
    if (updates.meetingTime !== undefined) patch.meeting_time = cleanMeetingTime(updates.meetingTime);
    if (typeof updates.position === 'number' && Number.isFinite(updates.position)) {
      patch.sort_order = Math.max(0, Math.trunc(updates.position));
    }

    const { data, error } = await this.supabase
      .from('courses')
      .update(patch)
      .eq('id', id)
      .eq('user_id', uid)
      .select()
      .single();
    if (error) throw courseWriteError(error, String(patch.code ?? updates.code ?? ''));
    return rowToCourse(data as CourseRow);
  }

  async deleteCourse(id: string): Promise<void> {
    const uid = await this.userId();
    const { error } = await this.supabase
      .from('courses')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;
    // DB cascade removes sessions + tasks automatically
  }

  // ---- Sessions ----
  // Always scoped to the active semester. addSession doesn't need to set
  // semester_id itself, supabase/schema.sql's tasks_set_semester_id /
  // sessions_set_semester_id triggers copy it from the course on insert.

  async getSessions(filters?: SessionFilters): Promise<Session[]> {
    const uid = await this.userId();
    const semesterId = await this.activeSemesterId(uid);
    let query = this.supabase
      .from('sessions')
      .select('*')
      .eq('user_id', uid)
      .eq('semester_id', semesterId)
      .order('created_at', { ascending: false });

    if (filters?.courseId) {
      query = query.eq('course_id', filters.courseId);
    }
    if (filters?.dateRange) {
      query = query.gte('date', filters.dateRange[0]).lte('date', filters.dateRange[1]);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as SessionRow[]).map(rowToSession);
  }

  async getSessionsForSemester(semesterId: string): Promise<Session[]> {
    const uid = await this.userId();
    const { data, error } = await this.supabase
      .from('sessions')
      .select('*')
      .eq('user_id', uid)
      .eq('semester_id', semesterId)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as SessionRow[]).map(rowToSession);
  }

  async addSession(input: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
    if (!isLoggableDuration(input.durationSeconds)) {
      throw new Error('Session duration must be greater than zero');
    }
    const courseId = cleanText(input.courseId, 80);
    if (!courseId) throw new Error('Course is required');
    const uid = await this.userId();
    const { data, error } = await this.supabase
      .from('sessions')
      .insert({
        user_id: uid,
        course_id: courseId,
        task_id: input.taskId ? cleanText(input.taskId, 80) : null,
        date: requireIsoDate(input.date, 'Session date'),
        duration_seconds: clampSessionSeconds(input.durationSeconds),
        note: cleanSessionNote(input.note),
      })
      .select()
      .single();
    if (error) throw error;
    return rowToSession(data as SessionRow);
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    const uid = await this.userId();
    const patch: Record<string, unknown> = {};
    if (updates.courseId !== undefined) {
      const courseId = cleanText(updates.courseId, 80);
      if (!courseId) throw new Error('Course is required');
      patch.course_id = courseId;
    }
    if (updates.taskId !== undefined) patch.task_id = updates.taskId ? cleanText(updates.taskId, 80) : null;
    if (updates.date !== undefined) patch.date = requireIsoDate(updates.date, 'Session date');
    if (updates.durationSeconds !== undefined) {
      if (!isLoggableDuration(updates.durationSeconds)) {
        throw new Error('Session duration must be greater than zero');
      }
      patch.duration_seconds = clampSessionSeconds(updates.durationSeconds);
    }
    if (updates.note !== undefined) patch.note = cleanSessionNote(updates.note);

    const { data, error } = await this.supabase
      .from('sessions')
      .update(patch)
      .eq('id', id)
      .eq('user_id', uid)
      .select()
      .single();
    if (error) throw error;
    return rowToSession(data as SessionRow);
  }

  async deleteSession(id: string): Promise<void> {
    const uid = await this.userId();
    const { error } = await this.supabase
      .from('sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;
  }

  // ---- Tasks ----
  // Always scoped to the active semester, see the Sessions comment above,
  // the same trigger keeps tasks.semester_id in sync.

  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    const uid = await this.userId();
    const semesterId = await this.activeSemesterId(uid);
    let query = this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', uid)
      .eq('semester_id', semesterId)
      .order('created_at', { ascending: true });

    if (filters?.courseId) {
      query = query.eq('course_id', filters.courseId);
    }
    if (typeof filters?.completed === 'boolean') {
      query = query.eq('completed', filters.completed);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as TaskRow[]).map(rowToTask);
  }

  async addTask(
    input: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt'>,
  ): Promise<Task> {
    const uid = await this.userId();
    const courseId = cleanText(input.courseId, 80);
    const title = cleanTaskTitle(input.title);
    if (!courseId) throw new Error('Course is required');
    if (!title) throw new Error('Task title is required');
    const { data, error } = await this.supabase
      .from('tasks')
      .insert({
        user_id: uid,
        course_id: courseId,
        title,
        description: cleanText(input.description ?? '', 5000),
        subtasks: sanitizeSubtasks(input.subtasks),
        due_date: cleanOptionalDate(input.dueDate),
        priority: input.priority === 'high' ? 'high' : 'normal',
        ...taskExtras(input),
      })
      .select()
      .single();
    if (error) throw error;
    return rowToTask(data as TaskRow);
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const uid = await this.userId();
    const patch: Record<string, unknown> = {};
    if (updates.courseId !== undefined) {
      const courseId = cleanText(updates.courseId, 80);
      if (!courseId) throw new Error('Course is required');
      patch.course_id = courseId;
    }
    if (updates.title !== undefined) {
      const title = cleanTaskTitle(updates.title);
      if (!title) throw new Error('Task title is required');
      patch.title = title;
    }
    if (updates.description !== undefined) patch.description = cleanText(updates.description, 5000);
    if (updates.subtasks !== undefined) patch.subtasks = sanitizeSubtasks(updates.subtasks);
    if (updates.dueDate !== undefined) patch.due_date = cleanOptionalDate(updates.dueDate);
    if (updates.priority !== undefined) patch.priority = updates.priority === 'high' ? 'high' : 'normal';
    if (updates.completed !== undefined) {
      patch.completed = updates.completed;
      patch.completed_at = updates.completed ? new Date().toISOString() : null;
    }
    if (updates.completedAt !== undefined) patch.completed_at = updates.completedAt;
    if (updates.kind !== undefined) patch.kind = cleanKind(updates.kind);
    if (updates.weight !== undefined) patch.weight = cleanWeight(updates.weight);
    if (updates.pages !== undefined) patch.pages = cleanPages(updates.pages);

    const { data, error } = await this.supabase
      .from('tasks')
      .update(patch)
      .eq('id', id)
      .eq('user_id', uid)
      .select()
      .single();
    if (error) throw error;
    return rowToTask(data as TaskRow);
  }

  async deleteTask(id: string): Promise<void> {
    const uid = await this.userId();
    const { error } = await this.supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;
  }

  // ---- Semesters ----

  async getActiveSemester(): Promise<Semester | null> {
    const uid = await this.userId();
    const activeId = await this.readActiveSemesterId(uid);
    if (!activeId) return null;
    const { data, error } = await this.supabase
      .from('semesters')
      .select('*')
      .eq('id', activeId)
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToSemester(data as SemesterRow, activeId);
  }

  async getSemesters(): Promise<Semester[]> {
    const uid = await this.userId();
    const [{ data: rows, error }, activeId] = await Promise.all([
      this.supabase
        .from('semesters')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
      this.readActiveSemesterId(uid),
    ]);
    if (error) throw error;
    return (rows as SemesterRow[]).map((r) => rowToSemester(r, activeId));
  }

  /**
   * Shared by createSemester and the self-healing fallback in
   * activeSemesterId, the latter must not go through the public
   * createSemester (which re-resolves uid via userId()) while already
   * holding it.
   */
  private async createSemesterFor(uid: string, input: NewSemesterInput): Promise<Semester> {
    const label = cleanText(input.label ?? '', 60) || seasonLabel();
    const { data, error } = await this.supabase
      .from('semesters')
      .insert({
        user_id: uid,
        label,
        start_date: cleanOptionalDate(input.startDate ?? null),
        end_date: cleanOptionalDate(input.endDate ?? null),
      })
      .select()
      .single();
    if (error) throw error;
    const created = data as SemesterRow;

    const { error: settingsError } = await this.supabase.from('user_settings').upsert(
      { user_id: uid, active_semester_id: created.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (settingsError) throw settingsError;
    this.rememberSemester(uid, created.id);

    return rowToSemester(created, created.id);
  }

  async createSemester(input: NewSemesterInput): Promise<Semester> {
    const uid = await this.userId();
    return this.createSemesterFor(uid, input);
  }

  async updateSemester(id: string, updates: NewSemesterInput): Promise<Semester> {
    const uid = await this.userId();
    const patch: Record<string, unknown> = {};
    if (updates.label !== undefined) patch.label = cleanText(updates.label ?? '', 60);
    if (updates.startDate !== undefined) patch.start_date = cleanOptionalDate(updates.startDate);
    if (updates.endDate !== undefined) patch.end_date = cleanOptionalDate(updates.endDate);

    const [{ data, error }, activeId] = await Promise.all([
      this.supabase
        .from('semesters')
        .update(patch)
        .eq('id', id)
        .eq('user_id', uid)
        .select()
        .single(),
      this.readActiveSemesterId(uid),
    ]);
    if (error) throw error;
    return rowToSemester(data as SemesterRow, activeId);
  }

  async deleteSemester(id: string): Promise<void> {
    const uid = await this.userId();
    const [{ data: rows, error: semestersError }, activeId] = await Promise.all([
      this.supabase
        .from('semesters')
        .select('id')
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
      this.readActiveSemesterId(uid),
    ]);
    if (semestersError) throw semestersError;

    const semesters = (rows ?? []) as Array<{ id: string }>;
    if (!semesters.some((semester) => semester.id === id)) {
      throw new Error('Semester not found.');
    }
    const nextActive = semesters.find((semester) => semester.id !== id) ?? null;
    if (!nextActive) {
      throw new Error('Start another semester before deleting your only semester.');
    }

    // The schema cascades this delete to the semester's courses, tasks, and
    // sessions. When removing the active semester, preserve a usable active
    // term by switching to the newest remaining one first.
    if (activeId === id) {
      const { error: settingsError } = await this.supabase.from('user_settings').upsert(
        { user_id: uid, active_semester_id: nextActive.id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (settingsError) throw settingsError;
      this.rememberSemester(uid, nextActive.id);
    }

    const { error } = await this.supabase
      .from('semesters')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;
  }

  // ---- Onboarding ----

  async isOnboardingComplete(): Promise<boolean> {
    const uid = await this.userId();
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('onboarding_complete')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    return data?.onboarding_complete ?? false;
  }

  async setOnboardingComplete(): Promise<void> {
    const uid = await this.userId();
    const { error } = await this.supabase.from('user_settings').upsert(
      {
        user_id: uid,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
  }

  // ---- User settings ----

  async getUserSettings(): Promise<UserSettings | null> {
    const uid = await this.userId();
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('display_name, daily_goal_hours, avatar_url')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      displayName: cleanDisplayName(data.display_name ?? ''),
      dailyGoalHours: clampDailyGoalHours(data.daily_goal_hours ?? 4),
      avatarUrl: cleanAvatarUrl(data.avatar_url ?? ''),
    };
  }

  async updateUserSettings(settings: Partial<UserSettings>): Promise<void> {
    const uid = await this.userId();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (settings.displayName !== undefined) patch.display_name = cleanDisplayName(settings.displayName);
    if (settings.dailyGoalHours !== undefined) {
      patch.daily_goal_hours = clampDailyGoalHours(settings.dailyGoalHours);
    }
    if (settings.avatarUrl !== undefined) patch.avatar_url = assertAvatarUrl(settings.avatarUrl);

    const { error } = await this.supabase.from('user_settings').upsert(
      { user_id: uid, ...patch },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
  }

  // ---- Dev / debugging ----

  async resetAll(): Promise<void> {
    const uid = await this.userId();
    // Delete in FK-safe order
    await this.supabase.from('sessions').delete().eq('user_id', uid);
    await this.supabase.from('tasks').delete().eq('user_id', uid);
    await this.supabase.from('courses').delete().eq('user_id', uid);
    await this.supabase.from('semesters').delete().eq('user_id', uid);
    await this.supabase.from('user_settings').delete().eq('user_id', uid);
    // The remembered semester id now names a row that is gone. The next read
    // re-reads, finds nothing, and the self-healing path makes a fresh term.
    this.forgetSemester();
  }

  async deleteAccount(): Promise<void> {
    // A SECURITY DEFINER function in the schema, because removing a row from
    // auth.users is the one thing RLS alone cannot express. It deletes
    // auth.uid() and nothing else, and the FK cascades do the rest.
    const { error } = await this.supabase.rpc('delete_own_account');
    if (error) throw new Error(error.message || 'Could not delete the account.');
    this.forget();
    await this.supabase.auth.signOut();
  }
}
