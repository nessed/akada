import { createClient } from '@supabase/supabase-js';
import type { readAccessToken } from '@/lib/mcp-auth';
import { READ_SCOPE, WRITE_SCOPE } from './scopes';

export const MCP_SCOPES = [READ_SCOPE, WRITE_SCOPE] as const;

type KnownCallback = { name: string; test: (uri: string) => boolean };

function isLoopbackCallback(uri: string) {
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      (url.pathname === '/oauth/callback' || url.pathname === '/callback')
    );
  } catch {
    return false;
  }
}

// Each assistant's connector flow uses its own fixed callback URL (Gemini CLI's
// loopback redirect is the exception: it's a local server on a port that changes
// every run, so it's matched by shape instead of an exact string).
const KNOWN_CALLBACKS: KnownCallback[] = [
  { name: 'Claude', test: (uri) => uri === 'https://claude.ai/api/mcp/auth_callback' },
  {
    name: 'ChatGPT',
    // The plugin dialog hands each connector its own /connector/oauth/<id>
    // callback; the older apps flow and OpenAI's review tool use fixed ones.
    test: (uri) =>
      uri === 'https://chatgpt.com/connector_platform_oauth_redirect' ||
      uri === 'https://platform.openai.com/apps-manage/oauth' ||
      /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(uri),
  },
  {
    name: 'Gemini',
    test: (uri) => uri === 'https://vertexaisearch.cloud.google.com/oauth-redirect' || isLoopbackCallback(uri),
  },
];

export function matchKnownCallback(uri: string): string | null {
  return KNOWN_CALLBACKS.find((candidate) => candidate.test(uri))?.name ?? null;
}

export function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error('NEXT_PUBLIC_SITE_URL is not configured.');
  return value.replace(/\/$/, '');
}

export function mcpUrl() {
  return `${siteUrl()}/api/mcp`;
}

// RFC 8707: a client names the server it wants a token for. Akada has one
// MCP server, so the only acceptable answer is its URL (a trailing slash is
// tolerated). No `resource` at all is allowed for clients that predate it.
export function checkResource(value: string | null | undefined) {
  if (value === null || value === undefined) return true;
  try {
    const url = new URL(value);
    if (url.hash) return false;
    return url.href.replace(/\/$/, '') === mcpUrl();
  } catch {
    return false;
  }
}

export function oauthError(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  );
}

function buildClient(url: string, anonKey: string, accessToken?: string) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

// The client for the last access token asked for. One MCP message used to
// build two or three identical clients (authentication, then each tool's
// default argument, then again inside activeSemesterId), and each one builds
// its auth, REST and realtime halves up front. A client made for an access
// token holds nothing but that token in its headers, so the same token gets
// the same client. Never the tokenless client: the OAuth routes sign in and
// refresh on that one, which leaves a session in its memory.
let lastClient: { key: string; client: ReturnType<typeof buildClient> } | null = null;

export function mcpSupabase(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase is not configured.');
  if (!accessToken) return buildClient(url, anonKey);
  const key = `${url}\n${anonKey}\n${accessToken}`;
  if (lastClient?.key === key) return lastClient.client;
  const client = buildClient(url, anonKey, accessToken);
  lastClient = { key, client };
  return client;
}

export function hasAllowedScopes(value: string | null) {
  if (!value) return MCP_SCOPES.join(' ');
  const scopes = value.split(/\s+/).filter(Boolean);
  return scopes.every((scope) => (MCP_SCOPES as readonly string[]).includes(scope))
    ? scopes.join(' ')
    : null;
}

export function htmlEscape(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}

type McpToken = Pick<ReturnType<typeof readAccessToken>, 'userId' | 'supabaseAccessToken'>;

/**
 * The student's settings row: the semester everything is scoped to, their
 * daily goal, and the clock the app writes (lib/student-day.ts), which is how
 * the connector knows the student's day instead of assuming UTC. `*` because
 * the clock columns are an additive migration.
 *
 * `supabase` is injectable (defaulting to a real client) so a test can drive
 * this against an in-memory double instead of a live project.
 */
export async function readStudentSettings(token: McpToken, supabase: ReturnType<typeof mcpSupabase> = mcpSupabase(token.supabaseAccessToken)) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', token.userId)
    .maybeSingle();
  // Carry the cause up rather than flattening it: the outer catch logs it.
  // Codes, messages and hints only: PostgREST puts row values in `details`.
  if (error) {
    const reason = [error.code, error.message, error.hint].filter(Boolean).join(' | ');
    throw new Error(`Akada could not load your active semester. ${reason}`);
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const goal = Number(row.daily_goal_hours);
  return {
    semesterId: (row.active_semester_id as string | null | undefined) ?? null,
    dailyGoalHours: Number.isFinite(goal) && goal > 0 ? goal : null,
    timeZone: typeof row.time_zone === 'string' ? row.time_zone : '',
    dayEndingHour: Number(row.day_ending_hour ?? 0),
  };
}

/**
 * Starts a read now so it runs alongside the ones before it, to be awaited
 * later. A tool that returns early on an earlier failure never awaits it, so
 * a rejection is caught here rather than surfacing as unhandled; awaiting the
 * returned promise still throws it.
 */
export function startRead<T>(read: PromiseLike<T>): Promise<T> {
  const started = Promise.resolve(read);
  started.catch(() => {});
  return started;
}
