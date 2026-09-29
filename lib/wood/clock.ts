import type { SessionSegment } from '../data/types';

/**
 * The wood's clocks, read off the timer.
 *
 * Three numbers matter. **Focus** is the sitting's focus time, pauses and
 * breaks left out, and it is the only thing the land ages on: a wood that
 * grew while nobody was working would be lying about the work. **Rest** is
 * the breaks. **Scene** is the wood's own clock, the one the animals move
 * on: it runs at full speed through focus, at a crawl through a break so the
 * wood is resting rather than frozen, and not at all while the clock is
 * held. All three are worked out from the timer's state and the time, never
 * remembered, so a reload lands on exactly the wood it left.
 */

/** Bump when anything rolled from a key would come out differently. */
export const WOOD_VERSION = 1;

/** How fast the scene runs during a break, against focus. */
export const BREAK_PACE = 0.3;

type Segment = Pick<SessionSegment, 'kind' | 'seconds' | 'startedAt' | 'targetSeconds'>;

/** As much of a sitting as the wood reads. The timer's live state fits it. */
export interface SittingState {
  courseId: string;
  phase: 'focus' | 'break';
  isPaused: boolean;
  /** When the current run of the current stretch began, ms. */
  startedAt: number;
  /** What the current stretch had banked before that run, ms. */
  accumulatedMs: number;
  sittingStartedAt: number;
  targetSeconds: number | null;
  segments: Segment[];
}

/**
 * The name a sitting's wood is rolled from. The course is in it so each
 * course grows its own; the sitting's start is in it so no two sittings
 * are the same wood.
 */
export function woodKey(courseId: string, sittingStartedAtMs: number): string {
  return `wood${WOOD_VERSION}:${courseId}:${Math.round(sittingStartedAtMs)}`;
}

/**
 * The same key from a finished sitting's segments. The first stretch starts
 * when the sitting does, to the millisecond, so a logged sitting names the
 * wood it grew.
 */
export function woodKeyFromSegments(courseId: string, segments: readonly Segment[]): string | null {
  const first = segments[0];
  if (!first) return null;
  const at = Date.parse(first.startedAt);
  return Number.isFinite(at) ? woodKey(courseId, at) : null;
}

/** The course's own half of every wood it grows. */
export function courseKey(courseId: string): string {
  return `wood${WOOD_VERSION}:course:${courseId}`;
}

export interface WoodTime {
  /** Seconds of focus in the whole sitting. */
  focus: number;
  /** Seconds of break in the whole sitting. */
  rest: number;
  /** The wood's own clock, in seconds. */
  scene: number;
  phase: 'focus' | 'break';
  paused: boolean;
  /** Focus blocks already closed. */
  blocks: number;
}

export function woodTime(s: SittingState, nowMs: number): WoodTime {
  let focus = 0;
  let rest = 0;
  let blocks = 0;
  for (const seg of s.segments) {
    if (seg.kind === 'break') rest += seg.seconds;
    else {
      focus += seg.seconds;
      blocks += 1;
    }
  }
  const live = (Math.max(0, s.accumulatedMs) + (s.isPaused ? 0 : Math.max(0, nowMs - s.startedAt))) / 1000;
  if (s.phase === 'break') rest += live;
  else focus += live;
  return { focus, rest, scene: focus + BREAK_PACE * rest, phase: s.phase, paused: s.isPaused, blocks };
}

/**
 * The same, for a sitting that has ended: everything is in the segments, and
 * the clock is still.
 */
export function woodTimeFromSegments(segments: readonly Segment[]): WoodTime {
  let focus = 0;
  let rest = 0;
  let blocks = 0;
  for (const seg of segments) {
    if (seg.kind === 'break') rest += seg.seconds;
    else {
      focus += seg.seconds;
      blocks += 1;
    }
  }
  const last = segments[segments.length - 1];
  return {
    focus,
    rest,
    scene: focus + BREAK_PACE * rest,
    phase: last?.kind === 'break' ? 'break' : 'focus',
    paused: true,
    // Finished, the last block is the tree on screen, not one behind it.
    blocks: Math.max(0, blocks - (last?.kind === 'focus' ? 1 : 0)),
  };
}

/**
 * The scene clock at the moment focus reached `f`. An animal arrives on a
 * focus second (nothing new comes during a break) but lives on the scene
 * clock, so it needs to know where the scene was when it came.
 */
export function sceneAtFocus(segments: readonly Segment[], f: number): number {
  let focus = 0;
  let rest = 0;
  for (const seg of segments) {
    if (seg.kind === 'break') {
      rest += seg.seconds;
      continue;
    }
    if (focus + seg.seconds >= f) return f + BREAK_PACE * rest;
    focus += seg.seconds;
  }
  // Past every closed block is the stretch on the clock. A break adds no
  // focus, so every closed break came before this point.
  return f + BREAK_PACE * rest;
}

/**
 * Which block's tree is the one on screen. While a block runs it is the one
 * being grown; during a break it is the block that just ended, which the
 * timer holds where it stopped.
 */
export function heroBlock(t: Pick<WoodTime, 'phase' | 'blocks'>): number {
  return t.phase === 'break' ? Math.max(0, t.blocks - 1) : t.blocks;
}

/**
 * The finished blocks, oldest first, each with how far its tree grew. They
 * stand behind the one on screen for the rest of the sitting.
 */
export function finishedBlocks(segments: readonly Segment[], t: Pick<WoodTime, 'phase' | 'blocks'>): { index: number; grown: number }[] {
  const hero = heroBlock(t);
  const out: { index: number; grown: number }[] = [];
  let index = 0;
  for (const seg of segments) {
    if (seg.kind !== 'focus') continue;
    if (index >= hero) break;
    // The same reading the timer makes for a held fan: a block's share of
    // its own length, and an open block against a notional three hours.
    const grown = seg.targetSeconds ? seg.seconds / seg.targetSeconds : seg.seconds / (3 * 60 * 60);
    out.push({ index, grown: Math.min(1, Math.max(0, grown)) });
    index += 1;
  }
  return out;
}
