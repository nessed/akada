import { createClient } from '@supabase/supabase-js';

export const MCP_SCOPES = ['akada.tasks.read', 'akada.tasks.write'] as const;
export const CLAUDE_CALLBACK_URL = 'https://claude.ai/api/mcp/auth_callback';

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
