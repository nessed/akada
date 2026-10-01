/**
 * Creatures, drawn once and then only moved.
 *
 * A crowded sea is sixty animals a frame, and drawing each one's every fin,
 * dot and tentacle sixty times a second is the kind of work that shows up as
 * a stutter on a phone. So each species is inked once, at the size it is
 * needed, onto a small canvas of its own, and the frame only places those:
 * sliced and nudged for a swimming wave, squeezed for a bell's beat. The
 * cache is bounded by memory, oldest out first.
 */

import { buildAnatomy, LAYERS, type Anatomy, type LayerName, type Shape } from './anatomy';
import type { Species } from './biome';
import { creatureInk, type CreatureInk } from './palette';

const anatomies = new WeakMap<Species, Anatomy>();

export function anatomyOf(species: Species): Anatomy {
  let a = anatomies.get(species);
  if (!a) {
    a = buildAnatomy(species.genome, species.seed);
    anatomies.set(species, a);
  }
  return a;
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Size in device pixels. */
  w: number;
  h: number;
}

/** Sizes step by this ratio, so a creature drawn a little bigger reuses its sprite. */
const STEP = 1.18;

export class SpriteCache {
  private map = new Map<string, Sprite>();
  private bytes = 0;

  constructor(private budget = 24e6) {}

  get(species: Species, lenCss: number, dark: boolean, dpr: number, vivid = false): Sprite | null {
    if (typeof document === 'undefined') return null;
    const bucket = Math.round(Math.log(Math.max(8, lenCss)) / Math.log(STEP));
    const key = `${species.id}|${bucket}|${dark ? 1 : 0}|${dpr}|${vivid ? 1 : 0}`;
    const hit = this.map.get(key);
    if (hit) {
      // Most recently used goes to the back of the line.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const sprite = render(species, Math.pow(STEP, bucket), dark, dpr, vivid);
    if (!sprite) return null;
    this.map.set(key, sprite);
    this.bytes += sprite.w * sprite.h * 4;
    for (const [k, s] of this.map) {
      if (this.bytes <= this.budget) break;
      this.map.delete(k);
      this.bytes -= s.w * s.h * 4;
    }
    return sprite;
  }
}

function render(species: Species, lenCss: number, dark: boolean, dpr: number, vivid: boolean): Sprite | null {
  const a = anatomyOf(species);
  const w = a.maxX - a.minX;
  const h = a.maxY - a.minY;
  const scale = (lenCss * dpr) / Math.max(w, h);
  const glow = species.genome.lit || dark;
  // The halo is left out of the bounds, so it does not shrink the animal,
  // but it still needs the room: past the body, then its blur, or it is
  // cut square. Evenly on both sides, so the body stays centred.
  let ox = 0;
  let oy = 0;
  for (const s of [...a.layers.glowBack, ...a.layers.dotGlow]) {
    if (s.kind !== 'disc') continue;
    ox = Math.max(ox, a.minX - (s.x - s.rx), s.x + s.rx - a.maxX);
    oy = Math.max(oy, a.minY - (s.y - s.ry), s.y + s.ry - a.maxY);
  }
  const padX = Math.ceil(ox * scale + (6 + (glow ? 22 : 0)) * dpr);
  const padY = Math.ceil(oy * scale + (6 + (glow ? 22 : 0)) * dpr);
  const cw = Math.min(2048, Math.ceil(w * scale + padX * 2));
  const ch = Math.min(2048, Math.ceil(h * scale + padY * 2));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const ink = creatureInk(species.genome, dark, vivid);
  // Line weights in device pixels, heavier on a bigger animal.
  const lw = Math.max(0.6, Math.min(1.5, lenCss / 150)) * dpr;
  ctx.setTransform(scale, 0, 0, scale, padX - a.minX * scale, padY - a.minY * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paint(ctx, a, ink, scale, lw, dpr, species.genome.pattern === 'bands');
  return { canvas, w: cw, h: ch };
}

function trace(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  ctx.beginPath();
  for (const s of shapes) {
    if (s.kind === 'disc') {
      ctx.moveTo(s.x + s.rx, s.y);
      ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(s.pts[0], s.pts[1]);
      for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]);
      if (s.close) ctx.closePath();
    }
  }
}

type Style = { fill?: string; stroke?: string; width?: number; alpha?: number; blur?: number };

function paint(
  ctx: CanvasRenderingContext2D,
  a: Anatomy,
  ink: CreatureInk,
  scale: number,
  lw: number,
  dpr: number,
  bands: boolean,
) {
  const unit = (px: number) => (px * lw) / scale;
  const styles: Record<LayerName, Style[]> = {
    glowBack: ink.glow ? [{ fill: ink.glow, alpha: 0.3, blur: 8 }] : [],
    tentB: [{ stroke: ink.tent, width: 1, alpha: 0.85 }],
    legs: [{ stroke: ink.ink, width: 1.3 }],
    fin: [{ fill: ink.fin, alpha: ink.finAlpha }, { stroke: ink.ink, width: 0.9 }],
    finRay: [{ stroke: ink.ink, width: 0.5, alpha: 0.5 }],
    body: [{ fill: ink.body, alpha: ink.bodyAlpha }],
    guts: [{ stroke: ink.ink, width: 0.7, alpha: 0.45 }],
    gutFill: [{ fill: ink.pat, alpha: 0.5 }],
    pat: [{ fill: ink.pat, alpha: 0.85 }],
    patLine: [{ stroke: ink.pat, width: bands ? 4 : 1.4, alpha: 0.8 }],
    detail: [{ stroke: ink.ink, width: 0.6, alpha: 0.55 }],
    tentF: [{ stroke: ink.tent, width: 1.4 }],
    beads: [{ fill: ink.pat }],
    dotGlow: ink.glow ? [{ fill: ink.glow, alpha: 0.8, blur: 2 }] : [],
    dots: [{ fill: ink.dot }],
    eye: [{ fill: ink.eyeW }, { stroke: ink.ink, width: 0.8 }],
    pupil: [{ fill: ink.pupil }],
    lure: [{ stroke: ink.ink, width: 0.9 }],
  };
  const canBlur = 'filter' in ctx;
  const draw = (layer: LayerName) => {
    const shapes = a.layers[layer];
    if (!shapes.length) return;
    for (const st of styles[layer]) {
      trace(ctx, shapes);
      ctx.globalAlpha = st.alpha ?? 1;
      if (st.blur && canBlur) ctx.filter = `blur(${st.blur * dpr}px)`;
      if (st.fill) {
        ctx.fillStyle = st.fill;
        ctx.fill();
      }
      if (st.stroke) {
        ctx.strokeStyle = st.stroke;
        ctx.lineWidth = unit(st.width ?? 1);
        ctx.stroke();
      }
      if (st.blur && canBlur) ctx.filter = 'none';
    }
  };
  for (const layer of LAYERS) {
    draw(layer);
    // The outline goes over the body's pattern, inked last of the body.
    if (layer === 'detail' && a.layers.body.length) {
      trace(ctx, a.layers.body);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = unit(1.2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
