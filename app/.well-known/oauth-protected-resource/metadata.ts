import { NextResponse } from 'next/server';
import { MCP_SCOPES, mcpUrl, siteUrl } from '@/app/api/mcp/_shared';

// RFC 9728 protected resource metadata for /api/mcp. The 401 from the MCP
// endpoint points at /mcp directly, but a client that loses that header
// probes /.well-known/oauth-protected-resource/api/mcp and then the bare
// path, so all three answer with the same document.
export function protectedResourceMetadata() {
  return NextResponse.json(
    {
      resource: mcpUrl(),
      authorization_servers: [siteUrl()],
      scopes_supported: MCP_SCOPES,
      bearer_methods_supported: ['header'],
      resource_name: 'Akada',
      resource_documentation: `${siteUrl()}/docs`,
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
