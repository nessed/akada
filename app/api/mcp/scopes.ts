import type { McpServer, RegisteredTool } from '@modelcontextprotocol/server';

export const READ_SCOPE = 'akada.tasks.read';
export const WRITE_SCOPE = 'akada.tasks.write';

// A token granted only the read scope must not reach a tool that changes
// anything. Every tool already declares readOnlyHint when it only reads, so
// that annotation is the line: anything without it is switched off before the
// server answers, which keeps it out of tools/list and makes a direct call
// fail as an unknown tool. Call this before registering tools.
export function limitToGrantedScopes(server: McpServer, scopes: readonly string[]) {
  if (scopes.includes(WRITE_SCOPE)) return server;
  const register = server.registerTool.bind(server) as (...args: unknown[]) => RegisteredTool;
  server.registerTool = ((...args: unknown[]) => {
    const tool = register(...args);
    const config = args[1] as { annotations?: { readOnlyHint?: boolean } } | undefined;
    if (!config?.annotations?.readOnlyHint) tool.disable();
    return tool;
  }) as McpServer['registerTool'];
  return server;
}
