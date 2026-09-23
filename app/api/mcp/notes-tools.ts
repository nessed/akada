import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { readAccessToken } from '@/lib/mcp-auth';
import { FORMAT_RULES } from '@/lib/notes/format';
import { cleanChecks, extractChecks, type CheckResult } from '@/lib/notes/checks';
import { NOTE_MARKDOWN_MAX, NOTE_TITLE_MAX, cleanNoteMarkdown, cleanNoteTitle } from '@/lib/notes/limits';
import { mcpSupabase, siteUrl } from './_shared';

/**
 * The notes tools. An assistant with the connector writes a study note
 * straight onto the student's Notes shelf in Markd's format, reads one back
 * to quiz them on it, and records how the quiz went so the strokes on the
 * page fill in. Kept out of route.ts, which only registers them.
 */

type AuthenticatedToken = ReturnType<typeof readAccessToken>;
type McpSupabaseClient = ReturnType<typeof mcpSupabase>;
type QueryFailure = { message?: string; code?: string; details?: string; hint?: string } | null;

interface NoteRow {
  id: string;
  course_id: string | null;
  title: string;
  markdown: string;
  checks: unknown;
  source: string;
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
const NOTES_NOT_SET_UP =
  'Notes are not set up in this Akada database yet. The student needs to run the latest supabase/schema.sql once.';

// Same shape as route.ts: the real cause in the log, a short safe reason in
// the reply, never `details` (PostgREST puts row values there).
function queryFailed(tool: string, step: string, error: QueryFailure, message: string) {
  console.error(`[mcp:${tool}] ${step} failed`, { code: error?.code, message: error?.message, hint: error?.hint });
  if (error?.code && MISSING_TABLE.includes(error.code)) return toolError(NOTES_NOT_SET_UP);
  const reason = [error?.code, error?.message, error?.hint].filter(Boolean).join(' | ');
  return toolError(reason ? `${message} (${reason})` : message);
}

function toolCrashed(tool: string, cause: unknown) {
  const reason = cause instanceof Error ? cause.message : String(cause ?? '');
  console.error(`[mcp:${tool}] unhandled failure`, reason);
  return toolError(`Akada is not configured or your session has expired. Reconnect the connector and try again.${reason ? ` (${reason})` : ''}`);
}

function noteUrl(id: string): string | null {
  try {
    return `${siteUrl()}/notes?n=${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}

function words(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/[#>*_`~|=-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function tally(markdown: string, stored: unknown) {
  const total = extractChecks(markdown).length;
  const checks = cleanChecks(stored, total);
  const values = Object.values(checks);
  const got = values.filter((v) => v === 'got').length;
  const miss = values.filter((v) => v === 'miss').length;
  return { total, got, not_yet: miss, untried: total - got - miss };
}

type CourseRef = { id: string; code: string; name: string };

async function loadCourses(supabase: McpSupabaseClient, userId: string, ids: string[]) {
  const map = new Map<string, CourseRef>();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return map;
  const { data } = await supabase.from('courses').select('id, code, name').eq('user_id', userId).in('id', wanted);
  for (const course of data ?? []) map.set(course.id, course as CourseRef);
  return map;
}

function summary(row: NoteRow, course: CourseRef | undefined) {
  const w = words(row.markdown);
  return {
    id: row.id,
    title: row.title,
    course: course ? { id: course.id, code: course.code, name: course.name } : null,
    source: row.source,
    words: w,
    minutes: Math.max(1, Math.round(w / 200)),
    checks: tally(row.markdown, row.checks),
    updated_at: row.updated_at,
    url: noteUrl(row.id),
  };
}

async function loadNote(tool: string, token: AuthenticatedToken, supabase: McpSupabaseClient, noteId: string) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', noteId)
    .eq('user_id', token.userId)
    .maybeSingle();
  if (error) return { ok: false as const, error: queryFailed(tool, 'note read', error, 'Akada could not read that note.') };
  if (!data) return { ok: false as const, error: toolError('That note is not on the student’s Notes shelf. Find it again with list_notes and use the id it returns.') };
  return { ok: true as const, row: data as NoteRow };
}

async function checkCourse(tool: string, token: AuthenticatedToken, supabase: McpSupabaseClient, courseId: string) {
  const { data, error } = await supabase
    .from('courses')
    .select('id, code, name')
    .eq('id', courseId)
    .eq('user_id', token.userId)
    .maybeSingle();
  if (error) return { ok: false as const, error: queryFailed(tool, 'course lookup', error, 'Akada could not look up that course.') };
  if (!data) return { ok: false as const, error: toolError('That course is not one of the student’s. Find it with find_course and use the id it returns.') };
  return { ok: true as const, course: data as CourseRef };
}

/* ── Inputs ─────────────────────────────────────────────────────────── */

export const SaveNoteInput = z.object({
  markdown: z.string().trim().min(1).max(NOTE_MARKDOWN_MAX),
  title: z.string().trim().max(NOTE_TITLE_MAX).optional(),
  course_id: z.string().uuid().optional(),
});

export const ListNotesInput = z.object({
  query: z.string().trim().max(120).optional(),
  course_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const GetNoteInput = z.object({
  note_id: z.string().uuid(),
  include_markdown: z.boolean().default(true),
});

export const UpdateNoteInput = z.object({
  note_id: z.string().uuid(),
  markdown: z.string().trim().min(1).max(NOTE_MARKDOWN_MAX).optional(),
  append: z.string().trim().min(1).max(NOTE_MARKDOWN_MAX).optional(),
  title: z.string().trim().min(1).max(NOTE_TITLE_MAX).optional(),
  course_id: z.string().uuid().nullable().optional(),
});

export const RecordNoteChecksInput = z.object({
  note_id: z.string().uuid(),
  results: z
    .array(z.object({ index: z.number().int().min(0).max(999), result: z.enum(['got', 'not_yet', 'clear']) }))
    .min(1)
    .max(100),
});

export const DeleteNoteInput = z.object({ note_id: z.string().uuid() });

/* ── Tools ──────────────────────────────────────────────────────────── */

export async function saveNoteTool(
  token: AuthenticatedToken,
  { markdown, title, course_id }: z.infer<typeof SaveNoteInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    let course: CourseRef | undefined;
    if (course_id) {
      const found = await checkCourse('save_note', token, supabase, course_id);
      if (!found.ok) return found.error;
      course = found.course;
    }
    const body = cleanNoteMarkdown(markdown);
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: token.userId,
        course_id: course?.id ?? null,
        title: cleanNoteTitle(title ?? '', body),
        markdown: body,
        source: 'mcp',
      })
      .select('*')
      .single();
    if (error) return queryFailed('save_note', 'note insert', error, 'Akada could not save that note.');
    const note = summary(data as NoteRow, course);
    return result({
      note,
      message: `Saved “${note.title}” to the student’s Notes${course ? ` under ${course.code}` : ''}.${note.url ? ` Open it at ${note.url}` : ''}`,
    });
  } catch (cause) {
    return toolCrashed('save_note', cause);
  }
}

export async function listNotesTool(
  token: AuthenticatedToken,
  { query, course_id, limit }: z.infer<typeof ListNotesInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    let request = supabase.from('notes').select('*').eq('user_id', token.userId);
    if (course_id) request = request.eq('course_id', course_id);
    const { data, error } = await request.order('updated_at', { ascending: false }).limit(200);
    if (error) return queryFailed('list_notes', 'notes read', error, 'Akada could not read the notes.');
    let rows = (data ?? []) as NoteRow[];
    if (query) {
      const needle = query.toLowerCase();
      rows = rows.filter((r) => r.title.toLowerCase().includes(needle) || r.markdown.toLowerCase().includes(needle));
    }
    rows = rows.slice(0, limit);
    const courses = await loadCourses(supabase, token.userId, rows.map((r) => r.course_id ?? ''));
    return result({
      notes: rows.map((r) => summary(r, r.course_id ? courses.get(r.course_id) : undefined)),
      count: rows.length,
    });
  } catch (cause) {
    return toolCrashed('list_notes', cause);
  }
}

