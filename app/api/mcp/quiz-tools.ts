import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { readAccessToken } from '@/lib/mcp-auth';
import { LETTERS, QUIZ_FORMAT_RULES, QUIZ_TEXT_MAX, cleanAttempts, cleanQuestions, parseQuiz } from '@/lib/quiz/format';
import { mcpSupabase, siteUrl } from './_shared';

/**
 * The quiz tools. An assistant that has the student's book or notes in front
 * of it writes a multiple-choice quiz in the text format QUIZ_FORMAT_RULES
 * sets, sends it here, and it lands on the Notes screen filed under the
 * course, and the task or note it tests. The student takes it in Akada; the
 * marks come back through get_quiz. Kept out of route.ts, which only
 * registers them.
 */

type AuthenticatedToken = ReturnType<typeof readAccessToken>;
type McpSupabaseClient = ReturnType<typeof mcpSupabase>;
type QueryFailure = { message?: string; code?: string; details?: string; hint?: string } | null;

interface QuizRow {
  id: string;
  course_id: string | null;
  task_id: string | null;
  note_id: string | null;
  title: string;
  context: string | null;
  questions: unknown;
  attempts: unknown;
  created_at: string;
  updated_at: string;
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
const QUIZZES_NOT_SET_UP =
  'Quizzes are not set up in this Akada database yet. The student needs to run the latest supabase/schema.sql once.';

function queryFailed(tool: string, step: string, error: QueryFailure, message: string) {
  console.error(`[mcp:${tool}] ${step} failed`, { code: error?.code, message: error?.message, hint: error?.hint });
  if (error?.code && MISSING_TABLE.includes(error.code)) return toolError(QUIZZES_NOT_SET_UP);
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

type Ref = { id: string; label: string };

async function lookup(supabase: McpSupabaseClient, userId: string, table: 'courses' | 'tasks' | 'notes', ids: string[]) {
  const map = new Map<string, Ref>();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return map;
  const columns = table === 'courses' ? 'id, code' : 'id, title';
  const { data } = await supabase.from(table).select(columns).eq('user_id', userId).in('id', wanted);
  for (const row of (data ?? []) as unknown as Record<string, string>[]) map.set(row.id, { id: row.id, label: row.code ?? row.title });
  return map;
}

function summary(row: QuizRow, refs: { courses: Map<string, Ref>; tasks: Map<string, Ref>; notes: Map<string, Ref> }) {
  const questions = cleanQuestions(row.questions);
  const attempts = cleanAttempts(row.attempts);
  const last = attempts[attempts.length - 1];
  const best = attempts.reduce((b, a) => Math.max(b, a.score), 0);
  return {
    id: row.id,
    title: row.title,
    context: row.context || null,
    course: row.course_id ? { id: row.course_id, code: refs.courses.get(row.course_id)?.label ?? null } : null,
    task: row.task_id ? { id: row.task_id, title: refs.tasks.get(row.task_id)?.label ?? null } : null,
    note: row.note_id ? { id: row.note_id, title: refs.notes.get(row.note_id)?.label ?? null } : null,
    questions: questions.length,
    attempts: attempts.length,
    last_score: last ? `${last.score}/${last.total}` : null,
    best_score: attempts.length ? `${best}/${questions.length}` : null,
    created_at: row.created_at,
    url: quizUrl(row.id),
  };
}

async function refsFor(supabase: McpSupabaseClient, userId: string, rows: QuizRow[]) {
  const [courses, tasks, notes] = await Promise.all([
    lookup(supabase, userId, 'courses', rows.map((r) => r.course_id ?? '')),
    lookup(supabase, userId, 'tasks', rows.map((r) => r.task_id ?? '')),
    lookup(supabase, userId, 'notes', rows.map((r) => r.note_id ?? '')),
  ]);
  return { courses, tasks, notes };
}

/* ── Inputs ─────────────────────────────────────────────────────────── */

export const SendQuizInput = z.object({
  quiz: z.string().trim().min(1).max(QUIZ_TEXT_MAX),
  course_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  note_id: z.string().uuid().optional(),
});

export const ListQuizzesInput = z.object({
  course_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const GetQuizInput = z.object({ quiz_id: z.string().uuid() });
export const DeleteQuizInput = z.object({ quiz_id: z.string().uuid() });

/* ── Tools ──────────────────────────────────────────────────────────── */

export function getQuizFormatTool() {
  return result({
    format: QUIZ_FORMAT_RULES,
    next: 'Write the quiz in exactly this format and pass the whole text as `quiz` to send_quiz. File it with course_id (find_course), and task_id (get_tasks) when it tests one chapter or reading, or note_id (list_notes) when it tests a note.',
  });
}

export async function sendQuizTool(
  token: AuthenticatedToken,
  { quiz, course_id, task_id, note_id }: z.infer<typeof SendQuizInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    const parsed = parseQuiz(quiz);
    if (!parsed.ok) {
      return toolError(
        `The quiz did not parse. Fix these and send it again:\n- ${parsed.errors.slice(0, 20).join('\n- ')}\n\nThe format, for reference:\n\n${QUIZ_FORMAT_RULES}`,
      );
    }

    let courseId = course_id ?? null;
    if (task_id) {
      const { data, error } = await supabase.from('tasks').select('id, course_id').eq('id', task_id).eq('user_id', token.userId).maybeSingle();
      if (error) return queryFailed('send_quiz', 'task lookup', error, 'Akada could not look up that task.');
      if (!data) return toolError('That task is not one of the student’s. Find it with get_tasks and use the id it returns.');
      if (courseId && data.course_id && data.course_id !== courseId) return toolError('That task belongs to a different course than course_id. Pass one or the other, or make them agree.');
      courseId = courseId ?? data.course_id ?? null;
    }
    if (note_id) {
      const { data, error } = await supabase.from('notes').select('id, course_id').eq('id', note_id).eq('user_id', token.userId).maybeSingle();
      if (error) return queryFailed('send_quiz', 'note lookup', error, 'Akada could not look up that note.');
      if (!data) return toolError('That note is not on the student’s Notes shelf. Find it with list_notes and use the id it returns.');
      courseId = courseId ?? data.course_id ?? null;
    }
    if (courseId) {
      const { data, error } = await supabase.from('courses').select('id').eq('id', courseId).eq('user_id', token.userId).maybeSingle();
      if (error) return queryFailed('send_quiz', 'course lookup', error, 'Akada could not look up that course.');
      if (!data) return toolError('That course is not one of the student’s. Find it with find_course and use the id it returns.');
    }

    const { data, error } = await supabase
      .from('quizzes')
      .insert({
        user_id: token.userId,
        course_id: courseId,
        task_id: task_id ?? null,
        note_id: note_id ?? null,
        title: parsed.quiz.title,
        context: parsed.quiz.context || null,
        questions: parsed.quiz.questions,
      })
      .select('*')
      .single();
    if (error) return queryFailed('send_quiz', 'quiz insert', error, 'Akada could not save that quiz.');
    const row = data as QuizRow;
    const out = summary(row, await refsFor(supabase, token.userId, [row]));
    return result({
      quiz: out,
      message: `Sent “${out.title}”, ${out.questions} questions, to the student’s Notes${out.course?.code ? ` under ${out.course.code}` : ''}. They take it in Akada${out.url ? ` at ${out.url}` : ''}; call get_quiz afterwards to see how they did.`,
    });
  } catch (cause) {
    return toolCrashed('send_quiz', cause);
  }
}

export async function listQuizzesTool(
  token: AuthenticatedToken,
  { course_id, task_id, limit }: z.infer<typeof ListQuizzesInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    let request = supabase.from('quizzes').select('*').eq('user_id', token.userId);
    if (course_id) request = request.eq('course_id', course_id);
    if (task_id) request = request.eq('task_id', task_id);
    const { data, error } = await request.order('created_at', { ascending: false }).limit(limit);
    if (error) return queryFailed('list_quizzes', 'quizzes read', error, 'Akada could not read the quizzes.');
    const rows = (data ?? []) as QuizRow[];
    const refs = await refsFor(supabase, token.userId, rows);
    return result({ quizzes: rows.map((r) => summary(r, refs)), count: rows.length });
  } catch (cause) {
    return toolCrashed('list_quizzes', cause);
  }
}

export async function getQuizTool(
  token: AuthenticatedToken,
  { quiz_id }: z.infer<typeof GetQuizInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    const { data, error } = await supabase.from('quizzes').select('*').eq('id', quiz_id).eq('user_id', token.userId).maybeSingle();
    if (error) return queryFailed('get_quiz', 'quiz read', error, 'Akada could not read that quiz.');
    if (!data) return toolError('That quiz is not in the student’s Akada. Find it with list_quizzes and use the id it returns.');
    const row = data as QuizRow;
    const questions = cleanQuestions(row.questions);
    const attempts = cleanAttempts(row.attempts);
    const last = attempts[attempts.length - 1];
    return result({
      quiz: {
        ...summary(row, await refsFor(supabase, token.userId, [row])),
        questions: questions.map((q, i) => {
          const pick = last?.picks[i];
          return {
            number: i + 1,
            question: q.prompt,
            options: q.options.map((o, k) => `${LETTERS[k]}) ${o}`),
            answer: LETTERS[q.answer],
            why: q.explain ?? null,
            last_pick: last ? (pick !== undefined && pick >= 0 ? LETTERS[pick] : 'blank') : null,
            last_correct: last ? pick === q.answer : null,
          };
        }),
        history: attempts.map((a) => ({ at: a.at, score: a.score, total: a.total })),
      },
    });
  } catch (cause) {
    return toolCrashed('get_quiz', cause);
  }
}

export async function deleteQuizTool(
  token: AuthenticatedToken,
  { quiz_id }: z.infer<typeof DeleteQuizInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    const { data, error } = await supabase.from('quizzes').delete().eq('id', quiz_id).eq('user_id', token.userId).select('id, title').maybeSingle();
    if (error) return queryFailed('delete_quiz', 'quiz delete', error, 'Akada could not delete that quiz.');
    if (!data) return toolError('That quiz is not in the student’s Akada.');
    return result({ deleted: data, message: `Deleted “${data.title}”.` });
  } catch (cause) {
    return toolCrashed('delete_quiz', cause);
  }
}

