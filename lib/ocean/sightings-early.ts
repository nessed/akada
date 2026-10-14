/**
 * Five rare sightings for the first two hours, the water every sitting
 * passes through, each something really met there:
 *
 * - a pod of dolphins crossing high in the light, each one kicking, the pod
 *   strung out and rising and falling as it goes;
 * - a manta ray gliding over, seen from beneath as a diver sees one, its
 *   wings beating slowly, its belly pale and spotted;
 * - a whale shark, the biggest fish there is, slow, spotted and striped, its
 *   tail sweeping, a remora or two under it;
 * - a sperm whale at midnight, come down head first to hunt, its clicks
 *   going out ahead of it in the dark;
 * - a vampire squid, its webbed arms spread like a cloak, turning itself
 *   inside out and leaving a cloud of blue light behind it.
 *
 * The same contract as the other sightings: device pixels, `px` on every
 * size that is not already a share of the page, `age` 0 to 1 across the
 * event, `seed` for what differs between one and the next, `ambient` for
 * the small motion, light ink on dark water. Plates from a natural
 * history: a wash under one ink line, hatching and stipple, never a cartoon.
 * Each animal is inked once a size to a sprite and only placed, the way
 * the turtle is, so a frame pays a few image copies.
 */

import { mixHex } from '../fan';
import { HUES, IRON_GALL } from './palette';
import { bounds, detailFor, hatch, inkLine, LIGHT, smooth as curve, smoothPath, stipple, washFill } from './pen';
import { hash32, mulberry32 } from './random';

const PAPER = '#FBF8EF';
const NIGHT = '#1A1815';
const UNLIGHT: [number, number] = [-LIGHT[0], -LIGHT[1]];

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

function inkOf(dark: boolean): string {
  return dark ? IRON_GALL.dark : IRON_GALL.light;
}

/** A wash laid over the water's own colour: the hue, eased toward the paper or the night. */
function washOf(hue: string, dark: boolean, k = 0.2): string {
  return dark ? mixHex(hue, NIGHT, 0.45) : mixHex(hue, PAPER, k);
}

function pathOf(pts: number[], closed = true): Path2D {
  const p = new Path2D();
  for (let i = 0; i < pts.length; i += 2) {
    if (i === 0) p.moveTo(pts[0], pts[1]);
    else p.lineTo(pts[i], pts[i + 1]);
  }
  if (closed) p.closePath();
  return p;
}

/** A small closed shape as the pen draws its outline: smoothed, so its wash lies under its line. */
function shapeOf(pts: number[]): Path2D {
  return smoothPath(pts, true, 5);
}

/** Its box, smoothed the same way. */
function boxOf(pts: number[]) {
  return bounds(curve(pts, true, 5));
}

/* ---- Sprites ---- */

interface Inked {
  canvas: HTMLCanvasElement;
  /** Where the animal's own origin is in the canvas, device px. */
  ox: number;
  oy: number;
}

const inked = new Map<string, Inked | null>();

/** An animal inked once to a canvas `w` by `h` with its origin at (`ox`, `oy`), and after that only placed. */
function sprite(key: string, w: number, h: number, ox: number, oy: number, draw: (g: CanvasRenderingContext2D) => void): Inked | null {
  if (inked.has(key)) {
    const hit = inked.get(key) ?? null;
    inked.delete(key);
    inked.set(key, hit);
    return hit;
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(4096, Math.ceil(w)));
  canvas.height = Math.max(1, Math.min(4096, Math.ceil(h)));
  const g = canvas.getContext('2d');
  let made: Inked | null = null;
  if (g) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.translate(ox, oy);
    draw(g);
    made = { canvas, ox, oy };
  }
  inked.set(key, made);
  while (inked.size > 28) inked.delete(inked.keys().next().value as string);
  return made;
}

function place(ctx: CanvasRenderingContext2D, s: Inked | null, x: number, y: number, rot: number, flip: number, alpha: number, sy = 1) {
  if (!s || alpha <= 0.005) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(flip, sy);
  ctx.drawImage(s.canvas, -s.ox, -s.oy);
  ctx.restore();
}

/* ---- A body along its length ---- */

/**
 * A side-on body `L` long, tail at x = -L/2 and nose at +L/2: along its
 * back from tail to nose, then along its belly back again. `prof(s)` gives
 * its back's height and its belly's depth at `s` (0 tail, 1 nose), as
 * shares of `L`.
 */
function bodyOutline(L: number, prof: (s: number) => [number, number], n = 56): number[] {
  const top: number[] = [];
  const bot: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const [t, b] = prof(s);
    top.push((s - 0.5) * L, -t * L);
    bot.push((s - 0.5) * L, b * L);
  }
  const out = top.slice();
  for (let i = bot.length - 2; i >= 0; i -= 2) out.push(bot[i], bot[i + 1]);
  return out;
}

/** Shading top to bottom across a body: 0 on its back, 1 under its belly. */
function bellyShade(box: { y: number; h: number }, from = 0.45) {
  return (_x: number, y: number) => clamp01(from + (1 - from) * ((y - box.y) / Math.max(1, box.h)) * 1.4 - 0.4);
}

/* ---- Dolphins ---- */

function dolphinProf(s: number): [number, number] {
  // The tail stock narrow, the body full to the melon, the beak short and thin.
  const body = Math.pow(Math.sin(Math.PI * clamp01((s - 0.02) / 0.88)), 0.8);
  let top = 0.012 + 0.074 * body;
  let bot = 0.01 + 0.064 * body;
  if (s > 0.8) {
    // The melon swells a little over the eye, then drops to the beak.
    top += 0.012 * Math.sin(Math.PI * clamp01((s - 0.8) / 0.1));
  }
  if (s > 0.88) {
    const k = smooth((s - 0.88) / 0.12);
    top = top * (1 - k) + 0.008 * k;
    bot = bot * (1 - k) + 0.007 * k;
  }
  return [top, bot];
}

