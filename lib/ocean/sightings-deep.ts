/**
 * Three rare sightings for the dark water: an anglerfish's lure, a dumbo
 * octopus, and a whale fall on the floor.
 *
 * Like the rare things in `draw.ts`, each is drawn straight in, in device
 * pixels, from how far through it is, its own seed and the slow clock. They
 * are plates from a naturalist's notebook, a wash under a line of ink, and
 * nothing here reads the clock or `Math.random`.
 */

import { mixHex } from '../fan';
import { drained, IRON_GALL } from './palette';
import { detailFor, hatch, inkLine, LIGHT, shadeAcross, smoothPath, stipple, washFill } from './pen';
import { hash32, mulberry32 } from './random';

/** The light as the pen takes it: on dark water the light ink marks the light. */
const UNLIGHT: [number, number] = [-LIGHT[0], -LIGHT[1]];

/** In and out softly, so nothing arrives in a flash. */
function envelope(age: number, rise: number, fall: number): number {
  return Math.max(0, Math.min(1, age / rise, (1 - age) / fall));
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function smooth(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

/** A point on a quadratic, for setting teeth along a jaw. */
function quad(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by];
}

/** A point on a cubic, for drawing a rib only as far as it is unbroken. */
function cubic(p: number[], t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
}

/* ---- Light in the dark ---- */

/** The lure's light: a cold, pale blue-green, the colour of the storm's. */
const LURE = [191, 243, 230] as const;
const lure = (a: number) => `rgba(${LURE[0]}, ${LURE[1]}, ${LURE[2]}, ${a})`;

/** The anglerfish's outline, facing +x with its lure's rest at the origin. */
function lureFish(L: number): { outline: number[]; body: Path2D; maw: Path2D; UL: Pt; CORNER: Pt; CHIN: Pt; UPPER: Pt; LOWER: Pt } {
  // Facing +x, the lure's rest at the origin. Mostly head: a dome, a
  // gape that runs back past the eye, a jaw slung out beyond the snout,
  // and only a stub of a body and a small fan of tail behind.
  const UL: Pt = [-0.06 * L, 0.08 * L];
  const CORNER: Pt = [-0.27 * L, 0.24 * L];
  const CHIN: Pt = [0.04 * L, 0.27 * L];
  const UPPER: Pt = [-0.14 * L, 0.13 * L];
  const LOWER: Pt = [-0.06 * L, 0.31 * L];
  // The outline as points, for the pen, and as a path, for the fills.
  const outline: number[] = [];
  const cub = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 10) => {
    for (let k = 1; k <= n; k++) outline.push(...cubic([p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]], k / n));
  };
  const qd = (p0: Pt, c: Pt, p1: Pt, n = 8) => {
    for (let k = 1; k <= n; k++) outline.push(...quad(p0[0], p0[1], c[0], c[1], p1[0], p1[1], k / n));
  };
  const at = (u: number, v: number): Pt => [u * L, v * L];
  outline.push(...UL);
  cub(UL, at(-0.1, -0.12), at(-0.35, -0.2), at(-0.55, -0.12));
  cub(at(-0.55, -0.12), at(-0.68, -0.07), at(-0.76, 0.05), at(-0.78, 0.15), 6);
  outline.push(...at(-0.88, 0.08));
  qd(at(-0.88, 0.08), at(-0.94, 0.19), at(-0.88, 0.3), 5);
  outline.push(...at(-0.78, 0.22));
  cub(at(-0.78, 0.22), at(-0.7, 0.42), at(-0.4, 0.5), at(-0.16, 0.44));
  qd(at(-0.16, 0.44), at(0.02, 0.39), CHIN, 5);
  qd(CHIN, LOWER, CORNER, 6);
  qd(CORNER, UPPER, UL, 6);
  const body = new Path2D();
  body.moveTo(outline[0], outline[1]);
  for (let k = 2; k < outline.length; k += 2) body.lineTo(outline[k], outline[k + 1]);
  body.closePath();
  // The open mouth: the dark between the jaws.
  const maw = new Path2D();
  maw.moveTo(UL[0], UL[1]);
  maw.quadraticCurveTo(UPPER[0], UPPER[1], CORNER[0], CORNER[1]);
  maw.quadraticCurveTo(LOWER[0], LOWER[1], CHIN[0], CHIN[1]);
  maw.closePath();
  return { outline, body, maw, UL, CORNER, CHIN, UPPER, LOWER };
}

