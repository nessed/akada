/**
 * Three more rare things, drawn straight in like the whale and the eye: a
 * turtle that comes to look at the jelly, a siphonophore longer than the
 * page, and an oarfish hanging in the dark.
 *
 * The same contract as the rare things in `draw.ts`: device pixels, `px` on
 * every size and line that is not already a share of the page, `age` 0 to 1
 * across the event, `seed` for what differs between one sighting and the
 * next, `ambient` for the small motion, and light ink on dark water. They
 * are plates from a natural history, in pen and ink: a wash under a line,
 * the outline sometimes inked twice, never a cartoon and never a glow you
 * could read by.
 */

import { mixHex } from '../fan';
import { HUES, IRON_GALL } from './palette';
import { detailFor, hatch, inkLine, LIGHT, shadeAcross, smoothPath, stipple, washFill } from './pen';
import { mulberry32, range } from './random';

/** The light as the pen takes it: on dark water the light ink marks the light. */
const UNLIGHT: [number, number] = [-LIGHT[0], -LIGHT[1]];

const PAPER = '#FBF8EF';
const NIGHT = '#1A1815';

/** In and out softly, so nothing arrives in a flash. */
function envelope(age: number, rise: number, fall: number): number {
  return Math.max(0, Math.min(1, age / rise, (1 - age) / fall));
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function smooth(t: number): number {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
}

/** The animals' rule: every line in the one ink, iron-gall on light water and
    a warm off-white on dark; the hue is all in the washes. */
function inkOf(_hue: string, dark: boolean): string {
  return dark ? IRON_GALL.dark : IRON_GALL.light;
}

/** And the wash under the line, laid over the water's own colour. */
function washOf(hue: string, dark: boolean): string {
  return dark ? mixHex(hue, NIGHT, 0.45) : mixHex(hue, PAPER, 0.2);
}

/** A number 0 to 1 for the i-th part of an animal, so a chain of two
    hundred needs no table of them. */
function unit(seed: number, i: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ seed;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/* ---- The turtle ---- */

/** Shell olive: the sage pastel, warmed with the butter and a little clay. */
const OLIVE = mixHex(mixHex(HUES[0], HUES[6], 0.45), HUES[5], 0.18);
/** Its skin, greyer than the shell. */
const SKIN = mixHex(HUES[0], HUES[8], 0.45);
/** The plastron, paler and yellower. */
const BELLY = mixHex(HUES[6], HUES[0], 0.3);

interface TurtleInk {
  ink: string;
  shell: string;
  skin: string;
  belly: string;
}

function turtleInk(dark: boolean): TurtleInk {
  return { ink: inkOf(OLIVE, dark), shell: washOf(OLIVE, dark), skin: washOf(SKIN, dark), belly: washOf(BELLY, dark) };
}

const TURTLE_LIGHT = turtleInk(false);
const TURTLE_DARK = turtleInk(true);

interface Pose {
  x: number;
  y: number;
  /** Which way it faces, 1 the way it came in, -1 turned round, 0 edge-on mid-turn. */
  face: number;
}

const poseA: Pose = { x: 0, y: 0, face: 1 };
const poseB: Pose = { x: 0, y: 0, face: 1 };

/** The turtle's visit, in three parts: it comes in and slows to a stop short
    of the jelly, holds there looking, then goes off down and away. */
const ARRIVED = 0.36;
const LEAVES = 0.62;

function turtlePose(out: Pose, age: number, w: number, h: number, L: number, seed: number, jelly: { x: number; y: number }) {
  const dir = seed & 1 ? 1 : -1;
  const same = ((seed >>> 3) & 1) === 1;
  const jitter = ((seed >>> 8) % 100) / 100 - 0.5;
  const fromX = dir > 0 ? -L * 1.3 : w + L * 1.3;
  const fromY = jelly.y + jitter * 0.12 * h - 0.03 * h;
  // Close enough to size it up, never so close it is over the bell.
  const gap = Math.max(0.2 * w, L * 1.15);
  const sx = jelly.x - dir * gap;
  const sy = jelly.y + jitter * 0.06 * h;
  if (age < ARRIVED) {
    // Easing out to a stop: it was already swimming when it came on.
    const k = age / ARRIVED;
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    out.x = fromX + (sx - fromX) * e;
    out.y = fromY + (sy - fromY) * smooth(k);
    out.face = 1;
  } else if (age < LEAVES) {
    out.x = sx;
    out.y = sy;
    out.face = 1;
  } else {
    // Off from rest, picking up speed.
    const k = (age - LEAVES) / (1 - LEAVES);
    const m = k * k;
    if (same) {
      // Back the way it came, turning round first.
      out.face = Math.cos(Math.PI * smooth(k / 0.32));
      const ex = fromX;
      const ey = sy + 0.32 * h;
      out.x = sx + (ex - sx) * m;
      out.y = sy + (ey - sy) * m;
    } else {
      // On past it, but well underneath, under the tentacles.
      out.face = 1;
      const ex = dir > 0 ? w + L * 1.3 : -L * 1.3;
      const ey = sy + 0.45 * h;
      const qx = jelly.x;
      const qy = jelly.y + 0.55 * h;
      const a = (1 - m) * (1 - m);
      const b = 2 * (1 - m) * m;
      const c = m * m;
      out.x = a * sx + b * qx + c * ex;
      out.y = a * sy + b * qy + c * ey;
    }
  }
}

/** Points along a cubic, appended to `out` (the start is not). */
function bez(out: number[], x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, n: number) {
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const s = 1 - t;
    out.push(s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3, s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3);
  }
}

/** Flat points as a closed path. */
function polyPath(pts: number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}

/** A flipper along +x from its root: a long leaf, fuller on the leading (−y) edge. */
function flipperPts(len: number, wd: number): number[] {
  const pts = [0, -wd * 0.45];
  bez(pts, 0, -wd * 0.45, len * 0.35, -wd * 1.05, len * 0.8, -wd * 0.45, len, 0, 14);
  bez(pts, len, 0, len * 0.75, wd * 0.35, len * 0.35, wd * 0.75, 0, wd * 0.45, 12);
  return pts;
}

/** A still part of the turtle, painted once in its own frame and placed. */
interface TurtlePart {
  canvas: HTMLCanvasElement | null;
  x: number;
  y: number;
  w: number;
  h: number;
  paint: (g: CanvasRenderingContext2D) => void;
}

interface TurtleParts {
  key: string;
  shell: TurtlePart;
  head: TurtlePart;
  front: TurtlePart;
  rear: TurtlePart;
}

let turtleParts: TurtleParts[] = [];

function turtlePart(x: number, y: number, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): TurtlePart {
  let canvas: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    const g = canvas.getContext('2d');
    if (g) {
      g.translate(-x, -y);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      paint(g);
    } else canvas = null;
  }
  return { canvas, x, y, w: canvas ? canvas.width : w, h: canvas ? canvas.height : h, paint };
}

function placePart(ctx: CanvasRenderingContext2D, p: TurtlePart) {
  if (p.canvas) ctx.drawImage(p.canvas, p.x, p.y, p.w, p.h);
  else {
    ctx.save();
    p.paint(ctx);
    ctx.restore();
  }
}

/** Where the flippers sit at rest, for the light their pen lines take. */
const FRONT_REST = 2.85;
const REAR_REST = Math.PI - 0.25;
const FRONT = { len: 0.42, wd: 0.075 };
const REAR = { len: 0.14, wd: 0.05 };

/** The light as it falls on a part drawn turned by `a`. */
function turned(light: [number, number], a: number): [number, number] {
  const c = Math.cos(-a);
  const s = Math.sin(-a);
  return [light[0] * c - light[1] * s, light[0] * s + light[1] * c];
}

/** A flipper: a wash of the skin, a pen line round it, and two or three strokes down its length. */
function paintFlipper(g: CanvasRenderingContext2D, u: number, f: { len: number; wd: number }, strokes: number, c: TurtleInk, px: number, pw: number, light: [number, number], seed: number) {
  const len = f.len * u;
  const wd = f.wd * u;
  const pts = flipperPts(len, wd);
  const path = polyPath(pts);
  const box = { x: 0, y: -wd * 1.05, w: len, h: wd * 1.8 };
  washFill(g, path, box, { color: c.skin, edge: 0.35, paper: null, granulate: 0.25, light, px });
  // The strokes: down the flipper toward its trailing edge, where it turns
  // from the light, each a little shorter than the last.
  for (let k = 0; k < strokes; k++) {
    const v = wd * (0.1 + 0.2 * k);
    const end = len * (0.82 - 0.14 * k);
    const line: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = len * 0.1 + (end - len * 0.1) * t;
      line.push(x, v * (1 - t * 0.6) - wd * 0.25 * Math.sin(Math.PI * t) * (1 - k * 0.3));
    }
    inkLine(g, line, false, { width: 0.75 * pw, color: c.ink, alpha: 0.55, taper: [0.2, 0.5], seed: seed ^ (0xf1 + k), light, raw: true, plate: true, min: 0.25 * px });
  }
  inkLine(g, pts, true, { width: 1.15 * pw, color: c.ink, alpha: 1, seed: seed ^ 0xf1f, light, raw: true, plate: true, min: 0.3 * px });
}

/** The shell's line along the top, its rim, and a point at a share `f` down between them. */
function shellFrame(u: number) {
  const rim = (t: number) => 0.03 * u - 0.012 * u * t + 0.012 * u * Math.sin(Math.PI * t);
  const top = (t: number) => rim(t) - 0.19 * u * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.75);
  const sxAt = (t: number) => -0.34 * u + 0.6 * u * t;
  const yAt = (t: number, f: number) => top(t) + (rim(t) - top(t)) * f;
  return { rim, top, sxAt, yAt };
}

