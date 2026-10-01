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
import { detailFor, hatch, inkLine, LIGHT, shadeAcross, smoothPath, stipple } from './pen';
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

/** A flipper, from its root along angle `a`: a long leaf, fuller on the leading edge. */
function flipper(path: Path2D, x: number, y: number, a: number, len: number, wd: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const P = (u: number, v: number) => [x + c * u - s * v, y + s * u + c * v] as const;
  const p0 = P(0, -wd * 0.45);
  const p1 = P(len * 0.35, -wd * 1.05);
  const p2 = P(len * 0.8, -wd * 0.45);
  const p3 = P(len, 0);
  const p4 = P(len * 0.75, wd * 0.35);
  const p5 = P(len * 0.35, wd * 0.75);
  const p6 = P(0, wd * 0.45);
  path.moveTo(p0[0], p0[1]);
  path.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
  path.bezierCurveTo(p4[0], p4[1], p5[0], p5[1], p6[0], p6[1]);
  path.closePath();
}

/** The scales down a flipper: a line along it and a few ticks across. */
function flipperScales(path: Path2D, x: number, y: number, a: number, len: number, wd: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const X = (u: number, v: number) => x + c * u - s * v;
  const Y = (u: number, v: number) => y + s * u + c * v;
  path.moveTo(X(len * 0.12, -wd * 0.3), Y(len * 0.12, -wd * 0.3));
  path.quadraticCurveTo(X(len * 0.5, -wd * 0.55), Y(len * 0.5, -wd * 0.55), X(len * 0.85, -wd * 0.15), Y(len * 0.85, -wd * 0.15));
  for (let i = 1; i <= 3; i++) {
    const u = len * (0.15 + i * 0.16);
    path.moveTo(X(u, -wd * 0.7), Y(u, -wd * 0.7));
    path.lineTo(X(u - len * 0.03, -wd * 0.25), Y(u - len * 0.03, -wd * 0.25));
  }
}

