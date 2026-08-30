'use client';

/**
 * Ship a client-side crash to the server log. Fire-and-forget: reporting must
 * never throw, never block the error screen from rendering, and never retry.
 */
export function reportClientError(
  error: Error & { digest?: string },
  scope: 'app' | 'global',
): void {
  if (typeof window === 'undefined') return;
  try {
    const body = JSON.stringify({
      scope,
      message: String(error?.message ?? ''),
      digest: error?.digest ?? '',
      stack: String(error?.stack ?? ''),
      path: window.location.pathname,
    });

    // sendBeacon survives the page being torn down; fetch is the fallback.
    if (navigator.sendBeacon?.(
      '/api/client-error',
      new Blob([body], { type: 'application/json' }),
    )) {
      return;
    }
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting is best-effort by definition.
  }
}
