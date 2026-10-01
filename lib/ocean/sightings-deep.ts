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
import { HUES } from './palette';
import { mulberry32 } from './random';

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

    // Facing +x, the lure's rest at the origin. Mostly head: a dome, a
    // gape that runs back past the eye, a jaw slung out beyond the snout,
    // and only a stub of a body and a small fan of tail behind.
    const UL = [-0.06 * L, 0.08 * L];
    const CORNER = [-0.27 * L, 0.24 * L];
    const CHIN = [0.04 * L, 0.27 * L];
    const UPPER = [-0.14 * L, 0.13 * L];
    const LOWER = [-0.06 * L, 0.31 * L];
    const body = new Path2D();
    body.moveTo(UL[0], UL[1]);
    body.bezierCurveTo(-0.1 * L, -0.12 * L, -0.35 * L, -0.2 * L, -0.55 * L, -0.12 * L);
    body.bezierCurveTo(-0.68 * L, -0.07 * L, -0.76 * L, 0.05 * L, -0.78 * L, 0.15 * L);
    body.lineTo(-0.88 * L, 0.08 * L);
    body.quadraticCurveTo(-0.94 * L, 0.19 * L, -0.88 * L, 0.3 * L);
    body.lineTo(-0.78 * L, 0.22 * L);
    body.bezierCurveTo(-0.7 * L, 0.42 * L, -0.4 * L, 0.5 * L, -0.16 * L, 0.44 * L);
    body.quadraticCurveTo(0.02 * L, 0.39 * L, CHIN[0], CHIN[1]);
    body.quadraticCurveTo(LOWER[0], LOWER[1], CORNER[0], CORNER[1]);
    body.quadraticCurveTo(UPPER[0], UPPER[1], UL[0], UL[1]);
    body.closePath();
    // The open mouth: the dark between the jaws.
    const maw = new Path2D();
    maw.moveTo(UL[0], UL[1]);
    maw.quadraticCurveTo(UPPER[0], UPPER[1], CORNER[0], CORNER[1]);
    maw.quadraticCurveTo(LOWER[0], LOWER[1], CHIN[0], CHIN[1]);
    maw.closePath();

    // A shape darker than the water, then the lure's light on it, strongest
    // at the jaw and gone by the tail.
    ctx.globalAlpha = seen * (dark ? 0.6 : 0.35);
    ctx.fillStyle = dark ? '#050505' : '#1A1714';
    ctx.fill(body);
    ctx.globalAlpha = seen * (dark ? 0.7 : 0.4);
    ctx.fill(maw);
    const lit = ctx.createRadialGradient(ux, uy, 0, ux, uy, 1.1 * L);
    lit.addColorStop(0, lure(dark ? 0.18 : 0.12));
    lit.addColorStop(0.5, lure(dark ? 0.04 : 0.03));
    lit.addColorStop(1, lure(0));
    ctx.globalAlpha = seen;
    ctx.fillStyle = lit;
    ctx.fill(body);

    // The ink, fading the same way: the far end of it is barely there.
    const inkTone = dark ? '214, 228, 222' : '40, 44, 42';
    const line = ctx.createRadialGradient(ux, uy, 0, ux, uy, 1.0 * L);
    line.addColorStop(0, `rgba(${inkTone}, 0.85)`);
    line.addColorStop(1, `rgba(${inkTone}, 0.04)`);
    ctx.strokeStyle = line;
    ctx.globalAlpha = seen * 0.55;
    ctx.lineWidth = 1.1 * px;
    ctx.stroke(body);

    // A small pectoral fan, the gill's edge, and a little stipple on the
    // skin where the light is: the plate's shading.
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      ctx.moveTo(-0.46 * L, 0.24 * L);
      ctx.lineTo(-0.54 * L - k * 0.015 * L, 0.3 * L + k * 0.022 * L);
    }
    ctx.moveTo(-0.36 * L, 0.06 * L);
    ctx.quadraticCurveTo(-0.42 * L, 0.18 * L, -0.38 * L, 0.3 * L);
    ctx.globalAlpha = seen * 0.3;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
    const skin = mulberry32(seed ^ 0x5c1);
    ctx.fillStyle = line;
    for (let k = 0; k < 26; k++) {
      const sx = -0.08 * L - skin() * 0.45 * L;
      const sy = -0.08 * L + skin() * 0.18 * L + (sx + 0.08 * L) * -0.1;
      ctx.globalAlpha = seen * (0.2 + skin() * 0.3);
      ctx.fillRect(sx, sy, 0.9 * px, 0.9 * px);
    }

    // Needles, few and uneven, curving back into the mouth: short from the
    // upper jaw, long from the lower.
    ctx.beginPath();
    const teeth = mulberry32(seed ^ 0x7ee7);
    for (let k = 0; k < 5; k++) {
      const [x, y] = quad(UL[0], UL[1], UPPER[0], UPPER[1], CORNER[0], CORNER[1], (k + 0.4) / 6);
      const len = (0.03 + teeth() * 0.035) * L;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 0.01 * L, y + len * 0.6, x - 0.004 * L, y + len);
    }
    for (let k = 0; k < 6; k++) {
      const t = (k + 0.3) / 7;
      const [x, y] = quad(CHIN[0], CHIN[1], LOWER[0], LOWER[1], CORNER[0], CORNER[1], t);
      const len = (0.05 + teeth() * 0.07) * L * (1 - t * 0.5);
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len * 0.3, y - len * 0.6, x + len * 0.1, y - len);
    }
    ctx.strokeStyle = dark ? '#E9EFE6' : '#3A3A36';
    ctx.globalAlpha = seen * 0.75;
    ctx.lineWidth = 0.7 * px;
    ctx.stroke();

    // A small eye, and the stalk arching from the brow out to the light.
    ctx.beginPath();
    ctx.arc(-0.27 * L, 0.0 * L, Math.max(1.1 * px, 0.016 * L), 0, Math.PI * 2);
    ctx.strokeStyle = line;
    ctx.globalAlpha = seen * 0.75;
    ctx.lineWidth = 0.9 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.2 * L, -0.11 * L);
    ctx.quadraticCurveTo(-0.12 * L, -0.34 * L, ux, uy);
    ctx.lineWidth = 1 * px;
    ctx.stroke();
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