function paintDolphin(g: CanvasRenderingContext2D, L: number, dark: boolean, px: number, seed: number) {
  const ink = inkOf(dark);
  const back = dark ? mixHex('#6B7782', NIGHT, 0.35) : mixHex('#5F6B76', PAPER, 0.22);
  const belly = dark ? mixHex('#CFC9BC', NIGHT, 0.55) : mixHex('#F1ECE0', PAPER, 0.3);
  const flank = dark ? mixHex(HUES[6], NIGHT, 0.55) : mixHex(HUES[6], PAPER, 0.15);
  const light = dark ? UNLIGHT : LIGHT;
  const pw = px * (1 - 0.3 * detailFor(L));
  const out = bodyOutline(L, dolphinProf);
  const body = pathOf(out);
  const box = bounds(out);
  // Flukes: horizontal, so edge-on from the side, a thin swept blade.
  const fl = [-0.5 * L, -0.008 * L, -0.6 * L, -0.03 * L, -0.64 * L, -0.012 * L, -0.6 * L, 0.004 * L, -0.64 * L, 0.024 * L, -0.6 * L, 0.03 * L, -0.5 * L, 0.009 * L];
  // Dorsal fin: tall and falcate, its trailing edge hollowed back.
  const [t55] = dolphinProf(0.55);
  const dorsal = [0.08 * L, -t55 * L + 0.004 * L, -0.02 * L, -t55 * L - 0.1 * L, -0.06 * L, -t55 * L - 0.11 * L, -0.045 * L, -t55 * L - 0.075 * L, -0.06 * L, -t55 * L + 0.006 * L];
  const pec = [0.17 * L, 0.03 * L, 0.11 * L, 0.085 * L, 0.095 * L, 0.09 * L, 0.12 * L, 0.04 * L];
  const fin = (pts: number[], seed2: number) => {
    const p = shapeOf(pts);
    washFill(g, p, boxOf(pts), { color: back, edge: 0.3, paper: dark ? null : PAPER, highlight: 0.1, px, light });
    inkLine(g, pts, true, { width: 0.9 * pw, color: ink, swell: 0.6, lost: 0.2, seed: seed2, light });
  };
  // The far flipper and the flukes behind the body.
  fin(fl, hash32(seed, 'fluke'));
  washFill(g, body, box, { color: belly, edge: 0.2, paper: dark ? null : PAPER, highlight: 0.2, px, light });
  g.save();
  g.clip(body);
  // The cape: dark down the back, dipping in a V under the dorsal fin, as a
  // common dolphin's does; the pale belly under it, and a buff patch on the
  // fore flank.
  const cape: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const s = i / 40;
    const [t, b] = dolphinProf(s);
    const dip = 0.55 * Math.exp(-Math.pow((s - 0.52) / 0.12, 2));
    const y = (-t + (t + b) * (0.38 + dip * 0.45)) * L;
    cape.push((s - 0.5) * L, s > 0.86 ? (-t + (t + b) * 0.55) * L : y);
  }
  cape.push(0.6 * L, -0.3 * L, -0.6 * L, -0.3 * L);
  washFill(g, pathOf(cape), box, { color: back, edge: 0.35, paper: null, px, light });
  g.globalAlpha = 0.55;
  g.fillStyle = flank;
  g.beginPath();
  g.ellipse(0.17 * L, 0.012 * L, 0.13 * L, 0.025 * L, -0.05, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  hatch(g, body, box, { spacing: 2.6 * px, angle: Math.PI / 2 - 0.35, shade: bellyShade(box, 0.2), from: 0.6, color: ink, width: 0.45 * pw, alpha: 0.5, bow: 0.15, seed: hash32(seed, 'hatch') });
  g.restore();
  inkLine(g, out, true, { width: 1.1 * pw, color: ink, swell: 0.7, lost: 0.3, seed: hash32(seed, 'line'), light, plate: true });
  fin(dorsal, hash32(seed, 'dorsal'));
  fin(pec, hash32(seed, 'pec'));
  // The eye, and the mouth's line along the beak.
  g.fillStyle = ink;
  g.beginPath();
  g.arc(0.355 * L, -0.005 * L, Math.max(0.8 * px, 0.008 * L), 0, Math.PI * 2);
  g.fill();
  inkLine(g, [0.5 * L, 0.002 * L, 0.42 * L, 0.006 * L, 0.37 * L, 0.012 * L], false, { width: 0.6 * pw, color: ink, taper: [0.1, 0.4], seed: hash32(seed, 'mouth') });
}

/**
 * A pod crossing high in the light: four to seven, strung out and staggered,
 * each kicking and rising and falling on its own beat, the pod going by in
 * about forty seconds.
 */
export function drawDolphins(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean) {
  const env = envelope(age, 0.08, 0.08);
  if (env <= 0) return;
  const r = mulberry32(hash32(seed, 'pod'));
  const dir = seed & 1 ? 1 : -1;
  const L = Math.max(60 * px, Math.min(w * 0.13, h * 0.2, 190 * px));
  const n = 4 + Math.floor(r() * 4);
  const s = sprite(`dolphin|${seed}|${Math.round(L)}|${dark ? 1 : 0}|${px}`, L * 1.4, L * 0.42, L * 0.68, L * 0.22, (g) => paintDolphin(g, L, dark, px, seed));
  const lane = h * (0.14 + 0.16 * r());
  const travel = w + L * 6;
  for (let i = 0; i < n; i++) {
    const back = r() * L * 3.2;
    const dy = (r() - 0.5) * L * 1.1;
    const beat = 2.3 + r() * 0.6;
    const ph = r() * 6.28;
    const far = r() < 0.35;
    const x0 = -L * 2 - back + age * travel;
    const x = dir > 0 ? x0 : w - x0;
    // Rising and falling through the water as dolphins do, and the kick's pitch.
    const wave = Math.sin(ambient * 0.9 + ph) * L * 0.25;
    const pitch = Math.cos(ambient * 0.9 + ph) * 0.12 + Math.sin(ambient * beat + ph) * 0.05;
    const k = far ? 0.72 : 1;
    ctx.save();
    ctx.translate(x, lane + dy + wave);
    ctx.scale(k, k);
    place(ctx, s, 0, 0, pitch * dir, dir, env * (far ? 0.55 : 0.92));
    ctx.restore();
  }
}

