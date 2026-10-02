/* The print's paper. A cream rag (or the night paper, deep and warm), the
   picture laid on it like watercolour that stops where the brush stopped,
   raggedly and never in a straight line, with the darker tide line a wash
   leaves just inside its edge; and the plate pressed into the paper round
   it the way an etching leaves its mark: a bevelled edge, lit along the top
   and the left and in shadow along the foot and the right, round a plate a
   shade darker than the margin. No words and no mark of the app on it.

   Everything here is in output pixels; the engine scales the context for
   its supersampling. The geometry is pure and seeded, so the same picture
   gets the same edge every time it is saved. */

import type { FrameLayout, Rect } from './sizes';

export type PaperName = 'cream' | 'night';

export interface FramePaper {
  ground: string;
  /** The pressed plate is a shade off the margin (2 to 3% darker). */
  plateTone: string;
  /** The plate mark's bevel: the lit slope (top and left) and the shaded one. */
  lit: string;
  shade: string;
  /** How strongly the bevel's slopes show, at their crease. */
  bevel: number;
  /** Rag in the paper: the darker fibres and pits, and the paler fibres. */
  grain: [number, number, number];
  fibre: [number, number, number];
  grainAlpha: number;
}

export const FRAME_PAPERS: Record<PaperName, FramePaper> = {
  cream: {
    ground: '#F3EEE2',
    plateTone: 'rgba(120, 100, 66, 0.055)',
    lit: '#FFFDF6',
    shade: '#D9D2C2',
    bevel: 0.95,
    grain: [138, 118, 86],
    fibre: [255, 253, 246],
    grainAlpha: 0.07,
  },
  night: {
    ground: '#191712',
    plateTone: 'rgba(0, 0, 0, 0.07)',
    lit: '#2B2720',
    shade: '#0C0B08',
    bevel: 0.75,
    grain: [0, 0, 0],
    fibre: [235, 220, 196],
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
  /**
   * The tide line: the band a wash pools into as it dries, just inside its
   * edge, between these two outlines (outer, then inner).
   */
  tide: [Float64Array, Float64Array];
}

const RINGS = 10;

/** Deckles by the picture rectangle they were made for, so the paper can find its tide line. */
const deckles = new WeakMap<Rect, Deckle>();

/**
 * The edge of the painted area. One ragged outline, its wander in several
 * octaves from long slow swells down to the paper's fibres, its points no
 * further apart than a fifth of a millimetre at any size (a 2000th of the
 * short side at most); then `RINGS` copies of it a little inside one
 * another, each frayed only by a hair. Filled together, each at 1/RINGS,
 * they make a mask that is solid inside and thins over a few px, so the
 * colour stops crisply but never cleanly, like a wash dried on rag paper.
 * And the tide line, 1 to 3 px inside where the colour stops.
 */
export function deckleOutline(rect: Rect, deckle: FrameLayout['deckle'], seed: string): Deckle {
  const { x, y, w, h } = rect;
  const perimeter = 2 * (w + h);
  const short = Math.min(w, h);
  const step = Math.max(1, Math.min(short * 0.002, short / 1600));
  const count = Math.max(16, Math.ceil(perimeter / step));
  const base = fnv1a(seed || 'akada');
  // The wander of the wash: long slow swells, then shorter ones, down to
  // the fibres of the paper. The amplitudes sum to one.
  const octaves = [
    { wave: short * 0.16, amp: 0.38 },
    { wave: short * 0.055, amp: 0.27 },
    { wave: short * 0.018, amp: 0.17 },
    { wave: short * 0.006, amp: 0.1 },
    { wave: Math.max(step * 3, short * 0.0022), amp: 0.05 },
    { wave: Math.max(step * 2, short * 0.0009), amp: 0.03 },
  ];
  const reach = deckle.reach;
  // The fade from colour to paper: a few px, a part of the layout's feather.
  const spread = Math.max(1.5, deckle.feather * 0.45);
  const insetAt = new Float64Array(count);
  for (let n = 0; n < count; n += 1) {
    const t = (n / count) * perimeter;
    let wander = 0;
    for (let o = 0; o < octaves.length; o += 1) wander += octaves[o].amp * loopNoise(base + o * 7919, t, perimeter, octaves[o].wave);
    insetAt[n] = reach * (0.12 + 0.88 * wander);
  }
  /** A point `inset` in from the rectangle at distance `t` round it, clockwise from the top left. */
  const place = (t: number, inset: number, out: Float64Array, n: number) => {
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
    out[n * 2] = Math.min(Math.max(px, x + inset), x + w - inset);
    out[n * 2 + 1] = Math.min(Math.max(py, y + inset), y + h - inset);
  };
  const rings: Float64Array[] = [];
  for (let k = 0; k < RINGS; k += 1) {
    const ring = new Float64Array(count * 2);
    const fibreSeed = base ^ Math.imul(k + 1, 0x27d4eb2d);
    for (let n = 0; n < count; n += 1) {
      const t = (n / count) * perimeter;
      // Each ring frays by a hair on its own, at the scale of the fibres.
      const fibre = loopNoise(fibreSeed, t, perimeter, Math.max(step * 2, short * 0.0012)) - 0.5;
      ring[n * 2] = 0;
      place(t, insetAt[n] + spread * (k / (RINGS - 1)) + fibre * spread * 0.3, ring, n);
    }
    rings.push(ring);
  }
  // The tide line: from 1 px inside where the colour stops to 1 to 3 px,
  // its width wandering along the edge as a real one does.
  const edge = spread * 0.5;
  const outer = new Float64Array(count * 2);
  const inner = new Float64Array(count * 2);
  for (let n = 0; n < count; n += 1) {
    const t = (n / count) * perimeter;
    const wide = 1 + 2 * loopNoise(base ^ 0x7d1e, t, perimeter, short * 0.01);
    place(t, insetAt[n] + edge + 1, outer, n);
    place(t, insetAt[n] + edge + 1 + wide, inner, n);
  }
  const out: Deckle = { rings, tide: [outer, inner] };
  deckles.set(rect, out);
  return out;
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
const TILE = 512;

/** Value noise on a lattice that wraps every `cells`, so the tile repeats seamlessly. */
function wrapNoise(seed: number, u: number, v: number, cells: number): number {
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const s = (a: number) => a * a * (3 - 2 * a);
  const at = (a: number, b: number) => lattice(seed, (((a % cells) + cells) % cells) * 7919 + (((b % cells) + cells) % cells));
  const a0 = at(i, j) + (at(i + 1, j) - at(i, j)) * s(fu);
  const a1 = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * s(fu);
  return a0 + (a1 - a0) * s(fv);
}

/**
 * Rag paper at 300 dpi, a tile of it: a soft cloud in the pulp, a fine
 * tooth, flecks, and short fibres lying every way, some catching the light
 * and some in their own shadow. Quiet: none of it more than a few percent
 * off the ground, so it is felt at arm's length and seen only close to.
 */
function grainTile(paper: FramePaper): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = paper.grain.join(',') + paper.fibre.join(',') + paper.grainAlpha;
  const cached = grainTiles.get(key);
  if (cached) return cached;
  const size = TILE;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const [r, g, b] = paper.grain;
  const [fr, fg, fb] = paper.fibre;
  let s = 0x2545f491;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const k = paper.grainAlpha;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // The cloud of the pulp, two sizes of it; then the tooth; then a
      // fleck now and then.
      const cloud = (wrapNoise(11, x / 64, y / 64, size / 64) - 0.5) * 0.9 + (wrapNoise(12, x / 22, y / 22, Math.round(size / 22)) - 0.5) * 0.6;
      const tooth = (wrapNoise(13, x / 3.2, y / 3.2, size / 3.2) - 0.5) * 0.9;
      const v = rnd();
      const fleck = v > 0.9988 ? -1.4 : v < 0.001 ? 1 : 0;
      const d = cloud * 0.55 + tooth * 0.5 + (rnd() - 0.5) * 0.35 + fleck;
      const i = (y * size + x) * 4;
      if (d < 0) {
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
      } else {
        img.data[i] = fr;
        img.data[i + 1] = fg;
        img.data[i + 2] = fb;
      }
      img.data[i + 3] = Math.round(Math.min(1, Math.abs(d) * k) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  // Fibres: short curved hairs, every way, drawn round the tile's edges
  // too so the repeat never shows a cut one.
  ctx.lineCap = 'round';
  for (let n = 0; n < 420; n += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const a = rnd() * Math.PI;
    const len = 5 + rnd() * rnd() * 34;
    const bend = (rnd() - 0.5) * len * 0.5;
    const light = rnd() < 0.55;
    const [cr, cg, cb] = light ? paper.fibre : paper.grain;
    ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${(k * (0.5 + rnd() * 0.7)).toFixed(3)})`;
    ctx.lineWidth = 0.5 + rnd() * 0.7;
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const x0 = x + ox - dx / 2;
        const y0 = y + oy - dy / 2;
        if (x0 > size + len || x0 < -2 * len || y0 > size + len || y0 < -2 * len) continue;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x + ox - Math.sin(a) * bend, y + oy + Math.cos(a) * bend, x0 + dx, y0 + dy);
        ctx.stroke();
      }
    }
  }
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

/** The plate's corners: barely rounded, the way a bevelled copper plate's are. */
function plateRadius(layout: FrameLayout): number {
  return Math.min(layout.width, layout.height) * 0.0025;
}

/**
 * The tide line: where the wash dried, its pigment pooled a little into a
 * darker line just inside its edge. The picture already on the context is
 * laid over itself, multiplied, through the band between the deckle's two
 * tide outlines: a quarter more pigment, at about a third.
 */
function paintTideLine(ctx: Ctx, layout: FrameLayout, deckle: Deckle, y0: number, y1: number) {
  const bands = deckleBands(layout.picture, layout.deckle).filter((r) => r.y < y1 && r.y + r.h > y0);
  if (!bands.length) return;
  const m = ctx.getTransform();
  const canvas = ctx.canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
  if (!canvas || !canvas.width) return;
  ctx.save();
  ctx.beginPath();
  for (const r of bands) ctx.rect(r.x, Math.max(r.y, y0 - 2), r.w, Math.min(r.y + r.h, y1 + 2) - Math.max(r.y, y0 - 2));
  ctx.clip();
  ctx.beginPath();
  tracePolygon(ctx, deckle.tide[0]);
  tracePolygon(ctx, deckle.tide[1]);
  ctx.clip('evenodd');
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.35;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const r of bands) {
    // The band in device pixels, clamped to the canvas.
    const dx0 = Math.max(0, Math.floor(r.x * m.a + m.e) - 2);
    const dy0 = Math.max(0, Math.floor(Math.max(r.y, y0 - 2) * m.d + m.f) - 2);
    const dx1 = Math.min(canvas.width, Math.ceil((r.x + r.w) * m.a + m.e) + 2);
    const dy1 = Math.min(canvas.height, Math.ceil(Math.min(r.y + r.h, y1 + 2) * m.d + m.f) + 2);
    if (dx1 <= dx0 || dy1 <= dy0) continue;
    ctx.drawImage(canvas as CanvasImageSource, dx0, dy0, dx1 - dx0, dy1 - dy0, dx0, dy0, dx1 - dx0, dy1 - dy0);
  }
  ctx.restore();
}

/**
 * The sheet under the picture, for the rows `[y0, y1)`: the tide line in
 * the picture's own edge, then the paper, its rag, and the pressed plate's
 * slightly darker tone. Laid *behind* what is already on the context
 * (`destination-over`), so the picture can be painted and deckled first, on
 * the one canvas, and the paper slid under it.
 */
export function paintPaperBehind(ctx: Ctx, layout: FrameLayout, paper: FramePaper, y0: number, y1: number) {
  const deckle = deckles.get(layout.picture);
  if (deckle) paintTideLine(ctx, layout, deckle, y0, y1);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  // Top layer first: under destination-over each fill goes beneath the last.
  ctx.beginPath();
  roundRect(ctx, layout.plate, plateRadius(layout));
  ctx.fillStyle = paper.plateTone;
  ctx.fill();
  const tile = grainTile(paper);
  if (tile) {
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      // Nearest, not smoothed: one tile pixel is one pixel of the print, and
      // a filtered pattern over a supersampled A2 costs seconds.
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

/** The bevel's width: 30 to 45 px of a 300 dpi print, a little wider on a bigger sheet. */
export function bevelWidth(layout: FrameLayout): number {
  const short = Math.min(layout.width, layout.height);
  return Math.max(30, Math.min(45, short * 0.0105));
}

/**
 * The plate mark: the bevelled edge of the plate, pressed into the paper,
 * lit from the top left. A band 30 to 45 px wide all round the plate, its
 * slopes meeting in mitres at the corners: the top and the left catch the
 * light, the foot and the right are in shade. Each slope is crisp at its
 * outer crease and softens into the plate, as a pressed edge does; and the
 * corners are barely rounded.
 */
export function paintPlateMark(ctx: Ctx, layout: FrameLayout, paper: FramePaper) {
  const b = bevelWidth(layout);
  const radius = plateRadius(layout);
  const { x, y, w, h } = layout.plate;
  const ix = x + b;
  const iy = y + b;
  const iw = w - 2 * b;
  const ih = h - 2 * b;
  if (iw <= 0 || ih <= 0) return;
  /** A colour as rgba at an alpha. */
  const rgba = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
  };
  const k = paper.bevel;
  const slopes: { quad: [number, number][]; from: [number, number]; to: [number, number]; color: string }[] = [
    // Top and left, lit.
    { quad: [[x, y], [x + w, y], [ix + iw, iy], [ix, iy]], from: [0, y], to: [0, iy], color: paper.lit },
    { quad: [[x, y], [ix, iy], [ix, iy + ih], [x, y + h]], from: [x, 0], to: [ix, 0], color: paper.lit },
    // The foot and the right, in shade.
    { quad: [[x, y + h], [ix, iy + ih], [ix + iw, iy + ih], [x + w, y + h]], from: [0, y + h], to: [0, iy + ih], color: paper.shade },
    { quad: [[x + w, y], [x + w, y + h], [ix + iw, iy + ih], [ix + iw, iy]], from: [x + w, 0], to: [ix + iw, 0], color: paper.shade },
  ];
  ctx.save();
  // The plate's outline, its corners barely rounded, bounds every slope.
  ctx.beginPath();
  roundRect(ctx, layout.plate, radius);
  ctx.clip();
  for (const sl of slopes) {
    const g = ctx.createLinearGradient(sl.from[0], sl.from[1], sl.to[0], sl.to[1]);
    // Crisp at the crease, an even slope, and soft only where it meets the
    // plate's floor.
    g.addColorStop(0, rgba(sl.color, k));
    g.addColorStop(0.05, rgba(sl.color, k * 0.82));
    g.addColorStop(0.75, rgba(sl.color, k * 0.55));
    g.addColorStop(1, rgba(sl.color, k * 0.12));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sl.quad[0][0], sl.quad[0][1]);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(sl.quad[i][0], sl.quad[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
