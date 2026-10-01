/* The print's paper. A cream rag (or the night paper, deep and warm), the
   picture laid on it like watercolour that stops where the brush stopped,
   softly and never in a straight line, and the plate pressed into the paper
   round it the way an etching leaves its mark: a faint lit edge and a faint
   shadow, no line drawn. No words and no mark of the app anywhere on it.

   Everything here is in output pixels; the engine scales the context for
   its supersampling. The geometry is pure and seeded, so the same picture
   gets the same edge every time it is saved. */

import type { FrameLayout, Rect } from './sizes';

export type PaperName = 'cream' | 'night';

export interface FramePaper {
  ground: string;
  /** The pressed plate is a shade off the margin. */
  plateTone: string;
  /** The plate mark's two lines. */
  lit: string;
  shade: string;
  /** Rag fibres in the paper. */
  grain: [number, number, number];
  grainAlpha: number;
}

export const FRAME_PAPERS: Record<PaperName, FramePaper> = {
  cream: {
    ground: '#F3EEE2',
    plateTone: 'rgba(120, 100, 66, 0.035)',
    lit: 'rgba(255, 253, 246, 0.75)',
    shade: 'rgba(92, 74, 46, 0.16)',
    grain: [120, 102, 72],
    grainAlpha: 0.05,
  },
  night: {
    ground: '#191712',
    plateTone: 'rgba(0, 0, 0, 0.16)',
    lit: 'rgba(255, 238, 214, 0.075)',
    shade: 'rgba(0, 0, 0, 0.5)',
    grain: [235, 220, 196],
    grainAlpha: 0.035,
  },
};

