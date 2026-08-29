import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Client-side error sink.
 *
 * The error boundaries POST here so browser crashes land in the server log
 * instead of only in the user's console, where nobody will ever see them. On
 * Vercel these become runtime logs, which Log Drains and alerts can watch.
 * Swapping this for Sentry later means changing this one handler.
 *
 * Deliberately records nothing about the user: no ids, no emails, no planner
 * content. Just what broke and where.
 */

const MAX_FIELD = 1000;

function clip(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD) : '';
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;

  console.error(
    JSON.stringify({
      tag: 'akada.client-error',
      at: new Date().toISOString(),
      scope: clip(body.scope) || 'unknown',
      message: clip(body.message),
      digest: clip(body.digest),
      stack: clip(body.stack),
      path: clip(body.path),
      userAgent: clip(request.headers.get('user-agent') ?? ''),
    }),
  );

  // 204 so the browser has nothing to parse and no reason to retry.
  return new NextResponse(null, { status: 204 });
}
