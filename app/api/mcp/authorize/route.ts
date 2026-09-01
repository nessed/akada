import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import {
  hasAllowedScopes,
  htmlEscape,
  oauthError,
  siteUrl,
} from '../_shared';
import { issueAuthorizationCode, readMcpClient } from '@/lib/mcp-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuthorizationParams = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state: string | null;
};

function parseAuthorizationParams(searchParams: URLSearchParams): AuthorizationParams | Response {
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const codeChallenge = searchParams.get('code_challenge');
  const scope = hasAllowedScopes(searchParams.get('scope'));
  if (searchParams.get('response_type') !== 'code') {
    return oauthError('unsupported_response_type', 'Only the authorization-code flow is supported.');
  }
  if (!clientId || !redirectUri || !codeChallenge || !scope) {
    return oauthError('invalid_request', 'client_id, redirect_uri, code_challenge and valid scopes are required.');
  }
  if (searchParams.get('code_challenge_method') !== 'S256') {
    return oauthError('invalid_request', 'PKCE with S256 is required.');
  }
  try {
    const client = readMcpClient(clientId);
    if (!client.redirectUris.includes(redirectUri)) {
      return oauthError('invalid_request', 'The redirect URI does not match the registered client.');
    }
  } catch {
    return oauthError('invalid_client', 'The connector registration has expired or is invalid.');
  }
  return { clientId, redirectUri, codeChallenge, scope, state: searchParams.get('state') };
}

function createSessionClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase is not configured.');
  const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        pendingCookies.push(...cookies.map(({ name, value, options }) => ({
          name,
          value,
          options: (options ?? {}) as Record<string, unknown>,
        })));
      },
    },
  });
  return { client, pendingCookies };
}

function withCookies(response: NextResponse, pendingCookies: { name: string; value: string; options: Record<string, unknown> }[]) {
  for (const cookie of pendingCookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

async function currentSession(request: NextRequest) {
  const sessionClient = createSessionClient(request);
  const {
    data: { user },
  } = await sessionClient.client.auth.getUser();
  const {
    data: { session },
  } = await sessionClient.client.auth.getSession();
  return { ...sessionClient, user, session };
}

function consentPage(params: AuthorizationParams) {
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${htmlEscape(value)}" />`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connect Claude to Akada</title>
<style>body{margin:0;background:#f8f5ed;color:#1e1b17;font:16px Georgia,serif}.wrap{width:min(92vw,460px);margin:12vh auto;padding:32px;border:1px solid #ddd4c1;border-radius:18px;background:#fffdf8}.eyebrow{font:600 11px system-ui,sans-serif;letter-spacing:.12em;color:#8b806d}.note{color:#756b5c;line-height:1.55}.actions{display:flex;gap:12px;margin-top:26px}button,a{border-radius:11px;padding:12px 16px;font:600 14px system-ui,sans-serif;text-decoration:none;cursor:pointer}button{border:0;background:#1e1b17;color:#fff}a{border:1px solid #d8cfbd;color:#332e27}</style></head>
<body><main class="wrap"><p class="eyebrow">AKADA CONNECTOR</p><h1>Connect Claude to Akada?</h1><p class="note">Claude will be able to find your current courses and add study tasks to them. It cannot delete courses, tasks, or study history.</p><form id="mcp-consent" method="post" action="/api/mcp/authorize">${hidden('response_type', 'code')}${hidden('client_id', params.clientId)}${hidden('redirect_uri', params.redirectUri)}${hidden('code_challenge', params.codeChallenge)}${hidden('code_challenge_method', 'S256')}${hidden('scope', params.scope)}${params.state ? hidden('state', params.state) : ''}<div class="actions"><button type="submit">Allow connection</button><a href="${htmlEscape(siteUrl())}">Cancel</a></div></form></main><script>document.getElementById('mcp-consent').addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget;const response=await fetch(form.action,{method:'POST',body:new FormData(form),headers:{Accept:'application/json'}});if(!response.ok){window.location.reload();return}const payload=await response.json();window.location.assign(payload.redirect_uri)})</script></body></html>`;
}

export async function GET(request: NextRequest) {
  const parsed = parseAuthorizationParams(request.nextUrl.searchParams);
  if (parsed instanceof Response) return parsed;
  const auth = await currentSession(request);
  if (!auth.user || !auth.session) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return withCookies(NextResponse.redirect(new URL(`/auth?next=${encodeURIComponent(next)}`, request.nextUrl.origin)), auth.pendingCookies);
  }
  return withCookies(new NextResponse(consentPage(parsed), {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' },
  }), auth.pendingCookies);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin !== request.nextUrl.origin) return oauthError('invalid_request', 'Invalid authorization request origin.', 403);
  const form = await request.formData();
  const params = parseAuthorizationParams(new URLSearchParams(
    [...form.entries()].flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : []),
  ));
  if (params instanceof Response) return params;
  const auth = await currentSession(request);
  if (!auth.user || !auth.session) {
    return oauthError('login_required', 'Sign in to Akada before connecting Claude.', 401);
  }

  const code = issueAuthorizationCode({
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    scope: params.scope,
    userId: auth.user.id,
    supabaseAccessToken: auth.session.access_token,
    supabaseRefreshToken: auth.session.refresh_token,
  });
  const redirect = new URL(params.redirectUri);
  redirect.searchParams.set('code', code);
  if (params.state) redirect.searchParams.set('state', params.state);
  if (request.headers.get('accept')?.includes('application/json')) {
    return Response.json({ redirect_uri: redirect.toString() }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return withCookies(NextResponse.redirect(redirect), auth.pendingCookies);
}
