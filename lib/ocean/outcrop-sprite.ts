/**
 * Outcrops, inked (see `outcrop.ts`).
 *
 * A rock and everything on it is drawn once, to a canvas of its own, and
 * after that only placed: coral doesn't move, so there is nothing to
 * redraw, and a frame pays one image copy per rock (two where it crosses
 * what is written on the page). It is drawn as if it jutted from the left
 * edge, and mirrored when it comes from the right.
 *
 * The growths are drawn as a natural-history plate would draw them: a wash
 * of colour under a line of ink. Colour goes with the light, as it does in
 * real water, which takes the reds first: full pastels on the sunlit reef,
 * greyed in the twilight, and in the dark only pale ghosts.
 */

import { mixHex } from '../fan';
import { zoneMid } from './depth';
import type { EelPatch, Growth, Outcrop, outcropsInView } from './outcrop';
import { HUES, IRON_GALL, waterAt, type Water } from './palette';
import { detailFor, grain, hatch, inkLine, LIGHT, stipple } from './pen';
import { chance, hash32, int, mulberry32, range, type Rand } from './random';

/** The light from the top left, and the other way for light ink on dark
    water, which marks where the light falls rather than where it doesn't. */
const UNLIGHT: [number, number] = [-LIGHT[0], -LIGHT[1]];

interface Placed {
  canvas: HTMLCanvasElement;
  /** Where the rock top's page-edge corner sits in the canvas, in device pixels. */
  ox: number;
  oy: number;
}

/** A share of the page, 0 to 1 on each axis. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Only two or three are ever on the page; a few more cover a resize or a turn of the light. */
const KEEP = 8;

export class OutcropCache {
  private map = new Map<string, Placed>();

