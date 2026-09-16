import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { readAccessToken } from '@/lib/mcp-auth';
import { mcpSupabase, mcpUrl, siteUrl } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TASKS_PER_REQUEST = 20;
const MAX_TASKS_PER_READ = 100;
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
      description: 'Add extracted readings, assignments, or preparation tasks to exactly one active-semester Akada course. Use find_course first. Only include a due date when the source explicitly gives one; do not invent deadlines. Existing unfinished tasks with the same title and due date are skipped.',
      inputSchema: z.object({
        course_id: z.string().uuid(),
        tasks: z.array(z.object({
          title: z.string().trim().min(1).max(160),
          due_date: z.string().regex(DATE, 'Use YYYY-MM-DD.').nullable().optional(),
          priority: z.enum(['high', 'normal']).default('normal'),
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
          return [{ user_id: token.userId, course_id: course.id, title, due_date: dueDate, priority: task.priority }];
        });
        if (toInsert.length === 0) {
          return result({ course: { id: course.id, code: course.code, name: course.name }, created: [], skipped: tasks.length, message: 'Every task already exists in Akada.' });
        }
        const { data: created, error: insertError } = await supabase
          .from('tasks')
          .insert(toInsert)
          .select('id, title, due_date, priority');
        if (insertError) return queryFailed('create_tasks', 'insert', insertError, 'Akada could not save those tasks.');
        return result({
          course: { id: course.id, code: course.code, name: course.name },
          created: (created ?? []).map((task) => ({ id: task.id, title: task.title, due_date: task.due_date, priority: task.priority })),
          skipped: tasks.length - toInsert.length,
        });
      } catch (cause) {
        return toolCrashed('create_tasks', cause);
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