/**
 * The shell, plastron and tail: a wash of olive under the pen, each scute a
 * little darker or lighter than the next and streaked out from the corner
 * it grew from, the dome engraved where it turns from the light, and the
 * seams between the plates inked.
 */
function paintShell(g: CanvasRenderingContext2D, u: number, c: TurtleInk, px: number, pw: number, light: [number, number], dark: boolean, seed: number) {
  const { rim, top, sxAt, yAt } = shellFrame(u);
  const r = mulberry32(seed ^ 0x5c07e);
  // The tail, short and thick, tucked under the back of the shell.
  const tail = polyPath([-0.33 * u, 0.03 * u, -0.4 * u, 0.045 * u, -0.33 * u, 0.058 * u]);
  g.fillStyle = c.skin;
  g.fill(tail);
  g.strokeStyle = c.ink;
  g.lineWidth = 0.9 * pw;
  g.stroke(tail);

  // The plastron under it, paler, with its own seams.
  const bellyPts: number[] = [sxAt(0.04), rim(0.04)];
  for (let i = 1; i <= 16; i++) {
    const t = 0.04 + (i / 16) * 0.92;
    bellyPts.push(sxAt(t), rim(t) + 0.06 * u * Math.pow(Math.sin(Math.PI * t), 1.2));
  }
  const belly = polyPath(bellyPts);
  const bellyBox = { x: sxAt(0.04), y: rim(0.5) - 0.01 * u, w: 0.56 * u, h: 0.09 * u };
  washFill(g, belly, bellyBox, { color: c.belly, edge: 0.3, paper: null, granulate: 0.2, light, px });
  const bseams = new Path2D();
  for (const t of [0.3, 0.52, 0.74]) {
    bseams.moveTo(sxAt(t), rim(t) + 0.004 * u);
    bseams.lineTo(sxAt(t) - 0.01 * u, rim(t) + 0.05 * u * Math.pow(Math.sin(Math.PI * t), 1.2));
  }
  g.globalAlpha = 0.45;
  g.strokeStyle = c.ink;
  g.lineWidth = 0.6 * pw;
  g.stroke(bseams);
  g.globalAlpha = 1;
  inkLine(g, bellyPts, true, { width: 0.9 * pw, color: c.ink, alpha: 0.8, seed: seed ^ 0xbe11, light, raw: true, plate: true, min: 0.25 * px });

  // The carapace.
  const shellPts: number[] = [sxAt(0), rim(0)];
  for (let i = 1; i <= 32; i++) shellPts.push(sxAt(i / 32), top(i / 32));
  for (let i = 31; i >= 0; i--) shellPts.push(sxAt(i / 32), rim(i / 32) + 0.01 * u);
  const shell = polyPath(shellPts);
  const shellBox = { x: sxAt(0), y: top(0.5), w: 0.6 * u, h: rim(0.5) - top(0.5) + 0.02 * u };
  washFill(g, shell, shellBox, { color: c.shell, edge: 0.4, paper: null, granulate: 0.3, light, px });

  // The scutes: vertebrals along the ridge, costals down the flank,
  // marginals round the rim. Each seam leans a little, so the plates come
  // out as polygons.
  type Scute = { t0: [number, number]; t1: [number, number]; f0: number; f1: number };
  const scutes: Scute[] = [];
  const vert = [0.06, 0.2, 0.38, 0.56, 0.74, 0.94];
  const cost = [0.06, 0.29, 0.47, 0.65, 0.94];
  const lean = (t: number, edge: boolean, by: number): [number, number] => [t, edge ? t : t + by];
  for (let k = 0; k < vert.length - 1; k++) scutes.push({ t0: lean(vert[k], k === 0, 0.025), t1: lean(vert[k + 1], k + 1 === vert.length - 1, 0.025), f0: 0.03, f1: 0.3 });
  for (let k = 0; k < cost.length - 1; k++) scutes.push({ t0: lean(cost[k], k === 0, -0.035), t1: lean(cost[k + 1], k + 1 === cost.length - 1, -0.035), f0: 0.3, f1: 0.82 });
  // A point in a scute: `a` across it front to back, `b` down it.
  const inScute = (s: Scute, a: number, b: number): [number, number] => {
    const t0 = s.t0[0] + (s.t0[1] - s.t0[0]) * b;
    const t1 = s.t1[0] + (s.t1[1] - s.t1[0]) * b;
    const t = t0 + (t1 - t0) * a;
    const f = s.f0 + (s.f1 - s.f0) * b;
    return [sxAt(t), yAt(t, f)];
  };
  const pigment = dark ? mixHex(c.shell, '#0E0B08', 0.5) : mixHex(OLIVE, '#3B2A1A', 0.55);
  g.save();
  g.clip(shell);
  for (let k = 0; k < scutes.length; k++) {
    const s = scutes[k];
    const outline: number[] = [];
    for (let i = 0; i <= 6; i++) outline.push(...inScute(s, i / 6, 0));
    for (let i = 1; i <= 4; i++) outline.push(...inScute(s, 1, i / 4));
    for (let i = 5; i >= 0; i--) outline.push(...inScute(s, i / 6, 1));
    for (let i = 3; i >= 1; i--) outline.push(...inScute(s, 0, i / 4));
    // Tortoiseshell: each plate its own depth of the brown.
    g.globalAlpha = 0.15 + 0.25 * r();
    g.fillStyle = pigment;
    g.fill(polyPath(outline));
    // Streaks fanning out from the plate's first corner, back and up: the
    // green turtle's sunburst, laid in the brush as tapering strokes of
    // the brown, a few of them picked out in the pen.
    g.globalAlpha = 1;
    const [ax, ay] = inScute(s, 0.78, 0.18);
    const n = 8 + Math.floor(r() * 4);
    const wedges = new Path2D();
    for (let i = 0; i < n; i++) {
      const q = (i + 0.6 * r()) / n;
      // Round the far edges: down the front, along the bottom, up the back.
      let ex: number;
      let ey: number;
      if (q < 0.4) [ex, ey] = inScute(s, 0.02, 0.08 + (q / 0.4) * 0.88);
      else if (q < 0.8) [ex, ey] = inScute(s, ((q - 0.4) / 0.4) * 0.95, 0.97);
      else [ex, ey] = inScute(s, 0.98, 0.97 - ((q - 0.8) / 0.2) * 0.6);
      const reach = 0.5 + 0.48 * r();
      const tx = ax + (ex - ax) * reach;
      const ty = ay + (ey - ay) * reach;
      const len = Math.hypot(tx - ax, ty - ay) || 1;
      const nx = -(ty - ay) / len;
      const ny = (tx - ax) / len;
      const wd = (0.012 + 0.02 * r()) * u;
      const bend = (r() - 0.5) * 0.25 * len;
      const mx = (ax + tx) / 2 + nx * bend;
      const my = (ay + ty) / 2 + ny * bend;
      wedges.moveTo(ax, ay);
      wedges.quadraticCurveTo(mx + nx * wd, my + ny * wd, tx, ty);
      wedges.quadraticCurveTo(mx - nx * wd * 0.6, my - ny * wd * 0.6, ax, ay);
      if (i % 3 === 0) {
        const line: number[] = [];
        for (let j = 0; j <= 8; j++) {
          const t = (j / 8) * 0.9;
          const w0 = (1 - t) * (1 - t);
          const w1 = 2 * (1 - t) * t;
          const w2 = t * t;
          line.push(w0 * ax + w1 * mx + w2 * tx, w0 * ay + w1 * my + w2 * ty);
        }
        inkLine(g, line, false, { width: 0.6 * pw, color: c.ink, alpha: 0.35, taper: [0.3, 0.6], seed: seed ^ (k * 97 + i), light, raw: true, plate: true, min: 0.25 * px });
      }
    }
    g.globalAlpha = dark ? 0.5 : 0.42;
    g.fillStyle = pigment;
    g.fill(wedges);
  }
  // The marginals, every other one a shade darker.
  for (let i = 0; i < 11; i++) {
    const t0 = 0.07 + i * 0.087 - 0.087;
    const t1 = t0 + 0.087;
    if (i % 2 === 0 || t0 < 0) continue;
    const m: number[] = [sxAt(t0 - 0.006), yAt(t0 - 0.006, 1) + 0.01 * u, sxAt(t0), yAt(t0, 0.82), sxAt(t1), yAt(t1, 0.82), sxAt(t1 - 0.006), yAt(t1 - 0.006, 1) + 0.01 * u];
    g.globalAlpha = 0.18;
    g.fillStyle = pigment;
    g.fill(polyPath(m));
  }
  g.restore();
  g.globalAlpha = 1;

  // Engraved: the dome's turn from the light in contour lines, sagging with
  // it, crossed where it turns furthest.
  const across = shadeAcross(shellBox, light);
  hatch(g, shell, shellBox, {
    spacing: Math.max(1.6 * px, u * 0.0075),
    angle: 0.18,
    bow: 1.4,
    shade: (x, y) => across(x, y) * 0.75 + 0.35 * Math.max(0, (y - top(Math.max(0, Math.min(1, (x - sxAt(0)) / (0.6 * u))))) / (0.2 * u)),
    from: dark ? 0.58 : 0.44,
    cross: dark ? undefined : 0.78,
    color: c.ink,
    width: Math.max(0.4 * px, u * 0.0018),
    alpha: 0.55,
    seed: seed ^ 0x5e11,
  });

  // The seams.
  const plates = new Path2D();
  for (const band of [0.3, 0.82]) {
    plates.moveTo(sxAt(0.06), yAt(0.06, band));
    for (let i = 1; i <= 16; i++) {
      const t = 0.06 + (i / 16) * 0.88;
      plates.lineTo(sxAt(t), yAt(t, band));
    }
  }
  for (const t of vert.slice(1, -1)) {
    plates.moveTo(sxAt(t), yAt(t, 0.03));
    plates.lineTo(sxAt(t + 0.025), yAt(t + 0.025, 0.3));
  }
  for (const t of cost.slice(1, -1)) {
    plates.moveTo(sxAt(t), yAt(t, 0.3));
    plates.lineTo(sxAt(t - 0.035), yAt(t - 0.035, 0.82));
  }
  for (let i = 0; i < 11; i++) {
    const t = 0.07 + i * 0.087;
    plates.moveTo(sxAt(t), yAt(t, 0.82));
    plates.lineTo(sxAt(t - 0.006), yAt(t - 0.006, 1) + 0.01 * u);
  }
  g.globalAlpha = 0.85;
  g.strokeStyle = c.ink;
  g.lineWidth = 0.9 * pw;
  g.stroke(plates);
  g.globalAlpha = 1;
  inkLine(g, shellPts, true, { width: 1.3 * pw, color: c.ink, alpha: 1, seed, light, raw: true, plate: true, min: 0.3 * px });
}

