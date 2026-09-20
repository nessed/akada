import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { readAccessToken } from '@/lib/mcp-auth';
import { MAX_SESSION_SECONDS } from '@/lib/session-safety';
import { SESSION_NOTE_MAX } from '@/lib/planner-safety';
import { isoDate, startOfWeek, endOfWeek } from '@/lib/utils';
import { readCredit } from '@/lib/progression/credit';
import { readRuns } from '@/lib/progression/runs';
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
// The same ceilings lib/planner-safety.ts sanitizeAssessments and
// sanitizeGrading enforce on the app's own writes, so a scheme parsed here
// and a scheme typed into the card cannot differ in shape.
const MAX_COMPONENTS = 40;
const MAX_DROP_RULES = 20;
const MAX_GRADING_NOTE = 600;
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

/**
 * One course of the student's, in their active semester, or a refusal.
 *
 * The grading tools address a single course by id, so they need the same
 * ownership check the task tools get from loadOwnTasks but without loading
 * any tasks. `select('*')` because `grading` is an optional migration column:
 * naming it would make every grading call fail outright against a project
 * that has not applied the newer schema.sql, instead of simply reading no
 * scheme.
 */
async function loadOwnCourse(tool: string, token: AuthenticatedToken, courseId: string) {
  const semesterId = await activeSemesterId(token);
  if (!semesterId) return { ok: false, error: toolError('No active semester is set in Akada.') } as const;
  const supabase = mcpSupabase(token.supabaseAccessToken);
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .eq('user_id', token.userId)
    .eq('semester_id', semesterId)
    .maybeSingle();
  if (error) return { ok: false, error: queryFailed(tool, 'course lookup', error, 'Akada could not look up that course.') } as const;
  if (!data) {
    return { ok: false, error: toolError('That course is not in your active Akada semester. Find the course again with find_course and use the id it returns.') } as const;
  }
  const row = data as Record<string, unknown>;
  return {
    ok: true,
    supabase,
    course: {
      id: String(row.id),
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      assessments: row.assessments,
      grading: row.grading,
    },
  } as const;
}

type GradingRead = {
  basis: 'absolute' | 'relative' | null;
  dropRules: { group: string; keep: number }[];
  pending: {
    assessments: Record<string, unknown>[];
    basis: 'absolute' | 'relative';
    dropRules: { group: string; keep: number }[];
    note: string;
    source: string;
    createdAt: string;
  } | null;
};

/**
 * The grading column, read defensively.
 *
 * Deliberately not importing lib/planner-safety.ts sanitizeGrading: that one
 * is shaped for the app's camelCase model, while this route speaks to the
 * database directly and has to survive the column being absent entirely on a
 * project that has not applied the newer schema.sql.
 */
function readGrading(value: unknown): GradingRead {
  const empty: GradingRead = { basis: null, dropRules: [], pending: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
  const row = value as Record<string, unknown>;
  const basis = row.basis === 'relative' || row.basis === 'absolute' ? row.basis : null;
  const pendingRow =
    row.pending && typeof row.pending === 'object' && !Array.isArray(row.pending)
      ? (row.pending as Record<string, unknown>)
      : null;
  return {
    basis,
    dropRules: readDropRules(row.dropRules),
    pending: pendingRow
      ? {
          assessments: Array.isArray(pendingRow.assessments)
            ? (pendingRow.assessments as Record<string, unknown>[])
            : [],
          basis: pendingRow.basis === 'relative' ? 'relative' : 'absolute',
          dropRules: readDropRules(pendingRow.dropRules),
          note: typeof pendingRow.note === 'string' ? pendingRow.note : '',
          source: typeof pendingRow.source === 'string' ? pendingRow.source : '',
          createdAt: typeof pendingRow.createdAt === 'string' ? pendingRow.createdAt : '',
        }
      : null,
  };
}

function readDropRules(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const group = typeof row.group === 'string' ? row.group : '';
    const keep = Number(row.keep);
    if (!group || !Number.isFinite(keep)) return [];
    return [{ group, keep: Math.max(1, Math.trunc(keep)) }];
  });
}

