/**
 * A sitting, painted: the whole of it as one cutaway of the sea, for a
 * wallpaper or a print. No words anywhere; what happened is in the picture.
 *
 * A stranger sees a deep-sea painting. The one who sat reads their sitting:
 * how deep the page goes is how long they studied (the zones given room by
 * eye, not by metres); the light at the top is the hour they began, the sun
 * leaning with it or the moon at its real phase; the water's tint and the
 * regulars in it are the course; each block is a jelly where it ended, each
 * the child of the last, the last and largest the one they finished on; each
 * break a ledge of rock it rested on; the animals are the ones that really
 * swam by, near the depth they were met, the rarest given the best place;
 * and the rare things are drawn where they happened. Nothing is scored:
 * pauses do not show, and there is no measure of how well it went.
 *
 * `planPicture` is pure (encode.ts reads the sitting, layout.ts composes
 * it); `drawPicture` paints the plan (paint.ts).
 */

import type { SessionSegment } from '../../data/types';
import { readSession } from './encode';
import { plan as compose } from './layout';
import { paint } from './paint';

export interface PictureInput {
  courseId: string;
  /** The course colour. */
  color: string;
  /** The sitting's stretches as the log keeps them (focus and breaks, in order). */
  segments: SessionSegment[];
  /** Focus seconds, when the segments are not the whole of it (a live sitting). */
  focusSeconds?: number;
  ground: 'paper' | 'night';
  /** The reader's offset from UTC in minutes, for the hour the light comes from (Date#getTimezoneOffset). */
  tzOffset?: number;
}

/** The plan for one picture at one shape: deterministic for the same input and shape. */
export interface Picture {
  width: number;
  height: number;
  ground: 'paper' | 'night';
  /** Opaque to callers. */
  plan: unknown;
}

/** Lays out the picture for a shape (CSS px; only the aspect and scale matter). */
export function planPicture(input: PictureInput, shape: { width: number; height: number }): Picture | null {
  if (!(shape.width > 0 && shape.height > 0)) return null;
  const session = readSession(input.courseId, input.segments, input.focusSeconds, input.tzOffset);
  if (!session) return null;
  const plan = compose(session, input.color, input.ground, shape);
  return { width: shape.width, height: shape.height, ground: input.ground, plan };
}

/**
 * Paints the whole picture into `ctx`, covering (0, 0) to (width * px, height * px)
 * in device px. The caller may translate and clip to draw it in strips; the
 * same picture drawn twice comes out the same.
 */
export function drawPicture(
  ctx: CanvasRenderingContext2D,
  pic: Picture,
  px: number,
  /**
   * Optional: the rows of the picture (device px, 0 at its top) this call
   * has to cover, when the canvas is taller than the strip. Only what can
   * touch them is drawn; the canvas's own size already bounds it otherwise.
   */
  rows?: { top: number; bottom: number },
): void {
  const plan = pic.plan as Parameters<typeof paint>[1] | null;
  if (!plan || !(px > 0)) return;
  paint(ctx, plan, px * (pic.width / (plan.w * plan.unit)), rows);
}
