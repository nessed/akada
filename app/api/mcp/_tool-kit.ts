import type { readAccessToken } from '@/lib/mcp-auth';
import { siteUrl, type mcpSupabase } from './_shared';

/*
 * What every tool file replies with. These were copied into each tool file
 * (five copies of result and toolError, four of queryFailed and toolCrashed,
 * three of quizUrl); the wording of every reply is part of the connector's
 * contract, so it lives here once.
 */

export type AuthenticatedToken = ReturnType<typeof readAccessToken>;
export type McpSupabaseClient = ReturnType<typeof mcpSupabase>;

// Shape of a Supabase/PostgREST failure. Not imported from supabase-js
// because these tools also funnel plain Errors through the same reporting.
export type QueryFailure = { message?: string; code?: string; details?: string; hint?: string } | null;

/**
 * The codes PostgREST and Postgres give for a table or column that is not
 * there: a project that has not re-run supabase/schema.sql since an additive
 * migration.
 */
const MISSING_TABLE_CODES = ['PGRST205', '42P01', 'PGRST204', '42703'];

export function isMissingTable(error: QueryFailure): boolean {
  return Boolean(error?.code && MISSING_TABLE_CODES.includes(error.code));
}

export function result(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

export function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Codes, messages and hints only: PostgREST puts row values in `details`. */
export function describeFailure(error: QueryFailure) {
  return [error?.code, error?.message, error?.hint].filter(Boolean).join(' | ');
}

/**
 * A read or write that came back with an error, logged with its cause and
 * reported with the reason on the end. `notSetUp`, when given, is what to say
 * instead when the cause is a table the project does not have yet.
 */
export function queryFailed(tool: string, step: string, error: QueryFailure, message: string, notSetUp?: string) {
  console.error(`[mcp:${tool}] ${step} failed`, { code: error?.code, message: error?.message, hint: error?.hint });
  if (notSetUp && isMissingTable(error)) return toolError(notSetUp);
  const reason = describeFailure(error);
  return toolError(reason ? `${message} (${reason})` : message);
}

export function toolCrashed(tool: string, cause: unknown) {
  const reason = cause instanceof Error ? cause.message : String(cause ?? '');
  console.error(`[mcp:${tool}] unhandled failure`, reason);
  return toolError(`Akada is not configured or your session has expired. Reconnect the connector and try again.${reason ? ` (${reason})` : ''}`);
}

export function quizUrl(id: string): string | null {
  try {
    return `${siteUrl()}/notes/quiz?q=${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}