export async function getNoteTool(
  token: AuthenticatedToken,
  { note_id, include_markdown }: z.infer<typeof GetNoteInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    const loaded = await loadNote('get_note', token, supabase, note_id);
    if (!loaded.ok) return loaded.error;
    const row = loaded.row;
    const courses = await loadCourses(supabase, token.userId, [row.course_id ?? '']);
    const extracted = extractChecks(row.markdown);
    const stored = cleanChecks(row.checks, extracted.length);
    return result({
      note: {
        ...summary(row, row.course_id ? courses.get(row.course_id) : undefined),
        ...(include_markdown ? { markdown: row.markdown } : {}),
        check_questions: extracted.map((c) => ({
          index: c.index,
          question: c.question,
          answer: c.answer,
          result: stored[String(c.index)] === 'miss' ? 'not_yet' : stored[String(c.index)] ?? null,
        })),
      },
    });
  } catch (cause) {
    return toolCrashed('get_note', cause);
  }
}

export async function updateNoteTool(
  token: AuthenticatedToken,
  { note_id, markdown, append, title, course_id }: z.infer<typeof UpdateNoteInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    if (markdown === undefined && append === undefined && title === undefined && course_id === undefined) {
      return toolError('Nothing to change. Pass `markdown` to replace the note, `append` to add to the end, `title`, or `course_id`.');
    }
    if (markdown !== undefined && append !== undefined) {
      return toolError('Pass either `markdown` (the whole note, replaced) or `append` (added to the end), not both.');
    }
    const loaded = await loadNote('update_note', token, supabase, note_id);
    if (!loaded.ok) return loaded.error;
    const row = loaded.row;

    let course: CourseRef | undefined;
    if (course_id) {
      const found = await checkCourse('update_note', token, supabase, course_id);
      if (!found.ok) return found.error;
      course = found.course;
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let body = row.markdown;
    if (markdown !== undefined) body = cleanNoteMarkdown(markdown);
    if (append !== undefined) body = cleanNoteMarkdown(`${row.markdown.replace(/\s+$/, '')}\n\n${append}`);
    if (body !== row.markdown) {
      patch.markdown = body;
      // A rewrite can move the checks around; results past the new count go.
      patch.checks = cleanChecks(row.checks, extractChecks(body).length);
    }
    if (title !== undefined) patch.title = cleanNoteTitle(title, body);
    else if (markdown !== undefined) patch.title = cleanNoteTitle('', body);
    if (course_id !== undefined) patch.course_id = course_id;

    const { data, error } = await supabase
      .from('notes')
      .update(patch)
      .eq('id', note_id)
      .eq('user_id', token.userId)
      .select('*')
      .maybeSingle();
    if (error) return queryFailed('update_note', 'note update', error, 'Akada could not change that note.');
    if (!data) return toolError('That note is not on the student’s Notes shelf.');
    const saved = data as NoteRow;
    if (!course && saved.course_id) course = (await loadCourses(supabase, token.userId, [saved.course_id])).get(saved.course_id);
    return result({ note: summary(saved, course), message: `Updated “${saved.title}”.` });
  } catch (cause) {
    return toolCrashed('update_note', cause);
  }
}

