import { NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_LIFETIME,
  issueAccessToken,
  issueRefreshToken,
  pkceChallenge,
  readAuthorizationCode,
  readRefreshToken,
  secureEqual,
} from '@/lib/mcp-auth';
import { checkResource, mcpSupabase, mcpUrl, oauthError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The access token wraps a Supabase JWT, so it is only good for as long as
// that JWT is. Claude refreshes a few minutes before the expiry it is given;
// claiming a full hour over a shorter Supabase session would hand it a dead
// token in the meantime.
function accessLifetime(supabaseExpiresAt: number | undefined) {
  if (!supabaseExpiresAt) return ACCESS_TOKEN_LIFETIME;
  const remaining = supabaseExpiresAt - Math.floor(Date.now() / 1000);
  return Math.max(60, Math.min(ACCESS_TOKEN_LIFETIME, remaining));
}

function tokens(payload: {
  clientId: string;
  scope: string;
  resource: string;
  userId: string;
  supabaseAccessToken: string;
  supabaseRefreshToken: string;
  supabaseExpiresAt?: number;
}) {
  const lifetime = accessLifetime(payload.supabaseExpiresAt);
  return Response.json(
    {
      access_token: issueAccessToken({
        clientId: payload.clientId,
        scope: payload.scope,
        resource: payload.resource,
        userId: payload.userId,
        supabaseAccessToken: payload.supabaseAccessToken,
      }, lifetime),
      token_type: 'Bearer',
      expires_in: lifetime,
      refresh_token: issueRefreshToken({
        clientId: payload.clientId,
        scope: payload.scope,
        resource: payload.resource,
        userId: payload.userId,
        supabaseRefreshToken: payload.supabaseRefreshToken,
      }),
      scope: payload.scope,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return oauthError('invalid_request', 'Token requests must be form encoded.');
  }
  const form = await request.formData();
  const grantType = form.get('grant_type');
  const clientId = form.get('client_id');
  if (typeof clientId !== 'string') return oauthError('invalid_request', 'client_id is required.');
  const resource = form.get('resource');
  if (resource !== null && (typeof resource !== 'string' || !checkResource(resource))) {
    return oauthError('invalid_target', `This authorization server only issues tokens for ${mcpUrl()}.`);
  }

  if (grantType === 'authorization_code') {
    const code = form.get('code');
    const redirectUri = form.get('redirect_uri');
    const verifier = form.get('code_verifier');
    if (typeof code !== 'string' || typeof redirectUri !== 'string' || typeof verifier !== 'string') {
      return oauthError('invalid_request', 'code, redirect_uri and code_verifier are required.');
    }
    try {
      const payload = readAuthorizationCode(code);
      if (
        !secureEqual(payload.clientId, clientId) ||
        !secureEqual(payload.redirectUri, redirectUri) ||
        !secureEqual(payload.codeChallenge, pkceChallenge(verifier)) ||
        !checkResource(payload.resource)
      ) {
        return oauthError('invalid_grant', 'The authorization code does not match this connector.');
      }
      return tokens(payload);
    } catch {
      return oauthError('invalid_grant', 'The authorization code is invalid or expired.');
    }
  }

  if (grantType === 'refresh_token') {
    const refreshToken = form.get('refresh_token');
    if (typeof refreshToken !== 'string') return oauthError('invalid_request', 'refresh_token is required.');
    try {
      const payload = readRefreshToken(refreshToken);
      if (!secureEqual(payload.clientId, clientId) || !checkResource(payload.resource)) {
        return oauthError('invalid_grant', 'The refresh token does not match this connector.');
      }
      const { data, error } = await mcpSupabase('').auth.refreshSession({ refresh_token: payload.supabaseRefreshToken });
      if (error || !data.session || data.user?.id !== payload.userId) {
        return oauthError('invalid_grant', 'Your Akada session has expired. Reconnect Claude to continue.');
      }
      return tokens({
        ...payload,
        resource: payload.resource ?? mcpUrl(),
        supabaseAccessToken: data.session.access_token,
        supabaseRefreshToken: data.session.refresh_token,
        supabaseExpiresAt: data.session.expires_at,
      });
    } catch {
      return oauthError('invalid_grant', 'The refresh token is invalid or expired.');
    }
  }

  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
}
