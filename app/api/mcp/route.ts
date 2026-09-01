import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { readAccessToken } from '@/lib/mcp-auth';
import { mcpSupabase, mcpUrl, siteUrl } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TASKS_PER_REQUEST = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type AuthenticatedToken = ReturnType<typeof readAccessToken>;

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

async function activeSemesterId(token: AuthenticatedToken) {
  const supabase = mcpSupabase(token.supabaseAccessToken);
  const { data, error } = await supabase
    .from('user_settings')
    .select('active_semester_id')
    .eq('user_id', token.userId)
    .maybeSingle();
  if (error) throw new Error('Akada could not load your active semester.');
  return data?.active_semester_id as string | null;
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
        if (error) return toolError('Akada could not load courses.');
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
      } catch {
        return toolError('Akada is not configured or your session has expired. Reconnect the connector and try again.');
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
        if (courseError || !course) return toolError('That course is not available in your active Akada semester. Find the course again first.');

        const { data: existing, error: existingError } = await supabase
          .from('tasks')
          .select('title, due_date')
          .eq('course_id', course.id)
          .eq('user_id', token.userId)
          .eq('completed', false);
        if (existingError) return toolError('Akada could not check your existing tasks.');

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
        if (insertError) return toolError('Akada could not save those tasks.');
        return result({
          course: { id: course.id, code: course.code, name: course.name },
          created: (created ?? []).map((task) => ({ id: task.id, title: task.title, due_date: task.due_date, priority: task.priority })),
          skipped: tasks.length - toInsert.length,
        });
      } catch {
        return toolError('Akada is not configured or your session has expired. Reconnect the connector and try again.');
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
    if (error || data.user?.id !== token.userId) return null;
    return { token: match[1], payload: token };
  } catch {
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