/**
 * A dumbo octopus, small and pale, hanging in the water above the floor.
 * Its ear fins row slowly and it lifts a little after each stroke, then
 * settles, drifting across the lower page the while. Its arms are joined
 * by a web, which is the faintest wash; the arms are the ink.
 */
export function drawDumbo(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean): void {
  const env = envelope(age, 0.12, 0.12);
  if (env <= 0) return;
  const rand = mulberry32(seed ^ 0xd0b0);
  const hue = HUES[[1, 3, 9][Math.floor(rand() * 3)]];
  const startX = 0.28 + rand() * 0.44;
  const drift = 0.1 + rand() * 0.12;
  const way = rand() < 0.5 ? -1 : 1;
  const baseY = 0.64 + rand() * 0.1;
  const beat = 2.6 + rand() * 0.8;
  const phase = rand() * Math.PI * 2;

  const pale = mixHex(hue, '#EFE9DC', 0.55);
  const water = dark ? '#1A1815' : '#FBF8EF';
  const ink = dark ? mixHex(pale, '#FFFFFF', 0.45) : mixHex(pale, '#1A1714', 0.62);
  const wash = dark ? mixHex(pale, water, 0.12) : mixHex(pale, water, 0.2);

  // Small for an octopus, but big enough to be found.
  const S = Math.min(w, h) * 0.11;
  const R = S * 0.3;
  const ph = (ambient / beat) * Math.PI * 2 + phase;
  const flap = Math.sin(ph);
  // The body rises just after the fins come down.
  const lift = Math.sin(ph - 1.1);
  const x = w * Math.max(0.12, Math.min(0.88, startX + way * (age - 0.5) * 2 * drift)) + Math.sin(ambient * 0.17 + phase) * S * 0.4;
  const y = h * baseY - lift * S * 0.12 + Math.sin(ambient * 0.09 + phase) * S * 0.35;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(way * 0.1 + lift * 0.04);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = env;

  // The arms and the web between them, a skirt that opens a little on the
  // upstroke. Seen from the side, the near arms hang lowest.
  const spread = 1 + 0.12 * Math.sin(ph + 0.6);
  const angles: number[] = [];
  const tips: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (0.1 + (0.8 * i) / 7);
    angles.push(a);
    tips.push([-Math.cos(a) * R * 1.45 * spread, R * (0.55 + 0.6 * Math.sin(a)) * (1.1 - 0.1 * spread)]);
  }
  const web = new Path2D();
  web.moveTo(-R * 0.85, -R * 0.05);
  web.quadraticCurveTo(-R * 1.1, R * 0.15, tips[0][0], tips[0][1]);
  for (let i = 1; i < 8; i++) {
    const [ax, ay] = tips[i - 1];
    const [bx, by] = tips[i];
    // The web's margin dips up a little between arms.
    web.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - R * 0.12, bx, by);
  }
  web.quadraticCurveTo(R * 1.1, R * 0.15, R * 0.85, -R * 0.05);
  web.closePath();
  ctx.fillStyle = wash;
  ctx.globalAlpha = env * 0.35;
  ctx.fill(web);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = env * 0.55;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke(web);

  // The arms run inside the web, faint, and their tips curl out past it.
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const [tx, ty] = tips[i];
    const rx = -Math.cos(angles[i]) * R * 0.4;
    ctx.moveTo(rx, R * 0.05);
    ctx.quadraticCurveTo(tx * 0.8, ty * 0.45, tx, ty);
  }
  ctx.globalAlpha = env * 0.3;
  ctx.lineWidth = 0.7 * px;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const [tx, ty] = tips[i];
    const out = -Math.cos(angles[i]);
    const curl = Math.sin(ambient * 0.6 + i * 1.3) * R * 0.05;
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + out * R * 0.14, ty + R * 0.14, tx + out * R * 0.24 + curl, ty + R * 0.04);
  }
  ctx.globalAlpha = env * 0.75;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke();

  // The fins, high on each side of the crown like ears, rowing.
  const raise = 0.35 + 0.55 * flap;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 0.55 * R, -1.15 * R);
    ctx.scale(side, 1);
    ctx.rotate(-raise);
    const fin = new Path2D();
    fin.moveTo(0, -0.14 * R);
    fin.bezierCurveTo(0.45 * R, -0.42 * R, 1.05 * R, -0.36 * R, 1.05 * R, -0.02 * R);
    fin.bezierCurveTo(1.05 * R, 0.28 * R, 0.45 * R, 0.3 * R, 0, 0.14 * R);
    ctx.fillStyle = wash;
    ctx.globalAlpha = env * 0.7;
    ctx.fill(fin);
    ctx.globalAlpha = env * 0.9;
    ctx.lineWidth = 0.9 * px;
    ctx.stroke(fin);
    // A couple of strokes of shading along the fin.
    ctx.beginPath();
    ctx.moveTo(0.2 * R, 0.02 * R);
    ctx.quadraticCurveTo(0.55 * R, -0.04 * R, 0.85 * R, 0.0);
    ctx.globalAlpha = env * 0.35;
    ctx.lineWidth = 0.6 * px;
    ctx.stroke();
    ctx.restore();
  }

  // The mantle: a tall bell, inked twice, the second pass fainter and just
  // off, and a few lines of hatching on its shaded side.
  const bell = new Path2D();
  bell.moveTo(-R * 0.85, 0);
  bell.bezierCurveTo(-R * 0.98, -R * 0.95, -R * 0.62, -R * 1.62, 0, -R * 1.62);
  bell.bezierCurveTo(R * 0.62, -R * 1.62, R * 0.98, -R * 0.95, R * 0.85, 0);
  // Only the dome is inked: below, the mantle runs on into the web.
  const dome = new Path2D(bell);
  bell.quadraticCurveTo(0, R * 0.22, -R * 0.85, 0);
  bell.closePath();
  ctx.fillStyle = wash;
  ctx.globalAlpha = env * 0.9;
  ctx.fill(bell);
  ctx.globalAlpha = env;
  ctx.lineWidth = 1.1 * px;
  ctx.stroke(dome);
  ctx.save();
  ctx.translate(0.9 * px, 0.4 * px);
  ctx.globalAlpha = env * 0.3;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke(dome);
  ctx.restore();
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const y0 = -R * (1.1 - k * 0.24);
    ctx.moveTo(-way * R * 0.78, y0);
    ctx.quadraticCurveTo(-way * R * 0.62, y0 + R * 0.08, -way * R * 0.5, y0 + R * 0.04);
  }
  ctx.globalAlpha = env * 0.3;
  ctx.lineWidth = 0.6 * px;
  ctx.stroke();

  // Its eyes: small and dark, set toward the way it's going.
  const eye = Math.max(1 * px, R * 0.07);
  ctx.fillStyle = dark ? '#141210' : mixHex(pale, '#1A1714', 0.75);
  ctx.globalAlpha = env * 0.8;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 0.34 * R + way * R * 0.18, -0.36 * R, eye, eye * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ---- The whale fall ---- */