/**
 * A green turtle comes to look at the jelly. Turtles eat jellyfish, and this
 * one is sizing yours up: it swims in at about the jelly's height, slows to
 * a stop a little way off, holds there with its head turned toward the bell
 * for a few seconds, and then thinks better of it and goes off down and
 * away, turning edge-on as it comes round rather than flipping.
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
  // Big enough to show its scutes' growth rings and its skin's texture: a
  // wallpaper's turtle is, a live screen's is kept just short of it, since
  // it is drawn every frame it is on.
  const d = detailFor(u * 0.8);
  const light = dark ? UNLIGHT : LIGHT;
  // The pen's weight: drawn big, the lines stay fine, as an engraver's do.
  const pw = px * (1 - 0.4 * d);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(poseA.x, poseA.y + bob);
  // Pitched first and mirrored after, so mid-turn it narrows rather than shears.
  ctx.rotate((pitch + headTilt * 0.3) * Math.sign(dir * face));
  ctx.scale(dir * face, 1);
  const alpha = env * 0.95;

  // Front flippers beat together, slow and deep while it swims, a gentle
  // scull while it hangs there.
  const amp = 0.15 + 0.45 * effort;
  const beat = Math.sin(ambient * 1.15 + (seed % 11));
  const front = 2.85 + beat * amp;
  const frontFar = 2.85 + Math.sin(ambient * 1.15 + (seed % 11) - 0.35) * amp;
  const rear = Math.PI - 0.25 + Math.sin(ambient * 0.8) * 0.12;

  // The far side first, fainter, behind the shell.
  const far = new Path2D();
  flipper(far, 0.12 * u, 0.02 * u, frontFar, 0.38 * u, 0.07 * u);
  flipper(far, -0.27 * u, 0.03 * u, rear - 0.15, 0.12 * u, 0.045 * u);
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = c.skin;
  ctx.fill(far);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1 * pw;
  ctx.stroke(far);

  // Neck and head, before the shell, so the shell's lip sits over the neck.
  ctx.save();
  ctx.translate(0.22 * u, 0);
  ctx.rotate(headTilt * 0.7);
  ctx.translate(-0.22 * u, 0);
  const head = new Path2D();
  // A short thick neck and a big blunt head: a turtle's, not a snake's.
  head.moveTo(0.2 * u, -0.05 * u);
  head.lineTo(0.3 * u, -0.052 * u);
  head.bezierCurveTo(0.33 * u, -0.088 * u, 0.44 * u, -0.09 * u, 0.48 * u, -0.035 * u);
  head.quadraticCurveTo(0.5 * u, 0.0, 0.476 * u, 0.02 * u);
  head.bezierCurveTo(0.44 * u, 0.05 * u, 0.37 * u, 0.058 * u, 0.32 * u, 0.048 * u);
  head.lineTo(0.2 * u, 0.068 * u);
  head.closePath();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = c.skin;
  ctx.fill(head);
  if (d > 0.4) {
    stipple(ctx, head, { x: 0.2 * u, y: -0.09 * u, w: 0.3 * u, h: 0.16 * u }, {
      spacing: 1.5 * px,
      radius: 0.33 * px,
      shade: shadeAcross({ x: 0.2 * u, y: -0.09 * u, w: 0.3 * u, h: 0.16 * u }, light),
      from: 0.35,
      color: c.ink,
      alpha: alpha * 0.55,
      seed: seed ^ 0x4ead,
    });
  }
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.2 * pw;
  ctx.stroke(head);
  // The plates on its head, the cheek scale, the line of the beak, the
  // neck's crease. The beak's line runs back straight from the tip and
  // turns a little down at its corner: a turtle's mouth never smiles.
  const marks = new Path2D();
  marks.moveTo(0.35 * u, -0.074 * u);
  marks.lineTo(0.375 * u, -0.054 * u);
  marks.lineTo(0.45 * u, -0.06 * u);
  marks.moveTo(0.372 * u, -0.012 * u);
  marks.lineTo(0.392 * u, -0.008 * u);
  marks.lineTo(0.398 * u, 0.012 * u);
  marks.moveTo(0.48 * u, 0.008 * u);
  marks.lineTo(0.44 * u, 0.014 * u);
  marks.quadraticCurveTo(0.426 * u, 0.016 * u, 0.418 * u, 0.026 * u);
  marks.moveTo(0.31 * u, -0.046 * u);
  marks.quadraticCurveTo(0.322 * u, 0.0, 0.31 * u, 0.044 * u);
  ctx.lineWidth = 0.8 * pw;
  ctx.globalAlpha = alpha * 0.7;
  ctx.stroke(marks);
  // The eye: a dark iris under a heavy lid, a highlight, never a white disc.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = dark ? '#5A4A38' : '#4A3B2C';
  ctx.beginPath();
  ctx.ellipse(0.434 * u, -0.033 * u, 0.015 * u, 0.013 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.9 * pw;
  ctx.stroke();
  ctx.fillStyle = '#141210';
  ctx.beginPath();
  ctx.arc(0.437 * u, -0.033 * u, 0.008 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.globalAlpha = alpha * 0.8;
  ctx.beginPath();
  ctx.arc(0.431 * u, -0.037 * u, 0.0035 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.8;
  ctx.beginPath();
  ctx.moveTo(0.416 * u, -0.041 * u);
  ctx.quadraticCurveTo(0.434 * u, -0.054 * u, 0.452 * u, -0.04 * u);
  ctx.lineWidth = 1.1 * pw;
  ctx.stroke();
  ctx.restore();

  // The plastron under the shell, then the shell.
  const rim = (t: number) => 0.03 * u - 0.012 * u * t + 0.012 * u * Math.sin(Math.PI * t);
  const top = (t: number) => rim(t) - 0.19 * u * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.75);
  const sxAt = (t: number) => -0.34 * u + 0.6 * u * t;
  const yAt = (t: number, f: number) => top(t) + (rim(t) - top(t)) * f;
  const belly = new Path2D();
  belly.moveTo(sxAt(0.04), rim(0.04));
  for (let i = 1; i <= 12; i++) {
    const t = 0.04 + (i / 12) * 0.92;
    belly.lineTo(sxAt(t), rim(t) + 0.06 * u * Math.pow(Math.sin(Math.PI * t), 1.2));
  }
  belly.closePath();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = c.belly;
  ctx.fill(belly);
  ctx.globalAlpha = alpha * 0.8;
  ctx.lineWidth = 0.9 * pw;
  ctx.stroke(belly);

  const shell = new Path2D();
  const shellPts: number[] = [sxAt(0), rim(0)];
  shell.moveTo(sxAt(0), rim(0));
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    shell.lineTo(sxAt(t), top(t));
    shellPts.push(sxAt(t), top(t));
  }
  for (let i = 23; i >= 0; i--) {
    const t = i / 24;
    shell.lineTo(sxAt(t), rim(t) + 0.01 * u);
    shellPts.push(sxAt(t), rim(t) + 0.01 * u);
  }
  shell.closePath();
  ctx.globalAlpha = alpha * 0.92;
  ctx.fillStyle = c.shell;
  ctx.fill(shell);
  const shellBox = { x: sxAt(0), y: top(0.5), w: 0.6 * u, h: rim(0.5) - top(0.5) + 0.02 * u };
  if (d > 0.4) {
    // Engraved shading over the dome, contour lines sagging with it, crossed
    // where it turns furthest from the light.
    const across = shadeAcross(shellBox, light);
    hatch(ctx, shell, shellBox, {
      spacing: 1.9 * px,
      angle: 0.35,
      bow: 0.6,
      shade: (x, y) => across(x, y) * 0.75 + 0.35 * Math.max(0, (y - top(Math.max(0, Math.min(1, (x - sxAt(0)) / (0.6 * u))))) / (0.2 * u)),
      from: dark ? 0.6 : 0.46,
      cross: dark ? undefined : 0.8,
      color: c.ink,
      width: 0.45 * px,
      alpha: alpha * 0.5,
      seed: seed ^ 0x5e11,
    });
  }
  inkLine(ctx, shellPts, true, { width: 1.25 * pw, color: c.ink, alpha, swell: 0.8, lost: 0.25, seed, light, raw: true, min: 0.3 * px });

  // The scutes as plates: a band of vertebrals along the ridge, the costals
  // down the flank, the marginals round the rim, the joins staggered so the
  // plates come out as polygons.
  const plates = new Path2D();
  for (const band of [0.3, 0.82]) {
    plates.moveTo(sxAt(0.06), yAt(0.06, band));
    for (let i = 1; i <= 16; i++) {
      const t = 0.06 + (i / 16) * 0.88;
      plates.lineTo(sxAt(t), yAt(t, band));
    }
  }
  for (const t of [0.2, 0.38, 0.56, 0.74]) {
    plates.moveTo(sxAt(t), yAt(t, 0.03));
    plates.lineTo(sxAt(t + 0.025), yAt(t + 0.025, 0.3));
  }
  for (const t of [0.29, 0.47, 0.65]) {
    plates.moveTo(sxAt(t), yAt(t, 0.3));
    plates.lineTo(sxAt(t - 0.035), yAt(t - 0.035, 0.82));
  }
  for (let i = 0; i < 11; i++) {
    const t = 0.07 + i * 0.087;
    plates.moveTo(sxAt(t), yAt(t, 0.82));
    plates.lineTo(sxAt(t - 0.006), yAt(t - 0.006, 1) + 0.01 * u);
  }
  ctx.globalAlpha = alpha * 0.8;
  ctx.lineWidth = 0.9 * pw;
  ctx.stroke(plates);
  if (d > 0.4) {
    // Each scute's growth rings, round the little first plate (the areola)
    // it grew out from, as a turtle's shell keeps them like a tree.
    const rings = new Path2D();
    const scutes: [number, number, number, number][] = [
      [0.06, 0.2, 0.03, 0.3],
      [0.2, 0.38, 0.03, 0.3],
      [0.38, 0.56, 0.03, 0.3],
      [0.56, 0.74, 0.03, 0.3],
      [0.74, 0.94, 0.03, 0.3],
      [0.06, 0.29, 0.3, 0.82],
      [0.29, 0.47, 0.3, 0.82],
      [0.47, 0.65, 0.3, 0.82],
      [0.65, 0.94, 0.3, 0.82],
    ];
    for (const [t0, t1, f0, f1] of scutes) {
      // The areola sits toward the back and top of the scute.
      const tc = t0 + (t1 - t0) * 0.42;
      const fc = f0 + (f1 - f0) * 0.4;
      for (const k of [0.25, 0.5, 0.72, 0.88]) {
        for (let q = 0; q <= 20; q++) {
          const th = (q / 20) * Math.PI * 2;
          const ct = Math.cos(th);
          const st = Math.sin(th);
          // Squarish, the way the plates' rings follow their edges.
          const sq = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.6);
          const t = tc + (ct > 0 ? t1 - tc : tc - t0) * k * sq(ct) * 0.92;
          const f = fc + (st > 0 ? f1 - fc : fc - f0) * k * sq(st) * 0.9;
          if (q === 0) rings.moveTo(sxAt(t), yAt(t, f));
          else rings.lineTo(sxAt(t), yAt(t, f));
        }
      }
    }
    ctx.globalAlpha = alpha * 0.35;
    ctx.lineWidth = 0.45 * pw;
    ctx.stroke(rings);
  } else {
    // A little hatching low on each costal, where the dome turns away from the light.
    const strokes = new Path2D();
    for (let t = 0.13; t < 0.86; t += 0.045) {
      strokes.moveTo(sxAt(t), yAt(t, 0.58));
      strokes.lineTo(sxAt(t + 0.025), yAt(t + 0.025, 0.78));
    }
    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = 0.7 * pw;
    ctx.stroke(strokes);
  }
  // The outline inked twice, the second pass faint and just off the first.
  ctx.save();
  ctx.translate(0.9 * px, 0.4 * px);
  ctx.globalAlpha = alpha * 0.3;
  ctx.lineWidth = 0.8 * pw;
  ctx.stroke(shell);
  ctx.restore();

  // The near side over it: a rear flipper, the tail, and the long front one.
  const near = new Path2D();
  flipper(near, -0.3 * u, 0.05 * u, rear, 0.14 * u, 0.05 * u);
  flipper(near, 0.16 * u, 0.05 * u, front, 0.42 * u, 0.075 * u);
  near.moveTo(-0.33 * u, 0.03 * u);
  near.lineTo(-0.4 * u, 0.045 * u);
  near.lineTo(-0.33 * u, 0.055 * u);
  near.closePath();
  ctx.globalAlpha = alpha * 0.92;
  ctx.fillStyle = c.skin;
  ctx.fill(near);
  if (d > 0.4) {
    const fbox = { x: -0.5 * u, y: -0.15 * u, w: 0.85 * u, h: 0.5 * u };
    stipple(ctx, near, fbox, {
      spacing: 1.5 * px,
      radius: 0.33 * px,
      shade: (x, y) => Math.min(1, 0.3 + Math.max(0, y) / (0.2 * u)),
      from: 0.3,
      color: c.ink,
      alpha: alpha * 0.5,
      seed: seed ^ 0xf11,
    });
  }
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.1 * pw;
  ctx.stroke(near);
  const scales = new Path2D();
  flipperScales(scales, 0.16 * u, 0.05 * u, front, 0.42 * u, 0.075 * u);
  ctx.globalAlpha = alpha * 0.55;
  ctx.lineWidth = 0.7 * pw;
  ctx.stroke(scales);
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

/**
 * A giant siphonophore: not one animal but a colony of them strung on a
 * stem, longer than the page, so neither end is ever seen. Near its front a
 * run of swimming bells, pulsing one after another; then a long run of tiny
 * bracts, each with its feeding polyp and a thread of tentacle hanging from
 * it, beaded with stinging cells. It lies corner to corner in a slow S and
 * drifts across over the minute and a half, swimming forward a little as it
 * goes. On dark water it glows, faintly, in a wave that travels down it.
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
  /** How it lies, radians from level, in place of corner to corner: a still that wants it lying easy. */
  lie?: number,
) {
  const env = envelope(age, 0.12, 0.12);
  if (env <= 0) return;
  const r = mulberry32(seed);
  const diag = Math.hypot(w, h);
  const m = Math.min(w, h);
  // Corner to corner, more or less, down either diagonal, front at either end.
  const rolled = Math.atan2(h, w) * range(r, 0.6, 1.1) * (r() < 0.5 ? 1 : -1);
  const slope = lie ?? rolled;
  const ahead = r() < 0.5 ? 1 : -1;
  const tx = Math.cos(slope) * ahead;
  const ty = Math.sin(slope) * ahead;
  const nx = -ty;
  const ny = tx;
  const across = r() < 0.5 ? 1 : -1;
  const a1 = 0.07 * diag;
  const a2 = 0.022 * diag;
  const k1 = (Math.PI * 2) / (1.3 * diag);
  const k2 = (Math.PI * 2) / (0.45 * diag);
  const p1 = range(r, 0, Math.PI * 2);
  const p2 = range(r, 0, Math.PI * 2);
  const hue = SIPHON_HUES[Math.floor(r() * SIPHON_HUES.length)];
  // Drifting across the page, and swimming forward along itself a little.
  const off = (age - 0.5) * 0.5 * diag * across;
  const glide = (age - 0.5) * 0.08 * diag;
  const cx = w / 2 + nx * off + tx * glide;
  const cy = h / 2 + ny * off + ty * glide;
  let X = 0;
  let Y = 0;
  const at = (s: number) => {
    const bend = a1 * Math.sin(k1 * s + p1 + ambient * 0.05) + a2 * Math.sin(k2 * s + p2 - ambient * 0.12);
    X = cx + tx * s + nx * bend;
    Y = cy + ty * s + ny * bend;
  };
  // The front is just past a corner of the page however it lies, and the
  // back is far off the other way: the stem is drawn only as far as it could
  // possibly show.
  const front = 0.56 * diag;
  const back = -0.66 * diag;
  const bellsEnd = front - 0.34 * diag;
  const margin = 0.1 * m;
  const onPage = (x: number, y: number) => x > -margin && x < w + margin && y > -margin && y < h + margin;

  const ink = inkOf(hue, dark);
  const wash = washOf(hue, dark);
  const alpha = env * (dark ? 0.85 : 0.8);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The stem: a thin wash under a fine line, inked twice.
  const stem = new Path2D();
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    at(front - ((front - back) * i) / steps);
    if (i === 0) stem.moveTo(X, Y);
    else stem.lineTo(X, Y);
  }
  // A bell is small, but on a wallpaper it is near enough to show its
  // canals and shading, and the whole colony is drawn in the pen.
  const bellR = m * 0.011;
  const d = detailFor(bellR * 12);
  const light = dark ? UNLIGHT : LIGHT;
  ctx.strokeStyle = wash;
  ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = 2.6 * px;
  ctx.stroke(stem);
  if (d > 0.85) {
    // The stem in one pressure line, broken where the light is.
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      at(front - ((front - back) * i) / steps);
      pts.push(X, Y);
    }
    inkLine(ctx, pts, false, { width: 1.1 * px, color: ink, alpha: alpha * 0.8, taper: [0.01, 0.01], seed: seed ^ 0x57e, light, raw: true, plate: true, min: 0.3 * px });
  } else {
    ctx.strokeStyle = ink;
    ctx.globalAlpha = alpha * 0.7;
    ctx.lineWidth = 0.9 * px;
    ctx.stroke(stem);
    ctx.save();
    ctx.translate(0.8 * px, 0.4 * px);
    ctx.globalAlpha = alpha * 0.22;
    ctx.lineWidth = 0.6 * px;
    ctx.stroke(stem);
    ctx.restore();
  }

  // The swimming bells, alternating either side of the stem, each squeezing
  // in its turn so the beat runs down the row.
  const bells = new Path2D();
  const sacs = new Path2D();
  const placed: number[] = [];
  const bellOutlines: number[][] = [];
  const nBells = Math.floor((front - 0.03 * diag - bellsEnd) / (0.022 * diag));
  for (let j = 0; j <= nBells; j++) {
    const s = front - 0.03 * diag - j * 0.022 * diag;
    at(s + 1);
    const ax = X;
    const ay = Y;
    at(s);
    if (!onPage(X, Y)) continue;
    const ang = Math.atan2(ay - Y, ax - X);
    const side = j % 2 ? 1 : -1;
    const squeeze = Math.max(0, Math.sin(ambient * 2.2 - j * 0.6));
    const rb = bellR * (0.85 + 0.3 * unit(seed, j + 900));
    const bx = X - Math.sin(ang) * side * rb * 0.95;
    const by = Y + Math.cos(ang) * side * rb * 0.95;
    const rx = rb * 1.25;
    const ry = rb * 0.8 * (1 - 0.14 * squeeze);
    if (d > 0.4) {
      // A nectophore, not an ellipse: a rounded box, flattened across its
      // opening at the back, a little lopsided.
      const pts: number[] = [];
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let k = 0; k < 14; k++) {
        const t = (k / 14) * Math.PI * 2;
        const c = Math.cos(t);
        const sn = Math.sin(t);
        const sq = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
        const u = sq(c, c < 0 ? 0.45 : 0.8) * rx * (0.95 + 0.1 * unit(seed, j * 31 + k));
        const v = sq(sn, 0.75) * ry * (1 + 0.12 * c) * (0.95 + 0.1 * unit(seed, j * 37 + k));
        pts.push(bx + ca * u - sa * v, by + sa * u + ca * v);
      }
      bellOutlines.push(pts);
      bells.addPath(smoothPath(pts, true, 4));
    } else {
      bells.moveTo(bx + Math.cos(ang) * rx, by + Math.sin(ang) * rx);
      bells.ellipse(bx, by, rx, ry, ang, 0, Math.PI * 2);
    }
    // The muscular sac inside, opening backward: that is what it swims with.
    const ix = bx - Math.cos(ang) * rx * 0.2;
    const iy = by - Math.sin(ang) * rx * 0.2;
    sacs.moveTo(ix + Math.cos(ang) * rx * 0.62, iy + Math.sin(ang) * rx * 0.62);
    sacs.ellipse(ix, iy, rx * 0.62, ry * 0.5, ang, 0, Math.PI * 2);
    placed.push(bx, by, rx, ry, ang, j);
  }
  ctx.fillStyle = wash;
  ctx.globalAlpha = alpha * (d > 0.4 ? 0.32 : 0.22);
  ctx.fill(bells);
  if (d > 0.85) {
    for (let k = 0; k < bellOutlines.length; k++) inkLine(ctx, bellOutlines[k], true, { width: 0.9 * px, color: ink, alpha: alpha * 0.75, seed: seed ^ (k * 977), light, plate: true, min: 0.25 * px });
  } else {
    ctx.strokeStyle = ink;
    ctx.globalAlpha = alpha * 0.6;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke(bells);
  }
  ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = 0.6 * px;
  ctx.stroke(sacs);
  if (d > 0.4) {
    // Each bell stippled on its shadow side, as a clear thing is drawn, and
    // its four radial canals running from the opening back over the dome.
    const dots = new Path2D();
    const canals = new Path2D();
    const [lx, ly] = dark ? UNLIGHT : LIGHT;
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
        // How far toward the bell's far side from the light this dot is.
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

  // Down the rest of it, the repeating units: a bract, a polyp, a tentacle.
  // All batched, so two hundred of them is a handful of strokes.
  const bracts = new Path2D();
  const polyps = new Path2D();
  const threads = new Path2D();
  const threadLines: number[][] = [];
  const beads = new Path2D();
  const step = 0.011 * diag;
  const bead = Math.max(0.7 * px, m * 0.0012);
  const count = Math.min(200, Math.floor((bellsEnd - 0.02 * diag - back) / step));
  for (let i = 0; i < count; i++) {
    const s = bellsEnd - 0.02 * diag - i * step;
    at(s + 1);
    const ax = X;
    const ay = Y;
    at(s);
    if (!onPage(X, Y)) continue;
    const q = unit(seed, i);
    const ang = Math.atan2(ay - Y, ax - X);
    // Whichever side of the stem is underneath.
    const down = Math.cos(ang) >= 0 ? 1 : -1;
    // The bract: a little clear leaf off the underside, pointing back.
    const br = m * (0.005 + 0.003 * q);
    const bang = ang + Math.PI - 0.7 * down;
    const lx = Math.cos(bang) * br * 2.4;
    const ly = Math.sin(bang) * br * 2.4;
    const wx = -Math.sin(bang) * br * 0.8;
    const wy = Math.cos(bang) * br * 0.8;
    // A leaf fuller on one edge than the other, and no two alike.
    const full = 1.1 + 0.5 * unit(seed, i + 8000);
    bracts.moveTo(X, Y);
    bracts.quadraticCurveTo(X + lx * 0.45 + wx * full, Y + ly * 0.45 + wy * full, X + lx, Y + ly);
    bracts.quadraticCurveTo(X + lx * 0.6 - wx * 0.6, Y + ly * 0.6 - wy * 0.6, X, Y);
    // The polyp hanging under it.
    const pr = br * 0.42;
    // A tear, hanging well under the stem, its point up toward it.
    const py0 = Y + br * 2.3;
    polyps.moveTo(X, py0 - pr * 1.5);
    polyps.quadraticCurveTo(X + pr * 1.1, py0 - pr * 0.2, X + pr * 0.15, py0 + pr * 1.2);
    polyps.quadraticCurveTo(X - pr * 0.9, py0 + pr * 0.6, X, py0 - pr * 1.5);
    // And its tentacle, hanging, swaying a little, longer on some than others.
    if (i % 3 === 2 && q < 0.5) continue;
    const len = m * (0.025 + 0.06 * q);
    const sway = Math.sin(ambient * 0.5 + i * 0.7) * 0.25 + 0.08 * Math.sin(ambient * 0.17 + i);
    const x0 = X;
    const y0 = Y + br * 2.3 + pr * 1.2;
    const qx = x0 + sway * len * 0.15;
    const qy = y0 + len * 0.5;
    const ex = x0 + sway * len * 0.55;
    const ey = y0 + len;
    // Two hundred threads in the pen are for a print; a screen gets them as
    // plain fine lines.
    if (d > 0.85) {
      const pts: number[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push((1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * qx + t * t * ex, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * qy + t * t * ey);
      }
      threadLines.push(pts);
    } else {
      threads.moveTo(x0, y0);
      threads.quadraticCurveTo(qx, qy, ex, ey);
    }
    // The stinging cells: small beads, not evenly spaced or sized, each a
    // little longer than wide along the thread.
    const nb = 3 + Math.floor(unit(seed, i + 4000) * 3);
    for (let k = 0; k < nb; k++) {
      const t = 0.3 + ((k + 0.3 + 0.5 * unit(seed, i * 7 + k + 5000)) / nb) * 0.66;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      const dx = a * x0 + b * qx + c * ex;
      const dy = a * y0 + b * qy + c * ey;
      const br = bead * (0.6 + 0.7 * unit(seed, i * 11 + k + 6000));
      beads.moveTo(dx + br * 0.7, dy);
      beads.ellipse(dx, dy, br * 0.7, br * 1.2, sway * 0.4, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = wash;
  ctx.globalAlpha = alpha * 0.3;
  ctx.fill(bracts);
  ctx.fill(polyps);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = alpha * 0.5;
  ctx.lineWidth = 0.6 * px;
  ctx.stroke(bracts);
  ctx.stroke(polyps);
  ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = 0.5 * px;
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
    for (let i = 0, s = front - 0.03 * diag; s > back; i += 2, s -= step * 2) {
      at(s);
      if (!onPage(X, Y)) continue;
      const wave = 0.5 + 0.5 * Math.sin(ambient * 0.9 - i * 0.18);
      const pulse = wave * wave * wave;
      // A soft glow, faded to nothing at its rim: no hard discs in a row.
      ctx.globalAlpha = env * 0.12 * (0.2 + pulse);
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