/* ---- The manta ---- */

/** A manta seen from beneath, `S` from wingtip to wingtip, its head toward +x; `flap` 0 (wings level) to 1 (tips down toward the viewer). */
function mantaOutline(S: number, flap: number): { disc: number[]; horns: number[][]; tail: number[] } {
  // The wingtips swing in toward the body as they beat (foreshortened).
  const span = S * (0.5 - 0.07 * flap);
  const tipX = -0.02 * S - 0.03 * S * flap;
  const half: number[] = [];
  // Leading edge: from beside the head out to the tip, nearly straight, a
  // little full in its middle.
  for (let i = 0; i <= 14; i++) {
    const k = i / 14;
    const x = 0.11 * S + (tipX - 0.11 * S) * k + Math.sin(Math.PI * k) * 0.045 * S;
    const y = 0.085 * S + (span - 0.085 * S) * k;
    half.push(x, y);
  }
  // Trailing edge: from the tip back in, hollowed, to the root of the tail.
  for (let i = 1; i <= 12; i++) {
    const k = i / 12;
    const x = tipX + (-0.17 * S - tipX) * k + Math.sin(Math.PI * k) * 0.07 * S;
    const y = span * (1 - k) + 0.05 * S * k;
    half.push(x, y);
  }
  // The head stands forward of the wings' roots.
  const disc: number[] = [0.165 * S, 0, 0.155 * S, 0.055 * S];
  for (let i = 0; i < half.length; i += 2) disc.push(half[i], half[i + 1]);
  disc.push(-0.19 * S, 0);
  for (let i = half.length - 2; i >= 0; i -= 2) disc.push(half[i], -half[i + 1]);
  disc.push(0.155 * S, -0.055 * S);
  // Cephalic fins, short and rolled, either side of the mouth.
  const horn = (sgn: number) => [0.14 * S, sgn * 0.07 * S, 0.2 * S, sgn * 0.078 * S, 0.215 * S, sgn * 0.062 * S, 0.2 * S, sgn * 0.05 * S, 0.15 * S, sgn * 0.05 * S];
  return { disc, horns: [horn(1), horn(-1)], tail: [-0.19 * S, 0, -0.4 * S, 0.008 * S, -0.55 * S, 0.018 * S] };
}

