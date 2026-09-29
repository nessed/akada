import type { SessionSegment } from '../data/types';

/**
 * Which ocean a sitting swims in.
 *
 * The timer's own session id never leaves the device, but a sitting's first
 * stretch is logged with the moment it started, and that is the moment the
 * sitting started. So the key is the course and that start, which the live
 * timer, the finish sheet and any saved session all agree on: a sitting can
 * always be dived again, exactly, from its record.
 */

/** Bumped only if a change would make an old sitting's ocean come out different. */
export const OCEAN_VERSION = 1;

export function oceanKey(courseId: string, sittingStartedAtMs: number): string {
  return `v${OCEAN_VERSION}:${courseId}:${Math.round(sittingStartedAtMs)}`;
}

export function oceanKeyFromSegments(courseId: string, segments: SessionSegment[] | undefined): string | null {
  const first = segments?.[0];
  if (!first) return null;
  const at = Date.parse(first.startedAt);
  return Number.isFinite(at) ? oceanKey(courseId, at) : null;
}

/** The part of the sea that belongs to the course and comes back every sitting. */
export function courseKey(courseId: string): string {
  return `v${OCEAN_VERSION}:course:${courseId}`;
}