/* ---------- seeded noise ---------- */

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function lattice(seed: number, i: number): number {
  let h = Math.imul(seed ^ Math.imul(i, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Value noise along a closed loop of length `period`, 0..1, at wavelength
 * `wave`. The lattice wraps, so the edge meets itself where it started.
 */
function loopNoise(seed: number, t: number, period: number, wave: number): number {
  const cells = Math.max(3, Math.round(period / wave));
  const u = ((t / period) * cells) % cells;
  const i = Math.floor(u);
  const f = u - i;
  const a = lattice(seed, i);
  const b = lattice(seed, (i + 1) % cells);
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}

/* ---------- the deckle ---------- */

export interface Deckle {
  /** Closed outlines, outermost first, each a flat [x0, y0, x1, y1, ...]. */
  rings: Float64Array[];
}

const RINGS = 10;

/**
 * The edge of the painted area: `RINGS` outlines a little inside one
 * another, each ragged on its own. Filled together, each at 1/RINGS, they
 * make a mask that is solid inside and thins over the last few px, so the
 * colour stops softly and unevenly, like a wash dried on rag paper.
 */
export function deckleOutline(rect: Rect, deckle: FrameLayout['deckle'], seed: string): Deckle {
  const { x, y, w, h } = rect;
  const perimeter = 2 * (w + h);
  const short = Math.min(w, h);
  const step = Math.max(1, short / 1600);
  const count = Math.max(16, Math.ceil(perimeter / step));
  const base = fnv1a(seed || 'akada');
  // The wander of the wash: long slow swells, then shorter ones.
  const octaves = [
    { wave: short * 0.16, amp: 0.42 },
    { wave: short * 0.055, amp: 0.3 },
    { wave: short * 0.018, amp: 0.18 },
    { wave: short * 0.006, amp: 0.1 },
  ];
  const reach = deckle.reach;
  const feather = deckle.feather;
  const rings: Float64Array[] = [];
  for (let k = 0; k < RINGS; k += 1) {
    const ring = new Float64Array(count * 2);
    const fibreSeed = base ^ Math.imul(k + 1, 0x27d4eb2d);
    for (let n = 0; n < count; n += 1) {
      const t = (n / count) * perimeter;
      let wander = 0;
      for (let o = 0; o < octaves.length; o += 1) {
        wander += octaves[o].amp * loopNoise(base + o * 7919, t, perimeter, octaves[o].wave);
      }
      // Fibres: each ring frays on its own, at the scale of the paper's
      // tooth, smoothly enough that no stretch of it reads as a zigzag.
      const fibre =
        0.65 * (loopNoise(fibreSeed, t, perimeter, Math.max(step * 6, short * 0.007)) - 0.5) +
        0.35 * (loopNoise(fibreSeed ^ 0x5bd1e995, t, perimeter, Math.max(step * 4, short * 0.003)) - 0.5);
      const inset =
        reach * (0.12 + 0.88 * wander) + feather * (k / (RINGS - 1)) + fibre * feather * 0.9;
      // Walk the rectangle clockwise from the top-left corner.
      let px: number;
      let py: number;
      if (t < w) {
        px = x + t;
        py = y + inset;
      } else if (t < w + h) {
        px = x + w - inset;
        py = y + (t - w);
      } else if (t < 2 * w + h) {
        px = x + w - (t - w - h);
        py = y + h - inset;
      } else {
        px = x + inset;
        py = y + h - (t - 2 * w - h);
      }
      // Corners: clamp into the rectangle inset by this point's own depth, so
      // the edge turns the corner rather than spiking out along a side.
      px = Math.min(Math.max(px, x + inset), x + w - inset);
      py = Math.min(Math.max(py, y + inset), y + h - inset);
      ring[n * 2] = px;
      ring[n * 2 + 1] = py;
    }
    rings.push(ring);
  }
  return { rings };
}

type Ctx = CanvasRenderingContext2D;

function tracePolygon(ctx: Ctx, ring: Float64Array) {
  ctx.moveTo(ring[0], ring[1]);
  for (let i = 2; i < ring.length; i += 2) ctx.lineTo(ring[i], ring[i + 1]);
  ctx.closePath();
}

/**
 * Paints the deckle's mask onto a cleared context: alpha 1 well inside the
 * edge, falling to 0 across the rings. Composite the picture `destination-in`
 * against it.
 */
export function paintDeckleMask(ctx: Ctx, deckle: Deckle) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(0, 0, 0, ${1 / RINGS + 0.002})`;
  for (const ring of deckle.rings) {
    ctx.beginPath();
    tracePolygon(ctx, ring);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- the paper ---------- */

const grainTiles = new Map<string, HTMLCanvasElement>();

function grainTile(paper: FramePaper): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = paper.grain.join(',') + paper.grainAlpha;
  const cached = grainTiles.get(key);
  if (cached) return cached;
  const size = 256;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const [r, g, b] = paper.grain;
  let s = 0x2545f491;
  for (let i = 0; i < size * size; i += 1) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const v = (s >>> 0) / 4294967296;
    // Mostly nothing; now and then a fleck of fibre.
    const a = v > 0.86 ? (v - 0.86) / 0.14 : v * 0.18;
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.round(a * paper.grainAlpha * 255);
  }
  ctx.putImageData(img, 0, 0);
  grainTiles.set(key, tile);
  return tile;
}

function roundRect(ctx: Ctx, r: Rect, radius: number) {
  const { x, y, w, h } = r;
  const k = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.arcTo(x + w, y, x + w, y + k, k);
  ctx.lineTo(x + w, y + h - k);
  ctx.arcTo(x + w, y + h, x + w - k, y + h, k);
  ctx.lineTo(x + k, y + h);
  ctx.arcTo(x, y + h, x, y + h - k, k);
  ctx.lineTo(x, y + k);
  ctx.arcTo(x, y, x + k, y, k);
  ctx.closePath();
}

/**
 * The sheet under the picture, for the rows `[y0, y1)`: the paper, its
 * fibres, and the pressed plate's slightly different tone. Laid *behind*
 * what is already on the context (`destination-over`), so the picture can be
 * painted and deckled first, on the one canvas, and the paper slid under it.
 */
export function paintPaperBehind(ctx: Ctx, layout: FrameLayout, paper: FramePaper, y0: number, y1: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  // Top layer first: under destination-over each fill goes beneath the last.
  const short = Math.min(layout.width, layout.height);
  ctx.beginPath();
  roundRect(ctx, layout.plate, short * 0.004);
  ctx.fillStyle = paper.plateTone;
  ctx.fill();
  const tile = grainTile(paper);
  if (tile) {
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      // Nearest, not smoothed: the flecks are noise either way, and a
      // filtered pattern over a supersampled A2 costs seconds.
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, y0, layout.width, y1 - y0);
      ctx.imageSmoothingEnabled = true;
    }
  }
  ctx.fillStyle = paper.ground;
  ctx.fillRect(0, y0, layout.width, y1 - y0);
  ctx.restore();
}

/**
 * The strips of the picture its deckle can reach into, which are the only
 * places the mask is not simply solid: along the top and the foot full
 * width, and down the sides between them, so no pixel is in two.
 */
export function deckleBands(picture: Rect, deckle: FrameLayout['deckle']): Rect[] {
  const b = Math.min(Math.ceil(deckle.reach + deckle.feather * 1.6 + 2), Math.floor(Math.min(picture.w, picture.h) / 2));
  const { x, y, w, h } = picture;
  return [
    { x, y, w, h: b },
    { x, y: y + h - b, w, h: b },
    { x, y: y + b, w: b, h: h - 2 * b },
    { x: x + w - b, y: y + b, w: b, h: h - 2 * b },
  ];
}

/**
 * The plate mark: the edge of a depression in the paper, lit from the top
 * left. Along the top and left the lip catches the light outside and the
 * wall falls into shade inside; along the foot and the right it is the other
 * way round. Two hairlines, each barely there.
 */
export function paintPlateMark(ctx: Ctx, layout: FrameLayout, paper: FramePaper) {
  const short = Math.min(layout.width, layout.height);
  const line = Math.max(1, short * 0.0008);
  const radius = short * 0.004;
  const { x, y, w, h } = layout.plate;
  const far = short;
  const halves: { clip: [number, number][]; outer: string; inner: string }[] = [
    {
      // Above the diagonal from the bottom-left corner to the top-right one.
      clip: [
        [x - far, y + h + far * (h / w)],
        [x - far, y - far],
        [x + w + far * (w / h), y - far],
      ],
      outer: paper.lit,
      inner: paper.shade,
    },
    {
      clip: [
        [x - far, y + h + far * (h / w)],
        [x + w + far, y + h + far],
        [x + w + far * (w / h), y - far],
      ],
      outer: paper.shade,
      inner: paper.lit,
    },
  ];
  ctx.save();
  ctx.lineWidth = line;
  for (const half of halves) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(half.clip[0][0], half.clip[0][1]);
    for (let i = 1; i < half.clip.length; i += 1) ctx.lineTo(half.clip[i][0], half.clip[i][1]);
    ctx.closePath();
    ctx.clip();
    ctx.beginPath();
    roundRect(ctx, { x: x - line / 2, y: y - line / 2, w: w + line, h: h + line }, radius + line / 2);
    ctx.strokeStyle = half.outer;
    ctx.stroke();
    ctx.beginPath();
    roundRect(ctx, { x: x + line / 2, y: y + line / 2, w: w - line, h: h - line }, Math.max(0, radius - line / 2));
    ctx.strokeStyle = half.inner;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