  get(o: Outcrop, w: number, h: number, dark: boolean, px: number): Placed | null {
    if (typeof document === 'undefined' || w <= 0 || h <= 0) return null;
    const key = `${o.id}|${w}|${h}|${dark ? 1 : 0}|${px}`;
    const hit = this.map.get(key);
    if (hit) {
      // Most recently used goes to the back of the line.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const made = render(o, w, h, dark, px);
    if (!made) return null;
    this.map.set(key, made);
    while (this.map.size > KEEP) this.map.delete(this.map.keys().next().value as string);
    return made;
  }
}

/**
 * The outcrops on the page, each at its place. Where one crosses a `clear`
 * rect (what is written on the open screen, as shares of the page) it goes
 * faint, as the animals do, so the clock always reads.
 */
export function drawOutcrops(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  inView: ReturnType<typeof outcropsInView>,
  cache: OutcropCache,
  water: Water,
  px: number,
  clear: Rect[] | undefined,
) {
  for (const { outcrop, top } of inView) {
    const s = cache.get(outcrop, w, h, water.dark, px);
    if (!s) continue;
    const cw = s.canvas.width;
    const ch = s.canvas.height;
    const y = top * h - s.oy;
    const left = outcrop.edge < 0 ? -s.ox : w - (cw - s.ox);
    if (y > h || y + ch < 0) continue;
    const place = () => {
      if (outcrop.edge < 0) {
        ctx.drawImage(s.canvas, -s.ox, y);
      } else {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(s.canvas, -s.ox, y);
      }
    };
    const hits = (clear ?? []).filter(
      (r) => r.x * w < left + cw && (r.x + r.w) * w > left && r.y * h < y + ch && (r.y + r.h) * h > y,
    );
    ctx.save();
    ctx.globalAlpha = 1;
    if (!hits.length) {
      place();
      ctx.restore();
      continue;
    }
    const outside = new Path2D();
    outside.rect(-w, -h, w * 3, h * 3);
    const inside = new Path2D();
    for (const r of hits) {
      outside.rect(r.x * w, r.y * h, r.w * w, r.h * h);
      inside.rect(r.x * w, r.y * h, r.w * w, r.h * h);
    }
    ctx.clip(outside, 'evenodd');
    place();
    ctx.restore();
    ctx.save();
    ctx.clip(inside);
    ctx.globalAlpha = 0.3;
    place();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The sprite

function render(o: Outcrop, w: number, h: number, dark: boolean, px: number): Placed | null {
  const span = (o.reach + 0.03) * w;
  const thick = o.thick * h;
  const tallest = Math.max(0, ...o.growths.map((g) => g.size)) * px;
  const padL = 2 * px;
  const padR = Math.max(24, ...o.growths.map((g) => g.size * 0.75)) * px;
  const padT = Math.ceil(tallest * 1.15 + 16 * px);
  const cw = Math.min(4096, Math.ceil(padL + span * 1.03 + padR));
  const ch = Math.min(4096, Math.ceil(padT + thick + 8 * px));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ox = padL + 0.03 * w;
  const oy = padT;
  const crestY = drawRock(ctx, o, span, thick, padL, oy, dark, px);
  // Under the growths, so a coral at its edge stands on the sand.
  if (o.eels) drawSand(ctx, o, o.eels, (f) => padL + span * f, crestY, dark, px);
  for (const g of o.growths) {
    const x = ox + g.at * o.reach * w;
    const f = Math.min(0.88, (x - padL) / span);
    ctx.save();
    // Sunk a little into the rock, so it stands on it rather than floats.
    ctx.translate(x, crestY(f) + 1.5 * px);
    drawGrowth(ctx, g, o.zone, dark, px);
    ctx.restore();
  }
  return { canvas, ox, oy };
}

/** How far the crest stands above the rock's top at `f` (0 to 1 along it from
    its own edge), in device pixels: low boulders between the bumps, then the
    lip. Shared by the sprite and `rockTopAt`, so what stands on the rock
    from outside the sprite lands where the ink is. */
function crestRise(o: Outcrop, f: number, px: number): number {
  const n = o.bumps.length;
  const u = (Math.max(0, Math.min(0.88, f)) / 0.88) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u));
  const t = u - i;
  const b = o.bumps[i] + (o.bumps[i + 1] - o.bumps[i]) * (1 - Math.cos(Math.PI * t)) * 0.5;
  return (0.5 + 0.5 * b) * 7 * px + Math.sin(Math.PI * t) * 4 * px;
}

/** Where a point `f` (0..1 along the rock top from its own edge) sits on the page, in device px, for a rock in view: the top of the crest at f. */
export function rockTopAt(o: Outcrop, top: number, f: number, w: number, h: number, px: number): { x: number; y: number } {
  // The sprite's rock starts `padL` in and is placed `ox = padL + 0.03 w`
  // back off the page, so the pad cancels out.
  const x = (o.reach + 0.03) * w * f - 0.03 * w;
  return { x: o.edge < 0 ? x : w - x, y: top * h - crestRise(o, f, px) };
}

/** How high the sand stands over the crest at `f`, in CSS pixels: a low
    mound, highest in the middle and running out to nothing at its ends. */
export function sandLift(p: EelPatch, f: number): number {
  const u = (f - p.at) / (p.width / 2);
  return Math.abs(u) >= 1 ? 0 : 3.5 * (0.5 + 0.5 * Math.cos(Math.PI * u));
}

/** The burrows in a patch, one per eel, each with `f` along the rock top and
    how high the sand lifts it over the crest, in CSS pixels. Evenly spread
    over the middle of the mound and nudged, the way a colony keeps its
    distance. */
export function eelHoles(p: EelPatch): { f: number; lift: number }[] {
  const r = mulberry32(p.seed);
  const spread = p.width * 0.78;
  const step = spread / p.count;
  return Array.from({ length: p.count }, (_, i) => {
    const f = p.at - spread / 2 + step * (i + 0.5) + range(r, -0.22, 0.22) * step;
    return { f, lift: sandLift(p, f) };
  });
}

/** A garden eels' patch: a low mound of pale sand on the rock's top, stippled,
    with a burrow for each eel. The eels are drawn live by `garden-eels.ts`. */
function drawSand(
  ctx: CanvasRenderingContext2D,
  o: Outcrop,
  p: EelPatch,
  X: (f: number) => number,
  crestY: (f: number) => number,
  dark: boolean,
  px: number,
) {
  const zw = waterAt(zoneMid(o.zone), dark ? 'night' : 'paper', '#A8BCC9');
  const sand = dark ? mixHex(zw.bottom, '#D8CCB0', 0.42) : mixHex('#E9DFC6', zw.bottom, 0.22);
  const line = dark ? mixHex(zw.bottom, '#FFFFFF', 0.3) : mixHex(zw.bottom, '#1A1714', 0.55);
  const hole = dark ? '#0B0A09' : mixHex(zw.bottom, '#1A1714', 0.75);
  const alpha = 0.92 * (0.65 + 0.35 * zw.light);
  const f0 = p.at - p.width / 2;
  const top = (f: number) => crestY(f) - sandLift(p, f) * px;
  const crest = new Path2D();
  crest.moveTo(X(f0), top(f0));
  for (let k = 1; k <= 16; k++) crest.lineTo(X(f0 + (p.width * k) / 16), top(f0 + (p.width * k) / 16));
  // Down into the rock a little, so the sand sits in it rather than on it.
  const mound = new Path2D(crest);
  for (let k = 16; k >= 0; k--) mound.lineTo(X(f0 + (p.width * k) / 16), crestY(f0 + (p.width * k) / 16) + 1.5 * px);
  mound.closePath();
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = sand;
  ctx.fill(mound);
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = line;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke(crest);
  // Stipple, thicker toward the crest of the mound where the grains pile.
  const r = mulberry32(p.seed ^ 0x5a17);
  ctx.fillStyle = line;
  for (let i = 0; i < 22; i++) {
    const f = f0 + p.width * (0.08 + 0.84 * r());
    const lift = sandLift(p, f);
    if (lift < 0.6) continue;
    ctx.globalAlpha = alpha * range(r, 0.25, 0.5);
    ctx.beginPath();
    ctx.arc(X(f), crestY(f) - lift * px * r() * 0.85 + 0.6 * px, range(r, 0.35, 0.6) * px, 0, Math.PI * 2);
    ctx.fill();
  }
  // The burrows: small dark mouths, seen a little from above.
  ctx.fillStyle = hole;
  ctx.globalAlpha = alpha * 0.85;
  for (const b of eelHoles(p)) {
    ctx.beginPath();
    ctx.ellipse(X(b.f), crestY(b.f) - b.lift * px + 0.5 * px, 1.9 * px, 0.75 * px, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Soft blotches, 0 to 1, for where crust gathers on rock: no grid shows. */
function blotch(x: number, y: number, k: number): number {
  return (
    0.5 +
    0.28 * Math.sin(x * 0.021 * k + 1.3) * Math.sin(y * 0.027 * k + 0.4) +
    0.22 * Math.sin((x + y) * 0.047 * k + 2.1) * Math.sin((x - y) * 0.039 * k + 0.7)
  );
}

/** What `inkRock` needs to know about a rock: its crest, its body, and how
    its faces turn to the light. */
export interface RockInk {
  /** Points along the crest from the wall to the lip and a little way down it. */
  crest: number[];
  /** The rock's region: the wash is already laid in it. */
  body: Path2D;
  box: { x: number; y: number; w: number; h: number };
  /** How far down the rock a point is, 0 at the crest to 1 at its foot. */
  v: (x: number, y: number) => number;
  /** How much a point is on the face of the lip, 0 to 1. */
  lip: (x: number) => number;
  /** 1 when the lip faces away from the light (into shadow), -1 toward it. */
  away: number;
  /** Which way the rock runs from the wall, across the page: 1 right, -1 left. */
  dir: 1 | -1;
  /** Where the wash runs dry, so the marks thin out with it: 1 full to 0 gone. */
  fade: (y: number) => number;
  line: string;
  rock: string;
  dark: boolean;
  alpha: number;
  px: number;
  /** How much drawing the rock carries, 0 to 1. */
  d: number;
  seed: number;
  /** A few barnacles on its face. */
  barnacles?: boolean;
  /** Points along the underside, from the lip back to the wall, where it has one. */
  under?: number[];
}

/**
 * A rock in pen and wash, over a wash already laid: the pigment pooled at
 * the crest, paper grain, contour hatching that follows the crest down the
 * face and thickens into the shadow, strokes down the lip, cross-hatching
 * where it is darkest, a crust of stipple gathered in blotches, a few
 * cracks and barnacles, and the crest in one pressure line over it all. On
 * dark water the light ink marks where the light falls instead. Shared by
 * the outcrops and the kelp's ledge; small or live it is only the crest and
 * a few contours, which cost a handful of strokes.
 */
export function inkRock(ctx: CanvasRenderingContext2D, k: RockInk): void {
  const { px, alpha, d } = k;
  const r = mulberry32(k.seed);
  ctx.save();
  ctx.clip(k.body);
  // The pigment that ran to the crest and dried darker there.
  const crestPath = new Path2D();
  crestPath.moveTo(k.crest[0], k.crest[1]);
  for (let i = 2; i < k.crest.length; i += 2) crestPath.lineTo(k.crest[i], k.crest[i + 1]);
  ctx.strokeStyle = mixHex(k.rock, k.dark ? '#000000' : '#1A1714', 0.3);
  ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = 6 * px;
  ctx.stroke(crestPath);
  // How much a mark is wanted at a point: shadow on light water, light on dark.
  const shade = k.dark
    ? (x: number, y: number) => (0.95 - 2.2 * k.v(x, y) - 0.45 * k.lip(x) * k.away + 0.12 * (blotch(x / px, y / px, 1) - 0.5)) * k.fade(y)
    : (x: number, y: number) =>
        (0.12 + 1.05 * Math.pow(k.v(x, y), 1.2) + 0.45 * k.lip(x) * k.away + 0.2 * (blotch(x / px, y / px, 1) - 0.5)) *
        (0.4 + 0.6 * k.fade(y));
  if (d > 0.35) {
    // Paper tooth, in bands that thin as the wash runs dry.
    const gr = grain(ctx);
    if (gr) {
      gr.setTransform?.(new DOMMatrix([px, 0, 0, px, 0, 0]));
      ctx.fillStyle = gr;
      const bands = 6;
      for (let b = 0; b < bands; b++) {
        const y = k.box.y + (k.box.h * b) / bands;
        ctx.globalAlpha = alpha * (k.dark ? 0.35 : 0.28) * k.fade(y + k.box.h / bands / 2);
        ctx.fillRect(k.box.x, y, k.box.w, k.box.h / bands + 1);
      }
    }
  }
  // The pen strokes that model it, as wavering ribbons that break now and
  // then the way an engraver's lines do, so no run of them reads as a pattern.
  const strokes = new Path2D();
  const ribbon = (pts: number[], weight: (x: number, y: number, i: number) => number, ph: number) => {
    const run: number[] = [];
    let along = 0;
    const flush = () => {
      const m = run.length / 3;
      if (m >= 3) {
        strokes.moveTo(run[0], run[1] - run[2] / 2);
        for (let j = 1; j < m; j++) strokes.lineTo(run[j * 3], run[j * 3 + 1] - run[j * 3 + 2] / 2);
        for (let j = m - 1; j >= 0; j--) strokes.lineTo(run[j * 3], run[j * 3 + 1] + run[j * 3 + 2] / 2);
        strokes.closePath();
      }
      run.length = 0;
    };
    for (let j = 0; j < pts.length; j += 2) {
      if (j) along += Math.hypot(pts[j] - pts[j - 2], pts[j + 1] - pts[j - 1]);
      const gap = Math.sin(ph + along / (19 * px)) * Math.sin(ph * 1.7 + along / (7.3 * px));
      const wd = weight(pts[j], pts[j + 1], j / 2);
      if (gap < 0.55 && wd > 0.15 * px) run.push(pts[j], pts[j + 1], wd);
      else flush();
    }
    flush();
  };
  const fine = d > 0.35;
  const sp = (fine ? 2.6 : 3.4) * px;
  // Under the crest: the crest again a little way down, its boulders easing
  // out as it goes, so the top reads as rolling over.
  const m = k.crest.length / 2;
  const base: number[] = [];
  for (let j = 0; j < m; j++) {
    let sum = 0;
    let c = 0;
    for (let q = Math.max(0, j - 6); q <= Math.min(m - 1, j + 6); q++, c++) sum += k.crest[q * 2 + 1];
    base.push(sum / c);
  }
  const n1 = fine ? 6 : 3;
  for (let i = 1; i <= n1; i++) {
    const damp = 1 - i / (n1 + 2);
    const pts: number[] = [];
    const ph = r() * 6.28;
    for (let j = 0; j < m; j++) {
      const x = k.crest[j * 2];
      pts.push(x, base[j] + (k.crest[j * 2 + 1] - base[j]) * damp + i * sp + Math.sin(ph + x / (29 * px)) * sp * 0.25);
    }
    const t = i / n1;
    ribbon(
      pts,
      (x, y) =>
        (fine ? 0.6 : 0.5) * px * k.fade(y) * (k.dark ? 1.2 * (1 - 0.7 * t) : 0.45 + 0.9 * t) * (0.55 + 0.9 * (blotch(x / px, y / px, 1) - 0.2)),
      ph,
    );
  }
  // Up from the underside, where the rock turns away into its own shadow:
  // lines that follow it, heaviest at the edge.
  if (k.under && k.under.length >= 4) {
    const n2 = fine ? 9 : 4;
    for (let i = 0; i < n2; i++) {
      const pts: number[] = [];
      const ph = r() * 6.28;
      for (let j = 0; j < k.under.length; j += 2) {
        const x = k.under[j];
        pts.push(x, k.under[j + 1] - (i + 0.6) * sp + Math.sin(ph + x / (31 * px)) * sp * 0.2);
      }
      const t = i / n2;
      ribbon(pts, (x, y) => (k.dark ? 0 : (fine ? 0.75 : 0.55) * px * (1.25 - t) * Math.sqrt(k.fade(y)) * (0.6 + 0.8 * (blotch(x / px, y / px, 1) - 0.2))), ph);
    }
  }
  ctx.fillStyle = k.line;
  ctx.globalAlpha = alpha * (fine ? 0.6 : 0.32);
  ctx.fill(strokes);
  if (fine) {
    // Down the face, near-upright strokes where it is in shadow (or, on dark
    // water, in the light), heaviest on the lip.
    hatch(ctx, k.body, k.box, {
      spacing: 2.6 * px,
      angle: Math.PI / 2 - 0.22 * k.dir,
      shade: (x, y) => (k.dark ? shade(x, y) * (0.5 + 0.6 * k.lip(x)) : shade(x, y) * (0.75 + 0.35 * k.lip(x) * k.away)),
      from: 0.55,
      color: k.line,
      width: 0.5 * px,
      alpha: alpha * 0.5,
      seed: k.seed ^ 5,
    });
    // And across them where it is darkest, a second set.
    if (!k.dark) {
      hatch(ctx, k.body, k.box, {
        spacing: 2.9 * px,
        angle: -0.6 * k.dir,
        shade: (x, y) => shade(x, y),
        from: 0.85,
        color: k.line,
        width: 0.45 * px,
        alpha: alpha * 0.4,
        seed: k.seed ^ 9,
      });
    }
    // A crust of stipple, gathered in blotches, thickest near the crest.
    stipple(ctx, k.body, k.box, {
      spacing: 2.2 * px,
      radius: 0.42 * px,
      shade: (x, y) => (0.2 + 0.8 * blotch(x / px, y / px, 1.7)) * (1 - 0.75 * k.v(x, y)) * k.fade(y),
      from: 0.32,
      color: k.line,
      alpha: alpha * 0.55,
      seed: k.seed ^ 13,
    });
  }
  ctx.restore();
  if (d > 0.25) {
    // Cracks: short jagged lines in from the crest and across the lip,
    // now and then forking.
    const count = 2 + Math.floor(r() * 3);
    for (let c = 0; c < count; c++) {
      const j = 2 * Math.floor((0.15 + r() * 0.75) * (k.crest.length / 2 - 1));
      let cx = k.crest[j];
      let cy = k.crest[j + 1] + (2 + r() * 5) * px;
      let a = Math.PI / 2 + (r() - 0.5) * 0.9;
      const crack: number[] = [cx, cy];
      const segs = 3 + Math.floor(r() * 4);
      for (let s = 0; s < segs; s++) {
        a += (r() - 0.5) * 1.3;
        a = Math.max(0.4, Math.min(Math.PI - 0.4, a));
        const len = (3 + r() * 5) * px;
        cx += Math.cos(a) * len;
        cy += Math.sin(a) * len;
        crack.push(cx, cy);
        if (s === 1 && r() < 0.5) {
          const fa = a + (r() < 0.5 ? 0.8 : -0.8);
          inkLine(ctx, [cx, cy, cx + Math.cos(fa) * 4 * px, cy + Math.sin(fa) * 4 * px, cx + Math.cos(fa + 0.3) * 8 * px, cy + Math.sin(fa + 0.3) * 8 * px], false, {
            width: 0.5 * px,
            color: k.line,
            alpha: alpha * 0.5 * k.fade(cy),
            taper: [0, 0.8],
            seed: c * 7 + 1,
            raw: true,
            min: 0.2 * px,
          });
        }
      }
      inkLine(ctx, crack, false, { width: 0.8 * px, color: k.line, alpha: alpha * 0.7 * k.fade(cy), taper: [0.05, 0.7], seed: c * 7 + 3, raw: true, min: 0.2 * px });
    }
  }
  if (k.barnacles && d > 0.3 && r() < 0.65) {
    // A few barnacles just under the crest: a low cone, its plates, the slit on top.
    const nb = 2 + Math.floor(r() * 4);
    const j0 = 2 * Math.floor((0.2 + r() * 0.5) * (k.crest.length / 2 - 1));
    const shell = k.dark ? mixHex(k.rock, '#E8E0CF', 0.35) : mixHex(k.rock, '#FBF8EF', 0.55);
    for (let b = 0; b < nb; b++) {
      const j = Math.min(k.crest.length - 2, j0 + 2 * Math.floor(b * (1.5 + r() * 2)));
      const bw = (2.2 + r() * 1.6) * px;
      const x = k.crest[j] + (r() - 0.5) * 4 * px;
      const y = k.crest[j + 1] + (2.5 + r() * 6) * px;
      const cone = new Path2D();
      cone.moveTo(x - bw, y + bw * 0.35);
      cone.quadraticCurveTo(x - bw * 0.7, y - bw * 0.6, x - bw * 0.3, y - bw * 0.7);
      cone.lineTo(x + bw * 0.3, y - bw * 0.7);
      cone.quadraticCurveTo(x + bw * 0.7, y - bw * 0.6, x + bw, y + bw * 0.35);
      cone.closePath();
      ctx.fillStyle = shell;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fill(cone);
      ctx.strokeStyle = k.line;
      ctx.lineWidth = 0.5 * px;
      ctx.globalAlpha = alpha * 0.8;
      ctx.stroke(cone);
      ctx.beginPath();
      ctx.moveTo(x - bw * 0.25, y - bw * 0.62);
      ctx.lineTo(x + bw * 0.25, y - bw * 0.62);
      for (const f of [-0.55, 0, 0.55]) {
        ctx.moveTo(x + f * bw * 0.5, y - bw * 0.55);
        ctx.lineTo(x + f * bw, y + bw * 0.25);
      }
      ctx.lineWidth = 0.4 * px;
      ctx.globalAlpha = alpha * 0.6;
      ctx.stroke();
    }
  }
  // The crest, in one pressure line that runs on down the lip and lifts.
  inkLine(ctx, k.crest, false, {
    width: (d > 0.35 ? 1.5 : 1.25) * px,
    color: k.line,
    alpha: alpha * 0.85,
    swell: 0.8,
    taper: [0, 0.16],
    lost: d > 0.35 ? 0.3 : 0.15,
    seed: k.seed ^ 3,
    raw: true,
    light: k.dark ? UNLIGHT : LIGHT,
    min: 0.3 * px,
  });
}

/** A cubic's points, appended to `out` (not its start). */
function cubicPts(out: number[], p: number[], n: number) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(
      u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
      u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7],
    );
  }
}

/** The rock, as the kelp's ledge is drawn: inked along its top and lip, and
    bleeding away underneath toward the page edge it comes out of, so it reads
    as rock jutting from a wall rather than a bowl floating in the water. */
function drawRock(
  ctx: CanvasRenderingContext2D,
  o: Outcrop,
  span: number,
  thick: number,
  x0: number,
  top: number,
  dark: boolean,
  px: number,
): (f: number) => number {
  const X = (f: number) => x0 + span * f;
  // Coloured from its own zone's water, not the live water, so the sprite
  // holds still while the sea darkens around it.
  const zw = waterAt(zoneMid(o.zone), dark ? 'night' : 'paper', '#A8BCC9');
  const rock = dark ? mixHex(zw.bottom, '#000000', 0.28) : mixHex(zw.bottom, '#6B6459', 0.42);
  const line = dark ? IRON_GALL.dark : IRON_GALL.light;
  // Fainter as the light goes, but never lost: in the dark the rock is
  // what the growths stand on, and it is mostly its ink that shows.
  const alpha = 0.92 * (0.65 + 0.35 * zw.light);

  const crestY = (f: number) => top - crestRise(o, f, px);
  const edge = new Path2D();
  const crest: number[] = [X(0), crestY(0)];
  edge.moveTo(X(0), crestY(0));
  for (let k = 1; k <= 48; k++) {
    edge.lineTo(X((k / 48) * 0.88), crestY((k / 48) * 0.88));
    crest.push(X((k / 48) * 0.88), crestY((k / 48) * 0.88));
  }
  const lipTop = crestY(0.88);
  const lip = [X(0.88), lipTop, X(0.96), lipTop, X(1.01), top + thick * 0.12, X(0.97), top + thick * 0.3];
  edge.bezierCurveTo(lip[2], lip[3], lip[4], lip[5], lip[6], lip[7]);
  cubicPts(crest, lip, 10);
  // The underside runs back to the wall and is never inked: the wash runs dry
  // before it gets there.
  const under = [X(0.97), top + thick * 0.3, X(0.8), top + thick * 0.45, X(0.3), top + thick * 0.7, X(0), top + thick];
  const body = new Path2D(edge);
  body.bezierCurveTo(under[2], under[3], under[4], under[5], under[6], under[7]);
  body.closePath();
  // A little way on round the lip, where the pen lifts.
  cubicPts(crest, [under[0], under[1], X(0.93), top + thick * 0.35, X(0.88), top + thick * 0.4, X(0.84), top + thick * 0.42], 4);

  const g = ctx.createLinearGradient(0, top, 0, top + thick);
  g.addColorStop(0, rock);
  g.addColorStop(0.4, rock);
  g.addColorStop(1, `${rock}00`);
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = g;
  ctx.fill(body);
  // The underside as a lookup by x, for how far down the rock a point is.
  const ux: number[] = [];
  const uy: number[] = [];
  const tmp: number[] = [under[0], under[1]];
  cubicPts(tmp, under, 24);
  for (let i = 0; i < tmp.length; i += 2) {
    ux.push(tmp[i]);
    uy.push(tmp[i + 1]);
  }
  const underAt = (x: number) => {
    if (x >= ux[0]) return uy[0];
    for (let i = 1; i < ux.length; i++) {
      if (x >= ux[i]) {
        const t = (x - ux[i]) / (ux[i - 1] - ux[i] || 1);
        return uy[i] + (uy[i - 1] - uy[i]) * t;
      }
    }
    return uy[uy.length - 1];
  };
  const f0 = (x: number) => Math.max(0, Math.min(0.88, (x - x0) / span));
  ctx.restore();
  inkRock(ctx, {
    crest,
    body,
    box: { x: x0, y: top - 14 * px, w: span * 1.03, h: thick + 14 * px },
    v: (x, y) => {
      const c = crestY(f0(x));
      return Math.max(0, Math.min(1, (y - c) / Math.max(4 * px, underAt(x) - c)));
    },
    lip: (x) => Math.max(0, 1 - Math.abs(x - X(0.95)) / (0.12 * span)),
    away: 1,
    dir: 1,
    fade: (y) => Math.max(0, Math.min(1, 1.25 - (y - top) / thick)),
    line,
    rock,
    dark,
    alpha,
    px,
    d: detailFor(Math.min(span, thick * 2.5)),
    seed: hash32(o.id, 'rock'),
    barnacles: o.zone < 2,
    under: tmp,
  });
  return crestY;
}

// ---------------------------------------------------------------------------
// The growths. Each is drawn at its base, standing up (-y), `H` device pixels tall.

interface Ink {
  ink: string;
  body: string;
  /** The dark of an opening: a sponge's mouth. */
  hollow: string;
  /** A sea pen's light, in the dark. */
  glow: string | null;
}

/** The animals' ink rule, with the colour drained toward grey and then pale with depth. */
function inkFor(g: Growth, zone: number, dark: boolean): Ink {
  let c = HUES[Math.max(0, Math.min(HUES.length - 1, Math.round(g.hue)))];
  if (zone === 1) c = mixHex(c, '#9AA3AB', 0.5);
  else if (zone >= 2) c = mixHex(c, '#EFE9DC', 0.75);
  const water = dark ? '#1A1815' : '#FBF8EF';
  return {
    ink: dark ? mixHex(c, '#FFFFFF', 0.45) : mixHex(c, '#1A1714', 0.6),
    body: dark ? mixHex(c, water, 0.45) : mixHex(c, water, 0.2),
    hollow: dark ? '#0B0A09' : mixHex(c, '#1A1714', 0.75),
    glow: dark && zone >= 2 ? mixHex(c, '#FFFFFF', 0.55) : null,
  };
}

function drawGrowth(ctx: CanvasRenderingContext2D, g: Growth, zone: number, dark: boolean, px: number) {
  const r = mulberry32(g.seed);
  const ink = inkFor(g, zone, dark);
  const H = g.size * px;
  ctx.globalAlpha = zone === 0 ? 0.95 : zone === 1 ? 0.85 : 0.6;
  ctx.fillStyle = ink.body;
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 0.9 * px;
  DRAW[g.kind](ctx, H, ink, r, px);
}

type Drawer = (ctx: CanvasRenderingContext2D, H: number, ink: Ink, r: Rand, px: number) => void;

/** Stroke at a fraction of the current alpha, then put it back. */
function faint(ctx: CanvasRenderingContext2D, k: number, draw: () => void) {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * k;
  draw();
  ctx.globalAlpha = a;
}

const DRAW: Record<Growth['kind'], Drawer> = {
  // Antler coral: forking three or four times, the ink laid wide and the
  // body narrower over it so each branch reads as outlined, ends round.
  branch(ctx, H, ink, r, px) {
    const segs: number[][] = [];
    const grow = (x: number, y: number, a: number, len: number, wd: number, lvl: number) => {
      const x1 = x + Math.sin(a) * len;
      const y1 = y - Math.cos(a) * len;
      const bend = range(r, -0.3, 0.3) * len;
      segs.push([x, y, (x + x1) / 2 + Math.cos(a) * bend, (y + y1) / 2 + Math.sin(a) * bend, x1, y1, wd]);
      if (lvl === 0) return;
      const k = chance(r, 0.3) ? 3 : 2;
      for (let i = 0; i < k; i++) {
        const turn = k === 2 ? (i ? 1 : -1) * range(r, 0.3, 0.55) : (i - 1) * range(r, 0.4, 0.6);
        const na = Math.max(-1.2, Math.min(1.2, a + turn + range(r, -0.1, 0.1)));
        grow(x1, y1, na, len * range(r, 0.66, 0.8), wd * 0.74, lvl - 1);
      }
    };
    grow(0, 0, range(r, -0.12, 0.12), H * 0.34, Math.max(1.8 * px, H * 0.1), H > 44 * px ? 3 : 2);
    for (const [pass, extra, color] of [[0, 1.6, ink.ink], [1, 0, ink.body]] as const) {
      ctx.strokeStyle = color;
      for (const [x, y, cx, cy, x1, y1, wd] of segs) {
        ctx.lineWidth = wd + extra * px;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
        ctx.stroke();
      }
      if (pass === 1) ctx.strokeStyle = ink.ink;
    }
  },

  // Brain coral: a low dome, its meandering grooves following the curve.
  brain(ctx, H, ink, r, px) {
    const rx = H * 0.8;
    const ry = H * 0.55;
    const dome = new Path2D();
    dome.moveTo(-rx, 0);
    dome.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
    dome.closePath();
    ctx.fill(dome);
    ctx.stroke(dome);
    ctx.save();
    ctx.clip(dome);
    ctx.beginPath();
    for (let k = 1; k <= 5; k++) {
      const rk = k / 6;
      const freq = int(r, 7, 12);
      const ph = range(r, 0, Math.PI * 2);
      for (let s = 0; s <= 40; s++) {
        const t = Math.PI + (Math.PI * s) / 40;
        const rad = rk + 0.06 * Math.sin(t * freq + ph) + 0.03 * Math.sin(t * freq * 2.3 + ph * 1.7);
        const x = Math.cos(t) * rx * rad;
        const y = Math.sin(t) * ry * rad;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.lineWidth = 0.8 * px;
    faint(ctx, 0.6, () => ctx.stroke());
    ctx.restore();
  },

  // Sea fan: a short stem opening into a flat fan of ribs, crossed into a
  // lattice, over a thin wash.
  fan(ctx, H, ink, r, px) {
    const sx = range(r, -0.04, 0.04) * H;
    const oy = -0.16 * H;
    const n = int(r, 7, 10);
    const ribs: [number, number][][] = [];
    for (let i = 0; i < n; i++) {
      const a = -0.95 + (1.9 * i) / (n - 1) + range(r, -0.06, 0.06);
      const len = H * 0.84 * (0.72 + 0.28 * Math.cos(a)) * range(r, 0.92, 1.04);
      const ph = range(r, 0, Math.PI * 2);
      const pts: [number, number][] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const wob = Math.sin(t * 5 + ph) * 0.03 * H * t;
        pts.push([sx + Math.sin(a) * len * t + Math.cos(a) * wob, oy - Math.cos(a) * len * t + Math.sin(a) * wob]);
      }
      ribs.push(pts);
    }
    const wash = new Path2D();
    wash.moveTo(sx, oy);
    for (const pts of ribs) wash.lineTo(pts[6][0], pts[6][1]);
    wash.closePath();
    faint(ctx, 0.3, () => ctx.fill(wash));
    ctx.lineWidth = 1.6 * px;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(sx, oy);
    ctx.stroke();
    ctx.lineWidth = 0.8 * px;
    ctx.beginPath();
    for (const pts of ribs) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      // A fork at the tip.
      const [ex, ey] = pts[6];
      const [px0, py0] = pts[5];
      const dx = (ex - px0) * 0.5;
      const dy = (ey - py0) * 0.5;
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + dx - dy * 0.6, ey + dy + dx * 0.6);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + dx + dy * 0.6, ey + dy - dx * 0.6);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let k = 1; k <= 5; k++) {
      ctx.moveTo(ribs[0][k][0], ribs[0][k][1]);
      for (let i = 1; i < n; i++) ctx.lineTo(ribs[i][k][0], ribs[i][k][1]);
    }
    ctx.lineWidth = 0.5 * px;
    faint(ctx, 0.5, () => ctx.stroke());
  },

  // Anemone: a short column, its disc crowned with curving tentacles, each
  // ending in a little knob.
  anemone(ctx, H, ink, r, px) {
    const cw = H * 0.3;
    const tw = H * 0.38;
    const chh = H * 0.36;
    const n = int(r, 14, 20);
    const tips: [number, number][] = [];
    const tent = new Path2D();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const bx = (u - 0.5) * tw * 0.95;
      const by = -chh;
      const a = (u - 0.5) * 2.4 + range(r, -0.15, 0.15);
      const len = H * range(r, 0.42, 0.6);
      const cx = bx + Math.sin(a) * len * 0.5;
      const cy = by - Math.cos(a) * len * 0.5;
      const a2 = a * 1.5 + range(r, -0.3, 0.3);
      const ex = cx + Math.sin(a2) * len * 0.5;
      const ey = cy - Math.cos(a2) * len * 0.5;
      tent.moveTo(bx, by);
      tent.quadraticCurveTo(cx, cy, ex, ey);
      tips.push([ex, ey]);
    }
    ctx.lineWidth = 2.8 * px;
    ctx.stroke(tent);
    ctx.lineWidth = 1.5 * px;
    ctx.strokeStyle = ink.body;
    ctx.stroke(tent);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.7 * px;
    for (const [x, y] of tips) {
      ctx.beginPath();
      ctx.arc(x, y, 1.7 * px, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const col = new Path2D();
    col.moveTo(-cw / 2, 0);
    col.quadraticCurveTo(-cw * 0.42, -chh * 0.6, -tw / 2, -chh);
    col.ellipse(0, -chh, tw / 2, H * 0.05, 0, Math.PI, 0, true);
    col.quadraticCurveTo(cw * 0.42, -chh * 0.6, cw / 2, 0);
    col.closePath();
    ctx.fill(col);
    ctx.lineWidth = 0.9 * px;
    ctx.stroke(col);
    ctx.beginPath();
    for (const f of [-0.22, 0, 0.22]) {
      ctx.moveTo(f * cw, -2 * px);
      ctx.lineTo(f * tw, -chh + 3 * px);
    }
    ctx.lineWidth = 0.6 * px;
    faint(ctx, 0.4, () => ctx.stroke());
  },

  // Tube sponges: a few upright tubes, round-lipped, dark in the mouth.
  tube(ctx, H, ink, r, px) {
    const n = int(r, 2, 4);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * H * 0.2 + range(r, -0.03, 0.03) * H;
      const tw = H * range(r, 0.16, 0.22);
      const th = H * (i === Math.floor(n / 2) ? range(r, 0.85, 1) : range(r, 0.5, 0.85));
      const ry = tw * 0.22;
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(range(r, -0.12, 0.12) + (i - (n - 1) / 2) * 0.06);
      const p = new Path2D();
      p.moveTo(-tw * 0.4, 0);
      p.quadraticCurveTo(-tw * 0.56, -th * 0.5, -tw / 2, -th);
      p.ellipse(0, -th, tw / 2, ry, 0, Math.PI, 0);
      p.quadraticCurveTo(tw * 0.56, -th * 0.5, tw * 0.4, 0);
      p.closePath();
      ctx.fill(p);
      ctx.stroke(p);
      ctx.beginPath();
      for (const f of [0.3, 0.55, 0.78]) {
        const y = -th * f;
        ctx.moveTo(-tw * 0.48, y);
        ctx.quadraticCurveTo(0, y + ry * 1.4, tw * 0.48, y);
      }
      ctx.lineWidth = 0.6 * px;
      faint(ctx, 0.35, () => ctx.stroke());
      ctx.beginPath();
      ctx.ellipse(0, -th, tw * 0.36, ry * 0.65, 0, 0, Math.PI * 2);
      ctx.fillStyle = ink.hollow;
      faint(ctx, 0.75, () => ctx.fill());
      ctx.fillStyle = ink.body;
      ctx.lineWidth = 0.9 * px;
      ctx.beginPath();
      ctx.ellipse(0, -th, tw / 2, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },

  // Urchin: a round test bristling with fine spines, none into the rock.
  urchin(ctx, H, ink, r, px) {
    const R = H * 0.2;
    const cy = -R;
    ctx.beginPath();
    const n = int(r, 26, 34);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + range(r, -0.08, 0.08);
      if (Math.sin(a) > 0.2) continue;
      const len = H * range(r, 0.3, 0.45);
      ctx.moveTo(Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8);
      ctx.lineTo(Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len));
    }
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.9 * px;
    ctx.stroke();
    ctx.fillStyle = ink.ink;
    faint(ctx, 0.5, () => {
      for (let i = 0; i < 9; i++) {
        const a = range(r, 0, Math.PI * 2);
        const d = R * range(r, 0.2, 0.7);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 0.8 * px, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.fillStyle = ink.body;
  },

  // Plate coral: shelves stacked up a short stalk, each ringed with its growth.
  plate(ctx, H, ink, r, px) {
    const n = int(r, 2, 3);
    const shelves = Array.from({ length: n }, (_, k) => {
      const rx = H * range(r, 0.45, 0.62) * (1 - 0.15 * k);
      return { x: (k % 2 ? -1 : 1) * range(r, 0.05, 0.2) * H, y: -H * (0.25 + 0.28 * k), rx, ry: rx * 0.2 };
    });
    ctx.lineWidth = 1.4 * px;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (const s of shelves) ctx.lineTo(s.x * 0.3, s.y);
    ctx.stroke();
    const under = mixHex(ink.body, ink.ink, 0.25);
    // Top shelf first, so the lower ones lie over its stalk.
    for (let k = n - 1; k >= 0; k--) {
      const s = shelves[k];
      const lip = H * 0.045;
      ctx.lineWidth = 0.9 * px;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + lip, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = under;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = ink.body;
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      for (const f of [0.35, 0.6, 0.82]) {
        ctx.moveTo(s.x * 0.3 + s.rx * f + (s.x - s.x * 0.3) * f, s.y);
        ctx.ellipse(s.x * 0.3 + (s.x - s.x * 0.3) * f, s.y, s.rx * f, s.ry * f, 0, 0, Math.PI * 2);
      }
      ctx.lineWidth = 0.6 * px;
      faint(ctx, 0.4, () => ctx.stroke());
      ctx.restore();
    }
  },

  // Black coral: a few long whips, waving gently, in fine ink.
  whip(ctx, H, ink, r, px) {
    const n = int(r, 2, 4);
    const p = new Path2D();
    for (let i = 0; i < n; i++) {
      const lean = range(r, -0.35, 0.35);
      const len = H * range(r, 0.75, 1.05);
      const amp = H * range(r, 0.03, 0.07);
      const freq = range(r, 1.5, 2.5);
      const ph = range(r, 0, Math.PI * 2);
      const bx = range(r, -0.08, 0.08) * H;
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const wave = Math.sin(t * freq * Math.PI * 2 + ph) * amp * t;
        const x = bx + Math.sin(lean) * len * t + Math.cos(lean) * wave;
        const y = -Math.cos(lean) * len * t + Math.sin(lean) * wave;
        if (k === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
    }
    ctx.strokeStyle = ink.body;
    ctx.lineWidth = 2.2 * px;
    faint(ctx, 0.6, () => ctx.stroke(p));
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.9 * px;
    ctx.stroke(p);
    ctx.beginPath();
    ctx.ellipse(0, -1 * px, H * 0.07, 2 * px, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },

  // Glass sponge: a tall pale vase of crossed lattice, barely there.
  glass(ctx, H, ink, r, px) {
    const b = H * 0.06;
    const tw = H * range(r, 0.17, 0.22);
    const lean = range(r, -0.05, 0.05) * H;
    const vase = new Path2D();
    vase.moveTo(-b, 0);
    vase.bezierCurveTo(-H * 0.2, -H * 0.35, -tw * 0.6 + lean, -H * 0.75, -tw + lean, -H);
    vase.ellipse(lean, -H, tw, tw * 0.25, 0, Math.PI, 0);
    vase.bezierCurveTo(tw * 0.6 + lean, -H * 0.75, H * 0.2, -H * 0.35, b, 0);
    vase.closePath();
    faint(ctx, 0.3, () => ctx.fill(vase));
    ctx.save();
    ctx.clip(vase);
    ctx.beginPath();
    const step = Math.max(3 * px, H * 0.07);
    for (let c = -1.3 * H; c <= 0.3 * H; c += step) {
      ctx.moveTo(c, 0);
      ctx.lineTo(c + H, -H);
    }
    for (let c = -0.3 * H; c <= 1.3 * H; c += step) {
      ctx.moveTo(c, 0);
      ctx.lineTo(c - H, -H);
    }
    ctx.lineWidth = 0.5 * px;
    faint(ctx, 0.4, () => ctx.stroke());
    ctx.restore();
    ctx.lineWidth = 0.8 * px;
    faint(ctx, 0.8, () => ctx.stroke(vase));
    ctx.beginPath();
    ctx.ellipse(lean, -H, tw * 0.85, tw * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = ink.hollow;
    faint(ctx, 0.45, () => ctx.fill());
    faint(ctx, 0.8, () => ctx.stroke());
    ctx.fillStyle = ink.body;
  },

  // Sea pen: a feather on a short stalk; in the dark a few of its polyps glow.
  seapen(ctx, H, ink, r, px) {
    const lean = range(r, -0.15, 0.15) * H;
    const sy = -0.22 * H;
    const at = (t: number): [number, number] => {
      const u = 1 - t;
      return [2 * u * t * lean * 0.2 + t * t * lean, u * u * sy + 2 * u * t * (sy - 0.4 * H) + t * t * -H];
    };
    const m = int(r, 9, 13);
    const tips: [number, number][] = [];
    const leaves = new Path2D();
    for (let i = 0; i < m; i++) {
      const t = 0.08 + (0.87 * i) / (m - 1);
      const [x, y] = at(t);
      const pl = H * 0.22 * Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * t)), 0.8);
      const wd = H * 0.035;
      for (const side of [-1, 1]) {
        const ex = x + side * pl * 0.82;
        const ey = y - pl * 0.57;
        leaves.moveTo(x, y);
        leaves.quadraticCurveTo(x + side * pl * 0.35, y - pl * 0.5 - wd, ex, ey);
        leaves.quadraticCurveTo(x + side * pl * 0.5, y - pl * 0.1 + wd, x, y + wd * 0.5);
        tips.push([ex, ey]);
      }
    }
    ctx.fill(leaves);
    ctx.lineWidth = 0.6 * px;
    ctx.stroke(leaves);
    ctx.beginPath();
    ctx.ellipse(0, sy * 0.4, H * 0.035, -sy * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, sy);
    for (let k = 1; k <= 16; k++) {
      const [x, y] = at(k / 16);
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1.2 * px;
    ctx.stroke();
    if (!ink.glow) return;
    // A soft light at a few of the polyps: small, and no brighter than the snow.
    const a = ctx.globalAlpha;
    for (let i = 0; i < tips.length; i += 3) {
      const [x, y] = tips[i];
      const rad = 4 * px;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, ink.glow);
      g.addColorStop(1, `${ink.glow}00`);
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = ink.glow;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 * px, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = ink.body;
  },
};
