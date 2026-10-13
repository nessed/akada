import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { readLiveSitting, type LiveSittingReading } from '@/lib/live-sitting';
import { mcpSupabase, readStudentSettings } from './_shared';
import { result, toolCrashed, type AuthenticatedToken, type McpSupabaseClient } from './_tool-kit';

/**
 * get_current_session: the sitting on the clock right now, before it is logged.
 *
 * The app writes it onto user_settings.live_sitting as the sitting changes
 * shape and every ten minutes while it is open (lib/live-sitting.ts), so this
 * is one row that is already read for the student's day anyway. get_overview
 * and get_briefing carry the same reading as `current_session`.
 */

export const GetCurrentSessionInput = z.object({});

export const GET_CURRENT_SESSION_DESCRIPTION =
  'Read the study sitting the signed-in student has on Akada’s timer right now, which is not a logged session yet: its course and task, whether it is in a focus block, on a break, paused, or stopped and waiting to be logged, the focus and break time so far (breaks are never counted as focus), how many blocks and breaks it has had, and what the student wrote about each finished block. `current_session` is null when nothing is on the clock. The app logs the sitting itself when the student finishes it, so never log it again with log_study_session; its time already counts in get_briefing’s hours. When `quiet` is true the app has not been heard from since `last_synced_at` (the page was likely closed) and the figures are as of then. get_overview and get_briefing carry the same reading. This tool never changes Akada data.';

export interface CurrentSession {
  state: LiveSittingReading['state'];
  course: { id: string; code: string; name: string } | null;
  task: { id: string; title: string } | null;
  date: string;
  started_at: string;
  focus_minutes: number;
  focus_seconds: number;
  break_minutes: number;
  break_seconds: number;
  current_stretch_seconds?: number;
  current_stretch_target_seconds?: number | null;
  blocks_done: number;
  breaks_taken: number;
  block_notes: string[];
  last_synced_at: string;
  quiet: boolean;
  summary: string;
}

const minutes = (seconds: number) => Math.round(seconds / 60);

function span(seconds: number): string {
  const total = minutes(seconds);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function describe(reading: LiveSittingReading, label: string): string {
  const time = `${span(reading.focus_seconds)} of focus${reading.break_seconds >= 60 ? ` and ${span(reading.break_seconds)} of break` : ''}`;
  if (reading.state === 'stopped') {
    return `A ${label} sitting has stopped with ${time} and is waiting on the student's log sheet. The app logs it when they save it; do not log it with log_study_session.`;
  }
  const where =
    reading.state === 'break' ? 'on a break' : reading.state === 'paused' ? 'paused' : 'in a focus block';
  const quiet = reading.quiet
    ? ` The app has not been heard from since ${reading.last_synced_at}, so this is as of then; the page was likely closed and the app will settle the sitting when it is next opened.`
    : '';
  return `A ${label} sitting is on the clock, ${where}: ${time} so far. It is not logged yet; the app logs it when the student finishes, so do not log it with log_study_session.${quiet}`;
}

/**
 * The stored snapshot, worked out to now and named. `raw` is the settings
 * row's live_sitting when the caller has already read it.
 */
export async function readCurrentSession(
  token: AuthenticatedToken,
  supabase: McpSupabaseClient,
  raw: unknown,
  now = Date.now(),
): Promise<{ reading: LiveSittingReading; current: CurrentSession } | null> {
  const reading = readLiveSitting(raw, now);
  if (!reading) return null;
  // Names only, and a missing one is not a failure: the course may have been
  // deleted under a running clock, and the sitting is still worth reporting.
  const [courseRead, taskRead] = await Promise.all([
    supabase.from('courses').select('id, code, name').eq('user_id', token.userId).eq('id', reading.course_id).maybeSingle(),
    reading.task_id
      ? supabase.from('tasks').select('id, title').eq('user_id', token.userId).eq('id', reading.task_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const courseRow = (courseRead.error ? null : courseRead.data) as Record<string, unknown> | null;
  const taskRow = (taskRead.error ? null : taskRead.data) as Record<string, unknown> | null;
  const course = courseRow
    ? { id: String(courseRow.id), code: String(courseRow.code ?? ''), name: String(courseRow.name ?? '') }
    : null;
  const task = taskRow ? { id: String(taskRow.id), title: String(taskRow.title ?? '') } : null;
  const current: CurrentSession = {
    state: reading.state,
    course,
    task,
    date: reading.date,
    started_at: reading.started_at,
    focus_minutes: minutes(reading.focus_seconds),
    focus_seconds: reading.focus_seconds,
    break_minutes: minutes(reading.break_seconds),
    break_seconds: reading.break_seconds,
    ...(reading.current_stretch_seconds != null
      ? {
          current_stretch_seconds: reading.current_stretch_seconds,
          current_stretch_target_seconds: reading.current_stretch_target_seconds ?? null,
        }
      : {}),
    blocks_done: reading.blocks_done,
    breaks_taken: reading.breaks_taken,
    block_notes: reading.block_notes,
    last_synced_at: reading.last_synced_at,
    quiet: reading.quiet,
    summary: describe(reading, course?.code || 'study'),
  };
  return { reading, current };
}

export async function getCurrentSessionTool(
  token: AuthenticatedToken,
  _input: z.infer<typeof GetCurrentSessionInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
  now = Date.now(),
) {
  try {
    const settings = await readStudentSettings(token, supabase);
    const found = await readCurrentSession(token, supabase, settings.liveSitting, now);
    if (!found) {
      return result({ current_session: null, message: 'Nothing is on the Akada timer right now.' });
    }
    return result({ current_session: found.current, message: found.current.summary });
  } catch (cause) {
    return toolCrashed('get_current_session', cause);
  }
}

export function registerLiveTool(server: McpServer, token: AuthenticatedToken) {
  server.registerTool(
    'get_current_session',
    {
      title: 'Read the sitting on the Akada timer',
      description: GET_CURRENT_SESSION_DESCRIPTION,
      inputSchema: GetCurrentSessionInput,
      annotations: { readOnlyHint: true },
    },
    async (input) => getCurrentSessionTool(token, input),
  );
}
