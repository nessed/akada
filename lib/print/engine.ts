/* Drawing a picture far bigger than any canvas a phone will allow. The
   picture is painted in horizontal strips: each strip is a canvas the width
   of the picture (at the supersampled scale) and a few hundred rows tall,
   the drawing is called with the context moved up to that strip, the strip
   is halved down to the output size, and its rows go straight into the
   PNG encoder. No canvas is ever larger than `budget` pixels, so A2 at
   300 dpi (4961 × 7016, 35 MP, 140 MP supersampled) comes out of an iPhone,
   whose Safari refuses any canvas over 16 MP. Between strips the main thread
   gets a turn, so the page keeps answering, and the render can be stopped. */

import {
  deckleBands,
  deckleOutline,
  FRAME_PAPERS,
  paintDeckleMask,
  paintPaperBehind,
  paintPlateMark,
  type PaperName,
} from './frame';
import { PngStream } from './png';
import { frameLayout, type FrameLayout, type Rect } from './sizes';

export type DrawFn = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

export interface FrameStyle {
  paper: PaperName;
  /** Seeds the deckle, so a picture keeps its own edge. */
  seed?: string;
  /** Defaults to `frameLayout(width, height)`. */
  layout?: FrameLayout;
}

export interface RenderPictureOptions {
  /** Output size in px. */
  width: number;
  height: number;
  /** Drawn at this many times the output and filtered down. 1 to 4; 2 by default. */
  supersample?: number;
  /** Without a frame: an even border of `background` round the picture, in output px. */
  margin?: number;
  /** A print's paper margin, deckled edge and plate mark. */
  frame?: FrameStyle;
  /** Laid under the picture (and in the margin when there is no frame). Opaque by default. */
  background?: string;
  /** Keep transparency. Only meaningful without a frame or background. */
  alpha?: boolean;
  /** Written into the file, so it opens at its print size. */
  dpi?: number;
  /**
   * Paints the whole picture from (0, 0) to (width, height) in device px,
   * where width and height are the picture's size at the supersampled
   * scale. The context arrives translated and clipped to one strip, so the
   * drawing must place itself relative to the current transform (save,
   * translate, restore) and never `setTransform`. It is called once a strip.
   */
  draw: DrawFn;
  /** 0 to 1, after each strip. */
  onProgress?: (done: number) => void;
  /**
   * Each finished strip at the output scale, for a preview: rows
   * `[y, y + rows)` of the picture are at `sourceY` in `strip`. Draw from it
   * before returning; the canvas is reused for the next strip.
   */
  onStrip?: (strip: HTMLCanvasElement, sourceY: number, y: number, rows: number) => void;
  signal?: AbortSignal;
  /**
   * The most pixels any working canvas may hold: 8 MP by default, never over
   * 16 MP. Given explicitly, strips grow to fill it (fewer, taller strips,
   * for a drawing whose every call costs the same however little of it is
   * in the strip); by default they stop at 1024 supersampled rows.
   */
  budget?: number;
  /** The drawing reads pixels back (`getImageData`) from the context it is
      given, so the strip canvas is kept where reads are cheap. */
  readsPixels?: boolean;
}

/** iOS Safari's ceiling on one canvas, with a little room. */
export const CANVAS_LIMIT = 16_000_000;
const DEFAULT_BUDGET = 8_000_000;
/* Safari's longest side. */
const MAX_SIDE = 16_384;
/* Rows of overlap each side of a strip, so the downscale never reads past the
   edge of what was drawn and the strips meet without a seam. */
const PAD = 2;

export interface StripPlan {
  supersample: number;
  /** Output rows per strip (the last may be shorter). */
  rows: number;
  pad: number;
  strips: { y: number; h: number }[];
}

