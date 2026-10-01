/**
 * A sitting, painted: the whole of it as one cutaway of the sea, for a
 * wallpaper or a print. No words anywhere; what happened is in the picture.
 *
 * STUB: signatures are fixed; the bodies are being written.
 */

import type { SessionSegment } from '../../data/types';

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
export function planPicture(_input: PictureInput, shape: { width: number; height: number }): Picture | null {
  return { width: shape.width, height: shape.height, ground: _input.ground, plan: null };
}

/**
 * Paints the whole picture into `ctx`, covering (0, 0) to (width * px, height * px)
 * in device px. The caller may translate and clip to draw it in strips; the
 * same picture drawn twice comes out the same.
 */
export function drawPicture(_ctx: CanvasRenderingContext2D, _pic: Picture, _px: number): void {}