export async function recordNoteChecksTool(
  token: AuthenticatedToken,
  { note_id, results }: z.infer<typeof RecordNoteChecksInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    const loaded = await loadNote('record_note_checks', token, supabase, note_id);
    if (!loaded.ok) return loaded.error;
    const row = loaded.row;
    const total = extractChecks(row.markdown).length;
    if (!total) return toolError('This note has no [!CHECK] blocks to record against.');
    const bad = results.filter((r) => r.index >= total).map((r) => r.index);
    if (bad.length) return toolError(`This note has ${total} checks, numbered 0 to ${total - 1}. No check at ${bad.join(', ')}.`);

    const checks: Record<string, CheckResult> = cleanChecks(row.checks, total);
    for (const { index, result: outcome } of results) {
      if (outcome === 'clear') delete checks[String(index)];
      else checks[String(index)] = outcome === 'got' ? 'got' : 'miss';
    }
    const { error } = await supabase
      .from('notes')
      .update({ checks })
      .eq('id', note_id)
      .eq('user_id', token.userId);
    if (error) return queryFailed('record_note_checks', 'checks update', error, 'Akada could not record those results.');
    const counts = tally(row.markdown, checks);
    return result({
      note_id,
      checks: counts,
      message: `Recorded. ${counts.got} got, ${counts.not_yet} not yet, ${counts.untried} untried.`,
    });
  } catch (cause) {
    return toolCrashed('record_note_checks', cause);
  }
}