const BONE = '#DCD2BC';

/**
 * A whale's skeleton on the floor, long since picked clean and now a reef
 * of its own: the skull at one end, the spine running away smaller to the
 * tail, ribs standing up off it, some broken off and some lain down, all
 * a little sunk in the silt. A pale mat of bacteria on the bones, a few
 * tufts of bone worms, and squat lobsters and crabs picking their way along
 * it. It comes in over its arrival and then only the small life moves.
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
): void {
  const a = 0.85 * smooth(appear);
  if (a <= 0) return;
  // The layout comes from the seed afresh each frame, so it never shifts.
  const rand = mulberry32(seed ^ 0x3a1ef);
  const L = w * 0.45;
  const dir = rand() < 0.5 ? -1 : 1;
  const cx = w * (0.375 + rand() * 0.25);
  const sag0 = rand() * Math.PI * 2;

  const ink = dark ? mixHex(BONE, '#FFFFFF', 0.35) : mixHex(BONE, '#1A1714', 0.62);
  const wash = dark ? mixHex(BONE, '#110F0D', 0.55) : mixHex(BONE, '#FBF8EF', 0.3);
  const ground = dark ? '#080706' : '#2E3431';
  const silt = dark ? 'rgba(8, 7, 6, ' : 'rgba(46, 52, 49, ';
  const edge = dark ? '#2B2926' : '#6E7672';

  ctx.save();
  // The skull's tip at the origin, on the floor line, the tail along +x.
  ctx.translate(cx - (dir * L) / 2, floorY);
  ctx.scale(dir, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Whatever is below the line is in the silt.
  ctx.beginPath();
  ctx.rect(-L, -L, L * 3, L + 1.5 * px);
  ctx.clip();

  // The spine: from behind the skull to the tail, the bones shrinking and
  // closing up as they go.
  const s0 = 0.21 * L;
  const N = 26;
  const spineX = (t: number) => s0 + (L - s0) * (1 - Math.pow(1 - t, 1.35));
  const boneH = (t: number) => L * (0.034 * Math.pow(1 - t, 0.9) + 0.005);
  const boneY = (t: number) => -boneH(t) * 0.32 + L * 0.004 * Math.sin(t * 5 + sag0);
  const topAt = (x: number) => {
    if (x < s0) return -(0.003 * L + 0.045 * L * Math.pow(Math.max(0, x) / s0, 1.6));
    const f = Math.min(1, (x - s0) / (L - s0));
    const t = 1 - Math.pow(1 - f, 1 / 1.35);
    return boneY(t) - boneH(t) / 2;
  };

  const centra = new Path2D();
  const spines = new Path2D();
  const roots: [number, number, number][] = [];
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    const hv = boneH(t);
    const gap = spineX(Math.min(1, t + 1 / (N - 1))) - spineX(t);
    let x = spineX(t);
    let y = boneY(t);
    let rot = 0;
    // A few have been knocked loose.
    if (rand() < 0.14) {
      x += (rand() - 0.5) * hv;
      y += rand() * hv * 0.2;
      rot = (rand() - 0.5) * 0.9;
    }
    // A centrum from the side: a short drum, its sides drawn in a little.
    const hw = Math.max(gap * 0.38, 1.5 * px);
    const hh = hv / 2;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const at = (u: number, v: number): [number, number] => [x + u * cs - v * sn, y + u * sn + v * cs];
    const corners: [number, number][] = [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)];
    const pinch: [number, number][] = [at(0, -hh * 0.8), at(hw * 0.85, 0), at(0, hh * 0.8), at(-hw * 0.85, 0)];
    centra.moveTo(...pinch[3]);
    for (let j = 0; j < 4; j++) centra.quadraticCurveTo(corners[j][0], corners[j][1], pinch[j][0], pinch[j][1]);
    centra.closePath();
    if (t < 0.8) {
      spines.moveTo(x, y - hv / 2);
      spines.lineTo(x + hv * 0.5, y - hv / 2 - hv * 0.9 * (1 - t * 0.6));
    }
    roots.push([x, y - hv * 0.3, hv]);
  }

  // Ribs, off the front of the spine. The carcass lies on its side, so a
  // rib that still stands is a long low bow sprung back toward the tail;
  // some are snapped short with the rest lying below, and many have lain
  // down flat in the silt.
  const ribs = (rng: () => number, shift: number) => {
    const path = new Path2D();
    for (let i = 0; i < 11; i++) {
      const [rx0, ry] = roots[i + 2];
      const rx = rx0 + shift;
      const H = L * (0.085 - 0.035 * (i / 10)) * (0.7 + 0.5 * rng());
      const lean = L * (0.05 + rng() * 0.05) * (rng() < 0.2 ? -0.6 : 1);
      const fate = rng();
      if (fate < 0.35) {
        const way = rng() < 0.5 ? -1 : 1;
        const len = H * (1.1 + rng() * 0.5);
        path.moveTo(rx + way * L * 0.01, -0.003 * L);
        path.quadraticCurveTo(rx + way * len * 0.5, -0.012 * L - rng() * 0.01 * L, rx + way * len, -0.002 * L);
        continue;
      }
      const p = [rx, ry, rx + lean * 0.1, ry - H, rx + lean * 0.75, -H * 0.95, rx + lean, 2 * px];
      const end = fate < 0.62 ? 0.35 + rng() * 0.35 : 1;
      path.moveTo(rx, ry);
      for (let k = 1; k <= 12; k++) {
        const [x, y] = cubic(p, (end * k) / 12);
        path.lineTo(x, y);
      }
      if (end < 1) {
        // The broken-off piece, lying in the silt beneath.
        const [bx] = cubic(p, 0.85);
        path.moveTo(bx - L * 0.03, -0.001 * L);
        path.quadraticCurveTo(bx, -0.011 * L, bx + L * 0.025, -0.003 * L);
      }
    }
    return path;
  };
  const far = ribs(mulberry32(seed ^ 0xfa4), L * 0.012);
  const near = ribs(rand, 0);

  // The skull, its eye socket, and the jaw lying beside it.
  const skull = new Path2D();
  // Long and flat: the rostrum running out to a point, the braincase low
  // and broad behind it, not a dome.
  skull.moveTo(0, -0.003 * L);
  skull.bezierCurveTo(0.05 * L, -0.008 * L, 0.1 * L, -0.018 * L, 0.14 * L, -0.03 * L);
  skull.bezierCurveTo(0.16 * L, -0.045 * L, 0.19 * L, -0.05 * L, 0.205 * L, -0.036 * L);
  skull.quadraticCurveTo(0.216 * L, -0.015 * L, 0.21 * L, 0.012 * L);
  skull.lineTo(0, 0.006 * L);
  skull.closePath();
  const jaw = new Path2D();
  jaw.moveTo(-0.01 * L, 0.001 * L);
  jaw.quadraticCurveTo(0.1 * L, -0.02 * L, 0.2 * L, 0.002 * L);
  const shoulder = new Path2D();
  shoulder.moveTo(0.27 * L, 0.002 * L);
  shoulder.lineTo(0.255 * L, -0.032 * L);
  shoulder.quadraticCurveTo(0.29 * L, -0.058 * L, 0.325 * L, -0.038 * L);
  shoulder.closePath();

  const thick = Math.max(2.2 * px, L * 0.007);
  const ink1 = 1.1 * px;

  // Far ribs first, faint, as the other side of the animal.
  ctx.strokeStyle = wash;
  ctx.globalAlpha = a * 0.35;
  ctx.lineWidth = thick;
  ctx.stroke(far);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = a * 0.35;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke(far);

  // Then the bones: the wash, then the line over it.
  ctx.fillStyle = wash;
  ctx.globalAlpha = a * 0.85;
  ctx.fill(skull);
  ctx.fill(centra);
  ctx.fill(shoulder);
  ctx.strokeStyle = wash;
  ctx.lineWidth = thick;
  ctx.stroke(spines);
  ctx.stroke(near);
  ctx.lineWidth = thick * 1.6;
  ctx.stroke(jaw);

  ctx.strokeStyle = ink;
  ctx.globalAlpha = a;
  ctx.lineWidth = ink1;
  ctx.stroke(skull);
  ctx.stroke(centra);
  ctx.stroke(shoulder);
  ctx.stroke(near);
  ctx.stroke(jaw);
  ctx.lineWidth = 0.9 * px;
  ctx.stroke(spines);

  // A suture, the scapula's ridge, and the shadow of the socket, lightly.
  ctx.beginPath();
  ctx.moveTo(0.01 * L, -0.004 * L);
  ctx.quadraticCurveTo(0.08 * L, -0.012 * L, 0.15 * L, -0.03 * L);
  ctx.moveTo(0.29 * L, -0.008 * L);
  ctx.lineTo(0.3 * L, -0.032 * L);
  ctx.globalAlpha = a * 0.45;
  ctx.lineWidth = 0.7 * px;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0.168 * L, -0.02 * L, 0.009 * L, 0.006 * L, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = ground;
  ctx.globalAlpha = a * 0.6;
  ctx.fill();

  // The bacterial mat: stipple, thickest on the skull and the big bones.
  ctx.fillStyle = dark ? '#E6EBD6' : '#7E8C74';
  const dots = mulberry32(seed ^ 0xbac7);
  for (let i = 0; i < 150; i++) {
    const x = Math.pow(dots(), 1.4) * L * 0.95;
    const top = topAt(x);
    const y = top * (0.15 + dots() * 0.9);
    ctx.globalAlpha = a * (0.18 + dots() * 0.25);
    ctx.fillRect(x, y, (0.6 + dots() * 0.7) * px, (0.6 + dots() * 0.7) * px);
  }

  // The silt heaped round the bases, so they sink into it rather than sit on it.
  const heap = new Path2D();
  heap.moveTo(-0.03 * L, 2 * px);
  const bumps = mulberry32(seed ^ 0x5117);
  for (let i = 0; i <= 14; i++) {
    const x = -0.03 * L + (i / 14) * 1.06 * L;
    const lift = i === 0 || i === 14 ? 0 : L * (0.003 + bumps() * 0.008);
    heap.quadraticCurveTo(x - 0.035 * L, -lift * 1.3, x, -lift * 0.4);
  }
  heap.lineTo(1.03 * L, 2 * px);
  heap.closePath();
  const sink = ctx.createLinearGradient(0, -0.014 * L, 0, 1.5 * px);
  sink.addColorStop(0, `${silt}0)`);
  sink.addColorStop(1, `${silt}0.95)`);
  ctx.fillStyle = sink;
  ctx.globalAlpha = a / 0.85;
  ctx.fill(heap);
  ctx.strokeStyle = edge;
  ctx.globalAlpha = a * 0.2;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke(heap);

  // The living part arrives last, once the bones are there to be on.
  const life = a * smooth((appear - 0.6) / 0.4);
  if (life > 0) {
    const r2 = mulberry32(seed ^ 0x0ed);
    // Bone worms: little pale plumes standing off the bone, swaying.
    ctx.strokeStyle = dark ? '#E8C9BF' : '#8E625A';
    ctx.lineWidth = 0.7 * px;
    for (let i = 0; i < 3; i++) {
      const x = L * (0.08 + r2() * 0.5);
      const y = topAt(x) + 0.5 * px;
      const tall = Math.max(4 * px, L * (0.012 + r2() * 0.008));
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const lean = (j - 2.5) * 0.18 + Math.sin(ambient * 0.8 + i * 2 + j) * 0.12;
        const tx = x + Math.sin(lean) * tall;
        const ty = y - Math.cos(lean) * tall * (0.75 + 0.25 * ((j * 7) % 3) / 2);
        ctx.moveTo(x + (j - 2.5) * 0.4 * px, y);
        ctx.quadraticCurveTo(x + Math.sin(lean) * tall * 0.3, y - tall * 0.5, tx, ty);
      }
      ctx.globalAlpha = life * 0.7;
      ctx.stroke();
    }

    // Crabs and squat lobsters, picking along the bones with a hesitant
    // gait: they slow, nearly stop, and go on.
    const shell = dark ? '#E2C9B0' : '#5A4636';
    const c = Math.max(2.5 * px, L * 0.006);
    for (let i = 0; i < 4; i++) {
      const home = L * (0.08 + r2() * 0.72);
      const reach = L * (0.03 + r2() * 0.07);
      const speed = 0.04 + r2() * 0.06;
      const ph = r2() * Math.PI * 2;
      const g = ambient * speed + ph;
      const gait = g - Math.sin(g * 6) / 7.5;
      const x = Math.max(0.05 * L, Math.min(0.85 * L, home + reach * Math.sin(gait)));
      const facing = Math.cos(gait) >= 0 ? 1 : -1;
      const y = topAt(x) - c * 0.55;
      const step = Math.sin(gait * 60);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(facing, 1);
      ctx.strokeStyle = shell;
      ctx.fillStyle = shell;
      ctx.lineWidth = 0.7 * px;
      ctx.globalAlpha = life * 0.85;
      ctx.beginPath();
      if (i % 2 === 0) {
        // A crab: a round shell, legs either side, two small claws.
        ctx.ellipse(0, 0, c, c * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const lift = (k % 2 ? step : -step) * c * 0.15;
          for (const s of [-1, 1]) {
            ctx.moveTo(s * c * (0.3 + k * 0.25), c * 0.3);
            ctx.lineTo(s * c * (0.7 + k * 0.35), c * 0.85 + lift);
          }
        }
        ctx.moveTo(c * 0.7, -c * 0.2);
        ctx.quadraticCurveTo(c * 1.4, -c * 0.7, c * 1.6, -c * 0.2);
      } else {
        // A squat lobster: narrower, its long arms held out ahead.
        ctx.ellipse(0, 0, c * 1.1, c * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const lift = (k % 2 ? step : -step) * c * 0.15;
          ctx.moveTo(-c * 0.2 + k * c * 0.35, c * 0.3);
          ctx.lineTo(-c * 0.5 + k * c * 0.45, c * 0.85 + lift);
        }
        const wave = Math.sin(ambient * 0.7 + i) * c * 0.15;
        ctx.moveTo(c * 0.9, -c * 0.1);
        ctx.lineTo(c * 2.6, -c * 0.45 + wave);
        ctx.moveTo(c * 0.9, c * 0.1);
        ctx.lineTo(c * 2.5, c * 0.05 + wave);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}