/** How a picture of this size is cut into strips. Pure. */
export function planStrips(width: number, height: number, supersample = 2, budget?: number): StripPlan {
  const cap = Math.min(Math.max(budget ?? DEFAULT_BUDGET, 1_000_000), CANVAS_LIMIT);
  let ss = Math.max(1, Math.min(4, Math.round(supersample)));
  // A strip the picture's width has to be a canvas Safari will make, with
  // room for at least a few rows.
  while (ss > 1 && (width * ss > MAX_SIDE || width * ss * (8 + 2 * PAD) * ss > cap)) ss -= 1;
  const byBudget = Math.floor(cap / (width * ss * ss)) - 2 * PAD;
  // Not much past 1024 rows at the supersampled scale: a taller strip saves
  // little and holds the main thread longer.
  const byTime = budget == null ? Math.floor(1024 / ss) : Infinity;
  const rows = Math.max(1, Math.min(byBudget, byTime, height));
  const strips: { y: number; h: number }[] = [];
  for (let y = 0; y < height; y += rows) strips.push({ y, h: Math.min(rows, height - y) });
  return { supersample: ss, rows, pad: PAD, strips };
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function context(c: HTMLCanvasElement, read = false): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', read ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error('No 2D canvas');
  return ctx;
}

/* Let go of a canvas's backing store now rather than at the next GC; on iOS
   the total of all canvases is limited too. */
function release(...canvases: (HTMLCanvasElement | null)[]) {
  for (const c of canvases) {
    if (!c) continue;
    c.width = 0;
    c.height = 0;
  }
}

/** A macrotask, so input and paint get a turn. Not throttled in a hidden tab the way setTimeout is. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

function aborted(signal?: AbortSignal): DOMException {
  return signal?.reason instanceof DOMException ? signal.reason : new DOMException('The picture was put down', 'AbortError');
}

function intersects(rect: Rect, y0: number, y1: number): boolean {
  return rect.y < y1 && rect.y + rect.h > y0;
}

/**
 * Paints a picture strip by strip and writes it as a PNG. Resolves with the
 * file; rejects with an AbortError if `signal` fires.
 */
