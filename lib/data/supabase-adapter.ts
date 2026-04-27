import { createClient } from '@/lib/supabase';
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

// ---- Row → model mappers ----

interface CourseRow {
  id: string;
  code: string;
  name: string;
  color: string;
  tint: string | null;
  weekly_goal_hours: number;
  created_at: string;
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
  due_date: string | null;
  priority: 'high' | 'normal';
  completed: boolean;
  completed_at: string | null;
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
    dueDate: cleanOptionalDate(r.due_date),
    priority: r.priority === 'high' ? 'high' : 'normal',
    completed: Boolean(r.completed),
    completedAt: r.completed_at,
    createdAt: r.created_at,
  };
}

export class SupabaseAdapter implements DataProvider {
  private supabase = createClient();

  private async userId(): Promise<string> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session?.user) return session.user.id;
    
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    return user.id;
  }

  // ---- Courses ----

  async getCourses(): Promise<Course[]> {
    const uid = await this.userId();
    const { data, error } = await this.supabase
      .from('courses')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as CourseRow[]).map(rowToCourse);
  }

  async addCourse(input: Omit<Course, 'id' | 'createdAt'>): Promise<Course> {
    const uid = await this.userId();
    const code = cleanCourseCode(input.code);
    const name = cleanCourseName(input.name);
    if (!code || !name) throw new Error('Course code and name are required');
    const { data, error } = await this.supabase
      .from('courses')
      .insert({
        user_id: uid,
        code,
        name,
        color: cleanText(input.color, 32) || '#A8B89B',
        tint: input.tint ? cleanText(input.tint, 32) : null,
        weekly_goal_hours: clampWeeklyGoalHours(input.weeklyGoalHours),
      })
      .select()
      .single();
    if (error) throw error;
    return rowToCourse(data as CourseRow);
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
    if (updates.tint !== undefined) patch.tint = updates.tint ? cleanText(updates.tint, 32) : null;
    if (updates.weeklyGoalHours !== undefined) {
      patch.weekly_goal_hours = clampWeeklyGoalHours(updates.weeklyGoalHours);
    }

    const { data, error } = await this.supabase
      .from('courses')
      .update(patch)
      .eq('id', id)
      .eq('user_id', uid)
      .select()
      .single();
    if (error) throw error;
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

  async getSessions(filters?: SessionFilters): Promise<Session[]> {
    const uid = await this.userId();
    let query = this.supabase
      .from('sessions')
      .select('*')
      .eq('user_id', uid)
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

  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    const uid = await this.userId();
    let query = this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', uid)
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
        due_date: cleanOptionalDate(input.dueDate),
        priority: input.priority === 'high' ? 'high' : 'normal',
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
    if (updates.dueDate !== undefined) patch.due_date = cleanOptionalDate(updates.dueDate);
    if (updates.priority !== undefined) patch.priority = updates.priority === 'high' ? 'high' : 'normal';
    if (updates.completed !== undefined) {
      patch.completed = updates.completed;
      patch.completed_at = updates.completed ? new Date().toISOString() : null;
    }
    if (updates.completedAt !== undefined) patch.completed_at = updates.completedAt;

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

  // ---- Semester ----

  async getSemester(): Promise<Semester | null> {
    const uid = await this.userId();
    const { data, error } = await this.supabase
      .from('semesters')
      .select('start_date, end_date')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      startDate: data.start_date,
      endDate: data.end_date,
    };
  }

  async setSemester(semester: Semester): Promise<void> {
    const uid = await this.userId();
    const { error } = await this.supabase.from('semesters').upsert(
      {
        user_id: uid,
        start_date: semester.startDate,
        end_date: semester.endDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
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
    if (settings.avatarUrl !== undefined) patch.avatar_url = cleanAvatarUrl(settings.avatarUrl);

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
  }
}
