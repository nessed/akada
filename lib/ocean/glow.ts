/**
 * The jelly is the only light in the deep.
 *
 * Past the twilight no sunlight reaches, so whatever is seen down there is
 * seen by the jelly's own glow. Away from it the water closes in: the far
 * water, the floor and the animals sink into the dark, and only a soft pool
 * round the bell stays as it was. The pool is a little taller than wide and
 * hangs a little below the bell, since the trails hang below it and carry
 * light down with them.
 *
 * The overlay and `litBy` share one falloff, so an animal swimming into the
 * pool brightens exactly as the water round it does.
 */

/** The darkest the water goes, by the abyss. Never quite black: the page is
    paper at night, not a hole. */
const DEEPEST = 0.85;
/** The depth dial where the dark starts (the midnight zone) and is full (the abyss). */
const DARK_FROM = 0.6;
const DARK_FULL = 0.85;
/** The pool, in bell radii: clear out to the first, dark from the second. */
const CLEAR = 2.2;
const EDGE = 5;
/** Taller than wide, and centred this many radii below the bell. */
const TALL = 1.25;
const DROP = 0.8;
/** The dark itself: the desk colour, a shade further down. */
const INK = '5, 4, 4';

export interface JellyLight {
  x: number;
  y: number;
  r: number;
}

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** How far into the dark a point is, 0 in the pool to 1 beyond it. */
function shade(x: number, y: number, jelly: JellyLight): number {
  const r = Math.max(1, jelly.r);
  const dx = (x - jelly.x) / r;
  const dy = (y - (jelly.y + DROP * r)) / (r * TALL);
  const d = Math.sqrt(dx * dx + dy * dy);
  return smooth((d - CLEAR) / (EDGE - CLEAR));
}

/** How dark the water is away from the jelly, 0 (none) to about 0.85, by the depth dial z: nothing above the midnight zone (z < 0.6), easing in through it, full by the abyss (z >= 0.85). */
export function darknessAt(z: number): number {
  if (!Number.isFinite(z)) return 0;
  return DEEPEST * smooth((z - DARK_FROM) / (DARK_FULL - DARK_FROM));
}

/** A hex colour as 'r, g, b', or the storm's pale blue-green if it is not one. */
function rgbOf(hex: string): string {
  const s = hex.trim().replace('#', '');
  const full = s.length === 3 ? s.replace(/./g, (c) => c + c) : s.slice(0, 6);
  const n = parseInt(full, 16);
  if (full.length !== 6 || !Number.isFinite(n)) return '191, 243, 230';
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Drawn on the BACK canvas after the far water, floor and far animals: darkens everything except a soft pool of light round the jelly. `jelly` is the bell's centre and radius in device px. `tint` is the jelly's colour, for a faint glow in the pool. */
export function drawDarkness(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  jelly: JellyLight,
  darkness: number,
  px: number,
  tint: string,
): void {
  if (!(darkness > 0.01)) return;
  // `px` goes unread: the pool is measured in bell radii, which come in
  // device px already. It stays in the signature to match the other draws.
  // The same radius `shade` reads, so the light and `litBy` agree.
  const r = Math.max(1, jelly.r);
  const cx = jelly.x;
  const cy = jelly.y + DROP * r;
  ctx.save();
  // Drawn as a circle in a stretched frame, so the pool comes out an oval;
  // the fill covers the whole canvas in that frame.
  ctx.translate(cx, cy);
  ctx.scale(1, TALL);
  const fx = -cx;
  const fy = -cy / TALL;
  const fw = w;
  const fh = h / TALL;

  // The dark, with the pool cut out. Gradient stops are linear between
  // them, so the smoothstep is laid down as a handful of steps, which is
  // what `shade` (and so `litBy`) follows.
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const dark = ctx.createRadialGradient(0, 0, 0, 0, 0, EDGE * r);
  dark.addColorStop(0, `rgba(${INK}, 0)`);
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const at = (CLEAR + (EDGE - CLEAR) * t) / EDGE;
    dark.addColorStop(at, `rgba(${INK}, ${(darkness * smooth(t)).toFixed(4)})`);
  }
  ctx.fillStyle = dark;
  ctx.fillRect(fx, fy, fw, fh);

  // The jelly lighting the water it hangs in: barely there, more a warmth
  // than a colour, and stronger the darker it is round it.
  // Water scatters a light toward white as it carries it, so the pool is
  // the jelly's colour thinned with the paper's warmth, never its pure hue;
  // and it falls off as light in water does, fast near the source and then
  // in a long tail, not in a straight ramp.
  const a = 0.1 * Math.min(1, darkness / DEEPEST);
  const rgb = rgbOf(tint);
  const [tr, tg, tb] = rgb.split(',').map((v) => Number(v));
  const soft = `${Math.round(tr + (246 - tr) * 0.3)}, ${Math.round(tg + (240 - tg) * 0.3)}, ${Math.round(tb + (226 - tb) * 0.3)}`;
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(0, -DROP * r * 0.5, 0, 0, 0, CLEAR * 1.4 * r);
  const tail = (t: number) => 1 / (1 + (t / 0.28) ** 2);
  for (const t of [0, 0.12, 0.28, 0.5, 0.75, 1]) {
    const f = (tail(t) - tail(1)) / (1 - tail(1));
    glow.addColorStop(t, `rgba(${soft}, ${(a * f).toFixed(4)})`);
  }
  ctx.fillStyle = glow;
  const g = CLEAR * 1.4 * r;
  ctx.fillRect(-g, -g, g * 2, g * 2);
  ctx.restore();
}

/** Alpha multiplier for an animal at (x, y) device px: 1 inside the jelly's light, falling smoothly to (1 - darkness) far from it. */
export function litBy(x: number, y: number, jelly: JellyLight, darkness: number): number {
  if (!(darkness > 0.01)) return 1;
  return 1 - darkness * shade(x, y, jelly);
}