function paintManta(g: CanvasRenderingContext2D, S: number, flap: number, dark: boolean, px: number, seed: number) {
  const ink = inkOf(dark);
  const light = dark ? UNLIGHT : LIGHT;
  const belly = dark ? mixHex('#D8D3C6', NIGHT, 0.5) : mixHex('#F3EFE4', PAPER, 0.25);
  const rim = dark ? mixHex('#4A5058', NIGHT, 0.2) : mixHex('#4A535C', PAPER, 0.3);
  const pw = px * (1 - 0.3 * detailFor(S));
  const { disc, horns, tail } = mantaOutline(S, flap);
  const p = pathOf(disc);
  const box = bounds(disc);
  inkLine(g, tail, false, { width: 1.6 * pw, color: ink, taper: [0, 0.8], seed: hash32(seed, 'tail') });
  for (const hn of horns) {
    washFill(g, shapeOf(hn), boxOf(hn), { color: rim, edge: 0.3, paper: null, px, light });
    inkLine(g, hn, true, { width: 0.8 * pw, color: ink, swell: 0.5, seed: hash32(seed, 'horn', hn[1]), light });
  }
  washFill(g, p, box, { color: belly, edge: 0.15, paper: dark ? null : PAPER, highlight: 0.25, px, light });
  g.save();
  g.clip(p);
  // The dark of the back showing round the belly's edge, broad at the wingtips.
  g.lineWidth = S * 0.06;
  g.strokeStyle = rim;
  g.globalAlpha = 0.75;
  g.stroke(p);
  g.globalAlpha = 1;
  // Its spots: every manta's own, between and behind the gills.
  const r = mulberry32(hash32(seed, 'spots'));
  g.fillStyle = dark ? mixHex(rim, NIGHT, 0.2) : rim;
  for (let i = 0; i < 9 + Math.floor(r() * 8); i++) {
    const x = (-0.12 + r() * 0.24) * S;
    const y = (r() - 0.5) * 0.22 * S;
    g.globalAlpha = 0.5 + 0.4 * r();
    g.beginPath();
    g.ellipse(x, y, (0.008 + 0.014 * r()) * S, (0.006 + 0.01 * r()) * S, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  stipple(g, p, box, { spacing: 3.2 * px, shade: (x, y) => clamp01(Math.abs(y) / (S * 0.5) * 1.1 + (x < -0.1 * S ? 0.2 : 0)), from: 0.5, color: ink, radius: 0.5 * pw, alpha: 0.5, seed: hash32(seed, 'stip') });
  g.restore();
  inkLine(g, disc, true, { width: 1.1 * pw, color: ink, swell: 0.7, lost: 0.3, seed: hash32(seed, 'disc'), light, plate: true });
  // Five gill slits a side, and the wide mouth between the horns.
  for (const sgn of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const x = (0.1 - i * 0.026) * S;
      inkLine(g, [x, sgn * 0.045 * S, x - 0.008 * S, sgn * 0.1 * S], false, { width: 0.95 * pw, color: ink, alpha: 0.85, taper: [0.2, 0.2], seed: hash32(seed, 'gill', i, sgn) });
    }
  }
  inkLine(g, [0.155 * S, -0.045 * S, 0.165 * S, 0, 0.155 * S, 0.045 * S], false, { width: 1 * pw, color: ink, seed: hash32(seed, 'mouth') });
}

/** A manta gliding over, beneath the reader's line of sight, wings beating slowly, banking a little as it goes. */
export function drawManta(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean) {
  const env = envelope(age, 0.12, 0.12);
  if (env <= 0) return;
  const dir = seed & 1 ? 1 : -1;
  const S = Math.max(90 * px, Math.min(w * 0.3, h * 0.42, 420 * px));
  const travel = w + S * 1.6;
  const x0 = -S * 0.8 + age * travel;
  const x = dir > 0 ? x0 : w - x0;
  const y = h * (0.28 + ((seed >>> 4) % 100) / 100 * 0.2) + Math.sin(age * Math.PI * 2) * h * 0.04;
  // Eight inked frames of the beat, played on the slow clock.
  const beat = (Math.sin(ambient * 1.1 + (seed % 7)) + 1) / 2;
  const frame = Math.round(beat * 7);
  const s = sprite(`manta|${seed}|${Math.round(S)}|${frame}|${dark ? 1 : 0}|${px}`, S * 1.05, S * 1.1, S * 0.65, S * 0.55, (g) => paintManta(g, S, frame / 7, dark, px, seed));
  const bank = Math.sin(age * Math.PI * 2 + 1) * 0.12;
  place(ctx, s, x, y, bank * dir, dir, env * 0.92);
}

/* ---- The whale shark ---- */

function sharkProf(s: number): [number, number] {
  // A long body, deepest a third of the way back from the head, a broad flat head and a square snout.
  const body = Math.pow(Math.sin(Math.PI * clamp01((s - 0.02) / 0.96)), 0.7);
  let top = 0.012 + 0.084 * body;
  let bot = 0.01 + 0.07 * body;
  // The head: broad and flat, held deep to the very front, then a square snout.
  if (s > 0.7) {
    const k = smooth((s - 0.7) / 0.2);
    top = top * (1 - k) + 0.055 * k;
    bot = bot * (1 - k) + 0.04 * k;
  }
  if (s > 0.96) {
    const k = smooth((s - 0.96) / 0.04);
    top *= 1 - 0.45 * k;
    bot *= 1 - 0.35 * k;
  }
  return [top, bot];
}

function paintSharkBody(g: CanvasRenderingContext2D, L: number, dark: boolean, px: number, seed: number) {
  const ink = inkOf(dark);
  const light = dark ? UNLIGHT : LIGHT;
  const skin = dark ? mixHex(mixHex(HUES[4], '#3E4A55', 0.6), NIGHT, 0.25) : mixHex(mixHex(HUES[4], '#4B5A66', 0.55), PAPER, 0.1);
  const belly = dark ? mixHex('#C9C4B8', NIGHT, 0.55) : mixHex('#EEE9DD', PAPER, 0.25);
  const spot = dark ? mixHex('#E8E0CF', NIGHT, 0.25) : '#F6F2E8';
  const pw = px * (1 - 0.35 * detailFor(L * 0.5));
  // The body ends at the tail's root; the tail is drawn on its own, to sweep.
  const out = bodyOutline(L, sharkProf);
  const body = pathOf(out);
  const box = bounds(out);
  const fin = (pts: number[], key: string, k = 1) => {
    const p = shapeOf(pts);
    washFill(g, p, boxOf(pts), { color: skin, edge: 0.3, paper: null, px, light, alpha: k });
    inkLine(g, pts, true, { width: 0.9 * pw, color: ink, swell: 0.6, lost: 0.25, seed: hash32(seed, key), light });
  };
  washFill(g, body, box, { color: belly, edge: 0.2, paper: dark ? null : PAPER, highlight: 0.15, px, light });
  g.save();
  g.clip(body);
  // Dark down the back and flank, the belly pale.
  const line: number[] = [];
  for (let i = 0; i <= 30; i++) {
    const s = i / 30;
    const [t, b] = sharkProf(s);
    line.push((s - 0.5) * L, (-t + (t + b) * 0.62) * L);
  }
  line.push(0.6 * L, -0.3 * L, -0.6 * L, -0.3 * L);
  const back = pathOf(line);
  washFill(g, back, box, { color: skin, edge: 0.3, paper: null, px, light });
  // The ridges along its flank.
  for (const k of [0.25, 0.45]) {
    const pts: number[] = [];
    for (let i = 2; i <= 26; i++) {
      const s = i / 30;
      const [t, b] = sharkProf(s);
      pts.push((s - 0.5) * L, (-t + (t + b) * k) * L);
    }
    inkLine(g, pts, false, { width: 0.5 * pw, color: ink, alpha: 0.55, lost: 0.5, taper: [0.2, 0.2], seed: hash32(seed, 'ridge', k) });
  }
  // Its pattern: pale spots in rows, broken by pale stripes across the back.
  const r = mulberry32(hash32(seed, 'spots'));
  g.save();
  g.clip(back);
  g.fillStyle = spot;
  for (let i = 0; i < 26; i++) {
    const s = 0.05 + i * 0.035;
    const x = (s - 0.5) * L;
    // A stripe down from the back.
    if (s < 0.75) {
      g.globalAlpha = 0.45;
      g.fillRect(x - 0.003 * L, -0.12 * L, 0.006 * L, 0.18 * L);
    }
    for (let j = 0; j < 7; j++) {
      const [t] = sharkProf(s);
      const y = -t * L + (j + 0.5) * 0.022 * L + (r() - 0.5) * 0.006 * L;
      g.globalAlpha = 0.55 + 0.35 * r();
      g.beginPath();
      g.arc(x + 0.017 * L + (r() - 0.5) * 0.008 * L, y, (0.0035 + 0.003 * r()) * L, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  hatch(g, body, box, { spacing: 2.8 * px, angle: Math.PI / 2 - 0.35, shade: bellyShade(box, 0.15), from: 0.62, color: ink, width: 0.45 * pw, alpha: 0.45, bow: 0.12, seed: hash32(seed, 'hatch') });
  g.restore();
  inkLine(g, out, true, { width: 1.2 * pw, color: ink, swell: 0.7, lost: 0.3, seed: hash32(seed, 'outline'), light, plate: true });
  // Five gill slits behind the head.
  for (let i = 0; i < 5; i++) {
    const x = (0.33 - i * 0.02) * L;
    inkLine(g, [x, -0.02 * L, x - 0.006 * L, 0.02 * L, x - 0.002 * L, 0.045 * L], false, { width: 0.6 * pw, color: ink, alpha: 0.85, taper: [0.2, 0.2], seed: hash32(seed, 'gill', i) });
  }
  // Its fins: the first dorsal tall, the second small; pelvic and anal under.
  const [t42] = sharkProf(0.42);
  fin([0.0 * L, -t42 * L + 0.01 * L, -0.07 * L, -t42 * L - 0.11 * L, -0.1 * L, -t42 * L - 0.11 * L, -0.11 * L, -t42 * L + 0.01 * L], 'dorsal');
  const [t2] = sharkProf(0.22);
  fin([-0.24 * L, -t2 * L + 0.005 * L, -0.28 * L, -t2 * L - 0.045 * L, -0.31 * L, -t2 * L - 0.04 * L, -0.31 * L, -t2 * L + 0.004 * L], 'dorsal2');
  fin([-0.12 * L, 0.06 * L, -0.16 * L, 0.1 * L, -0.19 * L, 0.095 * L, -0.18 * L, 0.055 * L], 'pelvic');
  fin([0.26 * L, 0.05 * L, 0.17 * L, 0.125 * L, 0.14 * L, 0.125 * L, 0.19 * L, 0.055 * L], 'pec');
  // The mouth, wide across the front of the snout, and the small eye behind it.
  inkLine(g, [0.5 * L, 0.006 * L, 0.48 * L, 0.014 * L, 0.44 * L, 0.018 * L], false, { width: 1.1 * pw, color: ink, taper: [0.05, 0.5], seed: hash32(seed, 'mouth') });
  g.fillStyle = ink;
  g.beginPath();
  g.arc(0.45 * L, -0.014 * L, Math.max(0.8 * px, 0.005 * L), 0, Math.PI * 2);
  g.fill();
  // A remora or two riding under it.
  for (const [x, y] of [
    [0.05, 0.075],
    [-0.08, 0.07],
  ]) {
    const rm = [x * L - 0.03 * L, y * L, x * L + 0.02 * L, y * L - 0.004 * L, x * L + 0.03 * L, y * L + 0.003 * L, x * L - 0.03 * L, y * L + 0.007 * L];
    g.fillStyle = dark ? mixHex(skin, NIGHT, 0.2) : mixHex(skin, '#2A2320', 0.25);
    g.fill(shapeOf(rm));
    inkLine(g, rm, true, { width: 0.5 * pw, color: ink, seed: hash32(seed, 'remora', x) });
  }
}

/** The tail: its upper lobe long, its lower shorter, drawn from its root at the origin, pointing -x. */
function paintSharkTail(g: CanvasRenderingContext2D, L: number, dark: boolean, px: number, seed: number) {
  const ink = inkOf(dark);
  const light = dark ? UNLIGHT : LIGHT;
  const skin = dark ? mixHex(mixHex(HUES[4], '#3E4A55', 0.6), NIGHT, 0.25) : mixHex(mixHex(HUES[4], '#4B5A66', 0.55), PAPER, 0.1);
  const pw = px * (1 - 0.35 * detailFor(L * 0.5));
  const pts = [0.02 * L, -0.03 * L, -0.09 * L, -0.08 * L, -0.17 * L, -0.17 * L, -0.15 * L, -0.08 * L, -0.11 * L, -0.005 * L, -0.15 * L, 0.06 * L, -0.12 * L, 0.07 * L, 0.02 * L, 0.03 * L];
  const p = shapeOf(pts);
  washFill(g, p, boxOf(pts), { color: skin, edge: 0.3, paper: null, px, light });
  inkLine(g, pts, true, { width: 1 * pw, color: ink, swell: 0.6, lost: 0.25, seed: hash32(seed, 'tail'), light });
}

/** A whale shark going slowly by, its tail sweeping, across about a minute. */
export function drawWhaleShark(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean) {
  const env = envelope(age, 0.12, 0.12);
  if (env <= 0) return;
  const dir = seed & 1 ? 1 : -1;
  const L = Math.max(160 * px, Math.min(w * 0.62, h * 0.95, 900 * px));
  const travel = w + L * 1.8;
  const x0 = -L * 0.75 + age * travel;
  const x = dir > 0 ? x0 : w - x0;
  const y = h * (0.42 + ((seed >>> 5) % 100) / 100 * 0.2) + Math.sin(ambient * 0.13 + (seed % 9)) * h * 0.01;
  const key = `${seed}|${Math.round(L)}|${dark ? 1 : 0}|${px}`;
  const body = sprite(`shark|${key}`, L * 1.06, L * 0.42, L * 0.53, L * 0.2, (g) => paintSharkBody(g, L, dark, px, seed));
  const tail = sprite(`shark-tail|${key}`, L * 0.22, L * 0.3, L * 0.19, L * 0.18, (g) => paintSharkTail(g, L, dark, px, seed));
  const sweep = Math.sin(ambient * 0.9 + (seed % 5)) * 0.22;
  const a = env * 0.9;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  // The tail sweeping from its root at the end of the body, behind it.
  place(ctx, tail, -0.485 * L, 0, sweep, 1, a, 1 - Math.abs(sweep) * 0.6);
  place(ctx, body, 0, 0, sweep * 0.06, 1, a);
  ctx.restore();
}

/* ---- The sperm whale ---- */

function spermProf(s: number): [number, number] {
  // A square head a third of it long, a hump where a fin would be, knuckles
  // down the tail stock.
  const body = Math.pow(Math.sin(Math.PI * clamp01((s - 0.02) / 0.86)), 0.75);
  let top = 0.018 + 0.1 * body;
  let bot = 0.016 + 0.085 * body;
  if (s > 0.62) {
    // The head: as deep as the body and blunt-ended, the forehead square.
    const k = smooth((s - 0.62) / 0.1);
    top = top * (1 - k) + 0.105 * k;
    bot = bot * (1 - k) + 0.085 * k;
  }
  if (s > 0.97) {
    const k = smooth((s - 0.97) / 0.03);
    top *= 1 - 0.35 * k;
    bot *= 1 - 0.6 * k;
  }
  // The hump, and the knuckles behind it.
  top += 0.012 * Math.exp(-Math.pow((s - 0.38) / 0.03, 2));
  for (const at of [0.3, 0.25, 0.2, 0.16]) top += 0.005 * Math.exp(-Math.pow((s - at) / 0.012, 2));
  return [top, bot];
}

function paintSperm(g: CanvasRenderingContext2D, L: number, dark: boolean, px: number, seed: number) {
  const ink = inkOf(dark);
  const light = dark ? UNLIGHT : LIGHT;
  const skin = dark ? mixHex('#4C4844', NIGHT, 0.15) : mixHex('#5A544E', PAPER, 0.1);
  const jaw = dark ? mixHex('#E4DED0', NIGHT, 0.4) : '#F1ECE1';
  const pw = px * (1 - 0.35 * detailFor(L * 0.5));
  const out = bodyOutline(L, spermProf);
  const body = pathOf(out);
  const box = bounds(out);
  // Flukes, edge-on: a broad thin blade.
  const fl = [-0.48 * L, -0.01 * L, -0.58 * L, -0.02 * L, -0.67 * L, -0.012 * L, -0.65 * L, 0, -0.67 * L, 0.012 * L, -0.58 * L, 0.018 * L, -0.48 * L, 0.01 * L];
  washFill(g, shapeOf(fl), boxOf(fl), { color: skin, edge: 0.3, paper: null, px, light });
  inkLine(g, fl, true, { width: 0.9 * pw, color: ink, swell: 0.6, seed: hash32(seed, 'fluke'), light });
  washFill(g, body, box, { color: skin, edge: 0.35, paper: dark ? null : PAPER, highlight: 0.18, granulate: 0.5, px, light });
  g.save();
  g.clip(body);
  // Its skin: wrinkled along its length, long wavering lines.
  const r = mulberry32(hash32(seed, 'wrinkle'));
  for (let i = 0; i < 14; i++) {
    const k = 0.12 + i * 0.06;
    const pts: number[] = [];
    const from = 0.05 + r() * 0.1;
    const to = 0.6 - r() * 0.15;
    for (let j = 0; j <= 18; j++) {
      const s = from + ((to - from) * j) / 18;
      const [t, b] = spermProf(s);
      pts.push((s - 0.5) * L, (-t + (t + b) * k) * L + Math.sin(j * 1.7 + i) * 0.003 * L);
    }
    inkLine(g, pts, false, { width: 0.4 * pw, color: ink, alpha: 0.4, lost: 0.6, taper: [0.3, 0.3], seed: hash32(seed, 'wr', i) });
  }
  hatch(g, body, box, { spacing: 2.8 * px, angle: Math.PI / 2 - 0.35, shade: bellyShade(box, 0.25), from: 0.55, cross: 0.92, color: ink, width: 0.45 * pw, alpha: 0.5, bow: 0.12, seed: hash32(seed, 'hatch') });
  g.restore();
  // The lower jaw: long and narrow under the head, pale, with its teeth.
  const jawPts = [0.13 * L, 0.07 * L, 0.38 * L, 0.06 * L, 0.45 * L, 0.055 * L, 0.45 * L, 0.07 * L, 0.36 * L, 0.082 * L, 0.13 * L, 0.085 * L];
  const jp = shapeOf(jawPts);
  washFill(g, jp, boxOf(jawPts), { color: jaw, edge: 0.2, paper: null, px, light });
  inkLine(g, jawPts, true, { width: 0.8 * pw, color: ink, swell: 0.5, seed: hash32(seed, 'jaw'), light });
  for (let i = 0; i < 9; i++) {
    const x = (0.22 + i * 0.025) * L;
    inkLine(g, [x, 0.06 * L, x + 0.004 * L, 0.052 * L], false, { width: 0.5 * pw, color: ink, alpha: 0.7, seed: hash32(seed, 'tooth', i) });
  }
  inkLine(g, out, true, { width: 1.2 * pw, color: ink, swell: 0.7, lost: 0.3, seed: hash32(seed, 'outline'), light, plate: true });
  // The flipper, small and paddle-shaped, low behind the head.
  const pec = [0.1 * L, 0.06 * L, 0.04 * L, 0.11 * L, 0.02 * L, 0.105 * L, 0.06 * L, 0.06 * L];
  washFill(g, shapeOf(pec), boxOf(pec), { color: skin, edge: 0.3, paper: null, px, light });
  inkLine(g, pec, true, { width: 0.8 * pw, color: ink, swell: 0.6, seed: hash32(seed, 'pec'), light });
  // The small eye, far back by the jaw's hinge.
  g.fillStyle = dark ? IRON_GALL.dark : ink;
  g.beginPath();
  g.arc(0.15 * L, 0.035 * L, Math.max(0.8 * px, 0.005 * L), 0, Math.PI * 2);
  g.fill();
}

/**
 * A sperm whale come down to hunt: head first and slanting down across the
 * dark, its clicks going out ahead of it, a ring at a time.
 */
export function drawSpermWhale(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean) {
  const env = envelope(age, 0.15, 0.15);
  if (env <= 0) return;
  const dir = seed & 1 ? 1 : -1;
  const L = Math.max(160 * px, Math.min(w * 0.55, h * 0.9, 820 * px));
  // Down at a slant across the page.
  const slope = 0.32 + (((seed >>> 3) % 100) / 100) * 0.12;
  const travel = w + L * 1.6;
  const x0 = -L * 0.7 + age * travel;
  const x = dir > 0 ? x0 : w - x0;
  const y = h * 0.1 + (x0 + L * 0.7) * Math.tan(slope) * 0.6 - L * 0.1;
  const s = sprite(`sperm|${seed}|${Math.round(L)}|${dark ? 1 : 0}|${px}`, L * 1.36, L * 0.36, L * 0.68, L * 0.16, (g) => paintSperm(g, L, dark, px, seed));
  const a = env * 0.85;
  place(ctx, s, x, y, slope * dir, dir, a);
  // Its clicks: rings going out from its head, each fading as it widens.
  const hx = x + dir * Math.cos(slope) * L * 0.5;
  const hy = y + Math.sin(slope) * L * 0.5;
  ctx.save();
  ctx.strokeStyle = dark ? IRON_GALL.dark : IRON_GALL.light;
  ctx.lineWidth = 0.8 * px;
  for (let k = 0; k < 3; k++) {
    const t = (ambient * 0.7 + k / 3) % 1;
    const rad = L * (0.05 + 0.35 * t);
    ctx.globalAlpha = a * 0.35 * (1 - t) * smooth(t / 0.1);
    ctx.beginPath();
    const ang = dir > 0 ? slope : Math.PI - slope;
    ctx.arc(hx, hy, rad, ang - 0.45, ang + 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---- The vampire squid ---- */

/** The squid, `S` across its spread cloak, `inside` 0 (cloak spread down) to 1 (turned up over itself), mantle at the origin pointing up. */
function paintVampire(g: CanvasRenderingContext2D, S: number, inside: number, dark: boolean, px: number, seed: number) {
  const ink = inkOf(dark);
  const light = dark ? UNLIGHT : LIGHT;
  const wine = dark ? mixHex('#7A3B44', NIGHT, 0.3) : mixHex('#6E2E38', PAPER, 0.2);
  const inner = dark ? mixHex('#2A1418', NIGHT, 0.1) : mixHex('#3A1B20', PAPER, 0.1);
  const pw = px * (1 - 0.3 * detailFor(S));
  const mantleH = S * 0.32;
  const mantleW = S * 0.2;
  // The cloak: eight arms and the web between, swinging from spread down (0)
  // to swept up over the mantle (1), scalloped between the arm tips.
  const arms = 8;
  const tips: [number, number][] = [];
  for (let i = 0; i < arms; i++) {
    // Left to right: each arm swings up its own side of the mantle.
    const u = i / (arms - 1) - 0.5;
    const down = Math.PI / 2 - u * 1.9;
    const up = u < 0 ? (3 * Math.PI) / 2 + u * 1.2 : -Math.PI / 2 + u * 1.2;
    const a = down + (up - down) * smooth(inside);
    const reach = S * (0.48 - 0.12 * smooth(inside));
    tips.push([Math.cos(a) * reach, mantleH * 0.35 + Math.sin(a) * reach]);
  }
  const web: number[] = [];
  const root: [number, number] = [0, mantleH * 0.35];
  web.push(-mantleW * 0.6, root[1]);
  for (let i = 0; i < arms; i++) {
    const [tx, ty] = tips[i];
    if (i > 0) {
      const [px0, py0] = tips[i - 1];
      // The web's scallop between two tips, held in toward the root.
      web.push(root[0] + ((px0 + tx) / 2 - root[0]) * 0.78, root[1] + ((py0 + ty) / 2 - root[1]) * 0.78);
    }
    web.push(tx, ty);
  }
  web.push(mantleW * 0.6, root[1]);
  const drawWeb = () => {
    const wp = pathOf(web);
    const wb = bounds(web);
    // Turned out, the inside of the cloak shows: black, and set with soft spines.
    washFill(g, wp, wb, { color: inside > 0.5 ? inner : wine, edge: 0.35, paper: null, px, light });
    if (inside > 0.5) {
      const r = mulberry32(hash32(seed, 'cirri'));
      for (let i = 0; i < arms; i++) {
        const [tx, ty] = tips[i];
        for (let j = 1; j < 6; j++) {
          const k = j / 6;
          const cx = root[0] + (tx - root[0]) * k;
          const cy = root[1] + (ty - root[1]) * k;
          const ang = Math.atan2(ty - root[1], tx - root[0]) + (r() < 0.5 ? 1 : -1) * 1.2;
          inkLine(g, [cx, cy, cx + Math.cos(ang) * S * 0.035, cy + Math.sin(ang) * S * 0.035], false, { width: 0.55 * pw, color: dark ? IRON_GALL.dark : '#D8CBBE', alpha: 0.8, taper: [0, 0.8], seed: hash32(seed, 'cirrus', i, j) });
        }
      }
    }
    inkLine(g, web, true, { width: 0.9 * pw, color: ink, swell: 0.6, lost: 0.2, seed: hash32(seed, 'web'), light });
    for (const [tx, ty] of tips) inkLine(g, [root[0], root[1], tx, ty], false, { width: 0.6 * pw, color: ink, alpha: 0.7, taper: [0.1, 0.4], seed: hash32(seed, 'arm', tx) });
  };
  const drawMantle = () => {
    // The mantle, a soft bag, with a fin either side like an ear.
    const mantle: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      mantle.push(Math.cos(a) * mantleW * (1 - 0.15 * Math.sin((i / 24) * Math.PI)), mantleH * 0.35 + Math.sin(a) * mantleH);
    }
    const mp = pathOf(mantle);
    washFill(g, mp, bounds(mantle), { color: wine, edge: 0.35, paper: dark ? null : PAPER, highlight: 0.2, px, light });
    stipple(g, mp, bounds(mantle), { spacing: 2.4 * px, shade: (x) => clamp01(0.5 + (x / mantleW) * 0.5), from: 0.4, color: ink, radius: 0.45 * pw, alpha: 0.5, seed: hash32(seed, 'mantle') });
    inkLine(g, mantle, true, { width: 1 * pw, color: ink, swell: 0.7, seed: hash32(seed, 'mantle-line'), light });
    for (const sgn of [-1, 1]) {
      const ear = [sgn * mantleW * 0.7, -mantleH * 0.25, sgn * mantleW * 1.35, -mantleH * 0.4, sgn * mantleW * 1.3, -mantleH * 0.2, sgn * mantleW * 0.8, -mantleH * 0.05];
      washFill(g, shapeOf(ear), boxOf(ear), { color: wine, edge: 0.3, paper: null, px, light });
      inkLine(g, ear, true, { width: 0.8 * pw, color: ink, swell: 0.5, seed: hash32(seed, 'ear', sgn), light });
    }
    // Its eyes, huge for its size: blue, the largest eye for the body of any animal.
    for (const sgn of [-1, 1]) {
      const ex = sgn * mantleW * 0.45;
      const ey = mantleH * 0.12;
      const er = S * 0.032;
      g.fillStyle = dark ? '#6FA6C4' : '#55869F';
      g.globalAlpha = 0.9;
      g.beginPath();
      g.ellipse(ex, ey, er, er * 0.85, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = dark ? '#0B0A09' : '#1A1714';
      g.beginPath();
      g.ellipse(ex + sgn * er * 0.25, ey + er * 0.1, er * 0.42, er * 0.36, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  // Turned out, the cloak is drawn over the mantle, hiding it; spread, under it.
  if (inside > 0.5) {
    drawMantle();
    drawWeb();
  } else {
    drawWeb();
    drawMantle();
  }
}

const GLOW = '#9FE8FF';

/**
 * A vampire squid: it drifts in with its cloak spread, turns itself inside
 * out (arms up over its mantle, the black spined inside of the cloak
 * showing), and as it does lets go a cloud of glowing mucus that hangs and
 * fades while it slips away, its arm tips lit.
 */
export function drawVampire(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean) {
  const env = envelope(age, 0.12, 0.12);
  if (env <= 0) return;
  const r = mulberry32(hash32(seed, 'vampire'));
  const S = Math.max(80 * px, Math.min(w, h) * 0.2);
  const side = seed & 1 ? 1 : -1;
  const cx = w * (0.5 + side * (0.18 + 0.1 * r()));
  const cy = h * (0.35 + 0.25 * r());
  // In, the turn about a third of the way through, then away.
  const inside = smooth((age - 0.3) / 0.08) * (1 - smooth((age - 0.72) / 0.1));
  const away = smooth((age - 0.7) / 0.3);
  const x = cx + side * (1 - smooth(age / 0.3)) * w * 0.15 - side * away * w * 0.1;
  const y = cy + Math.sin(ambient * 0.5 + (seed % 7)) * S * 0.05 - away * h * 0.08;
  // The cloud first, behind: a hundred specks of cold light let go at the turn.
  const cloud = smooth((age - 0.36) / 0.1) * (1 - smooth((age - 0.55) / 0.45));
  if (cloud > 0) {
    ctx.save();
    ctx.fillStyle = GLOW;
    const rc = mulberry32(hash32(seed, 'cloud'));
    const spread = S * (0.3 + 0.9 * smooth((age - 0.36) / 0.5));
    for (let i = 0; i < 90; i++) {
      const a = rc() * Math.PI * 2;
      const d = Math.sqrt(rc()) * spread;
      const tw = 0.5 + 0.5 * Math.sin(ambient * (2 + rc() * 3) + i);
      ctx.globalAlpha = env * cloud * (0.35 + 0.5 * tw) * (dark ? 1 : 0.8);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + S * 0.15 + Math.sin(a) * d * 0.8, (0.7 + 1.2 * rc()) * px, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // The two poses, spread and turned out, one softly taking over from the other.
  const pose = (k: 0 | 1) => sprite(`vampire|${seed}|${Math.round(S)}|${k}|${dark ? 1 : 0}|${px}`, S * 1.3, S * 1.3, S * 0.65, S * 0.45, (g) => paintVampire(g, S, k, dark, px, seed));
  const a = env * 0.95 * (1 - 0.5 * away);
  const rot = Math.sin(ambient * 0.3) * 0.05;
  if (inside < 0.99) place(ctx, pose(0), x, y, rot, 1, a * (1 - inside));
  if (inside > 0.01) place(ctx, pose(1), x, y, rot, 1, a * inside);
  // Its arm tips lit, pulsing, the light at their ends.
  if (inside < 0.5) {
    ctx.save();
    ctx.fillStyle = GLOW;
    for (let i = 0; i < 8; i++) {
      const u = i / 7 - 0.5;
      const a = Math.PI / 2 - u * 1.9;
      const reach = S * 0.48;
      const tx = x + Math.cos(a) * reach;
      const ty = y + S * 0.32 * 0.35 + Math.sin(a) * reach;
      ctx.globalAlpha = env * (1 - away) * (0.4 + 0.4 * Math.sin(ambient * 2.2 + i));
      ctx.beginPath();
      ctx.arc(tx, ty, 1.4 * px, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
