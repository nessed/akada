import { NextRequest } from 'next/server';
import { MAX_REDIRECT_URIS, isAllowedRedirectUri, oauthError } from '../_shared';
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

  const requested = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((uri): uri is string => typeof uri === 'string')
    : [];
  if (requested.length === 0 || requested.length > MAX_REDIRECT_URIS) {
    return oauthError(
      'invalid_redirect_uri',
      `Register between 1 and ${MAX_REDIRECT_URIS} redirect URIs.`,
    );
  }

  // Registration is open, so this is the only thing standing between a
  // consenting user and a code delivered to somebody else's callback.
  const rejected = requested.filter((uri) => !isAllowedRedirectUri(uri));
  if (rejected.length > 0) {
    return oauthError(
      'invalid_redirect_uri',
      'Redirect URIs must be https on claude.ai or claude.com, or http on localhost for a local client.',
    );
  }

  const redirectUris = [...new Set(requested)];
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
