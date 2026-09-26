import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { readAccessToken } from '@/lib/mcp-auth';
import { WEAK_POINT_ERROR_TYPES } from '@/lib/data/types';
import {
  WEAK_POINT_CONFUSION_MAX,
  WEAK_POINT_REF_MAX,
  WEAK_POINT_SUMMARY_MAX,
  findSameWeakPoint,
  inSection,
  rankWeakPoints,
} from '@/lib/weak-points';
import { mcpSupabase, siteUrl } from './_shared';

/**
 * The weak point tools. After an assistant marks a quiz it writes down each
 * distinct confusion it found, filed under the course and the section and
 * pages it comes from; the same confusion found again counts against the row
 * already there (lib/weak-points.ts has the rule). The student sees them on
 * the course page and, with an exam a week out, on Today; an assistant reads
 * them back with get_weak_points to know what to drill before the exam.
 */

type AuthenticatedToken = ReturnType<typeof readAccessToken>;
type McpSupabaseClient = ReturnType<typeof mcpSupabase>;
type QueryFailure = { message?: string; code?: string; details?: string; hint?: string } | null;

interface WeakPointRow {
  id: string;
  course_id: string;
  task_id: string | null;
  quiz_id: string | null;
  section: string | null;
  page_ref: string | null;
  summary: string;
  confusion: string | null;
  error_type: string;
  times_missed: number;
  first_seen_at: string;
  last_seen_at: string;
  status: 'open' | 'fixed';
  fixed_at: string | null;
}

