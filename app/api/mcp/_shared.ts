import { createClient } from '@supabase/supabase-js';

export const MCP_SCOPES = ['akada.tasks.read', 'akada.tasks.write'] as const;

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
  { name: 'ChatGPT', test: (uri) => uri === 'https://chatgpt.com/connector_platform_oauth_redirect' },
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
