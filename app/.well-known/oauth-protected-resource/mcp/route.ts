import { NextResponse } from 'next/server';
import { MCP_SCOPES, mcpUrl, siteUrl } from '@/app/api/mcp/_shared';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      resource: mcpUrl(),
      authorization_servers: [siteUrl()],
      scopes_supported: MCP_SCOPES,
      bearer_methods_supported: ['header'],
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