function result(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

const MISSING_TABLE = ['PGRST205', '42P01', 'PGRST204', '42703'];
const NOT_SET_UP =
  'Weak points are not set up in this Akada database yet. The student needs to run the latest supabase/schema.sql once.';

function queryFailed(tool: string, step: string, error: QueryFailure, message: string) {
  console.error(`[mcp:${tool}] ${step} failed`, { code: error?.code, message: error?.message, hint: error?.hint });
  if (error?.code && MISSING_TABLE.includes(error.code)) return toolError(NOT_SET_UP);
  const reason = [error?.code, error?.message, error?.hint].filter(Boolean).join(' | ');
  return toolError(reason ? `${message} (${reason})` : message);
}

function toolCrashed(tool: string, cause: unknown) {
  const reason = cause instanceof Error ? cause.message : String(cause ?? '');
  console.error(`[mcp:${tool}] unhandled failure`, reason);
  return toolError(`Akada is not configured or your session has expired. Reconnect the connector and try again.${reason ? ` (${reason})` : ''}`);
}

function quizUrl(id: string): string | null {
  try {
    return `${siteUrl()}/notes/quiz?q=${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}

async function titles(supabase: McpSupabaseClient, userId: string, table: 'quizzes' | 'tasks', ids: (string | null)[]) {
  const map = new Map<string, string>();
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return map;
  const { data } = await supabase.from(table).select('id, title').eq('user_id', userId).in('id', wanted);
  for (const row of (data ?? []) as { id: string; title: string }[]) map.set(row.id, row.title);
  return map;
}

function shape(row: WeakPointRow, quizTitles: Map<string, string>, taskTitles: Map<string, string>) {
  return {
    id: row.id,
    section: row.section || null,
    page_ref: row.page_ref || null,
    summary: row.summary,
    confusion: row.confusion || null,
    error_type: row.error_type,
    times_missed: row.times_missed,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    status: row.status,
    fixed_at: row.fixed_at,
    quiz: row.quiz_id ? { id: row.quiz_id, title: quizTitles.get(row.quiz_id) ?? null, url: quizUrl(row.quiz_id) } : null,
    task: row.task_id ? { id: row.task_id, title: taskTitles.get(row.task_id) ?? null } : null,
  };
}

/* ── Inputs ─────────────────────────────────────────────────────────── */

const WeakPointItem = z.object({
  section: z.string().trim().max(WEAK_POINT_REF_MAX).default('').describe('Where it is in the material, as the book or slides number it: "1.3". Empty if unknown.'),
  page_ref: z.string().trim().max(WEAK_POINT_REF_MAX).default('').describe('The pages to reread: "p.22-24". Empty if unknown.'),
  summary: z.string().trim().min(1).max(WEAK_POINT_SUMMARY_MAX).describe('One line on what the student gets wrong: "Swaps the 3 core values with the 3 objectives".'),
  confusion: z.string().trim().max(WEAK_POINT_CONFUSION_MAX).optional().describe('The two things being mixed up, "core values vs objectives". This is what repeats are matched on, so name them the same way each time.'),
  error_type: z.enum(WEAK_POINT_ERROR_TYPES),
});

export const RecordWeakPointsInput = z.object({
  course_id: z.string().uuid(),
  quiz_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  items: z.array(WeakPointItem).min(1).max(30),
});

export const GetWeakPointsInput = z.object({
  course_id: z.string().uuid(),
  status: z.enum(['open', 'fixed', 'all']).default('open'),
  section: z.string().trim().max(WEAK_POINT_REF_MAX).optional().describe('Only this section and the ones under it: "1" takes 1.3.'),
  limit: z.number().int().min(1).max(200).default(50),
});

export const WeakPointIdInput = z.object({ id: z.string().uuid() });

/* ── Tools ──────────────────────────────────────────────────────────── */

export async function recordWeakPointsTool(
  token: AuthenticatedToken,
  { course_id, quiz_id, task_id, items }: z.infer<typeof RecordWeakPointsInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    const course = await supabase.from('courses').select('id, code').eq('id', course_id).eq('user_id', token.userId).maybeSingle();
    if (course.error) return queryFailed('record_weak_points', 'course lookup', course.error, 'Akada could not look up that course.');
    if (!course.data) return toolError('That course is not one of the student’s. Find it with find_course and use the id it returns.');
    if (quiz_id) {
      const { data, error } = await supabase.from('quizzes').select('id, course_id').eq('id', quiz_id).eq('user_id', token.userId).maybeSingle();
      if (error) return queryFailed('record_weak_points', 'quiz lookup', error, 'Akada could not look up that quiz.');
      if (!data) return toolError('That quiz is not in the student’s Akada. Find it with list_quizzes.');
      if (data.course_id && data.course_id !== course_id) return toolError('That quiz is filed under a different course than course_id.');
    }
    if (task_id) {
      const { data, error } = await supabase.from('tasks').select('id, course_id').eq('id', task_id).eq('user_id', token.userId).maybeSingle();
      if (error) return queryFailed('record_weak_points', 'task lookup', error, 'Akada could not look up that task.');
      if (!data) return toolError('That task is not one of the student’s. Find it with get_tasks.');
      if (data.course_id !== course_id) return toolError('That task belongs to a different course than course_id.');
    }

    const existing = await supabase.from('weak_points').select('*').eq('user_id', token.userId).eq('course_id', course_id);
    if (existing.error) return queryFailed('record_weak_points', 'weak points read', existing.error, 'Akada could not read the course’s weak points.');
    const pool = ((existing.data ?? []) as WeakPointRow[]).map((row) => ({ row, summary: row.summary, confusion: row.confusion ?? '' }));
    const touched = new Set<string>();
    const now = new Date().toISOString();
    const recorded: { id: string; summary: string; times_missed: number; outcome: 'new' | 'repeat' | 'reopened' | 'same_as_above' }[] = [];

    for (const item of items) {
      const confusion = item.confusion ?? '';
      const same = findSameWeakPoint(pool, { summary: item.summary, confusion });
      if (same && touched.has(same.row.id)) {
        // Two items in one marking that are the same confusion count once.
        recorded.push({ id: same.row.id, summary: same.row.summary, times_missed: same.row.times_missed, outcome: 'same_as_above' });
        continue;
      }
      if (same) {
        const reopened = same.row.status === 'fixed';
        const patch = {
          times_missed: same.row.times_missed + 1,
          last_seen_at: now,
          status: 'open' as const,
          fixed_at: null,
          quiz_id: quiz_id ?? same.row.quiz_id,
          task_id: task_id ?? same.row.task_id,
          section: same.row.section || item.section,
          page_ref: same.row.page_ref || item.page_ref,
          confusion: same.row.confusion || confusion || null,
        };
        const { error } = await supabase.from('weak_points').update(patch).eq('id', same.row.id).eq('user_id', token.userId);
        if (error) return queryFailed('record_weak_points', 'weak point update', error, 'Akada could not update a weak point.');
        Object.assign(same.row, patch);
        same.confusion = same.row.confusion ?? '';
        touched.add(same.row.id);
        recorded.push({ id: same.row.id, summary: same.row.summary, times_missed: patch.times_missed, outcome: reopened ? 'reopened' : 'repeat' });
        continue;
      }
      const { data, error } = await supabase
        .from('weak_points')
        .insert({
          user_id: token.userId,
          course_id,
          quiz_id: quiz_id ?? null,
          task_id: task_id ?? null,
          section: item.section,
          page_ref: item.page_ref,
          summary: item.summary,
          confusion: confusion || null,
          error_type: item.error_type,
          times_missed: 1,
          first_seen_at: now,
          last_seen_at: now,
          status: 'open',
        })
        .select('*')
        .single();
      if (error) return queryFailed('record_weak_points', 'weak point insert', error, 'Akada could not save a weak point.');
      const row = data as WeakPointRow;
      pool.push({ row, summary: row.summary, confusion: row.confusion ?? '' });
      touched.add(row.id);
      recorded.push({ id: row.id, summary: row.summary, times_missed: 1, outcome: 'new' });
    }

    const count = (outcome: string) => recorded.filter((r) => r.outcome === outcome).length;
    const parts = [
      count('new') && `${count('new')} new`,
      count('repeat') && `${count('repeat')} missed again`,
      count('reopened') && `${count('reopened')} reopened after being fixed`,
    ].filter(Boolean);
    return result({
      recorded,
      message: `Recorded under ${course.data.code}: ${parts.join(', ') || 'nothing new'}. The student sees them on the course page, and on Today when an exam is a week out.`,
    });
  } catch (cause) {
    return toolCrashed('record_weak_points', cause);
  }
}

export async function getWeakPointsTool(
  token: AuthenticatedToken,
  { course_id, status, section, limit }: z.infer<typeof GetWeakPointsInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    let request = supabase.from('weak_points').select('*').eq('user_id', token.userId).eq('course_id', course_id);
    if (status !== 'all') request = request.eq('status', status);
    const { data, error } = await request;
    if (error) return queryFailed('get_weak_points', 'weak points read', error, 'Akada could not read the weak points.');
    let rows = (data ?? []) as WeakPointRow[];
    if (section) rows = rows.filter((row) => inSection(row.section ?? '', section));
    const ranked = rankWeakPoints(rows.map((row) => ({ row, timesMissed: row.times_missed, lastSeenAt: row.last_seen_at }))).map((r) => r.row).slice(0, limit);
    const [quizTitles, taskTitles] = await Promise.all([
      titles(supabase, token.userId, 'quizzes', ranked.map((r) => r.quiz_id)),
      titles(supabase, token.userId, 'tasks', ranked.map((r) => r.task_id)),
    ]);
    return result({ weak_points: ranked.map((row) => shape(row, quizTitles, taskTitles)), count: ranked.length });
  } catch (cause) {
    return toolCrashed('get_weak_points', cause);
  }
}

async function setStatus(tool: string, token: AuthenticatedToken, id: string, status: 'open' | 'fixed', supabase: McpSupabaseClient) {
  try {
    const { data, error } = await supabase
      .from('weak_points')
      .update({ status, fixed_at: status === 'fixed' ? new Date().toISOString() : null })
      .eq('id', id)
      .eq('user_id', token.userId)
      .select('*')
      .maybeSingle();
    if (error) return queryFailed(tool, 'weak point update', error, 'Akada could not update that weak point.');
    if (!data) return toolError('That weak point is not in the student’s Akada. Find it with get_weak_points.');
    const row = data as WeakPointRow;
    return result({
      weak_point: shape(row, new Map(), new Map()),
      message: status === 'fixed' ? `Marked fixed: “${row.summary}”.` : `Open again: “${row.summary}”.`,
    });
  } catch (cause) {
    return toolCrashed(tool, cause);
  }
}

export function resolveWeakPointTool(token: AuthenticatedToken, { id }: z.infer<typeof WeakPointIdInput>, supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken)) {
  return setStatus('resolve_weak_point', token, id, 'fixed', supabase);
}

export function reopenWeakPointTool(token: AuthenticatedToken, { id }: z.infer<typeof WeakPointIdInput>, supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken)) {
  return setStatus('reopen_weak_point', token, id, 'open', supabase);
}

/* ── Registration ───────────────────────────────────────────────────── */

const RECORD_DESCRIPTION = `Write down what the student keeps getting wrong in a course, after you have marked a quiz (grade_quiz, or going over a multiple-choice sitting from get_quiz). One item per distinct confusion across the multiple-choice misses and the written answers, not one per question: three questions missed for the same mix-up is one item. Give each its \`section\` and \`page_ref\` from the material the quiz tested, a one-line \`summary\` of what goes wrong, the \`confusion\` as "X vs Y" when two things are being mixed up, and an \`error_type\`: concept (doesn't understand the idea), assumption (applies it where it doesn't hold), algebra (the working goes wrong), graph (reads or draws a graph wrong), evidence (claim without support, or the wrong support), command_word (answers a different question than asked, "describe" for "evaluate"), careless (knew it, slipped). A confusion already recorded for the course counts again on its row instead of adding another, and one marked fixed opens again, so name the same confusion the same way each time. Pass quiz_id, and task_id when the quiz tests one task.`;

const GET_DESCRIPTION = 'Read the student’s weak points in a course, most often missed first, then most recently: each with its section, pages, what goes wrong, the confusion, how many times it has been missed, and the quiz and task it came from. Use it before an exam, when the student asks what to revise, or before writing a quiz, so the quiz retests what keeps going wrong. `status` is open by default; `section` narrows to one part of the material. This tool never changes Akada data.';

const RESOLVE_DESCRIPTION = 'Mark a weak point fixed. Only after the student has got that confusion right on a retest (a quiz or a question you asked them), not because they say they understand it now. It opens again on its own if record_weak_points finds it again.';

const REOPEN_DESCRIPTION = 'Open a weak point marked fixed again, when the student gets it wrong again or asks for it back on the list.';

export function registerWeakPointTools(server: McpServer, token: AuthenticatedToken) {
  server.registerTool(
    'record_weak_points',
    { title: 'Record weak points in Akada', description: RECORD_DESCRIPTION, inputSchema: RecordWeakPointsInput, annotations: { destructiveHint: false, idempotentHint: false } },
    async (input) => recordWeakPointsTool(token, input),
  );
  server.registerTool(
    'get_weak_points',
    { title: 'Read a course’s weak points', description: GET_DESCRIPTION, inputSchema: GetWeakPointsInput, annotations: { readOnlyHint: true } },
    async (input) => getWeakPointsTool(token, input),
  );
  server.registerTool(
    'resolve_weak_point',
    { title: 'Mark a weak point fixed', description: RESOLVE_DESCRIPTION, inputSchema: WeakPointIdInput, annotations: { destructiveHint: false, idempotentHint: true } },
    async (input) => resolveWeakPointTool(token, input),
  );
  server.registerTool(
    'reopen_weak_point',
    { title: 'Open a weak point again', description: REOPEN_DESCRIPTION, inputSchema: WeakPointIdInput, annotations: { destructiveHint: false, idempotentHint: true } },
    async (input) => reopenWeakPointTool(token, input),
  );
}
