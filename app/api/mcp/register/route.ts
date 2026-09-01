import { NextRequest } from 'next/server';
import { CLAUDE_CALLBACK_URL, oauthError } from '../_shared';
import { registerMcpClient } from '@/lib/mcp-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return oauthError('invalid_client_metadata', 'Client registration needs a JSON body.');
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((uri): uri is string => typeof uri === 'string')
    : [];
  if (redirectUris.length !== 1 || redirectUris[0] !== CLAUDE_CALLBACK_URL) {
    return oauthError(
      'invalid_redirect_uri',
      'This connector only accepts Claude’s registered callback URL.',
    );
  }

  const clientId = registerMcpClient(redirectUris);
  return Response.json(
    {
      client_id: clientId,
      client_name: typeof body.client_name === 'string' ? body.client_name.slice(0, 100) : 'Claude',
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