/* ── Registration ───────────────────────────────────────────────────── */

const GET_QUIZ_FORMAT_DESCRIPTION = 'Get the exact text format Akada parses multiple-choice quizzes from. Call this before send_quiz the first time in a conversation, whenever the student asks to be quizzed and wants to take it in Akada. This tool never changes Akada data.';

const SEND_QUIZ_DESCRIPTION = `Send a multiple-choice quiz with its answer key to the student's Akada, where they take it on the Notes screen and get marked. Use this when the student asks to be quizzed or tested on material (a book chapter, a reading, lecture slides, one of their notes) and wants to do it in Akada rather than in chat. Do not reveal the answers in chat. Write the quiz in this format exactly and pass the whole text as \`quiz\`:

${QUIZ_FORMAT_RULES}

File it: course_id from find_course, task_id from get_tasks when it tests one chapter or reading task, note_id from list_notes when it tests a note. A task or note fills in its course. If the text does not parse, the reply lists what to fix; fix it and send again. The reply includes a url the student opens.`;

const LIST_QUIZZES_DESCRIPTION = 'List the quizzes in the student’s Akada, newest first, with what each is filed under and the last and best marks. Optionally narrow to a course or task. This tool never changes Akada data.';

const GET_QUIZ_DESCRIPTION = 'Read one quiz from Akada with its answer key, what the student picked on their latest attempt and whether each was right, and every past mark. Use it after they have taken it to go over what they missed. This tool never changes Akada data.';