/**
 * The head and neck: a blunt head of plates, a beak whose edge runs
 * straight back from the tip, and a round dark eye with nothing over it.
 */
function paintHead(g: CanvasRenderingContext2D, u: number, c: TurtleInk, px: number, pw: number, light: [number, number], dark: boolean, seed: number) {
  const pts: number[] = [0.2 * u, -0.05 * u, 0.3 * u, -0.052 * u];
  bez(pts, 0.3 * u, -0.052 * u, 0.33 * u, -0.088 * u, 0.44 * u, -0.09 * u, 0.48 * u, -0.035 * u, 12);
  bez(pts, 0.48 * u, -0.035 * u, 0.496 * u, -0.014 * u, 0.5 * u, 0.0, 0.49 * u, 0.012 * u, 5);
  bez(pts, 0.49 * u, 0.012 * u, 0.46 * u, 0.045 * u, 0.37 * u, 0.058 * u, 0.32 * u, 0.048 * u, 10);
  pts.push(0.2 * u, 0.068 * u);
  const head = polyPath(pts);
  const box = { x: 0.2 * u, y: -0.09 * u, w: 0.3 * u, h: 0.16 * u };
  washFill(g, head, box, { color: c.skin, edge: 0.35, paper: null, granulate: 0.25, light, px });
  // Engraved under the jaw and down the throat, where it turns from the light.
  hatch(g, head, box, {
    spacing: Math.max(1.6 * px, u * 0.0075),
    angle: 0.12,
    bow: 0.5,
    shade: (x, y) => Math.max(0, Math.min(1, (y + 0.005 * u) / (0.06 * u))),
    from: dark ? 0.55 : 0.4,
    color: c.ink,
    width: Math.max(0.4 * px, u * 0.0018),
    alpha: 0.5,
    seed: seed ^ 0x4ead,
  });
  // The plates of the head: the big frontal, the pair before it, the
  // scale behind the eye and the row under it.
  const m = new Path2D();
  const P = (x: number, y: number) => [x * u, y * u] as const;
  m.moveTo(...P(0.355, -0.081));
  m.lineTo(...P(0.375, -0.058));
  m.lineTo(...P(0.418, -0.056));
  m.lineTo(...P(0.432, -0.084));
  m.moveTo(...P(0.418, -0.056));
  m.lineTo(...P(0.462, -0.05));
  m.moveTo(...P(0.375, -0.058));
  m.lineTo(...P(0.366, -0.03));
  m.lineTo(...P(0.392, -0.012));
  m.lineTo(...P(0.392, 0.014));
  m.moveTo(...P(0.392, -0.012));
  m.lineTo(...P(0.418, -0.014));
  m.lineTo(...P(0.452, -0.012));
  m.moveTo(...P(0.33, -0.06));
  m.lineTo(...P(0.345, -0.02));
  m.lineTo(...P(0.366, -0.03));
  g.save();
  g.clip(head);
  // Drawn small, the plates are only scribble round the eye: left out.
  g.globalAlpha = detailFor(u * 0.8) > 0.3 ? 0.6 : 0;
  g.strokeStyle = c.ink;
  g.lineWidth = 0.7 * pw;
  g.stroke(m);
  // The neck's folds.
  const folds = new Path2D();
  for (const [x, k] of [[0.255, 1], [0.285, 0.8]] as const) {
    folds.moveTo(x * u, -0.044 * u * k);
    folds.quadraticCurveTo((x + 0.012) * u, 0, x * u, 0.05 * u * k);
  }
  g.globalAlpha = 0.45;
  g.lineWidth = 0.6 * pw;
  g.stroke(folds);
  g.restore();
  // The beak's edge: straight back from the tip to the corner of the jaw.
  const beak = [0.492 * u, 0.008 * u, 0.462 * u, 0.0095 * u, 0.428 * u, 0.011 * u];
  inkLine(g, beak, false, { width: 0.9 * pw, color: c.ink, alpha: 0.9, taper: [0.1, 0.4], seed: seed ^ 0xbea, light, raw: true, plate: true, min: 0.3 * px });
  inkLine(g, pts, true, { width: 1.2 * pw, color: c.ink, alpha: 1, seed: seed ^ 0x4e, light, raw: true, plate: true, min: 0.3 * px });
  // The eye: round and dark, a ring of skin round it, a point of light.
  const ex = 0.437 * u;
  const ey = -0.031 * u;
  g.fillStyle = dark ? '#2E2721' : '#3A2F25';
  g.beginPath();
  g.arc(ex, ey, 0.0165 * u, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = dark ? '#6A563F' : '#5C4630';
  g.beginPath();
  g.arc(ex, ey, 0.0125 * u, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#120F0C';
  g.beginPath();
  g.arc(ex + 0.001 * u, ey, 0.0075 * u, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = PAPER;
  g.globalAlpha = 0.85;
  g.beginPath();
  g.arc(ex - 0.004 * u, ey - 0.0045 * u, Math.max(0.6 * px, 0.003 * u), 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}

/**
 * A green turtle comes to look at the jelly. Turtles eat jellyfish, and this
 * one is sizing yours up: it swims in at about the jelly's height, slows to
 * a stop a little way off, holds there with its head turned toward the bell
 * for a few seconds, and then thinks better of it and goes off down and
 * away, turning edge-on as it comes round rather than flipping.
 *
 * Drawn as a plate: the shell a wash of olive with each scute streaked from
 * the corner it grew from and the dome engraved, the skin a wash under a
 * pen line, two or three strokes down each flipper. Every part is still in
 * its own frame, so each is painted once for a size and only placed, turned
 * and beaten, each frame.
 */
export function drawTurtle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  age: number,
  seed: number,
  px: number,
  ambient: number,
  dark: boolean,
  jelly: { x: number; y: number },
) {
  const env = envelope(age, 0.1, 0.1);
  if (env <= 0) return;
  const L = Math.min(w, h) * 0.16;
  const dir = seed & 1 ? 1 : -1;
  turtlePose(poseA, age, w, h, L, seed, jelly);
  turtlePose(poseB, Math.min(1, age + 0.003), w, h, L, seed, jelly);
  const vx = poseB.x - poseA.x;
  const vy = poseB.y - poseA.y;
  // How hard it is swimming, 0 at rest: it pitches with its path only while
  // it is moving, so it settles level when it stops.
  const effort = Math.min(1, Math.hypot(vx, vy) / 0.003 / (0.8 * w));
  const pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(vy, Math.abs(vx) + 1e-6) * effort));
  // While it holds, the head turns toward the jelly and back.
  const hk = (age - ARRIVED) / (LEAVES - ARRIVED);
  const look = smooth(hk / 0.25) * (1 - smooth((hk - 0.75) / 0.25));
  const toward = Math.max(-0.5, Math.min(0.5, Math.atan2(jelly.y - poseA.y, Math.abs(jelly.x - poseA.x) + 1)));
  const headTilt = toward * look;
  const bob = Math.sin(ambient * 0.6 + (seed % 7)) * L * 0.02;
  const f = poseA.face;
  const face = Math.sign(f || 1) * Math.max(0.12, Math.abs(f));
  const c = dark ? TURTLE_DARK : TURTLE_LIGHT;
  // The animal is drawn in units of `u`, tail to beak a little under one.
  const u = L * 1.12;
  const d = detailFor(u * 0.8);
  const light = dark ? UNLIGHT : LIGHT;
  // The pen's weight: drawn big, the lines stay fine, as an engraver's do.
  const pw = px * (1 - 0.4 * d);

  const key = `${seed}|${Math.round(u * 4)}|${px}|${dark ? 1 : 0}`;
  let parts = turtleParts.find((p) => p.key === key);
  if (!parts) {
    const pad = 3 * px;
    const fr = FRONT.len * u;
    const fw = FRONT.wd * u;
    const rr = REAR.len * u;
    const rw = REAR.wd * u;
    parts = {
      key,
      shell: turtlePart(-0.42 * u - pad, -0.19 * u - pad, 0.7 * u + 2 * pad, 0.29 * u + 2 * pad, (g) => paintShell(g, u, c, px, pw, light, dark, seed)),
      head: turtlePart(0.19 * u - pad, -0.1 * u - pad, 0.32 * u + 2 * pad, 0.18 * u + 2 * pad, (g) => paintHead(g, u, c, px, pw, light, dark, seed)),
      front: turtlePart(-pad, -fw * 1.1 - pad, fr + 2 * pad, fw * 1.9 + 2 * pad, (g) => paintFlipper(g, u, FRONT, 3, c, px, pw, turned(light, FRONT_REST), seed)),
      rear: turtlePart(-pad, -rw * 1.1 - pad, rr + 2 * pad, rw * 1.9 + 2 * pad, (g) => paintFlipper(g, u, REAR, 2, c, px, pw, turned(light, REAR_REST), seed ^ 0x2ea)),
    };
    turtleParts = [parts, ...turtleParts].slice(0, 2);
  }
  const P = parts;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(poseA.x, poseA.y + bob);
  // Pitched first and mirrored after, so mid-turn it narrows rather than shears.
  ctx.rotate((pitch + headTilt * 0.3) * Math.sign(dir * face));
  ctx.scale(dir * face, 1);
  const alpha = env * 0.95;
  const base = ctx.globalAlpha;

  // Front flippers beat together, slow and deep while it swims, a gentle
  // scull while it hangs there.
  const amp = 0.15 + 0.45 * effort;
  const beat = Math.sin(ambient * 1.15 + (seed % 11));
  const front = FRONT_REST + beat * amp;
  const frontFar = FRONT_REST + Math.sin(ambient * 1.15 + (seed % 11) - 0.35) * amp;
  const rear = REAR_REST + Math.sin(ambient * 0.8) * 0.12;
  const limb = (p: TurtlePart, x: number, y: number, a: number, sx: number, sy: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(sx, sy);
    placePart(ctx, p);
    ctx.restore();
  };

  // The far side first, fainter, behind the shell.
  ctx.globalAlpha = base * alpha * 0.6;
  limb(P.front, 0.12 * u, 0.02 * u, frontFar, 0.38 / FRONT.len, 0.07 / FRONT.wd);
  limb(P.rear, -0.27 * u, 0.03 * u, rear - 0.15, 0.12 / REAR.len, 0.045 / REAR.wd);

  // Neck and head, before the shell, so the shell's lip sits over the neck.
  ctx.globalAlpha = base * alpha;
  ctx.save();
  ctx.translate(0.22 * u, 0);
  ctx.rotate(headTilt * 0.7);
  ctx.translate(-0.22 * u, 0);
  placePart(ctx, P.head);
  ctx.restore();

  // The shell over the neck, then the near side over it: a rear flipper and the long front one.
  placePart(ctx, P.shell);
  limb(P.rear, -0.3 * u, 0.05 * u, rear, 1, 1);
  limb(P.front, 0.16 * u, 0.05 * u, front, 1, 1);
  ctx.restore();
}

/** A soft point of glow in a colour, made once and placed at any size. */
const glowDots = new Map<string, HTMLCanvasElement | null>();

function glowDot(color: string): HTMLCanvasElement | null {
  if (glowDots.has(color)) return glowDots.get(color) ?? null;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, color);
      grad.addColorStop(0.3, `${color}66`);
      grad.addColorStop(1, `${color}00`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
    } else c = null;
  }
  glowDots.set(color, c);
  return c;
}

