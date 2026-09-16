import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { readAccessToken } from '@/lib/mcp-auth';
import { MAX_SESSION_SECONDS } from '@/lib/session-safety';
import { SESSION_NOTE_MAX } from '@/lib/planner-safety';
import { isoDate, startOfWeek, endOfWeek } from '@/lib/utils';
import { mcpSupabase, mcpUrl, siteUrl } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TASKS_PER_REQUEST = 20;
const MAX_TASKS_PER_READ = 100;
// The same ceilings lib/data/supabase-adapter.ts sanitizeSubtasks enforces on
// the app's own writes, so a task built here and a task built in the sheet
// cannot differ in shape.
const MAX_SUBTASKS_PER_TASK = 50;
const MAX_SUBTASK_TITLE = 300;
const MAX_DESCRIPTION = 5000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// This is deliberately independent of optional app-migration columns. MCP
// must continue to read a student's tasks while a deployment is rolling out
// (or when an existing project has not yet applied a newer schema.sql).
const TaskReadSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  subtasks: z.array(z.object({ id: z.string(), title: z.string(), completed: z.boolean() })),
  due_date: z.string().nullable(),
  priority: z.enum(['high', 'normal']),
  completed: z.boolean(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  course: z.object({ id: z.string(), code: z.string(), name: z.string() }),
});

const TasksReadResponseSchema = z.object({
  schema_version: z.literal('akada.tasks.v1'),
  tasks: z.array(TaskReadSchema),
  meta: z.object({ include_completed: z.boolean(), course_id: z.string().nullable(), count: z.number().int() }),
  message: z.string().optional(),
});

type TaskRead = z.infer<typeof TaskReadSchema>;

type AuthenticatedToken = ReturnType<typeof readAccessToken>;

// Shape of a Supabase/PostgREST failure. Not imported from supabase-js
// because these tools also funnel plain Errors through the same reporting.
type QueryFailure = { message?: string; code?: string; details?: string; hint?: string } | null;

function result(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

// Every tool used to collapse a database failure into one generic sentence,
// which is the reason a single broken query took three rounds to diagnose.
// `queryFailed` puts the real cause in the runtime log and a short, safe
// reason in the tool's reply. Never include `details` in the reply: PostgREST
// puts row values in there. Codes, messages and hints are schema-level only.
function describe(error: QueryFailure) {
  return [error?.code, error?.message, error?.hint].filter(Boolean).join(' | ');
}

function queryFailed(tool: string, step: string, error: QueryFailure, message: string) {
  console.error(`[mcp:${tool}] ${step} failed`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
  const reason = describe(error);
  return toolError(reason ? `${message} (${reason})` : message);
}

// Same idea for the outer catch. A thrown error here is almost always a
// missing env var or an expired session, but "almost always" is what made
// the last three guesses expensive.
function toolCrashed(tool: string, cause: unknown) {
  const reason = cause instanceof Error ? cause.message : String(cause ?? '');
  console.error(`[mcp:${tool}] unhandled failure`, reason);
  const suffix = reason ? ` (${reason})` : '';
  return toolError(`Akada is not configured or your session has expired. Reconnect the connector and try again.${suffix}`);
}

async function activeSemesterId(token: AuthenticatedToken) {
  const supabase = mcpSupabase(token.supabaseAccessToken);
  const { data, error } = await supabase
    .from('user_settings')
    .select('active_semester_id')
    .eq('user_id', token.userId)
    .maybeSingle();
  // Carry the cause up rather than flattening it: the outer catch logs it.
  if (error) throw new Error(`Akada could not load your active semester. ${describe(error)}`);
  return data?.active_semester_id as string | null;
}

function readSubtasks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { id?: unknown; title?: unknown; completed?: unknown };
    return typeof row.id === 'string' && typeof row.title === 'string'
      ? [{ id: row.id, title: row.title, completed: Boolean(row.completed) }]
      : [];
  });
}

// The write side of the same document. Callers send plain strings, because a
// model asked for `{ id, title, completed }` invents ids that then have to be
// thrown away: a new task's pieces are always unticked, and the id only has to
// be unique inside one task's array, which is what the sheet's own
// `s-<timestamp>` ids are. The index keeps two pieces written in the same
// millisecond apart. Duplicate titles within one task collapse, the way two
// identical rows on a handwritten list would have been one.
function buildSubtasks(pieces: (string | { title: string; completed?: boolean })[] | undefined) {
  const seen = new Set<string>();
  const stamp = Date.now().toString(36);
  return (pieces ?? []).flatMap((piece, index) => {
    const raw = typeof piece === 'string' ? piece : piece.title;
    const title = raw.trim().replace(/\s+/g, ' ');
    if (!title || seen.has(normalize(title))) return [];
    seen.add(normalize(title));
    const completed = typeof piece === 'string' ? false : Boolean(piece.completed);
    return [{ id: `s-${stamp}-${index}`, title, completed }];
  });
}