export async function deleteNoteTool(
  token: AuthenticatedToken,
  { note_id }: z.infer<typeof DeleteNoteInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    const loaded = await loadNote('delete_note', token, supabase, note_id);
    if (!loaded.ok) return loaded.error;
    const { error } = await supabase.from('notes').delete().eq('id', note_id).eq('user_id', token.userId);
    if (error) return queryFailed('delete_note', 'note delete', error, 'Akada could not delete that note.');
    return result({ deleted: { id: note_id, title: loaded.row.title }, message: `Deleted “${loaded.row.title}”.` });
  } catch (cause) {
    return toolCrashed('delete_note', cause);
  }
}

/* ── Registration ───────────────────────────────────────────────────── */

const SAVE_NOTE_DESCRIPTION = `Save a study note straight to the student's Notes shelf in Akada, where it is read with callouts, self-check questions and a contents column. Use this whenever the student asks for notes, a summary, a study guide or a cheat sheet to be put in Akada, instead of pasting the markdown into chat. Write the note in Markd format, following these rules exactly:

${FORMAT_RULES}

Link it to a course with course_id (from find_course) when the material belongs to one. The reply includes a url the student can open.`;

const LIST_NOTES_DESCRIPTION = 'List the student’s study notes in Akada, newest first, with each note’s course, length and how their self-checks have gone. Optionally search by text or narrow to a course. This tool never changes Akada data.';

const GET_NOTE_DESCRIPTION = 'Read one study note from Akada: its markdown and its [!CHECK] questions with answers and how the student did on each (got, not_yet, or null for untried). Use it to answer questions about the note, to quiz the student, or before update_note. When quizzing, ask one question at a time and do not show the answer until they have tried. This tool never changes Akada data.';

const UPDATE_NOTE_DESCRIPTION = 'Change a study note in Akada. Pass `markdown` to replace the whole note, or `append` to add a section to the end (for example, more [!CHECK] questions or a section the student asked for). Also sets `title`, or links it to a course with `course_id` (null to unlink). Keep to the Markd format that save_note describes.';

const RECORD_NOTE_CHECKS_DESCRIPTION = 'Record how the student did on a note’s [!CHECK] questions after quizzing them in chat. `index` is the check’s position from get_note’s check_questions. `got` means they had it, `not_yet` means they missed it or only half had it, `clear` wipes a result. The strokes on the note page in Akada fill in from this.';

const DELETE_NOTE_DESCRIPTION = 'Permanently delete a study note from Akada. Only when the student clearly asks for that note to be deleted.';

export function registerNoteTools(server: McpServer, token: AuthenticatedToken) {
  server.registerTool(
    'save_note',
    {
      title: 'Save a study note to Akada',
      description: SAVE_NOTE_DESCRIPTION,
      inputSchema: SaveNoteInput,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async (input) => saveNoteTool(token, input),
  );
  server.registerTool(
    'list_notes',
    {
      title: 'List Akada study notes',
      description: LIST_NOTES_DESCRIPTION,
      inputSchema: ListNotesInput,
      annotations: { readOnlyHint: true },
    },
    async (input) => listNotesTool(token, input),
  );
  server.registerTool(
    'get_note',
    {
      title: 'Read an Akada study note',
      description: GET_NOTE_DESCRIPTION,
      inputSchema: GetNoteInput,
      annotations: { readOnlyHint: true },
    },
    async (input) => getNoteTool(token, input),
  );
  server.registerTool(
    'update_note',
    {
      title: 'Change an Akada study note',
      description: UPDATE_NOTE_DESCRIPTION,
      inputSchema: UpdateNoteInput,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async (input) => updateNoteTool(token, input),
  );
  server.registerTool(
    'record_note_checks',
    {
      title: 'Record self-check results on a note',
      description: RECORD_NOTE_CHECKS_DESCRIPTION,
      inputSchema: RecordNoteChecksInput,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async (input) => recordNoteChecksTool(token, input),
  );
  server.registerTool(
    'delete_note',
    {
      title: 'Delete an Akada study note',
      description: DELETE_NOTE_DESCRIPTION,
      inputSchema: DeleteNoteInput,
      annotations: { destructiveHint: true },
    },
    async (input) => deleteNoteTool(token, input),
  );
}