/** The fish as the lure lights it from where it hangs at rest: drawn once and placed. */
function paintLureFish(ctx: CanvasRenderingContext2D, L: number, seed: number, px: number, dark: boolean): void {
  const { outline, body, maw, UL, CORNER, CHIN, UPPER, LOWER } = lureFish(L);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const box = { x: -0.95 * L, y: -0.22 * L, w: 1.0 * L, h: 0.74 * L };
  // How near the lure's light a point is: all that can be seen of it.
  const reach = 1.05 * L;
  const near = (x: number, y: number) => Math.max(0, 1 - Math.hypot(x, y) / reach);

  // A shape a little darker than the water, the mouth darker still.
  ctx.globalAlpha = dark ? 0.5 : 0.3;
  ctx.fillStyle = dark ? '#1C1A18' : '#2A2320';
  ctx.fill(body);
  ctx.globalAlpha = dark ? 0.55 : 0.35;
  ctx.fill(maw);
  // The ink, fading the same way: the far end of it is barely there.
  // The one ink, iron-gall on light water and off-white on dark.
  const inkTone = dark ? '232, 224, 207' : '42, 35, 32';
  const line = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
  line.addColorStop(0, `rgba(${inkTone}, 0.9)`);
  line.addColorStop(1, `rgba(${inkTone}, 0.04)`);
  // Engraved where the light falls on it: contour lines round the head
  // and stipple over the skin, both thinning out into the dark.
  const dd = detailFor(L);
  const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
  ctx.globalAlpha = 1;
  if (dd > 0.45) {
    const sp = Math.max(1.3 * px, L * 0.014);
    hatch(ctx, body, box, {
      spacing: sp,
      angle: 0.3,
      // Bowed with the dome of the head, not ruled across it.
      bow: (0.07 * L) / sp,
      shade: (x, y) => Math.pow(near(x, y), 1.4),
      from: 0.3,
      color: ink,
      width: Math.max(0.35 * px, L * 0.0028),
      alpha: 0.6,
      seed: seed ^ 0x4a7c,
    });
  }
  stipple(ctx, body, box, {
    spacing: Math.max(1.2 * px, L * (dd > 0.45 ? 0.008 : 0.016)),
    radius: Math.max(0.3 * px, L * 0.0018),
    shade: (x, y) => Math.pow(near(x, y), 1.2),
    from: 0.12,
    color: ink,
    alpha: 0.6,
    seed: seed ^ 0x5c1,
  });
  // The outline in the pen, its ink a gradient that dies into the dark.
  inkLine(ctx, outline, true, { width: Math.max(0.8 * px, L * 0.006), color: line as unknown as string, alpha: 0.8, seed: seed ^ 0x0a, light: UNLIGHT, raw: true, plate: true, min: 0.3 * px });

  // A small pectoral fan, the gill's edge, and rays in the tail.
  const fins = new Path2D();
  for (let k = 0; k < 5; k++) {
    fins.moveTo(-0.46 * L, 0.24 * L);
    fins.quadraticCurveTo(-0.5 * L - k * 0.008 * L, 0.27 * L + k * 0.01 * L, -0.55 * L - k * 0.015 * L, 0.3 * L + k * 0.022 * L);
  }
  for (let k = 0; k < 6; k++) {
    fins.moveTo(-0.79 * L, 0.16 * L + k * 0.005 * L);
    fins.lineTo(-0.9 * L, 0.09 * L + k * 0.04 * L);
  }
  fins.moveTo(-0.36 * L, 0.06 * L);
  fins.quadraticCurveTo(-0.42 * L, 0.18 * L, -0.38 * L, 0.3 * L);
  ctx.strokeStyle = line;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = Math.max(0.4 * px, L * 0.003);
  ctx.stroke(fins);

  // Needles, few and uneven, curving back into the mouth: short from the
  // upper jaw, long from the lower; each one tapering to a point.
  const teeth = mulberry32(seed ^ 0x7ee7);
  const tooth = (x: number, y: number, cx: number, cy: number, ex: number, ey: number, k: number) => {
    const pts: number[] = [];
    for (let q = 0; q <= 6; q++) pts.push(...quad(x, y, cx, cy, ex, ey, q / 6));
    inkLine(ctx, pts, false, { width: Math.max(0.6 * px, L * 0.007), color: ink, alpha: 0.8, taper: [0, 0.85], seed: seed ^ k, light: UNLIGHT, raw: true, plate: true, min: 0.25 * px });
  };
  for (let k = 0; k < 5; k++) {
    const [x, y] = quad(UL[0], UL[1], UPPER[0], UPPER[1], CORNER[0], CORNER[1], (k + 0.4) / 6);
    const len = (0.03 + teeth() * 0.035) * L;
    tooth(x, y, x + 0.01 * L, y + len * 0.6, x - 0.004 * L, y + len, k + 1);
  }
  for (let k = 0; k < 6; k++) {
    const t = (k + 0.3) / 7;
    const [x, y] = quad(CHIN[0], CHIN[1], LOWER[0], LOWER[1], CORNER[0], CORNER[1], t);
    const len = (0.05 + teeth() * 0.07) * L * (1 - t * 0.5);
    tooth(x, y, x + len * 0.3, y - len * 0.6, x + len * 0.1, y - len, k + 11);
  }

  // A small eye, lit on its near rim, and the stalk arching from the brow
  // out to the light.
  const er = Math.max(1.1 * px, 0.016 * L);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#16120F';
  ctx.beginPath();
  ctx.arc(-0.27 * L, 0, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(0.5 * px, er * 0.25);
  ctx.beginPath();
  ctx.arc(-0.27 * L, 0, er, -1.2, 1.6);
  ctx.stroke();
  ctx.fillStyle = lure(0.9);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(-0.27 * L + er * 0.35, -er * 0.3, er * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

interface LureSprite {
  key: string;
  canvas: HTMLCanvasElement | null;
}

let lureSprites: LureSprite[] = [];

/** Where the fish's canvas sits in its own frame, as shares of L. */
const LURE_BOX = { x: -1, y: -0.26, w: 1.14, h: 0.82 };

/**
 * An anglerfish. For most of it there is only a bead of light bobbing in
 * the dark to one side; around the middle the light swells a little and,
 * for a few seconds, the fish behind it is there, lit only where the lure
 * reaches: the dome of a head, a small eye, the jaw hung open under it with
 * its needles. Then it is dark again around the light, and then the light
 * goes too. It never moves toward the reader.
 */
export function drawLure(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean): void {
  const env = envelope(age, 0.08, 0.15);
  if (env <= 0) return;
  const rand = mulberry32(seed ^ 0x51a7e);
  const right = (seed & 1) === 1;
  // To one side, out of the middle third, and high enough to keep off the
  // clock in the lower corners.
  const restX = w * (right ? 0.7 + rand() * 0.18 : 0.12 + rand() * 0.18);
  const restY = h * (0.15 + rand() * 0.4);
  const phase = rand() * Math.PI * 2;
  // It faces the middle of the page, so what there is of it lies toward the edge.
  const dir = right ? -1 : 1;
  const L = Math.min(w, h) * 0.2;

  const lx = restX + (Math.sin(ambient * 0.37 + phase) * 7 + Math.sin(ambient * 0.11 + phase * 0.7) * 10) * px;
  const ly = restY + Math.sin(ambient * 0.61 + phase * 1.3) * 5 * px;
  // Seen for a moment in the middle: a slow bell, never a cut.
  const seen = age > 0.44 && age < 0.64 ? Math.pow(Math.sin(((age - 0.44) / 0.2) * Math.PI), 2) : 0;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (seen > 0.01) {
    // The fish moves less than its lure does: the lure is what's dangled.
    const fx = restX + (lx - restX) * 0.35;
    const fy = restY + (ly - restY) * 0.35;
    const ux = (lx - fx) * dir;
    const uy = ly - fy;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(dir, 1);

    const { body } = lureFish(L);
    const key = `${seed}|${Math.round(L * 10)}|${px}|${dark ? 1 : 0}`;
    let sprite = lureSprites.find((sp) => sp.key === key);
    if (!sprite) {
      const c = scratch(LURE_BOX.w * L, LURE_BOX.h * L);
      const g = c?.getContext('2d');
      if (c && g) {
        g.translate(-LURE_BOX.x * L, -LURE_BOX.y * L);
        paintLureFish(g, L, seed, px, dark);
      }
      sprite = { key, canvas: c && g ? c : null };
      lureSprites = [sprite, ...lureSprites].slice(0, 2);
    }
    ctx.globalAlpha = seen;
    if (sprite.canvas) ctx.drawImage(sprite.canvas, LURE_BOX.x * L, LURE_BOX.y * L, LURE_BOX.w * L, LURE_BOX.h * L);
    else paintLureFish(ctx, L, seed, px, dark);
    // The lure's own light on it where it hangs now, strongest at the jaw.
    const lit = ctx.createRadialGradient(ux, uy, 0, ux, uy, 1.1 * L);
    lit.addColorStop(0, lure(dark ? 0.18 : 0.12));
    lit.addColorStop(0.5, lure(dark ? 0.04 : 0.03));
    lit.addColorStop(1, lure(0));
    ctx.globalAlpha = seen;
    ctx.fillStyle = lit;
    ctx.fill(body);

    const reach = 1.05 * L;
    const inkTone = dark ? '232, 224, 207' : '42, 35, 32';
    const line = ctx.createRadialGradient(ux, uy, 0, ux, uy, reach);
    line.addColorStop(0, `rgba(${inkTone}, 0.9)`);
    line.addColorStop(1, `rgba(${inkTone}, 0.04)`);
    const stalk: number[] = [];
    for (let q = 0; q <= 12; q++) stalk.push(...quad(-0.2 * L, -0.11 * L, -0.12 * L, -0.34 * L, ux, uy, q / 12));
    inkLine(ctx, stalk, false, { width: Math.max(0.7 * px, L * 0.006), color: line as unknown as string, alpha: seen * 0.85, taper: [0.1, 0.3], seed: seed ^ 0x57a1, light: UNLIGHT, raw: true, plate: true, min: 0.3 * px });
    ctx.restore();
  }

  // The light: a soft bead that breathes a little, and swells when the fish is seen.
  const breathe = 1 + 0.08 * Math.sin(ambient * 2.1 + phase);
  const r = (14 + 12 * seen) * px * breathe;
  ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
  glow.addColorStop(0, lure((0.5 + 0.25 * seen) * env));
  glow.addColorStop(0.25, lure((0.16 + 0.1 * seen) * env));
  glow.addColorStop(1, lure(0));
  ctx.globalAlpha = dark ? 1 : 0.6;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lx, ly, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = env * (dark ? 0.9 : 0.6);
  ctx.fillStyle = dark ? '#EFFFFA' : '#7FBFB0';
  ctx.beginPath();
  ctx.arc(lx, ly, 2 * px * breathe, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---- The dumbo octopus ---- */

/** The dumbo's mantle, drawn once a size and placed. */
let dumboMantles: { key: string; canvas: HTMLCanvasElement | null }[] = [];

/** A dumbo's pink, which the depth takes most of. */
const DUMBO = '#D9A69A';

/**
 * A dumbo octopus, small and pale, hanging in the water above the floor,
 * seen from the side and a little from the front as a plate would show it:
 * a soft mantle taller than it is wide, leaning back; a small eye low on
 * its side; the two ear fins, thin paddles with fine rays, rowing slowly so
 * that it lifts a little after each stroke and settles; and under it the
 * arms in their web, an umbrella of wash with the cirri fringing each arm.
 * It drifts across the lower page the while.
 */
export function drawDumbo(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean): void {
  const env = envelope(age, 0.12, 0.12);
  if (env <= 0) return;
  const rand = mulberry32(seed ^ 0xd0b0);
  // Rolled in this order, so the picture can place it the same way.
  rand();
  const startX = 0.28 + rand() * 0.44;
  const drift = 0.1 + rand() * 0.12;
  const way = rand() < 0.5 ? -1 : 1;
  const baseY = 0.64 + rand() * 0.1;
  const beat = 2.6 + rand() * 0.8;
  const phase = rand() * Math.PI * 2;

  // Its colour as the deep leaves it: most of the pink gone.
  const hue = drained(DUMBO, 0.32);
  const water = dark ? '#1A1815' : '#FBF8EF';
  const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
  const wash = dark ? mixHex(hue, water, 0.35) : mixHex(hue, water, 0.12);
  const web = dark ? mixHex(hue, water, 0.55) : mixHex(hue, water, 0.35);
  const baseLight = dark ? UNLIGHT : LIGHT;
  // Drawn facing +x and mirrored to face `way`: the light turns with it so
  // it still comes from the page's top left.
  const light: [number, number] = [baseLight[0] * way, baseLight[1]];

  // Small for an octopus, but big enough to be found.
  const S = Math.min(w, h) * 0.11;
  const d = detailFor(S * 1.6);
  const pw = Math.max(0.6 * px, S * 0.012) * (1 - 0.3 * d);
  const ph = (ambient / beat) * Math.PI * 2 + phase;
  const flap = Math.sin(ph);
  // The body rises just after the fins come down.
  const lift = Math.sin(ph - 1.1);
  const x = w * Math.max(0.12, Math.min(0.88, startX + way * (age - 0.5) * 2 * drift)) + Math.sin(ambient * 0.17 + phase) * S * 0.4;
  const y = h * baseY - lift * S * 0.12 + Math.sin(ambient * 0.09 + phase) * S * 0.35;
  const r = mulberry32(hash32('dumbo', seed));

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(way, 1);
  ctx.rotate(lift * 0.04);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const base = ctx.globalAlpha * env;

  // The mantle: an upright egg, 1.3 times as tall as it is wide, a little
  // fuller at the crown, hardly leaning.
  const MW = 0.42 * S;
  const MH = MW * 1.3;
  const mcx = 0.02 * S;
  const mcy = -0.36 * S;
  // Leaning a touch into the way it goes, crown first, as it swims.
  const tilt = 0.08;
  const mantle: number[] = [];
  for (let k = 0; k < 28; k++) {
    const t = (k / 28) * Math.PI * 2;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    // Fuller at the crown (sn < 0), drawn in a little at the foot.
    const full = 1 - 0.06 * sn;
    const u = (MW / 2) * c * full * (0.97 + 0.06 * unitOf(seed, k));
    const v = (MH / 2) * sn;
    mantle.push(mcx + u * Math.cos(tilt) - v * Math.sin(tilt), mcy + u * Math.sin(tilt) + v * Math.cos(tilt));
  }
  const mantleBox = boundsOf(mantle);
  const mantlePath = smoothPath(mantle, true, 4);

  // The arms: eight round a crown under the mantle, seen a little from the
  // front, so the near four hang in front of the web and the far four
  // behind it. The web opens and closes with the stroke.
  const spread = 1 + 0.1 * Math.sin(ph + 0.6);
  // Under the mantle, toward its back.
  // Inside the mantle's lower half: the arms grow out of the body itself,
  // with no neck between, and the web runs on from the mantle.
  const crown = { x: mcx - Math.sin(tilt) * MH * 0.32, y: mcy + Math.cos(tilt) * MH * 0.32 };
  interface Arm {
    pts: number[];
    near: boolean;
    depth: number;
  }
  const arms: Arm[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rx0 = crown.x + ca * 0.16 * S;
    const ry0 = crown.y + sa * 0.05 * S;
    const reach = (0.29 + 0.05 * unitOf(seed, i + 40)) * S * spread;
    // The skirt hangs under it, trailing only a little from the way it swims.
    const tx = crown.x + ca * reach - 0.04 * S;
    const ty = crown.y + 0.4 * S + sa * 0.08 * S - (spread - 1) * 0.6 * S;
    const curl = Math.sin(ambient * 0.6 + i * 1.3) * 0.04 * S;
    // Each arm bows out and its tip curls back in, never a straight spoke.
    arms.push({
      // Down from the body first, then flaring out, the tip flicked outward:
      // a skirt, never a lampshade's straight side.
      pts: [rx0, ry0, rx0 + ca * 0.05 * S, ry0 + 0.17 * S, tx - ca * 0.07 * S + curl, ty - 0.1 * S, tx + ca * 0.03 * S + curl, ty - 0.01 * S],
      near: sa > 0,
      depth: sa,
    });
  }
  // Furthest first, so the nearer arms lie over them.
  const order = [...arms].sort((p, q) => p.depth - q.depth);
  const webPatch = (p: Arm, q: Arm) => {
    const path = new Path2D();
    const at = (A: Arm, t: number) => cubic([A.pts[0], A.pts[1], A.pts[2], A.pts[3], A.pts[4], A.pts[5], A.pts[6], A.pts[7]], t);
    path.moveTo(p.pts[0], p.pts[1]);
    for (let k = 1; k <= 8; k++) path.lineTo(...at(p, (k / 8) * 0.8));
    const [px1, py1] = at(p, 0.8);
    const [qx1, qy1] = at(q, 0.8);
    path.quadraticCurveTo((px1 + qx1) / 2, (py1 + qy1) / 2 - 0.06 * S, qx1, qy1);
    for (let k = 8; k >= 0; k--) path.lineTo(...at(q, (k / 8) * 0.8));
    path.closePath();
    return path;
  };
  // Neighbours round the crown.
  const byAngle = [0, 1, 2, 3, 4, 5, 6, 7];
  const armAt = (i: number) => arms[i % 8];
  const farWeb = new Path2D();
  const nearWeb = new Path2D();
  for (const i of byAngle) {
    const p = armAt(i);
    const q = armAt(i + 1);
    const patch = webPatch(p, q);
    if (p.near && q.near) nearWeb.addPath(patch);
    else farWeb.addPath(patch);
  }

  // Big, each arm a tapering pen line; on a screen, one stroke for them all.
  const pen = d > 0.85;
  const armLine = (A: Arm, alpha: number, salt: number) => {
    if (pen) {
      inkLine(ctx, along(A.pts, 0, 1, 16), false, { width: pw * (A.near ? 1.1 : 0.8), color: ink, alpha: base * alpha, taper: [0.05, 0.45], seed: hash32(seed, salt), light, raw: true, plate: true, min: 0.25 * px });
      return;
    }
    ctx.beginPath();
    ctx.moveTo(A.pts[0], A.pts[1]);
    ctx.bezierCurveTo(A.pts[2], A.pts[3], A.pts[4], A.pts[5], A.pts[6], A.pts[7]);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = base * alpha;
    ctx.lineWidth = pw * (A.near ? 1 : 0.75);
    ctx.stroke();
  };
  const cirri = (A: Arm, alpha: number) => {
    // Fine cirri in pairs down the arm, and the suckers between them.
    const hairs = new Path2D();
    const sucks = new Path2D();
    const P = A.pts;
    for (let t = 0.32; t < 0.95; t += d > 0.4 ? 0.055 : 0.11) {
      const [ax, ay] = cubic(P, t);
      const [bx, by] = cubic(P, Math.min(1, t + 0.02));
      const tx = bx - ax;
      const ty = by - ay;
      const tn = Math.hypot(tx, ty) || 1;
      // The cirri stand off the arm's inner face, toward the web's middle.
      const sd = (ax - crown.x) * ty - (ay - crown.y) * tx > 0 ? -1 : 1;
      const nx = (-ty / tn) * sd;
      const ny = (tx / tn) * sd;
      const len = S * 0.028 * (1.1 - t * 0.5);
      const wob = (unitOf(seed, Math.round(t * 100)) - 0.5) * 0.5;
      hairs.moveTo(ax + nx * pw * 0.6, ay + ny * pw * 0.6);
      hairs.quadraticCurveTo(ax + nx * len * 0.7, ay + ny * len * 0.7, ax + nx * len + (tx / tn) * len * (0.4 + wob), ay + ny * len + (ty / tn) * len * (0.4 + wob));
      if (d > 0.85) {
        const sr = S * 0.0045 * (1.2 - t * 0.6);
        sucks.moveTo(ax - nx * pw * 1.4 + sr, ay - ny * pw * 1.4);
        sucks.ellipse(ax - nx * pw * 1.4, ay - ny * pw * 1.4, sr, sr * 0.7, Math.atan2(ty, tx), 0, Math.PI * 2);
      }
    }
    ctx.strokeStyle = ink;
    ctx.globalAlpha = base * alpha * 0.55;
    ctx.lineWidth = Math.max(0.3 * px, pw * 0.35);
    ctx.stroke(hairs);
    ctx.globalAlpha = base * alpha * 0.45;
    ctx.stroke(sucks);
  };

  // A fin: a thin paddle out from the mantle's side, on a short stalk,
  // with fine rays fanning from its root, rowing through its arc.
  const fin = (rootX: number, rootY: number, ang: number, len: number, wid: number, alpha: number, salt: number) => {
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const P = (u: number, v: number) => [rootX + c * u - sn * v, rootY + sn * u + c * v] as const;
    const outline: number[] = [];
    const prof: [number, number][] = [
      [0, -0.1], [0.25, -0.16], [0.55, -0.48], [0.8, -0.52], [0.97, -0.25], [1, 0.05], [0.9, 0.4], [0.65, 0.48], [0.4, 0.24], [0.2, 0.13], [0, 0.1],
    ];
    for (const [u, v] of prof) outline.push(...P(u * len, v * wid));
    const path = smoothPath(outline, true, 4);
    const box = boundsOf(outline);
    ctx.globalAlpha = base * alpha;
    if (d > 0.85) washFill(ctx, path, box, { color: wash, alpha: 0.85, edge: 0.35, paper: dark ? null : water, highlight: 0.35, granulate: 0.3, light, px });
    else {
      ctx.globalAlpha = base * alpha * 0.85;
      ctx.fillStyle = wash;
      ctx.fill(path);
    }
    // Rays: fine lines from the root to the paddle's rim.
    const rays = new Path2D();
    const nRays = d > 0.4 ? 9 : 4;
    for (let k = 0; k < nRays; k++) {
      const v = -0.4 + (k / (nRays - 1)) * 0.8;
      const [x0, y0] = P(len * 0.12, v * wid * 0.2);
      const [x1, y1] = P(len * (0.86 - Math.abs(v) * 0.15), v * wid * 0.85);
      rays.moveTo(x0, y0);
      rays.lineTo(x1, y1);
    }
    ctx.strokeStyle = ink;
    ctx.globalAlpha = base * alpha * 0.35;
    ctx.lineWidth = Math.max(0.3 * px, pw * 0.3);
    ctx.stroke(rays);
    if (pen) inkLine(ctx, outline, true, { width: pw * 0.9, color: ink, alpha: base * alpha * 0.9, seed: hash32(seed, salt), light, plate: true, min: 0.25 * px });
    else {
      ctx.strokeStyle = ink;
      ctx.globalAlpha = base * alpha * 0.9;
      ctx.lineWidth = pw * 0.8;
      ctx.stroke(path);
    }
  };
  // The ear fins, one each side of the mantle high up, at ten and two
  // o'clock, standing out and up; they row together, down and back up.
  const row = 0.42 * flap;
  const finLen = 0.27 * S;
  const finWid = 0.095 * S;

  // Far side first: its fin, its arms and the web behind.
  // A point on the mantle's surface, from its own frame (u across, v down).
  const onMantle = (u: number, v: number): [number, number] => [mcx + u * Math.cos(tilt) - v * Math.sin(tilt), mcy + u * Math.sin(tilt) + v * Math.cos(tilt)];
  // The far fin, at ten o'clock, behind the mantle's edge.
  const farRoot = onMantle(-MW * 0.36, -MH * 0.2);
  fin(farRoot[0], farRoot[1], -Math.PI + 0.4 - tilt - row, finLen * 0.9, finWid * 0.9, 0.75, 1);
  ctx.globalAlpha = base * 0.3;
  ctx.fillStyle = web;
  ctx.fill(farWeb);
  for (const A of order) if (!A.near) armLine(A, 0.45, 10 + A.depth * 7);

  // The mantle: wash with its paper strip, stipple where it turns away,
  // contour lines round its side, and a pressure line. It does not change
  // shape, so it is drawn once and placed.
  const paintMantle = (g: CanvasRenderingContext2D) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    washFill(g, mantlePath, mantleBox, { color: wash, edge: 0.4, paper: dark ? null : water, highlight: 0.55, granulate: 0.35, light, px });
    const across = shadeAcross(mantleBox, light);
    if (d > 0.15) {
      hatch(g, mantlePath, mantleBox, {
        spacing: Math.max(1.3 * px, S * 0.022),
        angle: tilt + 0.15,
        bow: 1.1,
        shade: across,
        from: 0.58,
        color: ink,
        width: Math.max(0.35 * px, S * 0.0045),
        alpha: 0.32,
        seed: seed ^ 0xd1,
      });
      stipple(g, mantlePath, mantleBox, { spacing: Math.max(1.2 * px, S * 0.012), radius: Math.max(0.3 * px, S * 0.0025), shade: across, from: 0.4, color: ink, alpha: 0.45, seed: seed ^ 0xd0 });
    }
    // Inked round the dome only: below, the mantle runs on into the web.
    const dome: number[] = [];
    for (let k = 0; k <= 40; k++) {
      const t = Math.PI / 2 + 0.95 + (k / 40) * (Math.PI * 2 - 1.9);
      const c = Math.cos(t);
      const sn = Math.sin(t);
      const u = (MW / 2) * c * (1 - 0.12 * sn);
      const v = (MH / 2) * sn;
      dome.push(mcx + u * Math.cos(tilt) - v * Math.sin(tilt), mcy + u * Math.sin(tilt) + v * Math.cos(tilt));
    }
    inkLine(g, dome, false, { width: pw * 0.95, color: ink, alpha: 0.8, seed, light, taper: [0.12, 0.12], plate: true, min: 0.25 * px });
  };
  const pad = pw * 3;
  const mKey = `${seed}|${Math.round(S * 10)}|${px}|${dark ? 1 : 0}|${way}`;
  let mantleSprite = dumboMantles.find((m) => m.key === mKey);
  if (!mantleSprite) {
    const c = scratch(mantleBox.w + pad * 2, mantleBox.h + pad * 2);
    const g = c?.getContext('2d');
    if (c && g) {
      g.translate(pad - mantleBox.x, pad - mantleBox.y);
      paintMantle(g);
    }
    mantleSprite = { key: mKey, canvas: c && g ? c : null };
    dumboMantles = [mantleSprite, ...dumboMantles].slice(0, 2);
  }
  ctx.globalAlpha = base;
  if (mantleSprite.canvas) ctx.drawImage(mantleSprite.canvas, mantleBox.x - pad, mantleBox.y - pad, mantleBox.w + pad * 2, mantleBox.h + pad * 2);
  else paintMantle(ctx);

  // The near web over the mantle's foot, then the near arms in it.
  // Thick where it leaves the body, thinning to the margin, so the mantle
  // runs on into it.
  const wg = ctx.createLinearGradient(0, crown.y - 0.06 * S, 0, crown.y + 0.38 * S);
  wg.addColorStop(0, `${wash}E0`);
  wg.addColorStop(0.3, `${mixHex(wash, web, 0.5)}99`);
  wg.addColorStop(1, `${web}66`);
  ctx.globalAlpha = base;
  ctx.fillStyle = wg;
  ctx.fill(nearWeb);
  if (d > 0.85) {
    const wb = { x: -0.5 * S, y: -0.15 * S, w: S, h: 0.6 * S };
    stipple(ctx, nearWeb, wb, { spacing: Math.max(1.3 * px, S * 0.014), radius: Math.max(0.3 * px, S * 0.0022), shade: (_x, yy) => 0.3 + 0.7 * Math.max(0, (yy + 0.05 * S) / (0.4 * S)), from: 0.45, color: ink, alpha: base * 0.35, seed: seed ^ 0xeb });
  }
  for (const A of order) {
    if (!A.near) continue;
    armLine(A, dark ? 0.6 : 0.85, 20 + A.depth * 7);
    cirri(A, 1);
  }
  // The web's margin between the near arms, a fine line.
  for (const i of byAngle) {
    const p = armAt(i);
    const q = armAt(i + 1);
    if (!(p.near && q.near)) continue;
    const [px1, py1] = cubic(p.pts, 0.8);
    const [qx1, qy1] = cubic(q.pts, 0.8);
    const m: number[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const u = 1 - t;
      const cxm = (px1 + qx1) / 2;
      const cym = (py1 + qy1) / 2 - 0.06 * S;
      m.push(u * u * px1 + 2 * u * t * cxm + t * t * qx1, u * u * py1 + 2 * u * t * cym + t * t * qy1);
    }
    if (pen) inkLine(ctx, m, false, { width: pw * 0.6, color: ink, alpha: base * 0.6, taper: [0.15, 0.15], seed: hash32(seed, 'web', i), light, raw: true, plate: true, min: 0.25 * px });
    else {
      ctx.beginPath();
      ctx.moveTo(m[0], m[1]);
      for (let q = 2; q < m.length; q += 2) ctx.lineTo(m[q], m[q + 1]);
      ctx.strokeStyle = ink;
      ctx.globalAlpha = base * 0.55;
      ctx.lineWidth = pw * 0.5;
      ctx.stroke();
    }
  }

  // The near fin, at two o'clock, over the mantle's edge.
  const nearRoot = onMantle(MW * 0.38, -MH * 0.2);
  fin(nearRoot[0], nearRoot[1], -0.4 + tilt + row, finLen, finWid, 0.9, 2);

  // The eye: small, on the near side under the fin, a bulge of skin over
  // it; dark, with no highlight, so it is an eye on an animal and never a
  // face looking out.
  const er = Math.max(0.8 * px, MW * 0.036);
  const [ex, ey] = onMantle(MW * 0.3, MH * 0.1);
  // Too small to show as an eye, it would only be a dot under two ears:
  // left out.
  if (er < 1.8 * px) {
    ctx.restore();
    return;
  }
  const bulge: number[] = [];
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (1.1 + (k / 10) * 0.8);
    bulge.push(ex + Math.cos(a) * er * 2.2, ey + Math.sin(a) * er * 1.8);
  }
  inkLine(ctx, bulge, false, { width: pw * 0.55, color: ink, alpha: base * 0.45, taper: [0.3, 0.3], seed: seed ^ 0xe1, light, plate: true, min: 0.25 * px });
  ctx.globalAlpha = base * 0.7;
  ctx.fillStyle = mixHex(hue, '#16120F', 0.7);
  ctx.beginPath();
  ctx.ellipse(ex, ey, er, er * 0.75, tilt, 0, Math.PI * 2);
  ctx.fill();
  void r;
  ctx.restore();
}

/** A number 0 to 1 for the i-th part of an animal. */
function unitOf(seed: number, i: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ seed;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/* ---- The whale fall ---- */

const BONE = '#DCD2BC';

type Pt = [number, number];

/** A scratch canvas, or null where there is no document. */
function scratch(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Points along a cubic, from t0 to t1. */
function along(p: number[], t0: number, t1: number, m: number): number[] {
  const out: number[] = [];
  for (let k = 0; k <= m; k++) out.push(...cubic(p, t0 + ((t1 - t0) * k) / m));
  return out;
}

/** Normals down a polyline, unit length, turned left of travel. */
function normals(cl: number[]): number[] {
  const n = cl.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = cl[b * 2] - cl[a * 2];
    const dy = cl[b * 2 + 1] - cl[a * 2 + 1];
    const d = Math.hypot(dx, dy) || 1;
    out.push(-dy / d, dx / d);
  }
  return out;
}

interface Bones {
  ctx: CanvasRenderingContext2D;
  dark: boolean;
  px: number;
  d: number;
  ink: string;
  wash: string;
  pale: string;
  /** The light in the drawing's own frame (it may be mirrored). */
  light: [number, number];
  seed: number;
}

/**
 * A long bone round a centre line: a ribbon `w0` wide at its root and `w1`
 * at its end, with knuckled, rounded ends; washed, shaded in short strokes
 * round its shadowed side, and outlined in the pen. Returns the outline.
 */
function bone(b: Bones, cl: number[], w0: number, w1: number, salt: number): number[] {
  const { ctx, px, d, ink, light } = b;
  const n = cl.length / 2;
  if (n < 2) return [];
  const nm = normals(cl);
  const r = mulberry32(hash32('bone', b.seed, salt));
  const width = (i: number) => {
    const t = i / (n - 1);
    // A knuckle at each end, the shaft between them a little irregular.
    const knob = 1 + 0.35 * Math.exp(-t * 14) + 0.08 * Math.exp(-(1 - t) * 14);
    // Broadest a little past the root, as a rib is, and never a pipe.
    const belly = 1 + 0.25 * Math.sin(Math.min(1, t * 1.6) * Math.PI);
    return (w0 + (w1 - w0) * t) * knob * belly * (1 + (r() - 0.5) * 0.12);
  };
  const ws: number[] = [];
  for (let i = 0; i < n; i++) ws.push(width(i));
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = ws[i] / 2;
    left.push(cl[i * 2] + nm[i * 2] * h, cl[i * 2 + 1] + nm[i * 2 + 1] * h);
    right.push(cl[i * 2] - nm[i * 2] * h, cl[i * 2 + 1] - nm[i * 2 + 1] * h);
  }
  // Round the ends: a few points round each cap, out past the end.
  const cap = (i: number, sgn: number) => {
    const out: number[] = [];
    const nx = nm[i * 2];
    const ny = nm[i * 2 + 1];
    // Travel along the bone, turned outward at the start.
    const tx = ny * sgn;
    const ty = -nx * sgn;
    const h = ws[i] / 2;
    for (const th of [0.5, 1, 1.5, 2, 2.5]) {
      const ang = (th / 3) * Math.PI;
      const c = Math.cos(ang) * sgn;
      out.push(cl[i * 2] + nx * h * c + tx * h * 0.8 * Math.sin(ang), cl[i * 2 + 1] + ny * h * c + ty * h * 0.8 * Math.sin(ang));
    }
    return out;
  };
  const poly: number[] = [...left, ...cap(n - 1, 1)];
  for (let i = n - 1; i >= 0; i--) poly.push(right[i * 2], right[i * 2 + 1]);
  poly.push(...cap(0, -1));
  const path = new Path2D();
  path.moveTo(poly[0], poly[1]);
  for (let i = 2; i < poly.length; i += 2) path.lineTo(poly[i], poly[i + 1]);
  path.closePath();
  ctx.fillStyle = b.wash;
  ctx.globalAlpha = 1;
  ctx.fill(path);
  // Round its shadowed side: strokes across the bone from its middle out,
  // the way an engraver turns a cylinder.
  const step = Math.max(1.3 * px, (w0 + w1) * 0.16);
  const strokes = new Path2D();
  let acc = 0;
  for (let i = 1; i < n; i++) {
    acc += Math.hypot(cl[i * 2] - cl[i * 2 - 2], cl[i * 2 + 1] - cl[i * 2 - 1]);
    if (acc < step) continue;
    acc = 0;
    const sx = nm[i * 2];
    const sy = nm[i * 2 + 1];
    const sgn = sx * light[0] + sy * light[1] >= 0 ? 1 : -1;
    const h = ws[i] / 2;
    const reach = 0.92 - (d > 0.4 ? 0 : 0.2) - r() * 0.15;
    strokes.moveTo(cl[i * 2] + sx * sgn * h * 0.05, cl[i * 2 + 1] + sy * sgn * h * 0.05);
    strokes.lineTo(cl[i * 2] + sx * sgn * h * reach, cl[i * 2 + 1] + sy * sgn * h * reach);
  }
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(0.4 * px, Math.min(w0, w1) * 0.08);
  ctx.stroke(strokes);
  ctx.globalAlpha = 1;
  // The edge where its flat face turns, a fine line down the lit side.
  if (n > 4 && d > 0.2) {
    const ridge: number[] = [];
    const lsg = nm[2] * light[0] + nm[3] * light[1] >= 0 ? -1 : 1;
    for (let i = 1; i < n - 1; i++) ridge.push(cl[i * 2] + nm[i * 2] * lsg * ws[i] * 0.22, cl[i * 2 + 1] + nm[i * 2 + 1] * lsg * ws[i] * 0.22);
    inkLine(ctx, ridge, false, { width: Math.max(0.35 * px, (w0 + w1) * 0.03), color: ink, alpha: 0.4, seed: hash32(b.seed, salt, 'r'), light, taper: [0.25, 0.35], raw: true, plate: true, min: 0.3 * px });
  }
  inkLine(ctx, poly, true, { width: Math.max(0.6 * px, (w0 + w1) * 0.05), color: ink, alpha: 0.85, seed: hash32(b.seed, salt), light, raw: true, plate: true, min: 0.3 * px });
  return poly;
}

/** A lumpy closed blob round (x, y), `a` by `b`, its corners squared a little. */
function lump(x: number, y: number, a: number, bb: number, rot: number, r: () => number, square = 0.6, k = 18): number[] {
  const pts: number[] = [];
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  for (let i = 0; i < k; i++) {
    const t = (i / k) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const u = Math.sign(c) * Math.pow(Math.abs(c), square) * a * (0.94 + r() * 0.12);
    const v = Math.sign(s) * Math.pow(Math.abs(s), square) * bb * (0.94 + r() * 0.12);
    pts.push(x + u * cs - v * sn, y + u * sn + v * cs);
  }
  return pts;
}

/** A shape's outline washed, shaded in contour lines away from the light, stippled big, and inked. */
function mass(b: Bones, pts: number[], o: { angle: number; bow: number; spacing: number; from?: number; cross?: number; stip?: boolean; wash?: string; salt: number }): Path2D {
  const { ctx, px, d, ink, light } = b;
  const path = smoothPath(pts, true, 4);
  const box = boundsOf(pts);
  ctx.globalAlpha = 1;
  ctx.fillStyle = o.wash ?? b.wash;
  ctx.fill(path);
  const across = shadeAcross(box, light);
  hatch(ctx, path, box, {
    spacing: Math.max(1.3 * px, o.spacing),
    angle: o.angle,
    bow: o.bow,
    shade: across,
    from: o.from ?? 0.5,
    // Crossed only in the deepest shadow, and only in dark ink: a light ink
    // crossed over a lit side reads as a grid.
    cross: d > 0.4 && !b.dark ? o.cross ?? 0.8 : undefined,
    color: ink,
    width: Math.max(0.4 * px, o.spacing * 0.22),
    alpha: 0.55,
    seed: hash32(b.seed, o.salt),
  });
  if (o.stip && d > 0.25) {
    stipple(ctx, path, box, { spacing: Math.max(1.2 * px, o.spacing * 0.6), radius: Math.max(0.3 * px, o.spacing * 0.09), shade: across, from: 0.3, color: ink, alpha: 0.4, seed: hash32(b.seed, o.salt, 's') });
  }
  inkLine(ctx, pts, true, { width: Math.max(0.6 * px, o.spacing * 0.35), color: ink, alpha: 0.9, seed: hash32(b.seed, o.salt, 'i'), light, plate: true, min: 0.3 * px });
  return path;
}

function boundsOf(pts: number[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

interface Fall {
  key: string;
  canvas: HTMLCanvasElement | null;
  /** Where the canvas sits relative to the skull's tip on the floor line, page px. */
  x0: number;
  y0: number;
  /** The top of the bones at x (in the drawing's own frame, skull at 0, tail at +L). */
  tops: Pt[];
}

let falls: Fall[] = [];

/** The top of the bones at x, read off the tops laid down with them. */
function topOf(tops: Pt[], x: number): number {
  if (!tops.length) return 0;
  let best = tops[0];
  for (const t of tops) if (Math.abs(t[0] - x) < Math.abs(best[0] - x)) best = t;
  return best[1];
}

/** How much the floor is foreshortened: we look down on it at about 20°. */
const FORE = 0.35;

/**
 * The bones, in the drawing's own frame: the skull's tip at the origin on
 * the floor line, the tail along +x. Seen a little from above, as a plate
 * shows a skeleton lying where it fell: the spine a long gentle curve of
 * separate blocks, shrinking to the tail and sinking into the silt as they
 * go; the ribs in pairs either side of it, arcs lying splayed on the floor
 * (the far ones behind the spine, the near ones toward the reader), some of
 * the far ones still arched up off it, some snapped with the piece lying by;
 * the skull a broad flat wedge, its two long jaws bowed out either side.
 *
 * A point on the floor is (X along the whale, Z toward the reader, H up),
 * all in shares of L, and lands on the page at (X, Z · FORE − H).
 */
function paintBones(ctx: CanvasRenderingContext2D, L: number, seed: number, px: number, dark: boolean, dir: number, tops: Pt[], siltColor?: string): void {
  const r = mulberry32(hash32('whale-bones', seed));
  const d = detailFor(L * 0.35);
  const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
  const wash = dark ? mixHex(BONE, '#110F0D', 0.5) : mixHex(BONE, '#FBF8EF', 0.25);
  const pale = dark ? mixHex(BONE, '#110F0D', 0.3) : mixHex(BONE, '#FBF8EF', 0.55);
  const shade = dark ? mixHex(BONE, '#110F0D', 0.68) : mixHex(BONE, '#2A2320', 0.3);
  const lightBase: [number, number] = dark ? [-LIGHT[0], -LIGHT[1]] : LIGHT;
  const light: [number, number] = [lightBase[0] * dir, lightBase[1]];
  const b: Bones = { ctx, dark, px, d, ink, wash, pale, light, seed };
  // Without the floor's own colour, a mid silt that reads on any floor.
  const silt = siltColor ?? (dark ? '#2B2824' : '#4A5250');
  const crest = dark ? mixHex(silt, '#8C8576', 0.35) : mixHex(silt, '#C9C3B4', 0.3);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const P = (X: number, Z: number, H: number): Pt => [X * L, (Z * FORE - H) * L];
  // A cubic on the floor, as its control points land on the page.
  const C = (pts: [number, number, number][]): number[] => pts.flatMap(([X, Z, H]) => P(X, Z, H));

  // The spine's line on the floor: a long gentle S, from behind the skull
  // to the tail.
  const X0 = 0.275;
  const X1 = 0.975;
  // It lies just in front of the floor's line, so the far ribs reach back
  // to about the line and the near ones come forward over the floor.
  const bend = 0.055 + r() * 0.02;
  const ph0 = (r() - 0.5) * 0.6;
  const zs = (X: number) => {
    const u = (X - X0) / (X1 - X0);
    return 0.05 + bend * (Math.sin(Math.PI * 1.15 * u + ph0) - Math.sin(ph0) - 0.3);
  };
  const slope = (X: number) => (zs(X + 0.005) - zs(X - 0.005)) / 0.01;
  const ZS = zs(X0);

  // The scour under it, darker than the floor round it, fading every way.
  ctx.save();
  ctx.translate(0.5 * L, ZS * FORE * L);
  ctx.scale(1, 0.12);
  const scour = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.58 * L);
  const sh = dark ? '4, 4, 3' : '26, 23, 20';
  scour.addColorStop(0, `rgba(${sh}, ${dark ? 0.3 : 0.16})`);
  scour.addColorStop(0.7, `rgba(${sh}, ${dark ? 0.16 : 0.08})`);
  scour.addColorStop(1, `rgba(${sh}, 0)`);
  ctx.fillStyle = scour;
  ctx.beginPath();
  ctx.arc(0, 0, 0.58 * L, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The vertebrae: seventeen blocks, closing up and shrinking to the tail,
  // each a little apart from the next, sinking deeper toward the tail.
  const N = 17;
  interface Vert { X: number; Z: number; hv: number; len: number; sink: number; rot: number; gone: boolean }
  const verts: Vert[] = [];
  let X = X0 + 0.012;
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    const step = 0.052 * (1 - 0.55 * t);
    const hv = 0.036 * Math.pow(1 - t, 0.7) + 0.008;
    // One or two knocked a little off the line.
    const knocked = k > 3 && r() < 0.12;
    const Z = zs(X) + (knocked ? (r() - 0.3) * 0.03 : 0);
    verts.push({ X: X + (knocked ? (r() - 0.5) * 0.01 : 0), Z, hv, len: step * 0.74, sink: hv * (0.15 + 0.45 * t), rot: (r() - 0.5) * (knocked ? 0.5 : 0.1), gone: k > 5 && k < N - 2 && r() < 0.06 });
    X += step;
  }
  // Where a vertebra's middle lands on the page, and the spine's angle there.
  const at = (v: Vert): Pt => P(v.X, v.Z, v.hv / 2 - v.sink);
  const angleAt = (v: Vert) => Math.atan2(slope(v.X) * FORE, 1) + v.rot;

  // The ribs, ten pairs off the first ten vertebrae. On each side one arc
  // out from the spine and swept back toward the tail, lying on the floor;
  // a few of the far ones still arched up off it; some snapped, the piece
  // lying beside; one or two gone.
  const ribs = (near: boolean) => {
    const q = mulberry32(hash32('ribs', seed, near ? 1 : 0));
    const side = near ? 1 : -1;
    for (let i = 0; i < 10; i++) {
      const v = verts[i + 1];
      const missing = q() < 0.1;
      const fate = q();
      const snap = q();
      const where = q();
      const sway = (q() - 0.5) * 0.25;
      if (v.gone || missing) continue;
      const length = (0.08 + 0.05 * Math.sin((Math.PI * (i + 1)) / 11)) * (0.92 + where * 0.16);
      // Across the spine and back along it, in the floor's plane.
      const s = slope(v.X);
      const nn = Math.hypot(s, 1);
      const nx = (-s / nn) * side;
      const nz = (1 / nn) * side;
      const tx = 1 / nn;
      const tz = s / nn;
      const stand = !near && fate < 0.22 ? 1 : 0;
      const sweep = 0.55 + sway;
      const out = (u: number, w: number): [number, number] => [v.X + nx * u + tx * w, v.Z + nz * u + tz * w];
      const h0 = v.hv * 0.7 - v.sink;
      const pts: [number, number, number][] = stand
        ? [
            [...out(0.012, 0), h0],
            [...out(length * 0.3, -length * 0.02), 0.06],
            [...out(length * 0.85, length * sweep * 0.4), 0.05],
            [...out(length * 0.9, length * sweep), 0.008],
          ]
        : [
            [...out(0.012, 0), h0],
            [...out(length * 0.5, -length * 0.03), h0 * 0.5 + 0.006],
            [...out(length * 0.98, length * sweep * 0.4), 0.003],
            [...out(length * 0.9, length * sweep), 0],
          ];
      const cp = C(pts);
      const broken = snap < (stand ? 0.6 : 0.3);
      const end = broken ? 0.45 + q() * 0.3 : 1;
      const w0 = L * 0.0085 * (1 - i / 26);
      const w1 = w0 * 0.42;
      bone(b, along(cp, 0, end, 16), w0, broken ? w0 * 0.7 : w1, i * 2 + (near ? 101 : 1));
      if (stand && !broken) tops.push(cubic(cp, 0.45));
      if (broken) {
        // The piece that fell, lying on the floor just past the break.
        const [ex, ez] = out(length * (0.6 + end * 0.35), length * sweep * end + 0.015);
        const fa = (q() - 0.5) * 1.2 + Math.atan2(nz, nx);
        const fl = length * (1 - end) * (0.8 + q() * 0.3);
        const frag = C([
          [ex, ez, 0.002],
          [ex + Math.cos(fa) * fl * 0.33, ez + Math.sin(fa) * fl * 0.33, 0.004],
          [ex + Math.cos(fa) * fl * 0.66 + 0.006, ez + Math.sin(fa) * fl * 0.66, 0.003],
          [ex + Math.cos(fa) * fl + 0.01, ez + Math.sin(fa) * fl, 0],
        ]);
        bone(b, along(frag, 0, 1, 8), w0 * 0.65, w1, i * 2 + (near ? 151 : 51));
      }
    }
  };

  // The skull, a broad flat wedge seen from above and the near side: its top
  // a long triangle of rostrum running out to the tip, wide at the back
  // where the braincase is; its near wall below that edge; the far jaw
  // lying bowed out behind it, the near jaw in front.
  const skullTop: [number, number, number][] = [
    [0, 0, 0.008], [0.05, 0.021, 0.013], [0.11, 0.035, 0.02], [0.165, 0.05, 0.027], [0.205, 0.07, 0.032], [0.232, 0.062, 0.036], [0.258, 0.034, 0.04], [0.27, 0, 0.042],
    [0.258, -0.034, 0.04], [0.232, -0.062, 0.036], [0.205, -0.07, 0.032], [0.165, -0.05, 0.027], [0.11, -0.035, 0.02], [0.05, -0.021, 0.013],
  ];
  const onSkull = (X: number, Z: number, H: number) => P(X, ZS + Z, H);
  const farJaw = C([[0.252, ZS - 0.082, 0.004], [0.19, ZS - 0.135, 0.004], [0.07, ZS - 0.1, 0.003], [0.008, ZS - 0.03, 0.002]]);
  const nearJaw = C([[0.256, ZS + 0.08, 0.004], [0.19, ZS + 0.14, 0.004], [0.07, ZS + 0.11, 0.003], [0.006, ZS + 0.035, 0.002]]);
  const paintSkull = () => {
    // The near wall: from the top's near edge down into the silt.
    const nearEdge = skullTop.slice(0, 8);
    const wall: number[] = [];
    for (const [Xs, Zk, H] of nearEdge) wall.push(...onSkull(Xs, Zk, H));
    for (let i = nearEdge.length - 1; i >= 0; i--) {
      const [Xs, Zk] = nearEdge[i];
      wall.push(...onSkull(Xs, Zk, -0.006));
    }
    mass(b, wall, { angle: Math.PI / 2 - 0.2, bow: 0.4, spacing: L * 0.0042, from: 0.3, cross: 0.7, wash: shade, salt: 9002 });
    // The top: pale, lit, shaded only toward its far edge.
    const top: number[] = [];
    for (const [Xs, Zk, H] of skullTop) top.push(...onSkull(Xs, Zk, H));
    mass(b, top, { angle: -0.08, bow: 0.4, spacing: L * 0.0045, from: 0.55, wash: pale, stip: true, salt: 9001 });
    // The ridge down the rostrum's middle, the nasal opening, and the
    // occipital shield's edge.
    const mid: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const Xs = 0.02 + (i / 8) * 0.17;
      mid.push(...onSkull(Xs, 0, 0.009 + 0.024 * (Xs / 0.19) + 0.002));
    }
    inkLine(ctx, mid, false, { width: Math.max(0.5 * px, L * 0.0012), color: ink, alpha: 0.55, seed: seed ^ 0x72, light, taper: [0.3, 0.2], plate: true });
    const nasal = lump(...onSkull(0.178, 0, 0.031), 0.012 * L, 0.004 * L, 0, r, 0.8, 12);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = mixHex(wash, dark ? '#000000' : '#2A2320', 0.55);
    ctx.fill(smoothPath(nasal, true, 4));
    ctx.globalAlpha = 1;
    inkLine(ctx, nasal, true, { width: Math.max(0.5 * px, L * 0.0011), color: ink, alpha: 0.7, seed: seed ^ 0x71, light, plate: true });
    const shield = [...onSkull(0.2, -0.05, 0.034), ...onSkull(0.212, 0, 0.037), ...onSkull(0.2, 0.05, 0.034)];
    inkLine(ctx, shield, false, { width: Math.max(0.5 * px, L * 0.0013), color: ink, alpha: 0.6, seed: seed ^ 0x73, light, taper: [0.2, 0.2], plate: true });
    // The near orbit: a hollow in shadow under the back corner, not a dark disc.
    const orbit = lump(...onSkull(0.212, 0.07, 0.016), 0.014 * L, 0.0075 * L, 0.1, r, 0.8, 14);
    const orbitPath = smoothPath(orbit, true, 4);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = mixHex(wash, dark ? '#000000' : '#2A2320', 0.5);
    ctx.fill(orbitPath);
    ctx.globalAlpha = 1;
    const ob = boundsOf(orbit);
    hatch(ctx, orbitPath, ob, { spacing: Math.max(1.2 * px, L * 0.0022), angle: 0.9, shade: (_x, y) => 0.5 + 0.5 * ((y - ob.y) / ob.h), from: 0.3, cross: 0.7, color: ink, width: Math.max(0.4 * px, L * 0.0006), alpha: 0.6, seed: seed ^ 0x0b });
    inkLine(ctx, orbit.slice(0, 16), false, { width: Math.max(0.5 * px, L * 0.0013), color: ink, alpha: 0.7, seed: seed ^ 0x0c, light, taper: [0.2, 0.3], plate: true });
    tops.push(onSkull(0.06, 0, 0.012), onSkull(0.12, 0, 0.022), onSkull(0.18, 0, 0.032), onSkull(0.24, 0, 0.04));
  };

  // A vertebra: the far process, the drum with its end face turned to the
  // skull, its neural spine leaning back, the near process.
  const vertebra = (v: Vert, k: number) => {
    const [x, y] = at(v);
    const a = (v.len / 2) * L;
    const bb = (v.hv / 2) * L;
    const rot = angleAt(v);
    const t = k / (N - 1);
    // Processes either side only on the lumbar vertebrae: on the ribbed ones
    // the ribs stand for them, and the tail's have none.
    const proc = k > 10 && t < 0.85;
    const spine = t < 0.85;
    const salt = 300 + k * 17;
    if (proc) {
      bone(b, [x - a * 0.1, y - bb * 0.2, x - a * 0.05, y - bb * 0.7, x + a * 0.05, y - bb * 1.2], a * 0.42, a * 0.22, salt + 3);
    }
    const body = lump(x, y, a, bb, rot, r, 0.45, 18);
    mass(b, body, { angle: Math.PI / 2 - 0.1 + rot, bow: 0.5, spacing: Math.max(1.3 * px, bb * 0.2), from: 0.45, cross: 0.8, salt: salt + 5 });
    // The end face, a disc of spongy bone turned toward the skull.
    const ex = x - Math.cos(rot) * a * 0.8;
    const ey = y - Math.sin(rot) * a * 0.8;
    const face = lump(ex, ey, a * 0.24, bb * 0.88, rot, r, 1, 14);
    const facePath = smoothPath(face, true, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = pale;
    ctx.fill(facePath);
    if (d > 0.3) stipple(ctx, facePath, boundsOf(face), { spacing: Math.max(1.2 * px, bb * 0.12), radius: Math.max(0.3 * px, bb * 0.02), shade: () => 0.55, from: 0.2, color: ink, alpha: 0.35, seed: hash32(seed, salt, 'f') });
    inkLine(ctx, face, true, { width: Math.max(0.5 * px, bb * 0.05), color: ink, alpha: 0.75, seed: hash32(seed, salt, 'fi'), light, plate: true });
    if (spine) {
      const lean = 0.5 + r() * 0.3 + rot;
      const len = bb * 1.45 * (0.9 + r() * 0.3) * (1 - t * 0.6) * (r() < 0.2 ? 0.45 : 1);
      const sx = x + a * 0.05;
      const sy = y - bb * 0.85;
      const tx = sx + Math.sin(lean) * len;
      const ty = sy - Math.cos(lean) * len;
      bone(b, [sx, sy, (sx + tx) / 2 - len * 0.05, (sy + ty) / 2, tx, ty], a * 0.42, a * 0.22, salt + 7);
      tops.push([tx, ty]);
    }
    if (proc) bone(b, [x + a * 0.05, y + bb * 0.3, x + a * 0.12, y + bb * 0.7, x + a * 0.2, y + bb * 1.05], a * 0.42, a * 0.24, salt + 9);
    tops.push([x, y - bb]);
  };

  // Back to front: the far jaw and the far ribs, the skull, the spine, the
  // silt heaped along the spine's near side, then the near ribs and jaw.
  bone(b, along(farJaw, 0, 1, 24), L * 0.009, L * 0.006, 9201);
  ribs(false);
  paintSkull();
  verts.forEach((v, k) => {
    if (!v.gone) vertebra(v, k);
  });

  // The shoulder blade, fallen flat on the near side behind the skull: a fan.
  const sc = mulberry32(hash32('scapula', seed));
  const scapF: [number, number][] = [[0.27, 0.035], [0.285, 0.05], [0.31, 0.075], [0.338, 0.085], [0.36, 0.075], [0.362, 0.05], [0.34, 0.04], [0.3, 0.032]];
  const scap: number[] = [];
  for (const [Xs, Zs] of scapF) scap.push(...P(Xs + (sc() - 0.5) * 0.003, ZS + Zs + (sc() - 0.5) * 0.004, 0.003));

  // The silt heaped along the spine's near side, so the bones sink into it
  // rather than sit on it: a ragged bank, thicker toward the tail, with
  // grains on it and a lit crest.
  const hp = mulberry32(hash32('silt-heap', seed));
  const heap: number[] = [];
  const depthOf: number[] = [];
  const M = 60;
  const p1 = hp() * 6.28;
  const p2 = hp() * 6.28;
  const hvAt = (Xq: number) => 0.036 * Math.pow(1 - Math.min(1, Math.max(0, (Xq - X0) / (X1 - X0))), 0.7) + 0.008;
  for (let i = 0; i <= M; i++) {
    const u = (i / M);
    const Xq = X0 - 0.01 + u * (X1 - X0 + 0.04);
    const bump = 0.003 + 0.003 * Math.max(0, Math.sin(u * 23 + p1)) + 0.002 * Math.max(0, Math.sin(u * 61 + p2)) + 0.006 * u + hp() * 0.002;
    const edge = Math.min(1, u / 0.06, (1 - u) / 0.2);
    const base = zs(Xq) * FORE + hvAt(Xq) * 0.5 + 0.004;
    heap.push(Xq * L, (base - bump * Math.max(0, edge)) * L);
    depthOf.push(0.022 * L * Math.max(0.1, edge));
  }
  const heapPath = new Path2D();
  heapPath.moveTo(heap[0], heap[1]);
  for (let i = 2; i < heap.length; i += 2) heapPath.lineTo(heap[i], heap[i + 1]);
  for (let i = heap.length - 2; i >= 0; i -= 2) heapPath.lineTo(heap[i], heap[i + 1] + depthOf[i / 2]);
  heapPath.closePath();
  const hbox = boundsOf(heap);
  hbox.h += 0.022 * L;
  const fill = ctx.createLinearGradient(0, hbox.y, 0, hbox.y + hbox.h);
  fill.addColorStop(0, mixHex(silt, crest, 0.5));
  fill.addColorStop(0.45, silt);
  fill.addColorStop(1, `${silt}00`);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = fill;
  ctx.fill(heapPath);
  ctx.globalAlpha = 1;
  stipple(ctx, heapPath, hbox, { spacing: Math.max(1.3 * px, L * 0.0025), radius: Math.max(0.3 * px, L * 0.0005), shade: (_x, y) => Math.max(0, 0.75 - (y - hbox.y) / hbox.h), from: 0.25, color: crest, alpha: 0.6, seed: seed ^ 0x51 });
  inkLine(ctx, heap, false, { width: Math.max(0.5 * px, L * 0.0012), color: dark ? IRON_GALL.dark : crest, alpha: dark ? 0.35 : 0.7, seed: seed ^ 0x52, light, taper: [0.05, 0.05], plate: true, min: 0.3 * px });

  mass(b, scap, { angle: -1.1, bow: 0.6, spacing: L * 0.004, from: 0.45, stip: true, salt: 9100 });
  inkLine(ctx, [...P(0.285, ZS + 0.04, 0.004), ...P(0.31, ZS + 0.06, 0.004), ...P(0.335, ZS + 0.078, 0.004)], false, { width: Math.max(0.6 * px, L * 0.0016), color: ink, alpha: 0.65, seed: seed ^ 0x5c, light, plate: true });
  ribs(true);
  bone(b, along(nearJaw, 0, 1, 24), L * 0.0105, L * 0.007, 9200);
  // The flipper's small bones, scattered in front of the shoulder.
  const fl = mulberry32(hash32('flipper', seed));
  for (let i = 0; i < 6; i++) {
    const [fx, fy] = P(0.33 + fl() * 0.1, ZS + 0.09 + fl() * 0.04, 0.002);
    const fa = (fl() - 0.5) * 1.2;
    const fl0 = (0.008 + fl() * 0.008) * L;
    bone(b, [fx, fy, fx + Math.cos(fa) * fl0 * 0.5, fy + Math.sin(fa) * fl0 * 0.5, fx + Math.cos(fa) * fl0, fy + Math.sin(fa) * fl0], L * 0.004, L * 0.003, 9300 + i);
  }

  // And drifts of it over the bones lying on the near floor, so they go
  // under and come out again.
  const dr = mulberry32(hash32('drifts', seed));
  for (let i = 0; i < 14; i++) {
    const Xd = 0.04 + dr() * 0.85;
    const x = Xd * L;
    const y = (zs(Math.max(X0, Xd)) * FORE + 0.02 + dr() * 0.03) * L;
    const hw = (0.012 + dr() * 0.022) * L;
    const hh = (0.003 + dr() * 0.003) * L;
    const pts: number[] = [];
    for (let k = 0; k <= 10; k++) {
      const u = -1 + (k / 10) * 2;
      pts.push(x + u * hw, y - hh * Math.pow(1 - u * u, 0.8) * (0.85 + dr() * 0.3));
    }
    const drift = new Path2D();
    drift.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) drift.lineTo(pts[k], pts[k + 1]);
    drift.lineTo(x + hw, y + hh * 0.8);
    drift.lineTo(x - hw, y + hh * 0.8);
    drift.closePath();
    const g = ctx.createLinearGradient(0, y - hh, 0, y + hh * 0.8);
    g.addColorStop(0, mixHex(silt, crest, 0.45));
    g.addColorStop(0.55, silt);
    g.addColorStop(1, `${silt}00`);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.95;
    ctx.fill(drift);
    ctx.globalAlpha = 1;
    stipple(ctx, drift, { x: x - hw, y: y - hh, w: hw * 2, h: hh * 2 }, { spacing: Math.max(1.3 * px, L * 0.0025), radius: Math.max(0.3 * px, L * 0.0005), shade: () => 0.55, from: 0.2, color: crest, alpha: 0.5, seed: hash32(seed, 'drift', i) });
    inkLine(ctx, pts, false, { width: Math.max(0.4 * px, L * 0.001), color: dark ? IRON_GALL.dark : crest, alpha: dark ? 0.3 : 0.6, seed: hash32(seed, 'dl', i), light, taper: [0.3, 0.3], plate: true, min: 0.3 * px });
  }

  // The bacterial mat: a pale bloom of fine dots over the tops of the bones.
  const mat = new Path2D();
  const mr = mulberry32(hash32('mat', seed));
  for (let i = 0; i < 260; i++) {
    const t = tops[Math.floor(mr() * tops.length)];
    if (!t) break;
    const x = t[0] + (mr() - 0.5) * 0.012 * L;
    const y = t[1] + mr() * 0.008 * L;
    const rad = Math.max(0.35 * px, L * (0.0004 + mr() * 0.0006));
    mat.moveTo(x + rad, y);
    mat.arc(x, y, rad, 0, Math.PI * 2);
  }
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = dark ? '#E6EBD6' : '#F2F0E2';
  ctx.fill(mat);
  ctx.globalAlpha = 1;
}

/**
 * A whale's skeleton on the floor, long since picked clean and now a reef
 * of its own: the skull at one end with its jaw beside it, the spine running
 * away smaller to the tail, ribs standing up off it at all angles, some
 * snapped with the rest lying under them, many fallen flat, all a little
 * sunk in the silt heaped round them. A pale mat of bacteria on the bones,
 * a few small tufts of bone worms, and squat lobsters and crabs picking
 * their way along it. It comes in over its arrival and then only the small
 * life moves; the bones are drawn once and placed.
 */
export function drawWhaleFall(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  appear: number,
  seed: number,
  px: number,
  ambient: number,
  dark: boolean,
  floorY: number,
  /** The floor's own colour at its line, for the silt heaped round the bones. */
  siltColor?: string,
): void {
  const a = 0.85 * smooth(appear);
  if (a <= 0) return;
  void h;
  // The layout comes from the seed afresh each frame, so it never shifts.
  const rand = mulberry32(seed ^ 0x3a1ef);
  const L = w * 0.45;
  const dir = rand() < 0.5 ? -1 : 1;
  const cx = w * (0.375 + rand() * 0.25);
  const tipX = cx - (dir * L) / 2;

  const key = `${Math.round(L)}|${seed}|${px}|${dark ? 1 : 0}|${siltColor ?? ''}`;
  let fall = falls.find((f) => f.key === key);
  if (!fall) {
    // The canvas spans the bones from a little before the skull to a little
    // past the tail, and from above the tallest rib to into the near silt.
    const left = -0.07 * L;
    const right = 1.08 * L;
    const top = -0.15 * L;
    const bottom = 0.085 * L;
    const canvas = scratch(right - left, bottom - top);
    const g = canvas?.getContext('2d');
    const tops: Pt[] = [];
    const x0 = dir > 0 ? left : -right;
    if (canvas && g) {
      g.translate(-x0, -top);
      g.scale(dir, 1);
      paintBones(g, L, seed, px, dark, dir, tops, siltColor);
    }
    fall = { key, canvas: canvas && g ? canvas : null, x0, y0: top, tops };
    falls = [fall, ...falls].slice(0, 2);
  }

  ctx.save();
  if (fall.canvas) {
    ctx.globalAlpha *= a;
    ctx.drawImage(fall.canvas, tipX + fall.x0, floorY + fall.y0);
  } else {
    // No canvas to keep them on: draw them in place.
    ctx.translate(tipX, floorY);
    ctx.scale(dir, 1);
    ctx.globalAlpha *= a;
    const tops: Pt[] = [];
    paintBones(ctx, L, seed, px, dark, dir, tops, siltColor);
    fall.tops = tops;
  }
  ctx.restore();

  // The living part arrives last, once the bones are there to be on, and
  // stays small: things a few millimetres long on a skeleton of metres.
  const life = a * smooth((appear - 0.6) / 0.4);
  if (life <= 0) return;
  const tops = fall.tops;
  ctx.save();
  ctx.translate(tipX, floorY);
  ctx.scale(dir, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
  const r2 = mulberry32(seed ^ 0x0ed);
  // Bone worms: little rust plumes standing off the bone, swaying.
  const worms = new Path2D();
  for (let i = 0; i < 5; i++) {
    const x = L * (0.06 + r2() * 0.55);
    const y = topOf(tops, x) + 0.5 * px;
    const tall = Math.max(2 * px, L * (0.005 + r2() * 0.004));
    for (let j = 0; j < 5; j++) {
      const lean = (j - 2) * 0.22 + Math.sin(ambient * 0.8 + i * 2 + j) * 0.12;
      worms.moveTo(x + (j - 2) * 0.3 * px, y);
      worms.quadraticCurveTo(x + Math.sin(lean) * tall * 0.3, y - tall * 0.5, x + Math.sin(lean) * tall, y - Math.cos(lean) * tall * (0.8 + 0.2 * (j % 2)));
    }
  }
  ctx.strokeStyle = dark ? '#C9988A' : '#8E4A3A';
  ctx.globalAlpha = life * 0.6;
  ctx.lineWidth = Math.max(0.5 * px, L * 0.0007);
  ctx.stroke(worms);

  // Crabs and squat lobsters, picking along the bones with a hesitant
  // gait: they slow, nearly stop, and go on.
  const shell = dark ? mixHex('#C9A58A', '#110F0D', 0.25) : '#B08A6A';
  const c = Math.max(1.8 * px, L * 0.0042);
  for (let i = 0; i < 4; i++) {
    const home = L * (0.08 + r2() * 0.72);
    const reach = L * (0.03 + r2() * 0.07);
    const speed = 0.04 + r2() * 0.06;
    const ph = r2() * Math.PI * 2;
    const g = ambient * speed + ph;
    const gait = g - Math.sin(g * 6) / 7.5;
    const x = Math.max(0.05 * L, Math.min(0.85 * L, home + reach * Math.sin(gait)));
    const facing = Math.cos(gait) >= 0 ? 1 : -1;
    const y = topOf(tops, x) - c * 0.45;
    const step = Math.sin(gait * 60);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    const legs = new Path2D();
    const body = new Path2D();
    if (i % 2 === 0) {
      // A crab: a broad shell, legs either side, two small claws.
      body.ellipse(0, 0, c, c * 0.6, 0, 0, Math.PI * 2);
      for (let k = 0; k < 3; k++) {
        const lift = (k % 2 ? step : -step) * c * 0.15;
        for (const sd of [-1, 1]) {
          legs.moveTo(sd * c * (0.3 + k * 0.25), c * 0.3);
          legs.quadraticCurveTo(sd * c * (0.7 + k * 0.3), c * 0.2, sd * c * (0.8 + k * 0.35), c * 0.85 + lift);
        }
      }
      legs.moveTo(c * 0.7, -c * 0.2);
      legs.quadraticCurveTo(c * 1.3, -c * 0.7, c * 1.5, -c * 0.25);
    } else {
      // A squat lobster: narrower, its long arms held out ahead.
      body.ellipse(0, 0, c * 1.05, c * 0.42, 0, 0, Math.PI * 2);
      for (let k = 0; k < 3; k++) {
        const lift = (k % 2 ? step : -step) * c * 0.15;
        legs.moveTo(-c * 0.2 + k * c * 0.35, c * 0.3);
        legs.lineTo(-c * 0.5 + k * c * 0.45, c * 0.85 + lift);
      }
      const wave = Math.sin(ambient * 0.7 + i) * c * 0.15;
      legs.moveTo(c * 0.9, -c * 0.1);
      legs.quadraticCurveTo(c * 1.8, -c * 0.4, c * 2.5, -c * 0.45 + wave);
      legs.moveTo(c * 0.9, c * 0.1);
      legs.quadraticCurveTo(c * 1.7, c * 0.1, c * 2.4, c * 0.05 + wave);
    }
    ctx.globalAlpha = life * 0.85;
    ctx.fillStyle = shell;
    ctx.fill(body);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(0.45 * px, c * 0.12);
    ctx.globalAlpha = life * 0.8;
    ctx.stroke(body);
    ctx.stroke(legs);
    ctx.restore();
  }
  ctx.restore();
}
