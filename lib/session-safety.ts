import type { Session } from './data';

export const MAX_SESSION_SECONDS = 18 * 60 * 60;

export function clampSessionSeconds(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor(seconds)));
}

export function sanitizeSession<T extends Pick<Session, 'durationSeconds'>>(session: T): T {
  return {
    ...session,
    durationSeconds: clampSessionSeconds(session.durationSeconds),
  };
}

export function isLoggableDuration(value: unknown): boolean {
  return clampSessionSeconds(value) > 0;
}
