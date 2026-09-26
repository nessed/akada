import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { NextRequest } from 'next/server';
import { issueAccessToken, issueAuthorizationCode, issueRefreshToken, pkceChallenge, readAccessToken, readRefreshToken, registerMcpClient } from '@/lib/mcp-auth';

const SITE = 'https://akada.test';
const MCP = `${SITE}/api/mcp`;
const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'a-verifier-that-is-long-enough-for-pkce-0123456789abcdef';

process.env.NEXT_PUBLIC_SITE_URL = SITE;
process.env.AKADA_MCP_TOKEN_SECRET = 'test-secret-that-is-at-least-thirty-two-characters';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';

// Supabase is reached over fetch; each test says what it answers.
const realFetch = globalThis.fetch;
let supabase: (url: string, init?: RequestInit) => Response = () => new Response('{}', { status: 500 });
beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => supabase(String(input instanceof Request ? input.url : input), init)) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function form(url: string, fields: Record<string, string>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

function code(overrides: Partial<Parameters<typeof issueAuthorizationCode>[0]> = {}) {
  const clientId = registerMcpClient([CLAUDE_CALLBACK], 'Claude');
  return {
    clientId,
    code: issueAuthorizationCode({
      clientId,
      redirectUri: CLAUDE_CALLBACK,
      codeChallenge: pkceChallenge(VERIFIER),
      scope: 'akada.tasks.read akada.tasks.write',
      resource: MCP,
      userId: 'user-1',
      supabaseAccessToken: 'sb-access',
      supabaseRefreshToken: 'sb-refresh',
      ...overrides,
    }),
  };
}

test('discovery: every protected-resource path names /api/mcp and this issuer', async () => {
  for (const path of ['', '/mcp', '/api/mcp']) {
    const { GET } = await import(`@/app/.well-known/oauth-protected-resource${path}/route`);
    const body = await (GET() as Response).json();
    assert.equal(body.resource, MCP, path);
    assert.deepEqual(body.authorization_servers, [SITE]);
  }
  const { GET } = await import('@/app/.well-known/oauth-authorization-server/route');
  const meta = await GET().json();
  assert.equal(meta.issuer, SITE);
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
  assert.ok(meta.registration_endpoint);
  assert.ok(meta.token_endpoint_auth_methods_supported.includes('none'));
});

test('register: Claude and any-port loopback callbacks are accepted, others are not', async () => {
  const { POST } = await import('./register/route');
  const register = (uris: string[]) => POST(new NextRequest(`${SITE}/api/mcp/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: uris }),
  }));
  assert.equal((await register([CLAUDE_CALLBACK])).status, 201);
  assert.equal((await register(['http://localhost:3118/callback'])).status, 201);
  assert.equal((await register(['http://127.0.0.1:49152/callback'])).status, 201);
  assert.equal((await register(['https://evil.example/callback'])).status, 400);
});

test('authorize: a foreign resource is refused, and a signed-out user is sent to sign in', async () => {
  const { GET } = await import('./authorize/route');
  const clientId = registerMcpClient([CLAUDE_CALLBACK], 'Claude');
  const params = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: CLAUDE_CALLBACK,
    code_challenge: pkceChallenge(VERIFIER), code_challenge_method: 'S256',
  });
  params.set('resource', 'https://other.example/mcp');
  const refused = await GET(new NextRequest(`${SITE}/api/mcp/authorize?${params}`));
  assert.equal((await refused.json()).error, 'invalid_target');

  params.set('resource', MCP);
  const signIn = await GET(new NextRequest(`${SITE}/api/mcp/authorize?${params}`));
  assert.equal(signIn.status, 307);
  assert.match(signIn.headers.get('location') ?? '', /\/auth\?next=/);

  params.set('code_challenge_method', 'plain');
  assert.equal((await (await GET(new NextRequest(`${SITE}/api/mcp/authorize?${params}`))).json()).error, 'invalid_request');
});

test('token: a code exchanges once PKCE, client, redirect and resource all match', async () => {
  const { POST } = await import('./token/route');
  const { clientId, code: issued } = code({ supabaseExpiresAt: Math.floor(Date.now() / 1000) + 600 });
  const base = { grant_type: 'authorization_code', client_id: clientId, code: issued, redirect_uri: CLAUDE_CALLBACK, code_verifier: VERIFIER };

  const wrongVerifier = await POST(form(`${SITE}/api/mcp/token`, { ...base, code_verifier: `${VERIFIER}x` }));
  assert.equal((await wrongVerifier.json()).error, 'invalid_grant');

  const wrongResource = await POST(form(`${SITE}/api/mcp/token`, { ...base, resource: 'https://other.example/mcp' }));
  assert.equal((await wrongResource.json()).error, 'invalid_target');

  const ok = await POST(form(`${SITE}/api/mcp/token`, { ...base, resource: MCP }));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.token_type, 'Bearer');
  // Capped to the ten minutes the Supabase session has left, not an hour.
  assert.ok(body.expires_in <= 600 && body.expires_in > 590, String(body.expires_in));
  const access = readAccessToken(body.access_token);
  assert.equal(access.userId, 'user-1');
  assert.equal(access.resource, MCP);
  assert.equal(readRefreshToken(body.refresh_token).resource, MCP);
});

test('token: JSON bodies are refused, form bodies are required', async () => {
  const { POST } = await import('./token/route');
  const response = await POST(new NextRequest(`${SITE}/api/mcp/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  }));
  assert.equal((await response.json()).error, 'invalid_request');
});