const DELETE_QUIZ_DESCRIPTION = 'Permanently delete a quiz and its marks from Akada. Only when the student clearly asks for that quiz to be deleted.';

export function registerQuizTools(server: McpServer, token: AuthenticatedToken) {
  server.registerTool(
    'get_quiz_format',
    { title: 'Get Akada’s quiz format', description: GET_QUIZ_FORMAT_DESCRIPTION, inputSchema: z.object({}), annotations: { readOnlyHint: true } },
    async () => getQuizFormatTool(),
  );
  server.registerTool(
    'send_quiz',
    { title: 'Send a quiz to Akada', description: SEND_QUIZ_DESCRIPTION, inputSchema: SendQuizInput, annotations: { destructiveHint: false, idempotentHint: false } },
    async (input) => sendQuizTool(token, input),
  );
  server.registerTool(
    'list_quizzes',
    { title: 'List Akada quizzes', description: LIST_QUIZZES_DESCRIPTION, inputSchema: ListQuizzesInput, annotations: { readOnlyHint: true } },
    async (input) => listQuizzesTool(token, input),
  );
  server.registerTool(
    'get_quiz',
    { title: 'Read an Akada quiz and its marks', description: GET_QUIZ_DESCRIPTION, inputSchema: GetQuizInput, annotations: { readOnlyHint: true } },
    async (input) => getQuizTool(token, input),
  );
  server.registerTool(
    'delete_quiz',
    { title: 'Delete an Akada quiz', description: DELETE_QUIZ_DESCRIPTION, inputSchema: DeleteQuizInput, annotations: { destructiveHint: true } },
    async (input) => deleteQuizTool(token, input),
  );
}