export async function renderPicturePng(options: RenderPictureOptions): Promise<Blob> {
  const { width, height, draw, onProgress, onStrip, signal } = options;
  if (!(width >= 1 && height >= 1)) throw new RangeError('A picture needs a size');
  const W = Math.round(width);
  const H = Math.round(height);
  const plan = planStrips(W, H, options.supersample ?? 2, options.budget);
  const ss = plan.supersample;
  const frame = options.frame ?? null;
  const layout = frame ? frame.layout ?? frameLayout(W, H) : null;
  const paper = frame ? FRAME_PAPERS[frame.paper] : null;
  const margin = !frame && options.margin ? Math.max(0, Math.round(options.margin)) : 0;
  const pictureRect: Rect = layout
    ? layout.picture
    : { x: margin, y: margin, w: W - margin * 2, h: H - margin * 2 };
  const deckle = layout ? deckleOutline(layout.picture, layout.deckle, frame?.seed ?? '') : null;
  const bands = layout ? deckleBands(layout.picture, layout.deckle) : [];
  const background = options.background ?? (paper ? paper.ground : options.alpha ? null : FRAME_PAPERS.cream.ground);
  const opaque = !options.alpha || Boolean(frame) || Boolean(options.background);

  const tall = plan.rows + plan.pad * 2;
  const work = makeCanvas(W * ss, tall * ss);
  // The context's attributes are fixed by its first getContext.
  context(work, Boolean(options.readsPixels));
  const mask = frame ? makeCanvas(W * ss, tall * ss) : null;
  // The halving ladder: ss → ss/2 → ... → 1, each step its own canvas.
  const ladder: HTMLCanvasElement[] = [];
  for (let f = ss; f > 1; ) {
    const next = f % 2 === 0 ? f / 2 : 1;
    ladder.push(makeCanvas(W * next, tall * next));
    f = next;
  }
  const out = ss === 1 ? work : ladder[ladder.length - 1];

  const png = new PngStream(W, H, { alpha: !opaque, dpi: options.dpi });
  try {
    for (const { y, h } of plan.strips) {
      if (signal?.aborted) throw aborted(signal);
      // Rows painted for this strip, the overlap included where there is
      // picture to overlap; the edge rows of the picture clamp, as they would
      // in one canvas.
      const top = Math.max(0, y - plan.pad);
      const bottom = Math.min(H, y + h + plan.pad);
      const span = bottom - top;

      const ctx = context(work);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, work.width, work.height);
      // Output coordinates from here on, for anything that is not the picture.
      ctx.setTransform(ss, 0, 0, ss, 0, -top * ss);

      if (layout && paper && mask && deckle) {
        if (intersects(pictureRect, top, bottom)) {
          // The picture first, on the strip itself.
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.translate(pictureRect.x * ss, (pictureRect.y - top) * ss);
          ctx.beginPath();
          ctx.rect(0, 0, pictureRect.w * ss, pictureRect.h * ss);
          ctx.clip();
          if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, pictureRect.w * ss, pictureRect.h * ss);
          }
          ctx.save();
          draw(ctx, pictureRect.w * ss, pictureRect.h * ss);
          ctx.restore();
          ctx.restore();

          // Then its edge taken back to the deckle, only where the deckle is:
          // inside the bands the mask is solid and would change nothing.
          const near = bands.filter((r) => intersects(r, top, bottom));
          if (near.length) {
            const mc = context(mask);
            mc.setTransform(1, 0, 0, 1, 0, 0);
            mc.clearRect(0, 0, mask.width, mask.height);
            mc.setTransform(ss, 0, 0, ss, 0, -top * ss);
            mc.save();
            mc.beginPath();
            for (const r of near) mc.rect(r.x, r.y, r.w, r.h);
            mc.clip();
            paintDeckleMask(mc, deckle);
            mc.restore();

            ctx.save();
            ctx.beginPath();
            for (const r of near) ctx.rect(r.x, r.y, r.w, r.h);
            ctx.clip();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(mask, 0, 0);
            ctx.restore();
          }
        }
        // The paper slid in underneath, and the plate pressed round it.
        paintPaperBehind(ctx, layout, paper, top, bottom);
        if (intersects({ ...layout.plate, y: layout.plate.y - 4, h: layout.plate.h + 8 }, top, bottom)) {
          paintPlateMark(ctx, layout, paper);
        }
      } else {
        if (background) {
          ctx.fillStyle = background;
          ctx.fillRect(0, top, W, span);
        }
        if (intersects(pictureRect, top, bottom)) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.translate(pictureRect.x * ss, (pictureRect.y - top) * ss);
          ctx.beginPath();
          ctx.rect(0, 0, pictureRect.w * ss, pictureRect.h * ss);
          ctx.clip();
          draw(ctx, pictureRect.w * ss, pictureRect.h * ss);
          ctx.restore();
        }
      }

      // Halve down to the output, a step at a time, which keeps every source
      // pixel in the average rather than sampling one in four.
      let src = work;
      let f = ss;
      for (const step of ladder) {
        const next = f % 2 === 0 ? f / 2 : 1;
        const sc = context(step);
        sc.setTransform(1, 0, 0, 1, 0, 0);
        sc.globalCompositeOperation = 'copy';
        sc.imageSmoothingEnabled = true;
        sc.imageSmoothingQuality = 'high';
        sc.drawImage(src, 0, 0, W * f, span * f, 0, 0, W * next, span * next);
        sc.globalCompositeOperation = 'source-over';
        src = step;
        f = next;
      }

      const sourceY = y - top;
      onStrip?.(out, sourceY, y, h);
      const rows = context(out, true).getImageData(0, sourceY, W, h);
      await png.pushRows(rows.data, h);
      onProgress?.((y + h) / H);
      await yieldToMain();
    }
    if (signal?.aborted) throw aborted(signal);
    return await png.finish();
  } catch (e) {
    png.abort(e);
    throw e;
  } finally {
    release(work, mask, ...ladder);
  }
}
