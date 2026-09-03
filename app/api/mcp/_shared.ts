import { createClient } from '@supabase/supabase-js';

export const MCP_SCOPES = ['akada.tasks.read', 'akada.tasks.write'] as const;
/**
 * Hosts Claude serves its connector callback from. Claude web is on both
 * domains, and which one a given account lands on is not ours to predict, so
 * hardcoding one of them broke registration for half the clients that exist.
 */
const CLAUDE_CALLBACK_HOSTS = new Set(['claude.ai', 'claude.com']);

/** RFC 8252 loopback: Claude Code, MCP Inspector and anything else running locally. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const MAX_REDIRECT_URIS = 5;

/**
 * A redirect URI is where an authorization code gets delivered, so a bad one
 * is a code handed to somebody else. Claude's own hosts over https, plus
 * http loopback on any port for local clients — nothing else.
 */
export function isAllowedRedirectUri(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return CLAUDE_CALLBACK_HOSTS.has(url.hostname);
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);
  return false;
}

export function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error('NEXT_PUBLIC_SITE_URL is not configured.');
  return value.replace(/\/$/, '');
}

export function mcpUrl() {
  return `${siteUrl()}/api/mcp`;
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

export function mcpSupabase(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase is not configured.');
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
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