/** Assessment rows as the connector states them: snake_case, no ids to guess. */
function readComponents(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const label = typeof row.label === 'string' ? row.label : '';
    if (!label) return [];
    const weight = Number(row.weight);
    const score = row.score === null || row.score === undefined ? null : Number(row.score);
    const outOf = row.outOf === null || row.outOf === undefined ? null : Number(row.outOf);
    return [
      {
        label,
        weight: Number.isFinite(weight) ? weight : 0,
        group: typeof row.group === 'string' && row.group ? row.group : null,
        // Null until the piece comes back, which is what "not marked yet"
        // means here. A zero would read as a zero the student scored.
        score: Number.isFinite(score as number) ? (score as number) : null,
        out_of: Number.isFinite(outOf as number) ? (outOf as number) : null,
      },
    ];
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
      description: 'Record time the student actually spent studying one active-semester course, optionally against a specific task, with a note about what the sitting covered. Only log time the student reports; never estimate it. `date` defaults to today and takes a past date for a sitting being written up after the fact. `duration_minutes` is focus time and must never include breaks; put rest in `break_minutes`, which is reported separately and does not count toward any goal.',
      inputSchema: z.object({
        course_id: z.string().uuid(),
        duration_minutes: z.number().int().min(1).max(Math.floor(MAX_SESSION_SECONDS / 60)),
        date: z.string().regex(DATE, 'Use YYYY-MM-DD.').optional(),
        task_id: z.string().uuid().optional(),
        note: z.string().trim().max(SESSION_NOTE_MAX).optional(),
        break_minutes: z.number().int().min(0).max(Math.floor(MAX_SESSION_SECONDS / 60)).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ course_id, duration_minutes, date, task_id, note, break_minutes }) => {
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
            // Left out entirely when there were none, so the insert still
            // runs against a project that has not re-run supabase/schema.sql.
            // Rest is never added into duration_seconds: the weekly goal and
            // the run both read that column and would inflate together.
            ...(break_minutes ? { break_seconds: break_minutes * 60 } : {}),
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
            break_minutes: Math.round(Number(row.break_seconds ?? 0) / 60),
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
      description: 'Read how one week went: hours logged per course against each course’s weekly goal, break time taken alongside them, tasks ticked off, and the student’s current run of consecutive counting weeks. `week_offset` is 0 for this week, -1 for last week. `hours_logged` is focus only and `break_hours` is rest, which never counts toward a goal. For how the sittings themselves were shaped — block lengths, how often breaks ran over — use get_focus_pattern. This tool never changes Akada data.',
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

        // The run needs weeks before this one, so sessions are read over a
        // wider window than the week being reported and filtered twice.
        const runFloor = new Date();
        runFloor.setDate(runFloor.getDate() - 120);
        const [{ data: sessions, error: sessionsError }, { data: tasks, error: tasksError }] = await Promise.all([
          supabase
            .from('sessions')
            // `*` rather than a column list so a project that has not re-run
            // supabase/schema.sql, and therefore has no break_seconds, still
            // answers instead of failing the whole week.
            .select('*')
            .eq('user_id', token.userId)
            .eq('semester_id', semesterId)
            .gte('date', isoDate(runFloor)),
          supabase
            .from('tasks')
            .select('id, course_id, title, completed, completed_at, pages')
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
        const breakSecondsByCourse = new Map<string, number>();
        scoped.forEach((session) => {
          secondsByCourse.set(session.course_id, (secondsByCourse.get(session.course_id) ?? 0) + Number(session.duration_seconds ?? 0));
          breakSecondsByCourse.set(
            session.course_id,
            (breakSecondsByCourse.get(session.course_id) ?? 0) + Number(session.break_seconds ?? 0),
          );
        });

        // Continuity is weeks, not days, and it is read through the very
        // same engine the app draws from rather than reimplemented here. Two
        // implementations of a rule this fiddly is two chances to tell the
        // student a different number than their own screen shows.
        const runCourses = (courses ?? []).map((course) => ({
          id: course.id,
          code: course.code,
          name: course.name,
          color: '',
          weeklyGoalHours: Number(course.weekly_goal_hours ?? 0),
          createdAt: '',
        }));
        const runs = readRuns(
          runCourses,
          readCredit(
            runCourses,
            (sessions ?? []).map((session) => ({
              id: String(session.id),
              courseId: session.course_id,
              taskId: session.task_id ?? null,
              date: session.date,
              durationSeconds: Number(session.duration_seconds ?? 0),
              note: '',
              createdAt: '',
            })),
            (tasks ?? []).map((task) => ({
              id: String(task.id),
              courseId: task.course_id,
              title: task.title,
              dueDate: null,
              priority: 'normal' as const,
              completed: true,
              completedAt: task.completed_at ?? null,
              createdAt: '',
              pages: task.pages ?? null,
            })),
          ),
          isoDate(),
        );

        const closed = (tasks ?? []).filter((task) => {
          const day = typeof task.completed_at === 'string' ? task.completed_at.slice(0, 10) : '';
          if (day < from || day > to) return false;
          return !course_id || task.course_id === course_id;
        });

        const perCourse = (courses ?? [])
          .filter((course) => !course_id || course.id === course_id)
          .map((course) => {
            const seconds = secondsByCourse.get(course.id) ?? 0;
            const restSeconds = breakSecondsByCourse.get(course.id) ?? 0;
            const goalHours = Number(course.weekly_goal_hours);
            return {
              id: course.id,
              code: course.code,
              name: course.name,
              hours_logged: Math.round((seconds / 3600) * 100) / 100,
              // Rest, beside the hours and never inside them. A goal is met
              // on time worked, so this never moves `goal_met`.
              break_hours: Math.round((restSeconds / 3600) * 100) / 100,
              weekly_study_goal_hours: goalHours,
              goal_met: goalHours > 0 ? seconds >= goalHours * 3600 : null,
            };
          });

        return result({
          week: { from, to, offset: week_offset },
          courses: perCourse,
          totals: {
            hours_logged: Math.round((scoped.reduce((sum, session) => sum + Number(session.duration_seconds ?? 0), 0) / 3600) * 100) / 100,
            break_hours: Math.round((scoped.reduce((sum, session) => sum + Number(session.break_seconds ?? 0), 0) / 3600) * 100) / 100,
            session_count: scoped.length,
            tasks_completed: closed.length,
          },
          tasks_completed: closed.map((task) => ({ title: task.title, course_id: task.course_id })),
          // Weeks, not days. A week counts on four study days, or on three
          // spread across three courses; margin days are the grace layer and
          // are reported separately rather than folded into the study count.
          weekly_run: runs.current,
          weekly_run_best: runs.best,
        });
      } catch (cause) {
        return toolCrashed('get_weekly_stats', cause);
      }
    },
  );

  server.registerTool(
    'get_focus_pattern',
    {
      title: 'Read the shape of Akada study sittings',
      description: 'Read how the student actually studies rather than how much: how long their blocks run, how often they finish the block they set, how long their breaks run against how long they meant them to, how much focus they get before the first break, and when in the day the work happens. Use this for questions about habits, rhythm, breaks and drift. For hours against goals use get_weekly_stats instead. `utc_offset_minutes` is the student’s offset from UTC (300 for UTC+5); without it the hourly breakdown is in UTC and says so. `recent_sittings` carries what each block actually covered, written by the student on the break straight after it, so questions about rhythm and questions about content can be answered together. Only sittings timed in Akada with continuous mode have a shape to read; time logged after the fact contributes its totals but not its chain. This tool never changes Akada data.',
      inputSchema: z.object({
        days: z.number().int().min(1).max(180).default(28),
        course_id: z.string().uuid().optional(),
        utc_offset_minutes: z.number().int().min(-840).max(840).default(0),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ days, course_id, utc_offset_minutes }) => {
      try {
        const semesterId = await activeSemesterId(token);
        if (!semesterId) return toolError('No active semester is set in Akada.');
        const supabase = mcpSupabase(token.supabaseAccessToken);

        const floor = new Date();
        floor.setDate(floor.getDate() - (days - 1));
        const from = isoDate(floor);
        const to = isoDate(new Date());
        const window = { from, to, days };

        let sessionQuery = supabase
          .from('sessions')
          // `*` for the same reason as everywhere else here: a project that
          // has not re-run supabase/schema.sql has no break_seconds and
          // should still answer.
          .select('*')
          .eq('user_id', token.userId)
          .eq('semester_id', semesterId)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: false })
          // A term of daily study is a few hundred rows; the cap is here so
          // one pathological account cannot turn this into an unbounded read.
          .limit(500);
        if (course_id) sessionQuery = sessionQuery.eq('course_id', course_id);

        const [{ data: sessions, error: sessionsError }, { data: courses, error: coursesError }] =
          await Promise.all([
            sessionQuery,
            supabase
              .from('courses')
              .select('id, code, name')
              .eq('user_id', token.userId)
              .eq('semester_id', semesterId),
          ]);
        const readError = sessionsError ?? coursesError;
        if (readError) {
          return queryFailed('get_focus_pattern', sessionsError ? 'sessions read' : 'courses read', readError, 'Akada could not load that window.');
        }
        if (course_id && !(courses ?? []).some((course) => course.id === course_id)) {
          return toolError('That course is not available in your active Akada semester.');
        }

        const rows = (sessions ?? []) as Record<string, unknown>[];
        const focusSeconds = rows.reduce((sum, row) => sum + Number(row.duration_seconds ?? 0), 0);
        const restSeconds = rows.reduce((sum, row) => sum + Number(row.break_seconds ?? 0), 0);
        const totals = {
          sittings: rows.length,
          focus_hours: Math.round((focusSeconds / 3600) * 100) / 100,
          break_hours: Math.round((restSeconds / 3600) * 100) / 100,
          break_share_of_sitting:
            focusSeconds + restSeconds > 0
              ? Math.round((restSeconds / (focusSeconds + restSeconds)) * 1000) / 1000
              : 0,
        };
        if (rows.length === 0) {
          return result({ window, totals, message: 'No study sessions in that window.' });
        }

        const courseOf = new Map(rows.map((row) => [String(row.id), String(row.course_id ?? '')]));
        const dateOf = new Map(rows.map((row) => [String(row.id), String(row.date ?? '')]));
        const codeOf = new Map((courses ?? []).map((course) => [course.id, course.code]));

        const { data: segmentRows, error: segmentsError } = await supabase
          .from('session_segments')
          // `*` rather than a column list, so a project that ran the first
          // version of the schema script and therefore has no `note` column
          // still answers instead of failing the whole call.
          .select('*')
          .eq('user_id', token.userId)
          .in('session_id', [...courseOf.keys()])
          .order('ordinal', { ascending: true });
        if (segmentsError) {
          // Where a project that has not re-run supabase/schema.sql lands:
          // the table is not there. The totals above are still real, so they
          // are returned rather than failing the call outright.
          return result({
            window,
            totals,
            message:
              'Akada is not recording the shape of sittings on this project yet. Run the latest supabase/schema.sql once; sittings timed after that will be broken down here.',
          });
        }

        interface SegmentRow {
          session_id: string;
          kind: string;
          ordinal: number;
          started_at: string;
          seconds: number;
          target_seconds: number | null;
          note?: string | null;
        }
        const segments = (segmentRows ?? []) as SegmentRow[];

        const blocks: number[] = [];
        const breaks: number[] = [];
        const overruns: number[] = [];
        const openers: number[] = [];
        const blocksPerSitting: number[] = [];
        const perCourse = new Map<string, { blocks: number[]; breaks: number[] }>();
        const hourFocus = new Array<number>(24).fill(0);
        const hourBreak = new Array<number>(24).fill(0);
        let blocksWithTarget = 0;
        let blocksFinished = 0;
        let breaksWithTarget = 0;
        let breaksRunOver = 0;

        const chains = new Map<string, SegmentRow[]>();
        for (const segment of segments) {
          const chain = chains.get(segment.session_id) ?? [];
          chain.push(segment);
          chains.set(segment.session_id, chain);
        }

        for (const [sessionId, chain] of chains) {
          chain.sort((a, b) => a.ordinal - b.ordinal);
          const courseKey = courseOf.get(sessionId) ?? '';
          const bucket = perCourse.get(courseKey) ?? { blocks: [], breaks: [] };
          let restedYet = false;
          let blockCount = 0;

          for (const segment of chain) {
            const seconds = Math.max(0, Number(segment.seconds ?? 0));
            const target = Number(segment.target_seconds);
            const hasTarget = Number.isFinite(target) && target > 0;
            // Shifted into the student's own day before it is bucketed; an
            // hourly breakdown in UTC answers a question nobody asked.
            const at = new Date(segment.started_at);
            const hour = Number.isNaN(at.getTime())
              ? null
              : (((at.getUTCHours() * 60 + at.getUTCMinutes() + utc_offset_minutes) / 60) % 24 + 24) % 24;

            if (segment.kind === 'break') {
              breaks.push(seconds);
              bucket.breaks.push(seconds);
              if (hour !== null) hourBreak[Math.floor(hour)] += seconds;
              if (hasTarget) {
                breaksWithTarget += 1;
                overruns.push(seconds - target);
                if (seconds > target) breaksRunOver += 1;
              }
              restedYet = true;
              continue;
            }

            blocks.push(seconds);
            bucket.blocks.push(seconds);
            blockCount += 1;
            if (hour !== null) hourFocus[Math.floor(hour)] += seconds;
            // How long the student goes before reaching for the first break,
            // which is the number the whole feature exists to surface.
            if (!restedYet) openers.push(seconds);
            if (hasTarget) {
              blocksWithTarget += 1;
              if (seconds >= target) blocksFinished += 1;
            }
          }

          if (blockCount > 0) blocksPerSitting.push(blockCount);
          perCourse.set(courseKey, bucket);
        }

        const minutes = (seconds: number) => Math.round((seconds / 60) * 10) / 10;
        const mean = (values: number[]) =>
          values.length ? minutes(values.reduce((a, b) => a + b, 0) / values.length) : 0;
        const median = (values: number[]) => {
          if (values.length === 0) return 0;
          const sorted = [...values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return minutes(
            sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
          );
        };
        const rate = (part: number, whole: number) =>
          whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;

        // What the blocks actually covered, written on the break after each
        // one. The aggregates above say the shape of a sitting; these say
        // what was in it, which is what makes "the afternoons where the
        // breaks ran long were all the same chapter" answerable at all.
        const recentSittings = [...chains.entries()]
          .map(([sessionId, chain]) => ({
            date: dateOf.get(sessionId) ?? '',
            course: codeOf.get(courseOf.get(sessionId) ?? '') ?? '',
            blocks: chain
              .filter(
                (segment) =>
                  segment.kind === 'focus' && String(segment.note ?? '').trim() !== '',
              )
              .map((segment) => ({
                minutes: minutes(segment.seconds),
                covered: String(segment.note ?? '').trim(),
              })),
          }))
          .filter((sitting) => sitting.blocks.length > 0)
          .sort((a, b) => b.date.localeCompare(a.date))
          // Newest first and capped: this is context for a question, not an
          // export of the term.
          .slice(0, 20);

        return result({
          window,
          totals,
          sittings_with_a_recorded_shape: chains.size,
          blocks: {
            count: blocks.length,
            avg_minutes: mean(blocks),
            median_minutes: median(blocks),
            longest_minutes: blocks.length ? minutes(Math.max(...blocks)) : 0,
            // Only blocks that were armed with a length can be said to have
            // been finished or cut short; an open sitting has no such claim.
            with_a_set_length: blocksWithTarget,
            ran_to_the_end: blocksFinished,
            completion_rate: rate(blocksFinished, blocksWithTarget),
          },
          breaks: {
            count: breaks.length,
            avg_minutes: mean(breaks),
            median_minutes: median(breaks),
            longest_minutes: breaks.length ? minutes(Math.max(...breaks)) : 0,
            with_a_set_length: breaksWithTarget,
            ran_over: breaksRunOver,
            overrun_rate: rate(breaksRunOver, breaksWithTarget),
            // Negative means breaks are typically cut short. This is the pair
            // a break total on its own can never give you.
            avg_overrun_minutes: mean(overruns),
          },
          rhythm: {
            avg_focus_before_first_break_minutes: mean(openers),
            avg_blocks_per_sitting:
              blocksPerSitting.length
                ? Math.round(
                    (blocksPerSitting.reduce((a, b) => a + b, 0) / blocksPerSitting.length) * 10,
                  ) / 10
                : 0,
            focus_to_break_ratio:
              restSeconds > 0 ? Math.round((focusSeconds / restSeconds) * 100) / 100 : null,
          },
          by_hour: hourFocus
            .map((seconds, hour) => ({
              hour,
              focus_minutes: minutes(seconds),
              break_minutes: minutes(hourBreak[hour]),
            }))
            .filter((row) => row.focus_minutes > 0 || row.break_minutes > 0),
          by_hour_offset_minutes: utc_offset_minutes,
          // Only sittings where at least one block was written about, newest
          // first. The last block of a sitting has no break after it and so
          // is never here; the session's own note covers it.
          recent_sittings: recentSittings,
          by_course: [...perCourse.entries()]
            .filter(([id]) => id !== '')
            .map(([id, bucket]) => ({
              id,
              code: codeOf.get(id) ?? '',
              blocks: bucket.blocks.length,
              avg_block_minutes: mean(bucket.blocks),
              breaks: bucket.breaks.length,
              avg_break_minutes: mean(bucket.breaks),
            }))
            .sort((a, b) => b.blocks - a.blocks),
        });
      } catch (cause) {
        return toolCrashed('get_focus_pattern', cause);
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

  server.registerTool(
    'get_grading_scheme',
    {
      title: 'Read how an Akada course is graded',
      description: 'Read the grading scheme Akada holds for one of the signed-in student’s courses: every graded component and its weight, whether the course is graded absolutely or relatively, and any rule where not every item counts. Returns both the accepted scheme and any scheme still waiting for the student to accept it. This tool never changes Akada data.',
      inputSchema: z.object({ course_id: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ course_id }) => {
      try {
        const owned = await loadOwnCourse('get_grading_scheme', token, course_id);
        if (!owned.ok) return owned.error;
        const { course } = owned;
        const grading = readGrading(course.grading);
        return result({
          schema_version: 'akada.grading.v1',
          course: { id: course.id, code: course.code, name: course.name },
          accepted: {
            components: readComponents(course.assessments),
            basis: grading.basis ?? 'absolute',
            drop_rules: grading.dropRules,
          },
          pending: grading.pending
            ? {
                components: readComponents(grading.pending.assessments),
                basis: grading.pending.basis,
                drop_rules: grading.pending.dropRules,
                note: grading.pending.note,
                source: grading.pending.source,
                created_at: grading.pending.createdAt,
              }
            : null,
          message: grading.pending
            ? 'A proposed scheme is waiting for the student to accept it on the course page. Nothing is projected from it until they do.'
            : undefined,
        });
      } catch (cause) {
        return toolCrashed('get_grading_scheme', cause);
      }
    },
  );

  server.registerTool(
    'set_grading_scheme',
    {
      title: 'Propose how an Akada course is graded',
      description:
        'Record how one of the signed-in student’s courses is graded, read off a course outline or syllabus the student has given you. Do not call this from the course code alone or from what the course usually looks like: only call it against an outline the student has actually attached. Cover every graded component with what it is worth as a percentage of the course, say whether the course is graded absolutely or relatively, and give a drop rule wherever not every item counts (put those items in a shared `group` and name that group in `drop_rules`). This does NOT take effect on its own: it lands as a proposal on the course page and the student has to accept it before Akada projects anything from it. Tell the student to go and look at it. Calling this again replaces any proposal not yet accepted, and never touches a scheme the student already accepted.',
      inputSchema: z.object({
        course_id: z.string().uuid(),
        components: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(120),
              weight: z.number().min(0).max(100),
              group: z
                .string()
                .trim()
                .min(1)
                .max(80)
                .optional()
                .describe('Items that share a drop rule share a group, e.g. "quizzes" on all seven quizzes.'),
            }),
          )
          .min(1)
          .max(MAX_COMPONENTS),
        basis: z
          .enum(['absolute', 'relative'])
          .describe('absolute: a fixed scale. relative: curved, ranked against the class.'),
        drop_rules: z
          .array(
            z.object({
              group: z.string().trim().min(1).max(80),
              keep: z.number().int().min(1).describe('How many of the group count, e.g. 6 for "best 6 of 7".'),
            }),
          )
          .max(MAX_DROP_RULES)
          .default([]),
        note: z
          .string()
          .trim()
          .max(MAX_GRADING_NOTE)
          .default('')
          .describe('Anything the outline was vague or silent about. Shown to the student under the rows.'),
        source: z
          .string()
          .trim()
          .max(200)
          .default('')
          .describe('Where this came from, e.g. the file name of the outline.'),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ course_id, components, basis, drop_rules, note, source }) => {
      try {
        const owned = await loadOwnCourse('set_grading_scheme', token, course_id);
        if (!owned.ok) return owned.error;
        const { course, supabase } = owned;

        // A rule naming a group no component is in silently does nothing, and
        // the student would have no way to see why their "best 6 of 7" was
        // ignored. Say so rather than writing it.
        const groups = new Set(components.flatMap((c) => (c.group ? [c.group] : [])));
        const orphan = drop_rules.find((rule) => !groups.has(rule.group));
        if (orphan) {
          return toolError(
            `No component is in the group "${orphan.group}", so that drop rule would do nothing. Give every item the rule covers that same group, then call this again.`,
          );
        }
        const tooFew = drop_rules.find(
          (rule) => rule.keep > components.filter((c) => c.group === rule.group).length,
        );
        if (tooFew) {
          const size = components.filter((c) => c.group === tooFew.group).length;
          return toolError(
            `The group "${tooFew.group}" keeps ${tooFew.keep} items but only ${size} are in it. Check the outline and call this again.`,
          );
        }

        const stamp = Date.now().toString(36);
        const pending = {
          assessments: components.map((component, index) => ({
            // Ids are generated here rather than asked of the model, which
            // would invent colliding ones. Accepting keeps these, so a score
            // later typed against a row stays with that row.
            id: `a-${stamp}-${index}`,
            label: component.label,
            weight: component.weight,
            score: null,
            outOf: 100,
            ...(component.group ? { group: component.group } : {}),
          })),
          basis,
          dropRules: drop_rules.map((rule) => ({ group: rule.group, keep: rule.keep })),
          source,
          note,
          createdAt: new Date().toISOString(),
        };

        // Read-modify-write on one jsonb column: the accepted basis and rules
        // live in the same object and have to survive a proposal being
        // written beside them.
        const existing = readGrading(course.grading);
        const grading: Record<string, unknown> = { pending };
        if (existing.basis) grading.basis = existing.basis;
        if (existing.dropRules.length > 0) grading.dropRules = existing.dropRules;

        const { error } = await supabase
          .from('courses')
          .update({ grading })
          .eq('id', course.id)
          .eq('user_id', token.userId);
        if (error) return queryFailed('set_grading_scheme', 'grading write', error, 'Akada could not save that grading scheme.');

        const total = components.reduce((acc, c) => acc + c.weight, 0);
        const rounded = Math.round(total * 100) / 100;
        return result({
          proposed: true,
          course: { id: course.id, code: course.code, name: course.name },
          components: readComponents(pending.assessments),
          basis,
          drop_rules: pending.dropRules,
          total_weight: rounded,
          message:
            `Proposed a grading scheme for ${course.code}. It is not live yet: the student has to open ${course.code} in Akada and accept it before anything is projected from it.` +
            (Math.abs(total - 100) > 0.01
              ? ` The weights come to ${rounded}%, not 100%. Tell the student, in case the outline was read wrong.`
              : ''),
        });
      } catch (cause) {
        return toolCrashed('set_grading_scheme', cause);
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