test('refresh: a rotated Supabase session comes back as a new token pair', async () => {
  const { POST } = await import('./token/route');
  const clientId = registerMcpClient([CLAUDE_CALLBACK], 'Claude');
  const refresh = issueRefreshToken({ clientId, scope: 'akada.tasks.read akada.tasks.write', userId: 'user-1', supabaseRefreshToken: 'sb-refresh' });
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  supabase = (url) => url.includes('grant_type=refresh_token')
    ? json({ access_token: 'sb-access-2', refresh_token: 'sb-refresh-2', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: { id: 'user-1' } })
    : json({}, 500);
  const response = await POST(form(`${SITE}/api/mcp/token`, { grant_type: 'refresh_token', client_id: clientId, refresh_token: refresh }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(readAccessToken(body.access_token).supabaseAccessToken, 'sb-access-2');
  const next = readRefreshToken(body.refresh_token);
  assert.equal(next.supabaseRefreshToken, 'sb-refresh-2');
  // A token from before resource binding picks it up on refresh.
  assert.equal(next.resource, MCP);
});

test('refresh: a dead Supabase session is invalid_grant, which tells Claude to reconnect', async () => {
  const { POST } = await import('./token/route');
  const clientId = registerMcpClient([CLAUDE_CALLBACK], 'Claude');
  const refresh = issueRefreshToken({ clientId, scope: 'akada.tasks.read', resource: MCP, userId: 'user-1', supabaseRefreshToken: 'revoked' });
  supabase = () => json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }, 400);
  const response = await POST(form(`${SITE}/api/mcp/token`, { grant_type: 'refresh_token', client_id: clientId, refresh_token: refresh }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'invalid_grant');

  const otherClient = registerMcpClient([CLAUDE_CALLBACK], 'Claude');
  const mismatch = await POST(form(`${SITE}/api/mcp/token`, { grant_type: 'refresh_token', client_id: otherClient, refresh_token: refresh }));
  assert.equal((await mismatch.json()).error, 'invalid_grant');
});

test('mcp: no bearer gets a 401 that points at the metadata and names the scopes', async () => {
  const { POST } = await import('./route');
  const response = await POST(new NextRequest(MCP, { method: 'POST', body: '{}' }));
  assert.equal(response.status, 401);
  const challenge = response.headers.get('www-authenticate') ?? '';
  assert.match(challenge, /resource_metadata="https:\/\/akada\.test\/\.well-known\/oauth-protected-resource\/mcp"/);
  assert.match(challenge, /scope="akada\.tasks\.read akada\.tasks\.write"/);
});

test('mcp: a token minted for another resource is refused even with a live session', async () => {
  const { POST } = await import('./route');
  supabase = (url) => url.endsWith('/auth/v1/user') ? json({ id: 'user-1', aud: 'authenticated' }) : json({}, 500);
  const foreign = issueAccessToken({ clientId: 'c', scope: 'akada.tasks.read', resource: 'https://other.example/mcp', userId: 'user-1', supabaseAccessToken: 'sb' });
  const response = await POST(new NextRequest(MCP, { method: 'POST', headers: { Authorization: `Bearer ${foreign}` }, body: '{}' }));
  assert.equal(response.status, 401);

  const wrongUser = issueAccessToken({ clientId: 'c', scope: 'akada.tasks.read', resource: MCP, userId: 'user-2', supabaseAccessToken: 'sb' });
  const mismatch = await POST(new NextRequest(MCP, { method: 'POST', headers: { Authorization: `Bearer ${wrongUser}` }, body: '{}' }));
  assert.equal(mismatch.status, 401);
});
