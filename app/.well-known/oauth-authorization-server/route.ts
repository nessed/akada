import { NextResponse } from 'next/server';
import { MCP_SCOPES, siteUrl } from '@/app/api/mcp/_shared';

export const dynamic = 'force-dynamic';

export function GET() {
  const issuer = siteUrl();
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/api/mcp/authorize`,
      token_endpoint: `${issuer}/api/mcp/token`,
      registration_endpoint: `${issuer}/api/mcp/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: MCP_SCOPES,
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