// Both write tools that take task ids have to answer the same question first:
// is every one of these a task the signed-in student owns, in the semester
// they are actually studying? Ownership alone is not enough, because a task
// from a past semester is not something a connector should be reaching into.
// Checked by the owning course rather than tasks.semester_id, which is a
// denormalized column an un-migrated project may not have filled yet.
async function loadOwnTasks(tool: string, token: AuthenticatedToken, ids: string[]) {
  const semesterId = await activeSemesterId(token);
  if (!semesterId) return { ok: false, error: toolError('No active semester is set in Akada.') } as const;
  const supabase = mcpSupabase(token.supabaseAccessToken);
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, code, name')
    .eq('user_id', token.userId)
    .eq('semester_id', semesterId);
  if (coursesError) return { ok: false, error: queryFailed(tool, 'courses read', coursesError, 'Akada could not load courses.') } as const;
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', token.userId)
    .in('id', ids);
  if (error) return { ok: false, error: queryFailed(tool, 'tasks read', error, 'Akada could not load those tasks.') } as const;
  const allowed = new Map((courses ?? []).map((course) => [course.id, course]));
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((task) => allowed.has(task.course_id as string));
  const found = new Set(rows.map((task) => String(task.id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return { ok: false, error: toolError(`${missing.length === ids.length ? 'No' : 'Not every'} task in that request is in your active Akada semester. Read your tasks again with get_tasks and use the ids it returns.`) } as const;
  }
  return { ok: true, supabase, courses: allowed, tasks: rows } as const;
}

// Due date first with undated tasks last, newest first inside a date. This
// used to be a two-key PostgREST `order` string plus `limit`, which made the
// MCP request shape diverge from the app's proven task read for no gain.
// A hundred rows sort in microseconds; keep the query boring.
function byDueDate(a: TaskRead, b: TaskRead) {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  if (a.created_at === b.created_at) return 0;
  return a.created_at < b.created_at ? 1 : -1;
}

function createServer(token: AuthenticatedToken) {
  const server = new McpServer({ name: 'Akada', version: '1.0.0' });

  server.registerTool(
    'find_course',
    {
      title: 'Find an Akada course',
      description: 'Find one of the signed-in student’s courses in the active semester before creating tasks. Search by code or course name. If more than one course matches, ask the student which one they mean.',
      inputSchema: z.object({ query: z.string().trim().min(1).max(120) }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      try {
        const semesterId = await activeSemesterId(token);
        if (!semesterId) return result({ courses: [], message: 'No active semester is set in Akada.' });
        const { data, error } = await mcpSupabase(token.supabaseAccessToken)
          .from('courses')
          .select('id, code, name, credits, weekly_goal_hours')
          .eq('user_id', token.userId)
          .eq('semester_id', semesterId)
          .order('code');
        if (error) return queryFailed('find_course', 'courses read', error, 'Akada could not load courses.');
        const needle = normalize(query);
        const courses = (data ?? [])
          .filter((course) => normalize(`${course.code} ${course.name}`).includes(needle))
          .slice(0, 8)
          .map((course) => ({
            id: course.id,
            code: course.code,
            name: course.name,
            credits: course.credits ?? 4,
            weekly_study_goal_hours: Number(course.weekly_goal_hours),
          }));
        return result({ courses });
      } catch (cause) {
        return toolCrashed('find_course', cause);
      }
    },
  );

  server.registerTool(
    'get_tasks',
    {
      title: 'Read Akada tasks',
      description: 'Read the signed-in student’s active-semester tasks. Optionally narrow to a course or include completed tasks. This tool never changes Akada data.',
      inputSchema: z.object({
        course_id: z.string().uuid().optional(),
        include_completed: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ course_id, include_completed }) => {
      try {
        const semesterId = await activeSemesterId(token);
        if (!semesterId) return result(TasksReadResponseSchema.parse({
          schema_version: 'akada.tasks.v1', tasks: [], meta: { include_completed, course_id: course_id ?? null, count: 0 }, message: 'No active semester is set in Akada.',
        }));
        const supabase = mcpSupabase(token.supabaseAccessToken);
        const { data: courses, error: courseError } = await supabase
          .from('courses')
          .select('id, code, name')
          .eq('user_id', token.userId)
          .eq('semester_id', semesterId);
        if (courseError) return queryFailed('get_tasks', 'courses read', courseError, 'Akada could not load courses.');
        const allowed = new Map((courses ?? []).map((course) => [course.id, course]));
        if (course_id && !allowed.has(course_id)) return toolError('That course is not available in your active Akada semester.');
        // Deliberately the same request shape the app itself uses
        // (lib/data/supabase-adapter.ts listTasks): `select('*')` scoped by
        // user and semester, no PostgREST ordering, no limit. Two earlier
        // attempts at a cleverer query failed in production and could not be
        // told apart, because a named column list breaks outright on a
        // project whose schema.sql predates that column, while `*` simply
        // returns what exists. Sorting and capping happen below.
        let query = supabase
          .from('tasks')
          .select('*')
          .eq('user_id', token.userId)
          .eq('semester_id', semesterId);
        if (course_id) query = query.eq('course_id', course_id);
        if (!include_completed) query = query.eq('completed', false);
        const { data, error } = await query;
        if (error) return queryFailed('get_tasks', 'tasks read', error, 'Akada could not load tasks.');
        const rows = (data ?? []) as Record<string, unknown>[];
        const tasks: TaskRead[] = rows
          .flatMap((task) => {
            const course = allowed.get(task.course_id as string);
            if (!course) return [];
            return [{
              id: String(task.id),
              title: String(task.title ?? ''),
              // `description` and `subtasks` are additive columns. Reading
              // with `*` means an un-migrated project yields undefined here
              // instead of failing the whole tool.
              description: typeof task.description === 'string' ? task.description : '',
              subtasks: readSubtasks(task.subtasks),
              due_date: (task.due_date as string | null) ?? null,
              priority: task.priority === 'high' ? ('high' as const) : ('normal' as const),
              completed: Boolean(task.completed),
              completed_at: (task.completed_at as string | null) ?? null,
              created_at: String(task.created_at),
              course: { id: course.id, code: course.code, name: course.name },
            }];
          })
          .sort(byDueDate)
          .slice(0, MAX_TASKS_PER_READ);
        return result(TasksReadResponseSchema.parse({
          schema_version: 'akada.tasks.v1',
          tasks,
          meta: { include_completed, course_id: course_id ?? null, count: tasks.length },
        }));
      } catch (cause) {
        return toolCrashed('get_tasks', cause);
      }
    },
  );

  server.registerTool(
    'get_overview',
    {
      title: 'Read Akada study overview',
      description: 'Read a compact, read-only snapshot of active-semester courses, open-task counts, and recent study sessions for the signed-in student.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const semesterId = await activeSemesterId(token);
        if (!semesterId) return result({ courses: [], recent_sessions: [], message: 'No active semester is set in Akada.' });
        const supabase = mcpSupabase(token.supabaseAccessToken);
        const [{ data: courses, error: coursesError }, { data: tasks, error: tasksError }, { data: sessions, error: sessionsError }] = await Promise.all([
          supabase.from('courses').select('id, code, name, weekly_goal_hours').eq('user_id', token.userId).eq('semester_id', semesterId).order('code'),
          supabase.from('tasks').select('course_id, completed').eq('user_id', token.userId).eq('semester_id', semesterId),
          supabase.from('sessions').select('course_id, date, duration_seconds, note').eq('user_id', token.userId).eq('semester_id', semesterId).order('date', { ascending: false }).limit(12),
        ]);
        const overviewError = coursesError ?? tasksError ?? sessionsError;
        if (overviewError) {
          const step = coursesError ? 'courses read' : tasksError ? 'tasks read' : 'sessions read';
          return queryFailed('get_overview', step, overviewError, 'Akada could not load the study overview.');
        }
        const openByCourse = new Map<string, number>();
        (tasks ?? []).filter((task) => !task.completed).forEach((task) => openByCourse.set(task.course_id, (openByCourse.get(task.course_id) ?? 0) + 1));
        const courseById = new Map((courses ?? []).map((course) => [course.id, course]));
        return result({
          courses: (courses ?? []).map((course) => ({ id: course.id, code: course.code, name: course.name, weekly_study_goal_hours: Number(course.weekly_goal_hours), open_task_count: openByCourse.get(course.id) ?? 0 })),
          recent_sessions: (sessions ?? []).map((session) => ({ date: session.date, duration_seconds: session.duration_seconds, note: session.note, course: courseById.get(session.course_id) ?? null })),
        });
      } catch (cause) {
        return toolCrashed('get_overview', cause);
      }
    },
  );

  server.registerTool(
    'create_tasks',
    {
      title: 'Add study tasks to Akada',
      description: 'Add extracted readings, assignments, or preparation tasks to exactly one active-semester Akada course. Use find_course first. Only include a due date when the source explicitly gives one; do not invent deadlines. A task that the source breaks into steps can carry those steps as `subtasks`, which the student ticks off inside the task; use them for the real pieces of one piece of work, not as a way to add several unrelated tasks at once. `description` holds notes that belong with the task, such as the instructions or what the source said about it. Existing unfinished tasks with the same title and due date are skipped.',
      inputSchema: z.object({
        course_id: z.string().uuid(),
        tasks: z.array(z.object({
          title: z.string().trim().min(1).max(160),
          due_date: z.string().regex(DATE, 'Use YYYY-MM-DD.').nullable().optional(),
          priority: z.enum(['high', 'normal']).default('normal'),
          description: z.string().trim().max(MAX_DESCRIPTION).optional(),
          subtasks: z.array(z.string().trim().min(1).max(MAX_SUBTASK_TITLE)).max(MAX_SUBTASKS_PER_TASK).optional(),
        })).min(1).max(MAX_TASKS_PER_REQUEST),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ course_id, tasks }) => {
      try {
        const semesterId = await activeSemesterId(token);
        if (!semesterId) return toolError('No active semester is set in Akada.');
        const supabase = mcpSupabase(token.supabaseAccessToken);
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, code, name')
          .eq('id', course_id)
          .eq('user_id', token.userId)
          .eq('semester_id', semesterId)
          .maybeSingle();
        // A missing row and a failed query are different problems. Only the
        // second one has a cause worth reporting.
        if (courseError) return queryFailed('create_tasks', 'course lookup', courseError, 'Akada could not look up that course.');
        if (!course) return toolError('That course is not available in your active Akada semester. Find the course again first.');

        const { data: existing, error: existingError } = await supabase
          .from('tasks')
          .select('title, due_date')
          .eq('course_id', course.id)
          .eq('user_id', token.userId)
          .eq('completed', false);
        if (existingError) return queryFailed('create_tasks', 'duplicate check', existingError, 'Akada could not check your existing tasks.');

        const existingKeys = new Set((existing ?? []).map((task) => `${normalize(task.title)}|${task.due_date ?? ''}`));
        const seen = new Set<string>();
        const toInsert = tasks.flatMap((task) => {
          const title = task.title.trim().replace(/\s+/g, ' ');
          const dueDate = task.due_date ?? null;
          const taskKey = `${normalize(title)}|${dueDate ?? ''}`;
          if (existingKeys.has(taskKey) || seen.has(taskKey)) return [];
          seen.add(taskKey);
          return [{
            user_id: token.userId,
            course_id: course.id,
            title,
            due_date: dueDate,
            priority: task.priority,
            description: (task.description ?? '').trim(),
            subtasks: buildSubtasks(task.subtasks),
          }];
        });
        // `description` and `subtasks` are additive columns, so naming one is
        // what would break an insert on a project whose schema.sql predates
        // it. Drop a key from every row when nothing in the request uses it,
        // and a deployment mid-rollout keeps creating plain tasks exactly as
        // before; only a request that genuinely needs the column hits the
        // error that says so. Uniformly present or uniformly absent across the
        // batch, never mixed: PostgREST writes NULL for a key some rows omit,
        // and both columns are `not null`.
        if (toInsert.length === 0) {
          return result({ course: { id: course.id, code: course.code, name: course.name }, created: [], skipped: tasks.length, message: 'Every task already exists in Akada.' });
        }
        const withNotes = toInsert.some((row) => row.description.length > 0);
        const withSubtasks = toInsert.some((row) => row.subtasks.length > 0);
        const rowsToInsert = toInsert.map(({ description, subtasks, ...task }) => ({
          ...task,
          ...(withNotes ? { description } : {}),
          ...(withSubtasks ? { subtasks } : {}),
        }));
        const { data: created, error: insertError } = await supabase
          .from('tasks')
          .insert(rowsToInsert)
          // `*` rather than a column list for the same reason get_tasks reads
          // that way: `subtasks` is only there once schema.sql has been re-run,
          // and naming it in the returning clause would fail the whole insert
          // on a project that has not.
          .select('*');
        if (insertError) return queryFailed('create_tasks', 'insert', insertError, 'Akada could not save those tasks.');
        return result({
          course: { id: course.id, code: course.code, name: course.name },
          created: ((created ?? []) as Record<string, unknown>[]).map((task) => ({
            id: String(task.id),
            title: String(task.title ?? ''),
            due_date: (task.due_date as string | null) ?? null,
            priority: task.priority === 'high' ? ('high' as const) : ('normal' as const),
            description: typeof task.description === 'string' ? task.description : '',
            subtasks: readSubtasks(task.subtasks),
          })),
          skipped: tasks.length - toInsert.length,
        });
      } catch (cause) {
        return toolCrashed('create_tasks', cause);
      }
    },
  );

  server.registerTool(
    'update_tasks',
    {
      title: 'Change study tasks in Akada',
      description: 'Change tasks that already exist in the signed-in student’s active semester. Read the tasks with get_tasks first and pass the ids it returns. Only the fields you name are changed; everything you leave out keeps its current value. `description` is the notes that sit with the task, and passing it replaces the existing notes, so include what should be kept. `subtasks` likewise replaces the whole list of pieces, so send every piece the task should end up with, carrying over the ones already ticked. To only tick a task off, prefer complete_tasks.',
      inputSchema: z.object({
        tasks: z.array(z.object({
          task_id: z.string().uuid(),
          title: z.string().trim().min(1).max(160).optional(),
          due_date: z.string().regex(DATE, 'Use YYYY-MM-DD.').nullable().optional(),
          priority: z.enum(['high', 'normal']).optional(),
          description: z.string().trim().max(MAX_DESCRIPTION).optional(),
          subtasks: z.array(z.object({
            title: z.string().trim().min(1).max(MAX_SUBTASK_TITLE),
            completed: z.boolean().default(false),
          })).max(MAX_SUBTASKS_PER_TASK).optional(),
          completed: z.boolean().optional(),
        })).min(1).max(MAX_TASKS_PER_REQUEST),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ tasks }) => {
      try {
        const ids = [...new Set(tasks.map((task) => task.task_id))];
        const owned = await loadOwnTasks('update_tasks', token, ids);
        if (!owned.ok) return owned.error;

        // One statement per task, because each carries a different patch, and
        // in request order so a reply reads the way the request was written.
        // Twenty round-trips at worst, which is the same ceiling create_tasks
        // already accepts for a syllabus.
        const updated: Record<string, unknown>[] = [];
        for (const task of tasks) {
          const patch: Record<string, unknown> = {};
          if (task.title !== undefined) patch.title = task.title.trim().replace(/\s+/g, ' ');
          if (task.due_date !== undefined) patch.due_date = task.due_date;
          if (task.priority !== undefined) patch.priority = task.priority;
          if (task.description !== undefined) patch.description = task.description;
          if (task.subtasks !== undefined) patch.subtasks = buildSubtasks(task.subtasks);
          if (task.completed !== undefined) {
            patch.completed = task.completed;
            // Written here rather than left to the app, so a task ticked off
            // through the connector still lands on the right day in Stats.
            patch.completed_at = task.completed ? new Date().toISOString() : null;
          }
          if (Object.keys(patch).length === 0) continue;
          const { data, error } = await owned.supabase
            .from('tasks')
            .update(patch)
            .eq('id', task.task_id)
            .eq('user_id', token.userId)
            .select('*')
            .maybeSingle();
          if (error) return queryFailed('update_tasks', 'task update', error, 'Akada could not change that task.');
          if (data) updated.push(data as Record<string, unknown>);
        }
        if (updated.length === 0) return toolError('That request named no change to make. Include at least one field to change on a task.');
        return result({
          updated: updated.map((task) => {
            const course = owned.courses.get(task.course_id as string);
            return {
              id: String(task.id),
              title: String(task.title ?? ''),
              due_date: (task.due_date as string | null) ?? null,
              priority: task.priority === 'high' ? ('high' as const) : ('normal' as const),
              description: typeof task.description === 'string' ? task.description : '',
              subtasks: readSubtasks(task.subtasks),
              completed: Boolean(task.completed),
              course: course ? { id: course.id, code: course.code, name: course.name } : null,
            };
          }),
        });
      } catch (cause) {
        return toolCrashed('update_tasks', cause);
      }
    },
  );

  server.registerTool(
    'complete_tasks',
    {
      title: 'Tick Akada tasks off',
      description: 'Mark tasks in the signed-in student’s active semester as done, or put them back on the list with completed: false. Read the tasks with get_tasks first and pass the ids it returns. Ticking a task off is what feeds the student’s week in Stats, so only do it for work the student says is actually finished.',
      inputSchema: z.object({
        task_ids: z.array(z.string().uuid()).min(1).max(MAX_TASKS_PER_REQUEST),
        completed: z.boolean().default(true),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ task_ids, completed }) => {
      try {
        const ids = [...new Set(task_ids)];
        const owned = await loadOwnTasks('complete_tasks', token, ids);
        if (!owned.ok) return owned.error;
        const { data, error } = await owned.supabase
          .from('tasks')
          .update({ completed, completed_at: completed ? new Date().toISOString() : null })
          .in('id', ids)
          .eq('user_id', token.userId)
          .select('*');
        if (error) return queryFailed('complete_tasks', 'tasks update', error, 'Akada could not change those tasks.');
        return result({
          completed,
          tasks: ((data ?? []) as Record<string, unknown>[]).map((task) => {
            const course = owned.courses.get(task.course_id as string);
            return {
              id: String(task.id),
              title: String(task.title ?? ''),
              due_date: (task.due_date as string | null) ?? null,
              completed: Boolean(task.completed),
              completed_at: (task.completed_at as string | null) ?? null,
              course: course ? { id: course.id, code: course.code, name: course.name } : null,
            };
          }),
        });
      } catch (cause) {
        return toolCrashed('complete_tasks', cause);
      }
    },
  );

  server.registerTool(
    'log_study_session',
    {
      title: 'Log study time in Akada',
      description: 'Record time the student actually spent studying one active-semester course, optionally against a specific task, with a note about what the sitting covered. Only log time the student reports; never estimate it. `date` defaults to today and takes a past date for a sitting being written up after the fact.',
      inputSchema: z.object({
        course_id: z.string().uuid(),
        duration_minutes: z.number().int().min(1).max(Math.floor(MAX_SESSION_SECONDS / 60)),
        date: z.string().regex(DATE, 'Use YYYY-MM-DD.').optional(),
        task_id: z.string().uuid().optional(),
        note: z.string().trim().max(SESSION_NOTE_MAX).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ course_id, duration_minutes, date, task_id, note }) => {
      try {
        const semesterId = await activeSemesterId(token);
        if (!semesterId) return toolError('No active semester is set in Akada.');
        const supabase = mcpSupabase(token.supabaseAccessToken);
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, code, name')
          .eq('id', course_id)
          .eq('user_id', token.userId)
          .eq('semester_id', semesterId)
          .maybeSingle();
        if (courseError) return queryFailed('log_study_session', 'course lookup', courseError, 'Akada could not look up that course.');
        if (!course) return toolError('That course is not available in your active Akada semester. Find the course again first.');

        // A task from another course would be accepted by the database and
        // then read back as time spent on the wrong thing, because
        // sessions.task_id is only `on delete set null` and nothing ties the
        // pair together. Checked here rather than trusted.
        if (task_id) {
          const owned = await loadOwnTasks('log_study_session', token, [task_id]);
          if (!owned.ok) return owned.error;
          const task = owned.tasks[0];
          if (String(task.course_id) !== course.id) {
            return toolError('That task belongs to a different course. Log the session against the task’s own course, or leave task_id out.');
          }
        }

        const { data: session, error: insertError } = await supabase
          .from('sessions')
          .insert({
            user_id: token.userId,
            course_id: course.id,
            task_id: task_id ?? null,
            // The server clock is UTC, which is a day boundary the student
            // does not live in. Their own date wins whenever they give one.
            date: date ?? isoDate(new Date()),
            duration_seconds: duration_minutes * 60,
            note: note ?? '',
          })
          // The semester_id column is filled by schema.sql's
          // sessions_set_semester_id trigger, exactly as the app's own
          // addSession relies on. `*` for the same reason as everywhere else
          // here: an un-migrated project still answers.
          .select('*');
        if (insertError) return queryFailed('log_study_session', 'insert', insertError, 'Akada could not save that study session.');
        const row = ((session ?? []) as Record<string, unknown>[])[0] ?? {};
        return result({
          session: {
            id: String(row.id ?? ''),
            date: (row.date as string | null) ?? null,
            duration_minutes: Math.round(Number(row.duration_seconds ?? 0) / 60),
            duration_seconds: Number(row.duration_seconds ?? 0),
            note: typeof row.note === 'string' ? row.note : '',
            task_id: (row.task_id as string | null) ?? null,
            course: { id: course.id, code: course.code, name: course.name },
          },
        });
      } catch (cause) {
        return toolCrashed('log_study_session', cause);
      }
    },
  );

  server.registerTool(
    'get_weekly_stats',
    {
      title: 'Read an Akada study week',
      description: 'Read how one week went: hours logged per course against each course’s weekly goal, tasks ticked off, and the student’s current run of consecutive studied days. `week_offset` is 0 for this week, -1 for last week. This tool never changes Akada data.',
      inputSchema: z.object({
        week_offset: z.number().int().min(-12).max(0).default(0),
        course_id: z.string().uuid().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ week_offset, course_id }) => {
      try {
        const semesterId = await activeSemesterId(token);
        if (!semesterId) return result({ courses: [], message: 'No active semester is set in Akada.' });
        const supabase = mcpSupabase(token.supabaseAccessToken);
        // Monday-first, the same week the app's own weekBounds draws, so a
        // number read here and a number read on the Stats screen agree.
        const anchor = new Date();
        anchor.setDate(anchor.getDate() + week_offset * 7);
        const from = isoDate(startOfWeek(anchor));
        const to = isoDate(endOfWeek(anchor));

        const { data: courses, error: coursesError } = await supabase
          .from('courses')
          .select('id, code, name, weekly_goal_hours')
          .eq('user_id', token.userId)
          .eq('semester_id', semesterId)
          .order('code');
        if (coursesError) return queryFailed('get_weekly_stats', 'courses read', coursesError, 'Akada could not load courses.');
        if (course_id && !(courses ?? []).some((course) => course.id === course_id)) {
          return toolError('That course is not available in your active Akada semester.');
        }

        // The streak needs days before this week, so sessions are read over a
        // wider window than the week being reported and filtered twice.
        const streakFloor = new Date();
        streakFloor.setDate(streakFloor.getDate() - 120);
        const [{ data: sessions, error: sessionsError }, { data: tasks, error: tasksError }] = await Promise.all([
          supabase
            .from('sessions')
            .select('course_id, date, duration_seconds, note')
            .eq('user_id', token.userId)
            .eq('semester_id', semesterId)
            .gte('date', isoDate(streakFloor)),
          supabase
            .from('tasks')
            .select('course_id, title, completed, completed_at')
            .eq('user_id', token.userId)
            .eq('semester_id', semesterId)
            .eq('completed', true),
        ]);
        const readError = sessionsError ?? tasksError;
        if (readError) {
          return queryFailed('get_weekly_stats', sessionsError ? 'sessions read' : 'tasks read', readError, 'Akada could not load that week.');
        }

        const inWeek = (sessions ?? []).filter((session) => session.date >= from && session.date <= to);
        const scoped = course_id ? inWeek.filter((session) => session.course_id === course_id) : inWeek;
        const secondsByCourse = new Map<string, number>();
        scoped.forEach((session) => {
          secondsByCourse.set(session.course_id, (secondsByCourse.get(session.course_id) ?? 0) + Number(session.duration_seconds ?? 0));
        });

        // A day counts once, however many sittings it held. Today not having
        // been studied yet does not break a run that is otherwise intact, so
        // the count is allowed to start at yesterday.
        const studied = new Set((sessions ?? []).map((session) => session.date));
        const cursor = new Date();
        if (!studied.has(isoDate(cursor))) cursor.setDate(cursor.getDate() - 1);
        let streak = 0;
        while (studied.has(isoDate(cursor)) && streak < 365) {
          streak += 1;
          cursor.setDate(cursor.getDate() - 1);
        }

        const closed = (tasks ?? []).filter((task) => {
          const day = typeof task.completed_at === 'string' ? task.completed_at.slice(0, 10) : '';
          if (day < from || day > to) return false;
          return !course_id || task.course_id === course_id;
        });

        const perCourse = (courses ?? [])
          .filter((course) => !course_id || course.id === course_id)
          .map((course) => {
            const seconds = secondsByCourse.get(course.id) ?? 0;
            const goalHours = Number(course.weekly_goal_hours);
            return {
              id: course.id,
              code: course.code,
              name: course.name,
              hours_logged: Math.round((seconds / 3600) * 100) / 100,
              weekly_study_goal_hours: goalHours,
              goal_met: goalHours > 0 ? seconds >= goalHours * 3600 : null,
            };
          });

        return result({
          week: { from, to, offset: week_offset },
          courses: perCourse,
          totals: {
            hours_logged: Math.round((scoped.reduce((sum, session) => sum + Number(session.duration_seconds ?? 0), 0) / 3600) * 100) / 100,
            session_count: scoped.length,
            tasks_completed: closed.length,
          },
          tasks_completed: closed.map((task) => ({ title: task.title, course_id: task.course_id })),
          studied_day_streak: streak,
        });
      } catch (cause) {
        return toolCrashed('get_weekly_stats', cause);
      }
    },
  );

  server.registerTool(
    'delete_course',
    {
      title: 'Delete an Akada course',
      description: 'Permanently delete a course from the student’s active Akada semester by course_id. Also deletes all associated tasks and study sessions. Only call this when the student explicitly requests deleting the course.',
      inputSchema: z.object({
        course_id: z.string().uuid(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ course_id }) => {
      try {
        const semesterId = await activeSemesterId(token);
        if (!semesterId) return toolError('No active semester is set in Akada.');
        const supabase = mcpSupabase(token.supabaseAccessToken);
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, code, name')
          .eq('id', course_id)
          .eq('user_id', token.userId)
          .eq('semester_id', semesterId)
          .maybeSingle();
        if (courseError) return queryFailed('delete_course', 'course lookup', courseError, 'Akada could not look up that course.');
        if (!course) {
          return toolError('That course is not available in your active Akada semester. Find the course again first.');
        }

        const { error: sessionsError } = await supabase
          .from('sessions')
          .delete()
          .eq('course_id', course.id)
          .eq('user_id', token.userId);
        if (sessionsError) return queryFailed('delete_course', 'sessions delete', sessionsError, 'Akada could not remove study sessions for this course.');

        const { error: tasksError } = await supabase
          .from('tasks')
          .delete()
          .eq('course_id', course.id)
          .eq('user_id', token.userId);
        if (tasksError) return queryFailed('delete_course', 'tasks delete', tasksError, 'Akada could not remove tasks for this course.');

        const { error: deleteError } = await supabase
          .from('courses')
          .delete()
          .eq('id', course.id)
          .eq('user_id', token.userId)
          .eq('semester_id', semesterId);
        if (deleteError) return queryFailed('delete_course', 'course delete', deleteError, 'Akada could not delete that course.');

        return result({
          deleted: true,
          course: {
            id: course.id,
            code: course.code,
            name: course.name,
          },
          message: `Deleted course ${course.code} (${course.name}) and all associated tasks and study sessions.`,
        });
      } catch (cause) {
        return toolCrashed('delete_course', cause);
      }
    },
  );

  return server;
}

const handler = createMcpHandler(
  ({ authInfo }) => {
    if (!authInfo) throw new Error('Missing MCP authentication.');
    return createServer(readAccessToken(authInfo.token));
  },
  { responseMode: 'json' },
);

async function authenticate(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const token = readAccessToken(match[1]);
    const { data, error } = await mcpSupabase(token.supabaseAccessToken).auth.getUser();
    // A 401 from here is indistinguishable from a malformed bearer token
    // once it reaches the client, so say which one it was in the log. No ids
    // or token material, only the reason.
    if (error) {
      console.error('[mcp:auth] supabase session rejected', error.message);
      return null;
    }
    if (data.user?.id !== token.userId) {
      console.error('[mcp:auth] token subject does not match the supabase session');
      return null;
    }
    return { token: match[1], payload: token };
  } catch (cause) {
    console.error('[mcp:auth] bearer token could not be read', cause instanceof Error ? cause.message : cause);
    return null;
  }
}

function unauthorized() {
  return Response.json(
    { error: 'Unauthorized' },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
        'WWW-Authenticate': `Bearer resource_metadata="${siteUrl()}/.well-known/oauth-protected-resource/mcp"`,
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();
  return handler.fetch(request, {
    authInfo: {
      token: auth.token,
      clientId: auth.payload.clientId,
      scopes: auth.payload.scope.split(/\s+/).filter(Boolean),
      expiresAt: auth.payload.exp,
      resource: new URL(mcpUrl()),
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
}
