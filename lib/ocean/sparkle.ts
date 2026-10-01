/**
 * The water sparkles when you touch it.
 *
 * In the dark water a hand is answered the way the real sea answers a hand
 * or an oar: the plankton it disturbs lights up. Each speck flashes up in a
 * tenth of a second and dies away slowly, pale blue-green, the colour of the
 * storm. A tap lights a loose ring that spreads out a little from where it
 * landed; a drag leaves a short wake that fades behind the finger.
 *
 * It is the one thing in the ocean that is not a function of the sitting:
 * it is the reader's own, gone in a second or two, so it keeps its specks in
 * a small fixed pool rather than rolling them from a seed. Nothing is
 * allocated per speck or per frame; when the pool is full the oldest speck
 * gives way to the newest.
 */

import { mulberry32, type Rand } from './random';

/** Most specks lit at once. */
const CAP = 500;
/** A poke's specks, and how long one lasts, in ms. */
const POKE_MIN = 40;
const POKE_MAX = 60;
const POKE_LIFE = 1600;
/** A stroke: a few specks for every this many CSS px the finger travels. */
const STROKE_STEP = 6;
const STROKE_LIFE = 1200;
/** A move after this long, or this far, starts a new wake rather than
    drawing one across the gap. */
const STROKE_GAP_MS = 160;
const STROKE_GAP_PX = 120;
/** How long a speck takes to flash up, in ms. */
const RISE = 90;
/** How long the outward drift takes to settle, in seconds. */
const DRAG = 0.55;
const COLOURS = ['#BFF3E6', '#9FE6D0'];

export class Sparkles {
  private x = new Float32Array(CAP);
  private y = new Float32Array(CAP);
  /** Drift, device px per second, slowing to nothing over `DRAG`. */
  private vx = new Float32Array(CAP);
  private vy = new Float32Array(CAP);
  /** When it lights, ms on the performance clock: Float64, since a
      Float32 runs out of whole milliseconds a few hours in. */
  private born = new Float64Array(CAP);
  /** How long from lighting until it has died away, ms. */
  private life = new Float32Array(CAP);
  /** Radius at full flash, device px. */
  private size = new Float32Array(CAP);
  /** How bright it gets, 0 to 1. */
  private peak = new Float32Array(CAP);
  private hue = new Uint8Array(CAP);
  private head = 0;
  private count = 0;
  private rand: Rand = mulberry32(0x5eab17e);
  /** Where the last stroke left off, and how far it had gone toward its next speck. */
  private lastX = 0;
  private lastY = 0;
  private lastT = -1e9;
  private carry = 0;

  private spawn(x: number, y: number, vx: number, vy: number, born: number, life: number, size: number, peak: number) {
    const i = this.head;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.born[i] = born;
    this.life[i] = life;
    this.size[i] = size;
    this.peak[i] = peak;
    this.hue[i] = this.rand() < 0.22 ? 1 : 0;
    this.head = (i + 1) % CAP;
    if (this.count < CAP) this.count++;
  }

  /** A tap at (x, y) device px: a burst of plankton lighting up, spreading out in a ring and fading over about 1.6 s. `now` in ms (performance.now()). */
  poke(x: number, y: number, now: number, px: number): void {
    const r = this.rand;
    const n = POKE_MIN + Math.floor(r() * (POKE_MAX - POKE_MIN + 1));
    const ring = 34 * px;
    for (let k = 0; k < n; k++) {
      const ang = r() * Math.PI * 2;
      // A loose ring: most of them out toward the rim, a few nearer in.
      const out = 0.35 + 0.65 * Math.sqrt(r());
      const d = ring * out;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      // The disturbance travels: the far ones light a moment after the near.
      const delay = out * 260 + r() * 60;
      const speed = (10 + r() * 18) * px;
      this.spawn(
        x + c * d,
        y + s * d,
        c * speed,
        s * speed,
        now + delay,
        POKE_LIFE - 300 + r() * 300 - delay * 0.5,
        (1 + r() * 1.5) * px,
        0.55 + r() * 0.45,
      );
    }
    // A tap is not the start of a drag across the gap.
    this.lastT = -1e9;
  }

  /** A finger dragging through the water: lights a short wake of specks at (x, y) that fade over about 1.2 s. Called on every pointermove; space them by distance travelled so a slow drag and a fast one leave the same density. */
  stroke(x: number, y: number, now: number, px: number): void {
    const step = STROKE_STEP * px;
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (now - this.lastT > STROKE_GAP_MS || dist > STROKE_GAP_PX * px) {
      // A fresh wake: one tuft where the finger came down.
      this.tuft(x, y, now, px);
      this.lastX = x;
      this.lastY = y;
      this.lastT = now;
      this.carry = 0;
      return;
    }
    this.lastT = now;
    if (dist <= 0) return;
    // Walk the segment a step at a time, carrying the remainder to the next
    // move, so the wake's density is the finger's distance and not its speed.
    let at = step - this.carry;
    while (at <= dist) {
      const t = at / dist;
      this.tuft(this.lastX + dx * t, this.lastY + dy * t, now, px);
      at += step;
    }
    this.carry = dist - (at - step);
    this.lastX = x;
    this.lastY = y;
  }

  /** Two or three specks round one point of a wake, scattered a little. */
  private tuft(x: number, y: number, now: number, px: number) {
    const r = this.rand;
    const n = 2 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const ang = r() * Math.PI * 2;
      const d = r() * 4 * px;
      const speed = (2 + r() * 5) * px;
      this.spawn(
        x + Math.cos(ang) * d,
        y + Math.sin(ang) * d,
        Math.cos(ang) * speed,
        Math.sin(ang) * speed,
        now + r() * 40,
        STROKE_LIFE - 250 + r() * 250,
        (1 + r() * 1.2) * px,
        0.45 + r() * 0.45,
      );
    }
  }

  /** Draws whatever is still lit; returns true while anything is, so the caller knows to keep animating. 'lighter' composite. */
  draw(ctx: CanvasRenderingContext2D, now: number, px: number): boolean {
    if (this.count === 0) return false;
    let alive = false;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // One pass per colour, so the fill is set twice a frame rather than per speck.
    for (let c = 0; c < COLOURS.length; c++) {
      ctx.fillStyle = COLOURS[c];
      for (let i = 0; i < this.count; i++) {
        if (this.hue[i] !== c) continue;
        const age = now - this.born[i];
        const life = this.life[i];
        if (age >= life) continue;
        alive = true;
        if (age < 0) continue;
        // Up fast, then away slowly: by the end of its life it is all but out.
        const glow = age < RISE ? age / RISE : Math.exp(((RISE - age) / (life - RISE)) * 4.5);
        const a = this.peak[i] * glow;
        if (a < 0.02) continue;
        const sec = age / 1000;
        const drift = DRAG * (1 - Math.exp(-sec / DRAG));
        const x = this.x[i] + this.vx[i] * drift;
        const y = this.y[i] + this.vy[i] * drift;
        const r = this.size[i] * (0.75 + 0.25 * glow);
        // The brightest wear a faint halo while they are at their brightest.
        if (a > 0.5 && this.size[i] > 1.6 * px) {
          ctx.globalAlpha = a * 0.14;
          ctx.beginPath();
          ctx.arc(x, y, r * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a * 0.22;
          ctx.beginPath();
          ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // All out: forget them, so an idle pool costs nothing to draw.
    if (!alive) {
      this.count = 0;
      this.head = 0;
    }
    return alive;
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    this.lastT = -1e9;
    this.carry = 0;
  }
}