/* ---- The siphonophore ---- */

/** The pale pastels a colony can be: rose, lavender, peach, sky, mint. */
const SIPHON_HUES = [HUES[1], HUES[2], HUES[3], HUES[4], HUES[7]];

/** How a still colony lies: its tilt, and where its head is, in its region. */
interface SiphonStill {
  /** Radians below level from the head to the tail's end, 15 to 40 degrees. */
  tilt: number;
  /** +1 when the head points along +x, −1 along −x. */
  inward: number;
  hx: number;
  hy: number;
  /** How far along x it runs from the head to the end of its tail. */
  span: number;
  drop: number;
}

/** How far below the head a still colony's stem is, `x` along from it. */
function stillDrop(st: { tilt: number; span: number }, x: number): number {
  const k = Math.tan(st.tilt);
  return x * 0.5 * k + ((0.5 * k) / st.span) * x * x;
}

/** The share of a still colony's run a page shows, its head end: the picture's region has the page's edge about there. */
const STILL_SHOWN = 0.82;

/**
 * A tilt of 15 to 40 degrees: what the caller asked when that is in range,
 * otherwise the seed's; then eased toward 15 as far as it must be for the
 * part a page shows, bells and tentacles and all, to fit the region's
 * height, and set in the middle of it.
 */
function stillOf(w: number, h: number, seed: number, lie: number): SiphonStill {
  const asked = Math.abs(lie);
  let tilt = asked >= 0.26 && asked <= 0.7 ? asked : 0.26 + 0.44 * unit(seed, 0x711);
  const inward = lie > 0 ? -1 : 1;
  const span = 0.5 * w;
  const m = Math.min(w, h);
  const above = m * 0.016 * 2.5 + 0.025 * span;
  const below = m * 0.17 + 0.025 * span;
  const tall = (t: number) => above + stillDrop({ tilt: t, span }, span * STILL_SHOWN) + below;
  while (tilt > 0.26 && tall(tilt) > h * 0.96) tilt = Math.max(0.26, tilt - 0.02);
  const hy = (h - tall(tilt)) / 2 + above;
  return { tilt, inward, hx: lie > 0 ? 0.04 * w : 0.96 * w, hy, span, drop: span * Math.tan(tilt) };
}

/**
 * Where a still colony (one given `lie`) reaches in its region, `w` by `h`,
 * as far as `edge` (the region's x where the page ends; by default 0.82 of
 * the way along the stem, about where the picture's layout puts it): the
 * head 0.04 of the width
 * in from the end `lie` points it to (the region's left end when `lie` is
 * above 0, its right end below), the stem running half the region's width
 * out from there and falling at the tilt, the bells round the head and the
 * tentacles hanging under it all. The tilt is `|lie|` when that is between
 * 0.26 and 0.7 radians (15 to 40 degrees), otherwise the seed's own in
 * that range.
 */
export function siphonophoreReach(w: number, h: number, seed: number, lie: number, edge = lie > 0 ? 0.04 * w + 0.5 * w * STILL_SHOWN : 0.96 * w - 0.5 * w * STILL_SHOWN): { x0: number; x1: number; y0: number; y1: number; tilt: number } {
  const st = stillOf(w, h, seed, lie);
  const m = Math.min(w, h);
  const bellR = m * 0.016;
  const run = Math.max(0, Math.min(st.span, Math.abs(edge - st.hx)));
  const x0 = st.inward > 0 ? st.hx - run : st.hx - bellR * 2;
  const x1 = st.inward > 0 ? st.hx + bellR * 2 : st.hx + run;
  const wob = 0.025 * st.span;
  return { x0, x1, y0: st.hy - bellR * 2.5 - wob, y1: st.hy + stillDrop(st, run) + wob + m * 0.17, tilt: st.tilt };
}

/**
 * A giant siphonophore: not one animal but a colony of them strung on a
 * stem. At its head a float the size of a seed and a cluster of six to ten
 * swimming bells, clear and overlapping, pulsing one after another; behind
 * them the stem, thinning as it goes, and strung along it at uneven
 * intervals the groups that feed it, each a pair of clear bracts, a
 * feeding polyp and a tentacle hanging from it with its side branches,
 * beaded with stinging cells. It never lies level: on a screen it lies
 * corner to corner, sagging, longer than the page, and drifts across over
 * the minute and a half, swimming forward a little as it goes; in a still
 * (`lie` given) it hangs down from its head at 15 to 40 degrees and its
 * tail runs off the region. On dark water it glows, faintly, in a wave
 * that travels down it.
 */
