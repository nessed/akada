import { NextRequest } from 'next/server';
import {
  issueAccessToken,
  issueRefreshToken,
  pkceChallenge,
  readAuthorizationCode,
  readRefreshToken,
  secureEqual,
} from '@/lib/mcp-auth';
import { mcpSupabase, oauthError } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokens(payload: {
  clientId: string;
  scope: string;
  userId: string;
  supabaseAccessToken: string;
  supabaseRefreshToken: string;
}) {
  return Response.json(
    {
      access_token: issueAccessToken({
        clientId: payload.clientId,
        scope: payload.scope,
        userId: payload.userId,
        supabaseAccessToken: payload.supabaseAccessToken,
      }),
      token_type: 'Bearer',
      expires_in: 60 * 60,
      refresh_token: issueRefreshToken({
        clientId: payload.clientId,
        scope: payload.scope,
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
        !secureEqual(payload.codeChallenge, pkceChallenge(verifier))
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
      if (!secureEqual(payload.clientId, clientId)) {
        return oauthError('invalid_grant', 'The refresh token does not match this connector.');
      }
      const { data, error } = await mcpSupabase('').auth.refreshSession({ refresh_token: payload.supabaseRefreshToken });
      if (error || !data.session || data.user?.id !== payload.userId) {
        return oauthError('invalid_grant', 'Your Akada session has expired. Reconnect Claude to continue.');
      }
      return tokens({
        ...payload,
        supabaseAccessToken: data.session.access_token,
        supabaseRefreshToken: data.session.refresh_token,
      });
    } catch {
      return oauthError('invalid_grant', 'The refresh token is invalid or expired.');
    }
  }

  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
}