export function drawSiphonophore(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  age: number,
  seed: number,
  px: number,
  ambient: number,
  dark: boolean,
  /** A still, lying on the page's right (above 0) or left (below 0); see `siphonophoreReach`. */
  lie?: number,
) {
  const env = envelope(age, 0.12, 0.12);
  if (env <= 0) return;
  const r = mulberry32(seed);
  const diag = Math.hypot(w, h);
  const m = Math.min(w, h);
  // Corner to corner, more or less, down either diagonal, front at either end.
  const rolled = Math.atan2(h, w) * range(r, 0.6, 1.1) * (r() < 0.5 ? 1 : -1);
  const ahead = r() < 0.5 ? 1 : -1;
  const across = r() < 0.5 ? 1 : -1;
  const a1 = 0.07 * diag;
  const a2 = 0.022 * diag;
  const k1 = (Math.PI * 2) / (1.3 * diag);
  const k2 = (Math.PI * 2) / (0.45 * diag);
  const p1 = range(r, 0, Math.PI * 2);
  const p2 = range(r, 0, Math.PI * 2);
  const hue = SIPHON_HUES[Math.floor(r() * SIPHON_HUES.length)];
  const margin = 0.1 * m;
  const onPage = (x: number, y: number) => x > -margin && x < w + margin && y > -margin && y < h + margin;

  // The stem as points from the head back, however it lies.
  const stem: number[] = [];
  if (lie == null) {
    const tx = Math.cos(rolled) * ahead;
    const ty = Math.sin(rolled) * ahead;
    const nx = -ty;
    const ny = tx;
    // Drifting across the page, and swimming forward along itself a little.
    const off = (age - 0.5) * 0.5 * diag * across;
    const glide = (age - 0.5) * 0.08 * diag;
    const cx = w / 2 + nx * off + tx * glide;
    const cy = h / 2 + ny * off + ty * glide;
    // The head just inside a corner of the page, the tail far off past the
    // other; the stem sagging between, as a long thing in water does.
    const front = 0.44 * diag;
    const back = -0.66 * diag;
    const sag = 0.06 * diag;
    for (let i = 0; i <= 200; i++) {
      const s = front - ((front - back) * i) / 200;
      const bend = a1 * Math.sin(k1 * s + p1 + ambient * 0.05) + a2 * Math.sin(k2 * s + p2 - ambient * 0.12);
      const droop = sag * Math.max(0, 1 - Math.pow(s / (0.55 * diag), 2));
      stem.push(cx + tx * s + nx * bend, cy + ty * s + ny * bend + droop);
    }
  } else {
    const st = stillOf(w, h, seed, lie);
    // Shallower at the head and steeper down the tail: hanging from where
    // it swims, never a line ruled across.
    const wob = 0.025 * st.span;
    for (let i = 0; i <= 160; i++) {
      const x = (st.span * i) / 160;
      const y = st.hy + stillDrop(st, x) + wob * Math.sin((x / st.span) * Math.PI * 2.2 + p2 + ambient * 0.1) * (x / st.span);
      stem.push(st.hx - st.inward * x, y);
    }
  }
  const n = stem.length / 2;
  const lens: number[] = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + Math.hypot(stem[i * 2] - stem[i * 2 - 2], stem[i * 2 + 1] - stem[i * 2 - 1]));
  const total = lens[n - 1];
  // A point on the stem `l` back from the head, and the way to the head there.
  let X = 0;
  let Y = 0;
  let ANG = 0;
  let seg = 1;
  const at = (l: number) => {
    const q = Math.max(0, Math.min(total, l));
    if (q < lens[seg - 1]) seg = 1;
    while (seg < n - 1 && lens[seg] < q) seg++;
    const k = (q - lens[seg - 1]) / Math.max(1e-6, lens[seg] - lens[seg - 1]);
    const ax = stem[seg * 2 - 2];
    const ay = stem[seg * 2 - 1];
    const bx = stem[seg * 2];
    const by = stem[seg * 2 + 1];
    X = ax + (bx - ax) * k;
    Y = ay + (by - ay) * k;
    ANG = Math.atan2(ay - by, ax - bx);
  };

  const ink = inkOf(hue, dark);
  const wash = washOf(hue, dark);
  const alpha = env * (dark ? 0.85 : 0.8);
  // A bell is small, but on a wallpaper it is near enough to show its
  // canals and shading, and the whole colony is drawn in the pen.
  const bellR = m * 0.016;
  const d = detailFor(bellR * 12);
  const light = dark ? UNLIGHT : LIGHT;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The stem: thickest behind the bells and thinning to a thread, a wash
  // under the pen's own ribbon.
  const wHead = Math.max(1.4 * px, m * 0.0032);
  const wTail = 0.3 * px;
  const ribbon = (scale: number) => {
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = stem[i * 2];
      const y = stem[i * 2 + 1];
      const j = Math.min(n - 1, i + 1);
      const k = Math.max(0, i - 1);
      const dx = stem[j * 2] - stem[k * 2];
      const dy = stem[j * 2 + 1] - stem[k * 2 + 1];
      const dl = Math.hypot(dx, dy) || 1;
      const t = lens[i] / total;
      const wd = (wTail + (wHead - wTail) * Math.pow(1 - t, 1.6)) * scale * 0.5;
      left.push(x - (dy / dl) * wd, y + (dx / dl) * wd);
      right.push(x + (dy / dl) * wd, y - (dx / dl) * wd);
    }
    const p = new Path2D();
    p.moveTo(left[0], left[1]);
    for (let i = 2; i < left.length; i += 2) p.lineTo(left[i], left[i + 1]);
    for (let i = right.length - 2; i >= 0; i -= 2) p.lineTo(right[i], right[i + 1]);
    p.closePath();
    return p;
  };
  ctx.fillStyle = wash;
  ctx.globalAlpha = alpha * 0.35;
  ctx.fill(ribbon(2.4));
  ctx.fillStyle = ink;
  ctx.globalAlpha = alpha * 0.8;
  ctx.fill(ribbon(1));

  // The head: a float the size of a seed, then six to ten swimming bells
  // close-packed in two rows, overlapping, the youngest smallest at the
  // front, each squeezing in its turn so the beat runs down the row.
  const nBells = 6 + Math.floor(unit(seed, 0xbe1) * 5);
  const floatLen = bellR * 0.9;
  at(floatLen * 0.5);
  const fx = X;
  const fy = Y;
  const fang = ANG;
  const pitch = bellR * 1.05;
  const bellOutlines: number[][] = [];
  const bellPaths: Path2D[] = [];
  const sacs = new Path2D();
  const placed: number[] = [];
  for (let j = nBells - 1; j >= 0; j--) {
    at(floatLen + bellR * 0.6 + j * pitch);
    if (!onPage(X, Y)) continue;
    const side = j % 2 ? 1 : -1;
    const ang = ANG + side * 0.42;
    const squeeze = Math.max(0, Math.sin(ambient * 2.2 - j * 0.6));
    const rb = bellR * (0.62 + 0.38 * Math.min(1, j / 3)) * (0.9 + 0.2 * unit(seed, j + 900));
    // Each bell hangs off the stem to its side, its opening toward the back.
    const bx = X - Math.sin(ANG) * side * rb * 0.62 - Math.cos(ANG) * rb * 0.15;
    const by = Y + Math.cos(ANG) * side * rb * 0.62 - Math.sin(ANG) * rb * 0.15;
    const rx = rb * 1.25;
    const ry = rb * 0.85 * (1 - 0.14 * squeeze);
    const pts: number[] = [];
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (let k = 0; k < 14; k++) {
      const t = (k / 14) * Math.PI * 2;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      const sq = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
      // A rounded box, flattened across its opening at the back, a little lopsided.
      const u = sq(c, c < 0 ? 0.6 : 0.9) * rx * (0.95 + 0.1 * unit(seed, j * 31 + k));
      const v = sq(sn, 0.85) * ry * (1 + 0.18 * c) * (0.95 + 0.1 * unit(seed, j * 37 + k));
      pts.push(bx + ca * u - sa * v, by + sa * u + ca * v);
    }
    bellOutlines.push(pts);
    bellPaths.push(smoothPath(pts, true, 4));
    // The muscular sac inside, opening backward: that is what it swims with.
    const ix = bx - ca * rx * 0.2;
    const iy = by - sa * rx * 0.2;
    sacs.moveTo(ix + ca * rx * 0.62, iy + sa * rx * 0.62);
    sacs.ellipse(ix, iy, rx * 0.62, ry * 0.5, ang, 0, Math.PI * 2);
    placed.push(bx, by, rx, ry, ang, j);
  }
  // Clear things laid over each other: each its own thin wash, so where
  // two overlap the colour deepens.
  for (let k = 0; k < bellPaths.length; k++) {
    ctx.fillStyle = wash;
    ctx.globalAlpha = alpha * 0.24;
    ctx.fill(bellPaths[k]);
    if (d > 0.85) inkLine(ctx, bellOutlines[k], true, { width: 0.9 * px, color: ink, alpha: alpha * 0.75, seed: seed ^ (k * 977), light, plate: true, min: 0.25 * px });
    else {
      ctx.strokeStyle = ink;
      ctx.globalAlpha = alpha * 0.6;
      ctx.lineWidth = 0.8 * px;
      ctx.stroke(bellPaths[k]);
    }
  }
  ctx.strokeStyle = ink;
  ctx.globalAlpha = alpha * 0.25;
  ctx.lineWidth = 0.6 * px;
  ctx.stroke(sacs);
  if (d > 0.4) {
    // Each bell stippled on its shadow side, as a clear thing is drawn, and
    // its four radial canals running from the opening back over the dome.
    const dots = new Path2D();
    const canals = new Path2D();
    const [lx, ly] = light;
    const dr = 0.3 * px;
    for (let q = 0; q < placed.length; q += 6) {
      const [bx, by, rx, ry, ang, j] = placed.slice(q, q + 6);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let k = 0; k < 90; k++) {
        const u = unit(seed, j * 197 + k * 2 + 5000) * 2 - 1;
        const v = unit(seed, j * 197 + k * 2 + 5001) * 2 - 1;
        if (u * u + v * v > 0.92) continue;
        const x = bx + ca * u * rx - sa * v * ry;
        const y = by + sa * u * rx + ca * v * ry;
        const sh = 0.5 + 0.5 * (((x - bx) * lx + (y - by) * ly) / Math.max(rx, ry));
        if (unit(seed, j * 197 + k + 9000) > Math.pow(sh, 1.6)) continue;
        dots.moveTo(x + dr, y);
        dots.arc(x, y, dr, 0, Math.PI * 2);
      }
      for (const v of [-0.55, -0.2, 0.2, 0.55]) {
        canals.moveTo(bx + ca * rx * 0.9 - sa * v * ry * 0.4, by + sa * rx * 0.9 + ca * v * ry * 0.4);
        canals.quadraticCurveTo(bx - sa * v * ry * 1.05, by + ca * v * ry * 1.05, bx - ca * rx * 0.85 - sa * v * ry * 0.3, by - sa * rx * 0.85 + ca * v * ry * 0.3);
      }
    }
    ctx.fillStyle = ink;
    ctx.globalAlpha = alpha * 0.55;
    ctx.fill(dots);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = alpha * 0.25;
    ctx.lineWidth = 0.4 * px;
    ctx.stroke(canals);
  }
  // The float, at the very front, with its spot of pigment.
  if (onPage(fx, fy)) {
    const fr = bellR * 0.42;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(fang);
    ctx.beginPath();
    ctx.ellipse(0, 0, fr * 1.2, fr * 0.75, 0, 0, Math.PI * 2);
    ctx.fillStyle = wash;
    ctx.globalAlpha = alpha * 0.5;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.globalAlpha = alpha * 0.7;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(fr * 0.45, 0, fr * 0.4, fr * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = mixHex(hue, dark ? '#E8E0CF' : '#5A2E24', 0.45);
    ctx.globalAlpha = alpha * 0.8;
    ctx.fill();
    ctx.restore();
  }

  // Down the rest of it, the groups that feed it, at uneven intervals: a
  // pair of bracts, a polyp, a tentacle with its side branches. Batched,
  // so a run of them is a handful of strokes.
  const bracts = new Path2D();
  const polyps = new Path2D();
  const threads = new Path2D();
  const threadLines: number[][] = [];
  const beads = new Path2D();
  const bead = Math.max(0.7 * px, m * 0.0014);
  const gap = bellR * 2.6;
  let l = floatLen + bellR * 0.6 + nBells * pitch + bellR * 0.8;
  for (let i = 0; i < 160 && l < total; i++) {
    at(l);
    const q = unit(seed, i);
    // ±35% on the spacing to the next.
    l += gap * (0.65 + 0.7 * unit(seed, i + 3000)) * (1 + 0.5 * (l / total));
    if (!onPage(X, Y)) continue;
    // The groups shrink a little toward the tail.
    const shrink = 1 - 0.35 * Math.min(1, (l / total) * 1.5);
    const ang = ANG;
    // Whichever side of the stem is underneath.
    const down = Math.cos(ang) >= 0 ? 1 : -1;
    for (let b = 0; b < 2; b++) {
      // A bract: a little clear leaf off the underside, pointing back.
      const br = m * (0.006 + 0.003 * q) * shrink * (b ? 0.8 : 1);
      const bang = ang + Math.PI - (0.6 + 0.5 * b) * down;
      const lx = Math.cos(bang) * br * 2.4;
      const ly = Math.sin(bang) * br * 2.4;
      const wx = -Math.sin(bang) * br * 0.8;
      const wy = Math.cos(bang) * br * 0.8;
      // A leaf fuller on one edge than the other, and no two alike.
      const full = 1.1 + 0.5 * unit(seed, i * 2 + b + 8000);
      bracts.moveTo(X, Y);
      bracts.quadraticCurveTo(X + lx * 0.45 + wx * full, Y + ly * 0.45 + wy * full, X + lx, Y + ly);
      bracts.quadraticCurveTo(X + lx * 0.6 - wx * 0.6, Y + ly * 0.6 - wy * 0.6, X, Y);
    }
    // The feeding polyp hanging under them: a tear, its point up to the stem.
    const pr = m * 0.0032 * shrink * (0.85 + 0.3 * q);
    const py0 = Y + pr * 3.2;
    polyps.moveTo(X, py0 - pr * 2.2);
    polyps.quadraticCurveTo(X + pr * 1.3, py0 - pr * 0.2, X + pr * 0.15, py0 + pr * 1.3);
    polyps.quadraticCurveTo(X - pr * 1.1, py0 + pr * 0.6, X, py0 - pr * 2.2);
    // And its tentacle, hanging and streaming back from the way it swims,
    // swaying a little, some long, most short, a few drawn up in coils.
    const len = m * (0.03 + 0.12 * Math.pow(q, 1.5)) * shrink;
    const sway = Math.sin(ambient * 0.5 + i * 0.7) * 0.25 + 0.08 * Math.sin(ambient * 0.17 + i);
    const trail = -Math.cos(ang) * 0.35;
    const x0 = X;
    const y0 = py0 + pr * 1.3;
    const qx = x0 + (sway * 0.15 + trail * 0.4) * len;
    const qy = y0 + len * 0.5;
    const ex = x0 + (sway * 0.55 + trail) * len;
    const ey = y0 + len;
    const coiled = unit(seed, i + 9100) < 0.3;
    const pts: number[] = [];
    const steps = coiled ? 28 : 10;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      let x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * qx + t * t * ex;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * qy + t * t * ey;
      // A coil seen from the side: a wave across it, growing toward the tip.
      if (coiled && t > 0.35) x += Math.sin((t - 0.35) * 30 + i) * len * 0.07 * Math.min(1, (t - 0.35) * 4);
      pts.push(x, y);
    }
    if (d > 0.85) threadLines.push(pts);
    else {
      threads.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) threads.lineTo(pts[k], pts[k + 1]);
    }
    // The side branches, each ending in its knot of stinging cells: short,
    // not evenly spaced or sized, swept back down the tentacle.
    const nb = 3 + Math.floor(unit(seed, i + 4000) * 3);
    for (let k = 0; k < nb; k++) {
      const t = 0.25 + ((k + 0.3 + 0.5 * unit(seed, i * 7 + k + 5000)) / nb) * 0.7;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      const dx = a * x0 + b * qx + c * ex;
      const dy = a * y0 + b * qy + c * ey;
      const side = k % 2 ? 1 : -1;
      const tl = len * (0.05 + 0.035 * unit(seed, i * 13 + k + 7000));
      const tx = dx + side * tl * 0.6;
      const ty = dy + tl * 0.8;
      threads.moveTo(dx, dy);
      threads.quadraticCurveTo(dx + side * tl * 0.4, dy + tl * 0.3, tx, ty);
      const br = bead * (0.6 + 0.7 * unit(seed, i * 11 + k + 6000));
      beads.moveTo(tx + br * 0.7, ty);
      beads.ellipse(tx, ty, br * 0.7, br * 1.2, sway * 0.4 + side * 0.5, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = wash;
  ctx.globalAlpha = alpha * 0.3;
  ctx.fill(bracts);
  ctx.globalAlpha = alpha * 0.45;
  ctx.fill(polyps);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = alpha * 0.5;
  ctx.lineWidth = 0.6 * px;
  ctx.stroke(bracts);
  ctx.stroke(polyps);
  ctx.globalAlpha = alpha * 0.55;
  ctx.lineWidth = 0.55 * px;
  ctx.stroke(threads);
  for (let k = 0; k < threadLines.length; k++) inkLine(ctx, threadLines[k], false, { width: 0.7 * px, color: ink, alpha: alpha * 0.5, taper: [0.05, 0.7], seed: seed ^ (k * 131), light, raw: true, plate: true, min: 0.2 * px });
  ctx.fillStyle = ink;
  ctx.globalAlpha = alpha * 0.55;
  ctx.fill(beads);

  // On dark water, a faint light along the stem, a wave of it travelling
  // back from the front. Soft and low: the page is still the brightest thing.
  if (dark) {
    const glow = mixHex(mixHex(hue, '#FFFFFF', 0.5), '#9FE8FF', 0.25);
    ctx.globalCompositeOperation = 'lighter';
    const dot = glowDot(glow);
    const step = 0.022 * diag;
    for (let i = 0, gl = floatLen; gl < total; i += 2, gl += step) {
      at(gl);
      if (!onPage(X, Y)) continue;
      const wave = 0.5 + 0.5 * Math.sin(ambient * 0.9 - i * 0.18);
      const pulse = wave * wave * wave;
      // A soft glow, faded to nothing at its rim: no hard discs in a row.
      ctx.globalAlpha = env * 0.12 * (0.2 + pulse) * (1 - 0.6 * (gl / total));
      if (dot) ctx.drawImage(dot, X - 8 * px, Y - 8 * px, 16 * px, 16 * px);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/* ---- The oarfish ---- */

/** Silver: the slate pastel, lightened. */
const SILVER = mixHex(HUES[8], '#FFFFFF', 0.35);
/** The fin's red, kept toward the ink, never bright. */
const FIN = '#C98A7E';

interface OarInk {
  ink: string;
  body: string;
  fin: string;
  membrane: string;
  eye: string;
}

function oarInk(dark: boolean): OarInk {
  return {
    ink: inkOf(HUES[8], dark),
    body: dark ? mixHex(SILVER, NIGHT, 0.4) : mixHex(SILVER, PAPER, 0.25),
    fin: dark ? mixHex(FIN, '#FFFFFF', 0.15) : mixHex(FIN, '#1A1714', 0.35),
    membrane: dark ? mixHex(FIN, NIGHT, 0.45) : mixHex(FIN, PAPER, 0.4),
    eye: dark ? mixHex(PAPER, NIGHT, 0.2) : PAPER,
  };
}

const OAR_LIGHT = oarInk(false);
const OAR_DARK = oarInk(true);

/**
 * An oarfish, hanging in the dark: the real sea serpent, a silver ribbon
 * longer than the page, head up, tail running off the bottom. It is how they
 * are seen alive, upright and still. A red crest runs the whole length of
 * its back, rippling, which is how it moves at all, with long plumes on the
 * head and the two long oars that give it its name trailing under it. It
 * comes up out of the dark, hangs there barely moving, rises a little, and
 * goes.
 */
export function drawOarfish(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean) {
  const env = envelope(age, 0.2, 0.25);
  if (env <= 0) return;
  const m = Math.min(w, h);
  const left = (seed & 1) === 0;
  const x0 = w * (left ? 0.15 + (((seed >>> 4) % 100) / 100) * 0.15 : 0.85 - (((seed >>> 4) % 100) / 100) * 0.15);
  const D = m * 0.042;
  // Up off the bottom it hangs from, just barely.
  const y0 = h * (0.12 + (((seed >>> 11) % 100) / 100) * 0.08) - age * h * 0.035 + Math.sin(ambient * 0.3) * D * 0.1;
  // Leaning a little, the tail toward the page's edge, clear of the clock.
  const lean = (0.06 + (((seed >>> 17) % 100) / 100) * 0.1) * (left ? -1 : 1);
  const sl = Math.sin(lean);
  const cl = Math.cos(lean);
  const phase = ((seed >>> 21) % 100) / 16;
  const k = (Math.PI * 2) / (0.75 * h);
  const len = (h - y0) / cl + 6 * D;
  // The back faces into the page, so the crest is seen.
  const back = left ? 1 : -1;

  let X = 0;
  let Y = 0;
  let NX = 0;
  let NY = 0;
  let Dd = 0;
  /** A point down the spine, its normal toward the back, and the depth of the body there. */
  const at = (s: number) => {
    const amp = D * 0.6 * smooth(s / (0.4 * h)) * (1 + (s / h) * 0.5);
    const wave = amp * Math.sin(s * k - ambient * 0.7 + phase);
    const slope = amp * k * Math.cos(s * k - ambient * 0.7 + phase);
    X = x0 + sl * s + cl * wave;
    Y = y0 + cl * s - sl * wave;
    // The tangent is (sl + cl·slope, cl − sl·slope); the normal turns it a quarter.
    const tx = sl + cl * slope;
    const ty = cl - sl * slope;
    const n = Math.hypot(tx, ty) || 1;
    NX = (ty / n) * back;
    NY = (-tx / n) * back;
    const head = 1.6 * D;
    Dd = s < head ? D * (0.55 + 0.45 * smooth(s / head)) : D * (1 - 0.35 * (s / len));
  };
  // The tangent, read back off the normal.
  const TX = () => NY * back * -1;
  const TY = () => NX * back;

  const c = dark ? OAR_DARK : OAR_LIGHT;
  const alpha = env * 0.9;
  // Big, it shows its fin rays one by one, its spots, and its shading.
  const d = detailFor(D * 4);
  const pw = px * (1 - 0.35 * d);
  const N = 72;
  const ds = len / N;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The crest first, so the body's edge is inked over its roots. Its membrane
  // is a wash between the back and the ray tips; the rays lean back along the
  // body, and a ripple runs down them.
  const tipAt = (s: number) => {
    at(s);
    const ripple = Math.sin(s * k * 4.5 - ambient * 2.4 + phase);
    const lean2 = 0.45 + 0.28 * ripple;
    const f = Dd * 0.45 * (1 + 0.12 * ripple);
    const bx = X + NX * Dd * 0.5;
    const by = Y + NY * Dd * 0.5;
    const ex = bx + (NX * Math.cos(lean2) + TX() * Math.sin(lean2)) * f;
    const ey = by + (NY * Math.cos(lean2) + TY() * Math.sin(lean2)) * f;
    return [bx, by, ex, ey] as const;
  };
  const membrane = new Path2D();
  const rays = new Path2D();
  const s0 = 1.2 * D;
  {
    const [bx, by] = tipAt(s0);
    membrane.moveTo(bx, by);
    for (let i = 1; i <= N; i++) {
      at(s0 + ((len - s0) * i) / N);
      membrane.lineTo(X + NX * Dd * 0.5, Y + NY * Dd * 0.5);
    }
    for (let i = N; i >= 0; i--) {
      const [, , ex, ey] = tipAt(s0 + ((len - s0) * i) / N);
      membrane.lineTo(ex, ey);
    }
    membrane.closePath();
  }
  const rayStep = (d > 0.4 ? 3 : 5) * px;
  // Rays in three weights, so the fin is a run of drawn lines and not a
  // comb: every few a heavier one, unevenly spaced.
  const raysBy = [new Path2D(), new Path2D(), new Path2D()];
  for (let s = s0, i = 0; s < len; s += rayStep * (0.85 + 0.3 * unit(seed, i + 300)), i++) {
    const [bx, by, ex, ey] = tipAt(s);
    if (by > h + D * 2) break;
    const q = unit(seed, i + 700);
    const p = raysBy[i % 4 === 0 ? 2 : q < 0.5 ? 0 : 1];
    p.moveTo(bx, by);
    p.lineTo(ex, ey);
  }
  ctx.fillStyle = c.membrane;
  ctx.globalAlpha = alpha * 0.45;
  ctx.fill(membrane);
  ctx.strokeStyle = d > 0.4 ? c.ink : c.fin;
  raysBy.forEach((p, k) => {
    ctx.globalAlpha = alpha * (d > 0.4 ? 0.28 + 0.12 * k : 0.45 + 0.1 * k);
    ctx.lineWidth = (d > 0.4 ? 0.3 + 0.12 * k : 0.5 + 0.1 * k) * px;
    ctx.stroke(p);
  });
  if (d > 0.85) {
    // The membrane's edge, a broken pen line along the ray tips.
    const edge: number[] = [];
    for (let i = 0; i <= N; i++) {
      const [, , ex, ey] = tipAt(s0 + ((len - s0) * i) / N);
      if (ey > h + D * 2) break;
      edge.push(ex, ey);
    }
    inkLine(ctx, edge, false, { width: 0.7 * pw, color: c.ink, alpha: alpha * 0.5, taper: [0.02, 0.02], seed: seed ^ 0xed9e, light: dark ? UNLIGHT : LIGHT, raw: true, plate: true, min: 0.25 * px });
  }

  // The body: a ribbon, its snout rounded off at the top.
  const body = new Path2D();
  at(0);
  const sx0 = X;
  const sy0 = Y;
  const d0 = Dd;
  const tx0 = TX();
  const ty0 = TY();
  const dorsal0x = sx0 + NX * d0 * 0.5;
  const dorsal0y = sy0 + NY * d0 * 0.5;
  const ventral0x = sx0 - NX * d0 * 0.5;
  const ventral0y = sy0 - NY * d0 * 0.5;
  const bodyPts: number[] = [dorsal0x, dorsal0y];
  body.moveTo(dorsal0x, dorsal0y);
  for (let i = 1; i <= N; i++) {
    at(i * ds);
    body.lineTo(X + NX * Dd * 0.5, Y + NY * Dd * 0.5);
    bodyPts.push(X + NX * Dd * 0.5, Y + NY * Dd * 0.5);
  }
  for (let i = N; i >= 1; i--) {
    at(i * ds);
    body.lineTo(X - NX * Dd * 0.5, Y - NY * Dd * 0.5);
    bodyPts.push(X - NX * Dd * 0.5, Y - NY * Dd * 0.5);
  }
  body.lineTo(ventral0x, ventral0y);
  bodyPts.push(ventral0x, ventral0y);
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    const u = 1 - t;
    const p0 = [ventral0x, ventral0y, ventral0x - tx0 * d0 * 0.55, ventral0y - ty0 * d0 * 0.55, dorsal0x - tx0 * d0 * 0.75, dorsal0y - ty0 * d0 * 0.75, dorsal0x, dorsal0y];
    bodyPts.push(
      u * u * u * p0[0] + 3 * u * u * t * p0[2] + 3 * u * t * t * p0[4] + t * t * t * p0[6],
      u * u * u * p0[1] + 3 * u * u * t * p0[3] + 3 * u * t * t * p0[5] + t * t * t * p0[7],
    );
  }
  body.bezierCurveTo(
    ventral0x - tx0 * d0 * 0.55,
    ventral0y - ty0 * d0 * 0.55,
    dorsal0x - tx0 * d0 * 0.75,
    dorsal0y - ty0 * d0 * 0.75,
    dorsal0x,
    dorsal0y,
  );
  body.closePath();
  ctx.fillStyle = c.body;
  ctx.globalAlpha = alpha * 0.92;
  ctx.fill(body);

  // Shading across the silver: big, engraved lines on the shadowed half that
  // swell into the dark; small, a few faint strokes. And a line of faint
  // streaks down the flank.
  const streaks = new Path2D();
  // Which edge of the ribbon is away from the light.
  at(len * 0.4);
  // (On dark water the light ink marks the light, as everywhere.)
  const lt = dark ? UNLIGHT : LIGHT;
  const sg = NX * lt[0] + NY * lt[1] > 0 ? 1 : -1;
  if (d > 0.85) {
    // Laid down the body rather than clipped from a grid: each stroke runs
    // from the middle of the ribbon to its shadowed edge, a hair where it
    // starts and swelling into the dark, and in deep shadow a second set
    // across the first.
    const sp = Math.max(1.3 * px, D * 0.07);
    const lines = new Path2D();
    const cross = new Path2D();
    const wMax = Math.max(0.5 * px, sp * 0.32);
    for (let s = 1.8 * D, i = 0; s < len; s += sp * (0.9 + 0.2 * unit(seed, i + 1500)), i++) {
      at(s);
      if (Y > h + D) break;
      const start = 0.02 + 0.12 * unit(seed, i + 1600);
      const ax = X + NX * Dd * start * sg;
      const ay = Y + NY * Dd * start * sg;
      const nx0 = NX;
      const ny0 = NY;
      at(s + Dd * 0.5);
      const bx = X + NX * Dd * 0.48 * sg;
      const by = Y + NY * Dd * 0.48 * sg;
      // The stroke's normal, for its width.
      const lx = bx - ax;
      const ly = by - ay;
      const ll = Math.hypot(lx, ly) || 1;
      const qx = -ly / ll;
      const qy = lx / ll;
      const w1 = wMax * (0.7 + 0.5 * unit(seed, i + 1700));
      lines.moveTo(ax, ay);
      lines.lineTo(bx + (qx * w1) / 2, by + (qy * w1) / 2);
      lines.lineTo(bx - (qx * w1) / 2, by - (qy * w1) / 2);
      lines.closePath();
      if (!dark && i % 2 === 0) {
        const cx0 = ax + (bx - ax) * 0.55 - nx0 * 0;
        const cy0 = ay + (by - ay) * 0.55 - ny0 * 0;
        cross.moveTo(cx0, cy0);
        cross.lineTo(bx - lx * 0.1 + qx * sp * 1.2, by - ly * 0.1 + qy * sp * 1.2);
      }
    }
    ctx.fillStyle = c.ink;
    ctx.globalAlpha = alpha * 0.5;
    ctx.fill(lines);
    ctx.strokeStyle = c.ink;
    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = 0.4 * px;
    ctx.stroke(cross);
  } else {
    const strokes = new Path2D();
    for (let s = 1.8 * D; s < len; s += 5 * px) {
      at(s);
      if (Y > h + D) break;
      const ax = X + NX * Dd * 0.35;
      const ay = Y + NY * Dd * 0.35;
      at(s + Dd * 0.55);
      strokes.moveTo(ax, ay);
      strokes.lineTo(X - NX * Dd * 0.48, Y - NY * Dd * 0.48);
    }
    ctx.strokeStyle = c.ink;
    ctx.globalAlpha = alpha * 0.2;
    ctx.lineWidth = 0.55 * px;
    ctx.stroke(strokes);
  }
  for (let s = 2.4 * D, i = 0; s < len; s += D * 1.3, i++) {
    at(s);
    if (Y > h + D) break;
    const o = (i % 2 ? 0.12 : -0.05) * Dd;
    const tx = TX();
    const ty = TY();
    streaks.moveTo(X + NX * o, Y + NY * o);
    streaks.quadraticCurveTo(
      X + NX * (o + Dd * 0.06) + tx * Dd * 0.15,
      Y + NY * (o + Dd * 0.06) + ty * Dd * 0.15,
      X + NX * o + tx * Dd * 0.3,
      Y + NY * o + ty * Dd * 0.3,
    );
  }
  ctx.strokeStyle = c.ink;
  ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = 0.8 * pw;
  ctx.stroke(streaks);
  if (d > 0.4) {
    // Its spots and short dark bars, scattered down the flank, a stipple
    // of shadow along the belly, and the lateral line.
    const spots = new Path2D();
    const dots = new Path2D();
    const lateral = new Path2D();
    let first = true;
    for (let s = 2 * D, i = 0; s < len; s += 2.2 * px, i++) {
      at(s);
      if (Y > h + D) break;
      const q = (Math.sin(i * 12.9898 + seed) * 43758.5453) % 1;
      const qq = Math.abs(q);
      const lo = 0.3 + 0.17 * Math.abs((Math.sin(i * 78.233) * 9631.7) % 1);
      dots.moveTo(X + NX * Dd * lo * sg + 0.3 * px, Y + NY * Dd * lo * sg);
      dots.arc(X + NX * Dd * lo * sg, Y + NY * Dd * lo * sg, 0.3 * px, 0, Math.PI * 2);
      const lx = X + NX * Dd * 0.08;
      const ly = Y + NY * Dd * 0.08;
      if (first) lateral.moveTo(lx, ly);
      else lateral.lineTo(lx, ly);
      first = false;
      if (i % 9 === 0 && qq < 0.6) {
        const o = (qq - 0.3) * Dd * 0.6;
        const sr = Dd * (0.04 + 0.05 * qq);
        spots.moveTo(X + NX * o + sr, Y + NY * o);
        spots.ellipse(X + NX * o, Y + NY * o, sr, sr * 0.7, Math.atan2(TY(), TX()), 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = c.ink;
    ctx.globalAlpha = alpha * 0.4;
    ctx.fill(dots);
    ctx.globalAlpha = alpha * 0.35;
    ctx.fill(spots);
    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = 0.45 * px;
    ctx.stroke(lateral);
  }

  // The outline, inked twice: the first a pressure line, big.
  ctx.globalAlpha = alpha;
  if (d > 0.4) {
    inkLine(ctx, bodyPts, true, { width: 1.2 * pw, color: c.ink, swell: 0.75, lost: 0.2, seed, light: dark ? UNLIGHT : LIGHT, raw: true, min: 0.3 * px });
  } else {
    ctx.lineWidth = 1.2 * px;
    ctx.stroke(body);
  }
  ctx.save();
  ctx.translate(0.9 * px, 0.4 * px);
  ctx.globalAlpha = alpha * 0.3;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke(body);
  ctx.restore();

  // The plumes on its head: the first rays of the crest, long and standing
  // out from the crown, each with a little flag at the tip.
  const plumes = new Path2D();
  const flags = new Path2D();
  const plumeLines: number[][] = [];
  /** A small leaf of membrane at a plume's tip, along `fa`, `fr` long. */
  const leaf = (ex: number, ey: number, fa: number, fr: number, k: number) => {
    const ca = Math.cos(fa);
    const sa = Math.sin(fa);
    const wv = fr * (0.38 + 0.1 * unit(seed, k + 50));
    flags.moveTo(ex - ca * fr * 0.6, ey - sa * fr * 0.6);
    flags.quadraticCurveTo(ex - sa * wv, ey + ca * wv, ex + ca * fr, ey + sa * fr);
    flags.quadraticCurveTo(ex + sa * wv * 0.8, ey - ca * wv * 0.8, ex - ca * fr * 0.6, ey - sa * fr * 0.6);
  };
  const plumeOf = (bx: number, by: number, qx: number, qy: number, ex: number, ey: number) => {
    const pts: number[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const u = 1 - t;
      pts.push(u * u * bx + 2 * u * t * qx + t * t * ex, u * u * by + 2 * u * t * qy + t * t * ey);
    }
    plumeLines.push(pts);
  };
  for (let j = 0; j < 6; j++) {
    const s = D * (0.45 + j * 0.28);
    at(s);
    const bx = X + NX * Dd * 0.5;
    const by = Y + NY * Dd * 0.5;
    const tx = TX();
    const ty = TY();
    const pl = D * (2.4 - j * 0.2);
    const sway = Math.sin(ambient * 0.6 + j * 0.8) * 0.08 * pl;
    const qx = bx + NX * pl * 0.55 - tx * pl * 0.3;
    const qy = by + NY * pl * 0.55 - ty * pl * 0.3;
    const ex = bx + NX * pl * 0.92 - tx * (pl * 0.05 + sway) + tx * j * D * 0.12;
    const ey = by + NY * pl * 0.92 - ty * (pl * 0.05 + sway) + ty * j * D * 0.12;
    plumes.moveTo(bx, by);
    plumes.quadraticCurveTo(qx, qy, ex, ey);
    plumeOf(bx, by, qx, qy, ex, ey);
    leaf(ex, ey, Math.atan2(ey - qy, ex - qx), D * 0.11, j);
  }
  // And the two oars, long and thin under the throat, paddles at the ends.
  for (let j = 0; j < 2; j++) {
    at(D * 2.1 + j * D * 0.25);
    const bx = X - NX * Dd * 0.5;
    const by = Y - NY * Dd * 0.5;
    const tx = TX();
    const ty = TY();
    const ol = D * (3.8 - j * 0.5);
    const sway = Math.sin(ambient * 0.45 + j * 1.3) * 0.08 * ol;
    const qx = bx - NX * ol * 0.35 + tx * ol * 0.4;
    const qy = by - NY * ol * 0.35 + ty * ol * 0.4;
    const ex = bx - NX * (ol * 0.3 + sway) + tx * ol;
    const ey = by - NY * (ol * 0.3 + sway) + ty * ol;
    plumes.moveTo(bx, by);
    plumes.quadraticCurveTo(qx, qy, ex, ey);
    plumeOf(bx, by, qx, qy, ex, ey);
    leaf(ex, ey, Math.atan2(ey - qy, ex - qx), D * 0.2, j + 10);
  }
  if (d > 0.85) {
    // Big, each plume a tapering stroke of the pen.
    for (const pl of plumeLines) inkLine(ctx, pl, false, { width: 1.1 * pw, color: c.fin, alpha: alpha * 0.85, taper: [0.05, 0.4], seed: seed ^ pl.length, light: dark ? UNLIGHT : LIGHT, raw: true, plate: true, min: 0.25 * px });
  } else {
    ctx.strokeStyle = c.fin;
    ctx.globalAlpha = alpha * 0.8;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke(plumes);
  }
  ctx.fillStyle = c.membrane;
  ctx.globalAlpha = alpha * 0.75;
  ctx.fill(flags);
  ctx.strokeStyle = c.fin;
  ctx.globalAlpha = alpha * 0.8;
  ctx.lineWidth = 0.6 * px;
  ctx.stroke(flags);

  // The face: a small mouth at the tip, the gill cover, and a large eye.
  const face = new Path2D();
  at(D * 0.2);
  face.moveTo(X - NX * Dd * 0.42 - TX() * D * 0.1, Y - NY * Dd * 0.42 - TY() * D * 0.1);
  face.quadraticCurveTo(X - NX * Dd * 0.15, Y - NY * Dd * 0.15, X - NX * Dd * 0.05 + TX() * D * 0.25, Y - NY * Dd * 0.05 + TY() * D * 0.25);
  at(D * 1.45);
  const gx = X;
  const gy = Y;
  const gtx = TX();
  const gty = TY();
  const gd = Dd;
  face.moveTo(gx + NX * gd * 0.4, gy + NY * gd * 0.4);
  face.quadraticCurveTo(gx + gtx * gd * 0.35, gy + gty * gd * 0.35, gx - NX * gd * 0.45, gy - NY * gd * 0.45);
  ctx.strokeStyle = c.ink;
  ctx.globalAlpha = alpha * 0.8;
  ctx.lineWidth = 0.9 * px;
  ctx.stroke(face);
  at(D * 0.55);
  const ex = X + NX * Dd * 0.08;
  const ey = Y + NY * Dd * 0.08;
  const er = D * 0.17;
  // A plate's eye: a silver iris round a dark pupil, two highlights, and a
  // fine line round it; not a white disc.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = dark ? mixHex(SILVER, NIGHT, 0.2) : mixHex(SILVER, '#C9B98A', 0.35);
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#16120F';
  ctx.beginPath();
  ctx.arc(ex + TX() * er * 0.08, ey + TY() * er * 0.08, er * 0.6, 0, Math.PI * 2);
  ctx.fill();
  const rim: number[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    rim.push(ex + Math.cos(a) * er, ey + Math.sin(a) * er);
  }
  inkLine(ctx, rim, true, { width: Math.max(0.6 * px, er * 0.12), color: c.ink, alpha: alpha * 0.9, seed: seed ^ 0xe1e, light: dark ? UNLIGHT : LIGHT, plate: true, min: 0.25 * px });
  ctx.fillStyle = dark ? 'rgba(232, 224, 207, 0.75)' : 'rgba(251, 248, 239, 0.9)';
  ctx.beginPath();
  ctx.arc(ex - TX() * er * 0.22 + NX * er * 0.22, ey - TY() * er * 0.22 + NY * er * 0.22, er * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.5;
  ctx.beginPath();
  ctx.arc(ex + TX() * er * 0.25 - NX * er * 0.25, ey + TY() * er * 0.25 - NY * er * 0.25, er * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
