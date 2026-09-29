import { buildFan, drawFan, fanShades, mixHex, type FanShape, type FanTree } from '../fan';
import type { WoodEnv } from './biome';
import type { AnimalGenome, Plan } from './fauna';
import { GLOWS } from './fauna';
import { buildFigure, LAYER_ORDER, type Figure, type Layer, type Pose } from './figures';
import type { Land, LandElement } from './flora';
import { animalInks, grassHue, leafHue, recede, type Palette } from './palette';
import { unit } from './random';
import { groundY, HORIZON } from './schedule';
import { arrival } from './succession';

/**
 * Ink for the wood. Everything here takes a 2D context the caller owns and
 * draws into it; the layout says where the ground is in device pixels.
 */

export interface SceneLayout {
  /** Device pixels. */
  w: number;
  h: number;
  px: number;
  /** Where the ground line is, device pixels from the top. */
  ground: number;
}

export function scaleAt(d: number): number {
  return 0.28 + 0.72 * Math.min(1, Math.max(0, d));
}

export function groundPx(L: SceneLayout, d: number): number {
  return groundY(d, HORIZON) * L.ground;
}

/* How big each plan is, as a share of the view's height, standing on the
   ground line. A deer is a deer next to a finch. */
const REAL: Record<Plan, number> = {
  songbird: 0.07,
  owl: 0.085,
  raptor: 0.22,
  bat: 0.09,
  butterfly: 0.055,
  moth: 0.045,
  dragonfly: 0.07,
  bee: 0.022,
  firefly: 0.016,
  deer: 0.17,
  fox: 0.12,
  hare: 0.07,
  hedgehog: 0.05,
};

/** Device pixels an animal's reference length spans at depth `d`. */
export function animalPx(L: SceneLayout, g: AnimalGenome, d: number): number {
  return REAL[g.plan] * g.size * L.h * scaleAt(d);
}

/* ------------------------------------------------------------- the animals */

interface Paths {
  closed: Path2D | null;
  open: Path2D | null;
}

const figureCache = new Map<string, { fig: Figure; paths: Partial<Record<Layer, Paths>> }>();

function toPaths(fig: Figure): Partial<Record<Layer, Paths>> {
  const out: Partial<Record<Layer, Paths>> = {};
  for (const layer of LAYER_ORDER) {
    const shapes = fig.layers[layer];
    if (!shapes?.length) continue;
    let closed: Path2D | null = null;
    let open: Path2D | null = null;
    for (const s of shapes) {
      if (s.c) {
        closed ??= new Path2D();
        const [cx, cy, rx, ry, rot] = s.c;
        closed.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
        closed.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
      } else if (s.pts && s.pts.length > 1) {
        const target = s.close ? (closed ??= new Path2D()) : (open ??= new Path2D());
        target.moveTo(s.pts[0][0], s.pts[0][1]);
        for (let i = 1; i < s.pts.length; i++) target.lineTo(s.pts[i][0], s.pts[i][1]);
        if (s.close) target.closePath();
      }
    }
    out[layer] = { closed, open };
  }
  return out;
}

/** A figure and its paths, built once per species, pose and frame of the cycle. */
export function figureFor(id: string, g: AnimalGenome, pose: Pose): { fig: Figure; paths: Partial<Record<Layer, Paths>> } {
  const frames = pose.kind === 'fly' || pose.kind === 'walk' || pose.kind === 'hop' ? 12 : 4;
  const q = Math.floor((((pose.t % 1) + 1) % 1) * frames);
  const key = `${id}|${pose.kind}|${q}`;
  let hit = figureCache.get(key);
  if (!hit) {
    const fig = buildFigure(g, { kind: pose.kind, t: q / frames });
    hit = { fig, paths: toPaths(fig) };
    figureCache.set(key, hit);
    if (figureCache.size > 1600) {
      const first = figureCache.keys().next().value;
      if (first !== undefined) figureCache.delete(first);
    }
  }
  return hit;
}

type Inks = ReturnType<typeof animalInks>;
const inkCache = new Map<string, Inks>();

/** An animal's inks, pushed back toward the paper by how far away it is. */
export function inksFor(p: Palette, g: AnimalGenome, back: number): Inks {
  const q = Math.round(back * 10) / 10;
  const key = `${p.paper}|${p.dark}|${g.hue}|${g.accent}|${q}`;
  let hit = inkCache.get(key);
  if (!hit) {
    const base = animalInks(p, g.hue, g.accent);
    // At night a distant animal goes to silhouette: its lines sink into the
    // dark faster than its body does, so it reads as a shape against the
    // land, not a ghost drawn in light.
    hit = Object.fromEntries(
      Object.entries(base).map(([k, v]) => [k, k === 'lit' ? v : recede(p, v, q * (p.dark && k === 'ink' ? 1.1 : 0.7))]),
    ) as Inks;
    inkCache.set(key, hit);
  }
  return hit;
}

export interface FigureDraw {
  x: number;
  y: number;
  /** Device pixels for the figure's reference length. */
  size: number;
  facing: 1 | -1;
  heading?: number;
  alpha: number;
  inks: Inks;
  px: number;
  /** A firefly's light, 0 to 1. */
  lit?: number;
}

/**
 * Ink one animal. The pale body goes down first, the markings are clipped
 * inside it, the fine ink goes over, the outline over that, then the near
 * wing and the eye: the order an engraver would colour a plate in.
 */
export function drawFigure(ctx: CanvasRenderingContext2D, entry: ReturnType<typeof figureFor>, o: FigureDraw): void {
  const { fig, paths } = entry;
  const k = o.size / fig.ref;
  if (k <= 0 || o.alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = o.alpha;
  ctx.translate(o.x, o.y);
  if (fig.planform) ctx.rotate(o.heading ?? 0);
  ctx.scale(fig.planform ? k : k * o.facing, k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const hair = Math.max(0.55, Math.min(1.3, o.size / 60)) * o.px;
  const line = (w: number) => (w * hair) / k;
  const ink = o.inks;

  const clipTo = (layers: Layer[]) => {
    const clip = new Path2D();
    for (const l of layers) {
      const c = paths[l]?.closed;
      if (c) clip.addPath(c);
    }
    ctx.clip(clip);
  };
  const fill = (layer: Layer, color: string, alpha = 1) => {
    const p = paths[layer]?.closed;
    if (!p) return;
    ctx.globalAlpha = o.alpha * alpha;
    ctx.fillStyle = color;
    ctx.fill(p);
    ctx.globalAlpha = o.alpha;
  };
  const stroke = (layer: Layer, color: string, width: number, alpha = 1, which: 'both' | 'closed' | 'open' = 'both') => {
    const p = paths[layer];
    if (!p) return;
    ctx.globalAlpha = o.alpha * alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = line(width);
    if (p.closed && which !== 'open') ctx.stroke(p.closed);
    if (p.open && which !== 'closed') ctx.stroke(p.open);
    ctx.globalAlpha = o.alpha;
  };

  if (paths.glow?.closed && (o.lit ?? 0) > 0.01) {
    const [cx, cy, r] = fig.layers.glow?.[0]?.c ?? [0, 0, 10];
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const lit = o.inks.lit;
    g.addColorStop(0, lit);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = o.alpha * (o.lit ?? 0) * 0.55;
    ctx.fillStyle = g;
    ctx.fill(paths.glow.closed);
    ctx.globalAlpha = o.alpha;
  }
  const glass = fig.glass ? 0.22 : 0.9;
  fill('wingBack', ink.wing, glass * 0.85);
  stroke('wingBack', ink.ink, 0.8, 0.55);
  fill('legsBack', ink.dark, 0.9);
  stroke('legsBack', ink.ink, 0.8, 0.6);
  // The near legs go under the body too, so they come out from beneath it
  // rather than being laid over its side.
  fill('legsFront', ink.body);
  stroke('legsFront', ink.ink, 1, 0.95);
  fill('tail', ink.body);
  stroke('tail', ink.ink, 1, 0.9);
  fill('body', ink.body);
  ctx.save();
  clipTo(['body', 'tail']);
  fill('belly', ink.belly);
  fill('pattern', ink.pattern);
  fill('band', ink.dark);
  stroke('markLine', ink.pattern, 1.1, 0.9);
  ctx.restore();
  stroke('detail', ink.ink, 0.7, 0.5);
  stroke('body', ink.ink, 1.15, 1, 'closed');
  fill('wingFront', ink.wing, glass);
  if (paths.wingMark?.closed && paths.wingFront?.closed) {
    ctx.save();
    ctx.clip(paths.wingFront.closed);
    fill('wingMark', ink.pattern);
    ctx.restore();
  }
  stroke('wingFront', ink.ink, 1, fig.glass ? 0.6 : 1, 'closed');
  stroke('wingLine', ink.ink, 0.6, 0.45);
  stroke('horn', mixHex(ink.belly, ink.ink, 0.35), 1.6, 1);
  fill('dark', ink.dark);
  fill('eye', fig.eyeLit ? ink.lit : ink.eye);
  fill('shine', ink.shine, 0.9);
  stroke('antenna', ink.ink, 0.6, 0.8);
  if ((o.lit ?? 0) > 0.01) fill('light', mixHex(ink.lit, '#FFFFFF', 0.4), o.lit ?? 0);
  ctx.restore();
}

/** A bird too far off to draw feather by feather: two strokes of a wing. */
export function drawSpeck(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, beat: number, color: string, px: number, alpha: number): void {
  const w = Math.max(3 * px, size * 0.5);
  const lift = Math.sin(beat * Math.PI * 2) * w * 0.35;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, 1 * px);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - w, y - lift);
  ctx.quadraticCurveTo(x - w * 0.45, y - w * 0.3 - lift * 0.4, x, y);
  ctx.quadraticCurveTo(x + w * 0.45, y - w * 0.3 - lift * 0.4, x + w, y - lift);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------- wind */

/**
 * The wind at a moment on the scene clock: a slow swell, with a gust every
 * minute or so. Signed, about -1 to 1, the sign the side it blows from.
 */
export function windAt(env: WoodEnv, key: string, scene: number): number {
  const swell = env.wind * (0.55 + 0.45 * Math.sin(scene * 0.31) * Math.sin(scene * 0.117 + 1));
  const n = Math.floor(scene / 47);
  let gust = 0;
  for (const k of [n - 1, n]) {
    const at = k * 47 + 47 * unit(key, 'gust', k);
    const since = scene - at;
    if (since > 0 && since < 6) gust = Math.max(gust, Math.sin((since / 6) * Math.PI) * (0.4 + 0.6 * unit(key, 'gustSize', k)));
  }
  return env.windDir * (swell + gust * env.wind);
}

/* ------------------------------------------------------------------ plants */

export interface SpriteStore {
  get(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement | OffscreenCanvas;
}

/** An LRU of small canvases with a byte budget. */
export function spriteStore(budgetBytes = 24 * 1024 * 1024): SpriteStore {
  const map = new Map<string, HTMLCanvasElement>();
  let bytes = 0;
  return {
    get(key, w, h, draw) {
      const hit = map.get(key);
      if (hit) {
        map.delete(key);
        map.set(key, hit);
        return hit;
      }
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w));
      c.height = Math.max(1, Math.ceil(h));
      const ctx = c.getContext('2d');
      if (ctx) draw(ctx);
      map.set(key, c);
      bytes += c.width * c.height * 4;
      while (bytes > budgetBytes && map.size > 1) {
        const [oldKey, old] = map.entries().next().value as [string, HTMLCanvasElement];
        map.delete(oldKey);
        bytes -= old.width * old.height * 4;
      }
      return c;
    },
  };
}

const treeGeometry = new Map<string, FanTree>();

export function treeFor(seed: number, depth: number, tripleP: number, shape: FanShape): FanTree {
  const key = `${seed}|${depth}|${tripleP.toFixed(3)}|${JSON.stringify(shape)}`;
  let t = treeGeometry.get(key);
  if (!t) {
    t = buildFan(seed % 100000, depth, tripleP, shape);
    treeGeometry.set(key, t);
  }
  return t;
}

/**
 * A tree of the wood, as a sprite: the same fan the reader's own tree is,
 * grown as far as the land has got, in the season's leaf and faded by how
 * far back it stands. Returned with where its foot is inside the sprite.
 */
export function treeSprite(
  store: SpriteStore,
  p: Palette,
  tree: FanTree,
  key: string,
  heightPx: number,
  grown: number,
  colors: { stem: string; leaf: string },
  px: number,
): { canvas: CanvasImageSource; w: number; h: number; footX: number; footY: number } {
  const span = (tree.maxX - tree.minX) / -tree.minY;
  const h = Math.max(8, Math.round(heightPx));
  const w = Math.max(8, Math.round(h * span * 1.12 + 10 * px));
  // A wood's trees stay in leaf: flowers are what the reader's own tree
  // does when a block is done, and nothing else in the wood says that.
  const q = Math.min(0.96, Math.round(grown * 30) / 30);
  const sprite = store.get(`${key}|${q}|${w}x${h}|${p.paper}|${colors.leaf}`, w, h, (ctx) => {
    const trunk = Math.max(1.2 * px, h * 0.022);
    // A wash of canopy first, soft and pale, gathered round the outer
    // branches the way a watercolour sketch puts the mass of a crown in
    // before the pen finds the branches.
    const span = tree.maxX - tree.minX;
    const sc = Math.min((w * 0.9) / span, (h - 2 * px) / -tree.minY);
    const ox = w / 2 - ((tree.minX + tree.maxX) / 2) * sc;
    const run = q * (tree.depthMax + 1);
    ctx.fillStyle = hexA(colors.leaf, p.dark ? 0.16 : 0.2);
    for (let i = 0; i < tree.segs.length; i++) {
      const s = tree.segs[i];
      if (s.d < tree.depthMax - 2 || run - s.d < 0.6 || i % 2) continue;
      const r = Math.max(2 * px, s.len * sc * 0.9);
      ctx.beginPath();
      ctx.arc(ox + s.x1 * sc, h + s.y1 * sc, r, 0, Math.PI * 2);
      ctx.fill();
    }
    drawFan(ctx as CanvasRenderingContext2D, tree, w, h, {
      progress: q,
      colors: [colors.stem, mixHex(colors.stem, colors.leaf, 0.5), colors.leaf],
      trunkWidth: trunk,
      padTop: 2 * px,
      widthFill: 0.9,
      baseOffset: 0,
      px,
      leaf: {
        fill: mixHex(colors.leaf, p.paper, p.dark ? 0.35 : 0.3),
        edge: mixHex(colors.leaf, p.dark ? '#FFFFFF' : '#1A1714', p.dark ? 0.2 : 0.3),
        bloom: mixHex(colors.leaf, p.paper, 0.2),
        eye: mixHex(colors.leaf, '#000000', 0.4),
      },
    });
  });
  return { canvas: sprite, w, h, footX: w / 2, footY: h };
}

/** Grass: a few blades from one root, their tips carried on the wind. */
export function drawGrass(ctx: CanvasRenderingContext2D, e: LandElement, L: SceneLayout, p: Palette, grow: number, wind: number): void {
  if (grow <= 0) return;
  const x = e.x * L.w;
  const y = groundPx(L, e.d);
  const s = scaleAt(e.d);
  const h = e.h * L.h * s * grow;
  const blades = 3 + Math.floor(unit(e.seed, 'n') * 4);
  ctx.strokeStyle = recede(p, grassHue(p, e.hue), (1 - e.d) * 0.6 + (p.dark ? 0.35 : 0.05));
  ctx.lineWidth = Math.max(0.7, 0.9 * L.px * s);
  ctx.beginPath();
  for (let i = 0; i < blades; i++) {
    const spread = (i / Math.max(1, blades - 1) - 0.5) * h * 0.55;
    const bh = h * (0.6 + 0.4 * unit(e.seed, 'b', i));
    const bend = wind * bh * 0.28 + spread * 0.4;
    ctx.moveTo(x + spread * 0.2, y);
    ctx.quadraticCurveTo(x + spread * 0.5, y - bh * 0.6, x + spread + bend, y - bh);
  }
  ctx.stroke();
}

/** A flower on its stem, in five kinds. */
export function drawFlowerHead(ctx: CanvasRenderingContext2D, e: LandElement, L: SceneLayout, p: Palette, grow: number, wind: number): void {
  if (grow <= 0) return;
  const x = e.x * L.w;
  const y = groundPx(L, e.d);
  const s = scaleAt(e.d);
  const h = e.h * L.h * s * Math.min(1, grow * 1.3);
  const back = (1 - e.d) * 0.55 + (p.dark ? 0.3 : 0);
  const stem = recede(p, grassHue(p, 0), back + 0.05);
  const hue = mixHex(['#A8B89B', '#D4A5A5', '#B5A8C9', '#E2B594', '#A8BCC9', '#C99B7E', '#D9C58C', '#9FC1B0', '#9AA3AB', '#B89BAA'][e.hue % 10], p.course, 0.1);
  const petal = recede(p, p.dark ? mixHex(hue, p.paper, 0.35) : hue, back);
  const edge = recede(p, p.dark ? mixHex(hue, '#FFFFFF', 0.4) : mixHex(hue, '#1A1714', 0.55), back);
  const tipX = x + wind * h * 0.22;
  const tipY = y - h;
  ctx.strokeStyle = stem;
  ctx.lineWidth = Math.max(0.7, 0.9 * L.px * s);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x, y - h * 0.5, tipX, tipY);
  // A leaf off the stem.
  ctx.moveTo(x, y - h * 0.3);
  ctx.quadraticCurveTo(x + h * 0.18, y - h * 0.42, x + h * 0.22, y - h * 0.34);
  ctx.stroke();
  const r = Math.max(1.4 * L.px, h * 0.12) * Math.min(1, grow);
  ctx.fillStyle = petal;
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(0.5, 0.7 * L.px * s);
  const kind = e.flower ?? 'daisy';
  if (kind === 'daisy') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(tipX + Math.cos(a) * r, tipY + Math.sin(a) * r * 0.7, r * 0.75, r * 0.34, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = recede(p, '#D9C58C', back);
    ctx.beginPath();
    ctx.arc(tipX, tipY, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'bell') {
    for (const k of [-1, 1]) {
      const bx = tipX + k * r * 0.9;
      const by = tipY + r * 0.9;
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.55, by);
      ctx.quadraticCurveTo(bx - r * 0.6, by + r * 0.9, bx - r * 0.75, by + r * 1.1);
      ctx.lineTo(bx + r * 0.75, by + r * 1.1);
      ctx.quadraticCurveTo(bx + r * 0.6, by + r * 0.9, bx + r * 0.55, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (kind === 'umbel') {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.9 + (i / 6) * Math.PI * 0.8;
      const ux = tipX + Math.cos(a) * r * 1.4;
      const uy = tipY + Math.sin(a) * r * 1.1;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY + r * 0.6);
      ctx.lineTo(ux, uy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ux, uy, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'spike') {
    for (let i = 0; i < 6; i++) {
      const fy = tipY + r * 1.6 - i * r * 0.55;
      const fr = r * (0.5 - i * 0.05);
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(tipX + k * fr * 0.8, fy, fr, fr * 0.6, k * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(tipX - r, tipY - r * 0.9);
    ctx.quadraticCurveTo(tipX - r * 1.05, tipY + r * 0.6, tipX, tipY + r * 0.7);
    ctx.quadraticCurveTo(tipX + r * 1.05, tipY + r * 0.6, tipX + r, tipY - r * 0.9);
    ctx.lineTo(tipX + r * 0.35, tipY - r * 0.35);
    ctx.lineTo(tipX, tipY - r);
    ctx.lineTo(tipX - r * 0.35, tipY - r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** A bush: a clump of leaves washed in, outlined in a loose pencil scribble. */
export function bushSprite(store: SpriteStore, e: LandElement, L: SceneLayout, p: Palette, grow: number): { canvas: CanvasImageSource; w: number; h: number } {
  const s = scaleAt(e.d);
  const h = Math.max(6, Math.round(e.h * L.h * s));
  const w = Math.round(h * 2.2);
  const q = Math.round(grow * 12) / 12;
  const leaf = recede(p, leafHue(p, e.hue), (1 - e.d) * 0.55 + (p.dark ? 0.3 : 0));
  // Headroom above the clump, so no lobe is cut flat by the sprite's top.
  const H = Math.round(h * 1.5);
  const canvas = store.get(`bush|${e.id}|${q}|${w}x${H}|${p.paper}|${leaf}`, w, H, (ctx) => {
    ctx.translate(0, H - h);
    const lobes = 7 + Math.floor(unit(e.seed, 'lobes') * 5);
    const hh = h * (0.35 + 0.65 * q);
    const cx = w / 2;
    // Lobes along a low arch, every one kept inside the sprite so none is
    // cut flat by its edge.
    const lobe = (i: number) => {
      const u = i / (lobes - 1);
      const arch = Math.sin(u * Math.PI);
      const r = hh * (0.2 + 0.12 * unit(e.seed, 'r', i)) * (0.6 + 0.4 * arch);
      const lx = Math.min(w - r * 1.2, Math.max(r * 1.2, cx + (u - 0.5) * w * 0.66 * (0.55 + 0.45 * q)));
      const ly = Math.min(h - r * 0.75, h - hh * (0.2 + 0.5 * arch * (0.75 + 0.25 * unit(e.seed, 'y', i))));
      ctx.beginPath();
      ctx.ellipse(lx, ly, r * 1.15, r, unit(e.seed, 'a', i) * 0.6 - 0.3, 0, Math.PI * 2);
      return { lx, ly, r };
    };
    // The outline is every lobe stroked wide, then every lobe filled over
    // it, so only the clump's outer edge is left: one drawn line round it.
    ctx.strokeStyle = mixHex(leaf, p.dark ? '#FFFFFF' : '#1A1714', p.dark ? 0.12 : 0.3);
    ctx.lineWidth = Math.max(1.2, 1.8 * L.px);
    for (let i = 0; i < lobes; i++) {
      lobe(i);
      ctx.stroke();
    }
    ctx.fillStyle = mixHex(leaf, p.paper, p.dark ? 0.15 : 0.22);
    const spots: { lx: number; ly: number; r: number }[] = [];
    for (let i = 0; i < lobes; i++) {
      spots.push(lobe(i));
      ctx.fill();
    }
    // Leaves inside, a few short marks each, the way a pen fills a bush in.
    ctx.strokeStyle = mixHex(leaf, p.dark ? '#FFFFFF' : '#1A1714', p.dark ? 0.1 : 0.25);
    ctx.lineWidth = Math.max(0.6, 0.75 * L.px);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    spots.forEach(({ lx, ly, r }, i) => {
      for (let k = 0; k < 3; k++) {
        const a = unit(e.seed, 'm', i, k) * Math.PI * 2;
        const mx = lx + Math.cos(a) * r * 0.45;
        const my = ly + Math.sin(a) * r * 0.35;
        ctx.moveTo(mx - r * 0.12, my + r * 0.06);
        ctx.quadraticCurveTo(mx, my - r * 0.14, mx + r * 0.14, my);
      }
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Berries on some.
    if (unit(e.seed, 'berries') < 0.4 && q > 0.7) {
      ctx.fillStyle = recede(p, '#C98A8A', p.dark ? 0.4 : 0.1);
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(cx + (unit(e.seed, 'bx', i) - 0.5) * w * 0.5, h - hh * (0.3 + 0.5 * unit(e.seed, 'by', i)), Math.max(1, h * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  return { canvas, w, h: H };
}

/* ----------------------------------------------------- the land, standing */

/**
 * Everything that does not move: the sky's wash, the stars and the moon on a
 * night paper, the horizon and the far treeline, stones, ferns, the fallen
 * log and its fungi, the great trunk, the light through the canopy. Drawn
 * into its own canvas and only redrawn when the land has grown a step.
 */
export function drawStanding(ctx: CanvasRenderingContext2D, L: SceneLayout, p: Palette, land: Land, env: WoodEnv, z: number, night: boolean): void {
  ctx.clearRect(0, 0, L.w, L.h);
  const horizonPx = HORIZON * L.ground;

  // The sky: on paper, a pale wash at the very top and nothing else, so the
  // page stays a page; at night, a scatter of stars and the moon.
  if (!night) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizonPx);
    const blue = env.weather === 'haze' ? '#C9C2B0' : '#A8BCC9';
    sky.addColorStop(0, hexA(mixHex(blue, p.paper, p.dark ? 0.55 : 0.2), p.dark ? 0.18 : 0.16));
    sky.addColorStop(1, hexA(p.paper, 0));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, L.w, horizonPx);
  } else {
    const count = Math.round((L.w * L.h) / (9000 * L.px * L.px));
    for (let i = 0; i < count; i++) {
      const sx = unit(env.stars, 'x', i) * L.w;
      const sy = Math.pow(unit(env.stars, 'y', i), 1.4) * horizonPx * 0.9;
      const r = (0.4 + unit(env.stars, 'r', i) * 0.9) * L.px;
      ctx.fillStyle = hexA('#EFE9DC', 0.12 + 0.35 * unit(env.stars, 'a', i));
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    drawMoon(ctx, env.moonX * L.w, horizonPx * 0.22, Math.max(10 * L.px, L.h * 0.035), env.moon);
  }

  // Light through the canopy, on a day paper only.
  if (!night && env.weather !== 'drizzle') {
    for (const e of land.elements) {
      if (e.kind !== 'shaft') continue;
      const a = arrival(z, e.from, e.over);
      if (a <= 0) continue;
      const x = e.x * L.w;
      const lean = L.h * 0.35 * (unit(e.seed, 'lean') - 0.3);
      const wTop = L.w * 0.03;
      const wBot = L.w * (0.08 + 0.06 * unit(e.seed, 'w'));
      const g = ctx.createLinearGradient(0, 0, 0, L.ground);
      g.addColorStop(0, hexA('#F4E3B0', 0.2 * a));
      g.addColorStop(1, hexA('#F4E3B0', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - wTop, 0);
      ctx.lineTo(x + wTop, 0);
      ctx.lineTo(x + lean + wBot, L.ground);
      ctx.lineTo(x + lean - wBot, L.ground);
      ctx.closePath();
      ctx.fill();
    }
  }

  // The ground, a faint wash from the horizon down.
  const ground = ctx.createLinearGradient(0, horizonPx, 0, L.ground);
  const earth = night ? '#2A2721' : mixHex('#C9B98F', p.course, 0.08);
  ground.addColorStop(0, hexA(earth, night ? 0.45 : p.dark ? 0.05 : 0.06));
  ground.addColorStop(1, hexA(earth, night ? 0.85 : p.dark ? 0.11 : 0.14));
  ctx.fillStyle = ground;
  ctx.beginPath();
  horizonPath(ctx, L, land, horizonPx);
  ctx.lineTo(L.w, L.h);
  ctx.lineTo(0, L.h);
  ctx.closePath();
  ctx.fill();

  // The far treeline, rising along the horizon from the young wood on.
  const line = arrival(z, 0.34, 0.36);
  if (line > 0) {
    const n = land.treeline.length;
    const leaf = night ? mixHex(leafHue(p, 1), '#1A1815', 0.72) : recede(p, mixHex(leafHue(p, 1), '#A8AE98', 0.5), 0.5);
    ctx.fillStyle = hexA(leaf, night ? 0.9 : 0.55);
    ctx.strokeStyle = recede(p, p.pencil, 0.2);
    ctx.lineWidth = 0.8 * L.px;
    ctx.beginPath();
    const maxH = L.h * 0.07 * line;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * L.w;
      const base = horizonAt(L, land, horizonPx, i / (n - 1));
      const top = base - maxH * land.treeline[i];
      if (i === 0) ctx.moveTo(x, base);
      const x0 = x - L.w / (n - 1) / 2;
      ctx.quadraticCurveTo(x0, top - maxH * 0.2, x, top);
    }
    ctx.lineTo(L.w, horizonAt(L, land, horizonPx, 1));
    ctx.lineTo(0, horizonAt(L, land, horizonPx, 0));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // The horizon itself, a pencil line.
  ctx.strokeStyle = p.pencil;
  ctx.lineWidth = 0.9 * L.px;
  ctx.beginPath();
  horizonPath(ctx, L, land, horizonPx);
  ctx.stroke();

  for (const e of land.elements) {
    const a = arrival(z, e.from, e.over);
    if (a <= 0) continue;
    if (e.kind === 'stone') drawStone(ctx, e, L, p);
    else if (e.kind === 'fern') drawFern(ctx, e, L, p, a);
    else if (e.kind === 'log') drawLog(ctx, e, L, p, a);
    else if (e.kind === 'fungus') drawFungus(ctx, e, L, p, a, land);
    else if (e.kind === 'trunk') drawTrunk(ctx, e, L, p, a);
  }
}

function horizonAt(L: SceneLayout, land: Land, horizonPx: number, u: number): number {
  const n = land.horizon.length;
  const f = Math.min(n - 1, Math.max(0, u * (n - 1)));
  const i = Math.floor(f);
  const k = f - i;
  const v = land.horizon[i] * (1 - k) + land.horizon[Math.min(n - 1, i + 1)] * k;
  return horizonPx + v * (L.ground - horizonPx);
}

function horizonPath(ctx: CanvasRenderingContext2D, L: SceneLayout, land: Land, horizonPx: number): void {
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const y = horizonAt(L, land, horizonPx, u);
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(u * L.w, y);
  }
}

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number): void {
  const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 4);
  glow.addColorStop(0, 'rgba(239,233,220,0.10)');
  glow.addColorStop(1, 'rgba(239,233,220,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(239,233,220,0.82)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // The shadowed part, as a second disc slid across: a crescent near new,
  // nothing at full.
  // How much of it is lit, never less than a fair crescent.
  const lit = Math.max(0.28, 1 - Math.abs(phase - 0.5) * 2);
  if (lit < 0.94) {
    // The shadow is a disc slid across, kept inside the moon's own outline.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r + 0.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1A1815';
    ctx.globalAlpha = 0.94;
    ctx.beginPath();
    ctx.arc(x + (phase < 0.5 ? -1 : 1) * r * 2 * lit, y - r * 0.06, r * 1.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawStone(ctx: CanvasRenderingContext2D, e: LandElement, L: SceneLayout, p: Palette): void {
  const s = scaleAt(e.d);
  const x = e.x * L.w;
  const y = groundPx(L, e.d);
  const r = e.h * L.h * s;
  // Low and half sunk: a stone is mostly under the grass.
  ctx.fillStyle = recede(p, p.dark ? '#34312B' : '#E2DBCB', (1 - e.d) * 0.4);
  ctx.strokeStyle = recede(p, p.pencil, 0.15 + (1 - e.d) * 0.3);
  ctx.lineWidth = 0.8 * L.px;
  ctx.beginPath();
  ctx.moveTo(x - r * 1.3, y);
  ctx.bezierCurveTo(x - r * 1.2, y - r * 0.55, x - r * 0.3, y - r * 0.62, x + r * 0.35, y - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.95, y - r * 0.4, x + r * 1.3, y - r * 0.15, x + r * 1.35, y);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y - r * 0.32);
  ctx.lineTo(x - r * 0.15, y - r * 0.14);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawFern(ctx: CanvasRenderingContext2D, e: LandElement, L: SceneLayout, p: Palette, a: number): void {
  const s = scaleAt(e.d);
  const x = e.x * L.w;
  const y = groundPx(L, e.d);
  const h = e.h * L.h * s * a;
  const fronds = 3 + Math.floor(unit(e.seed, 'f') * 3);
  ctx.strokeStyle = recede(p, leafHue(p, 0), (1 - e.d) * 0.5 + (p.dark ? 0.35 : 0.05));
  ctx.lineWidth = Math.max(0.6, 0.8 * L.px);
  for (let f = 0; f < fronds; f++) {
    const side = (f / Math.max(1, fronds - 1) - 0.5) * 2;
    const tipX = x + side * h * 0.9;
    const tipY = y - h * (0.6 + 0.4 * (1 - Math.abs(side)));
    const cx = x + side * h * 0.2;
    const cy = y - h * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cx, cy, tipX, tipY);
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const px = (1 - t) * (1 - t) * x + 2 * t * (1 - t) * cx + t * t * tipX;
      const py = (1 - t) * (1 - t) * y + 2 * t * (1 - t) * cy + t * t * tipY;
      const len = h * 0.14 * (1 - t * 0.7);
      ctx.moveTo(px, py);
      ctx.lineTo(px - len * 0.7, py - len * 0.5);
      ctx.moveTo(px, py);
      ctx.lineTo(px + len * 0.7, py - len * 0.5);
    }
    ctx.stroke();
  }
}

function drawLog(ctx: CanvasRenderingContext2D, e: LandElement, L: SceneLayout, p: Palette, a: number): void {
  const s = scaleAt(e.d);
  const x = e.x * L.w;
  const y = groundPx(L, e.d);
  const r = e.h * L.h * s;
  const len = r * 7 * a;
  const x0 = x - len / 2;
  ctx.globalAlpha = a;
  ctx.fillStyle = recede(p, p.dark ? '#4A3C30' : '#CDB79A', (1 - e.d) * 0.35);
  ctx.strokeStyle = recede(p, p.dark ? '#8A7A66' : '#7D6A55', (1 - e.d) * 0.3);
  ctx.lineWidth = 0.9 * L.px;
  ctx.beginPath();
  ctx.moveTo(x0, y - r * 2);
  ctx.lineTo(x0 + len, y - r * 1.8);
  ctx.quadraticCurveTo(x0 + len + r * 0.6, y - r * 0.9, x0 + len, y);
  ctx.lineTo(x0, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x0, y - r, r * 0.55, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x0, y - r, r * 0.25, r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.5 * a;
  for (let i = 0; i < 6; i++) {
    const bx = x0 + len * (0.12 + i * 0.14);
    ctx.beginPath();
    ctx.moveTo(bx, y - r * 1.85);
    ctx.quadraticCurveTo(bx + r * 0.4, y - r, bx, y - r * 0.2);
    ctx.stroke();
  }
  // Moss along the top.
  ctx.globalAlpha = 0.7 * a;
  ctx.fillStyle = recede(p, leafHue(p, 0), p.dark ? 0.35 : 0.1);
  ctx.beginPath();
  ctx.ellipse(x0 + len * 0.45, y - r * 1.95, len * 0.3, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawFungus(ctx: CanvasRenderingContext2D, e: LandElement, L: SceneLayout, p: Palette, a: number, land: Land): void {
  const s = scaleAt(e.d);
  const log = land.elements.find((x) => x.kind === 'log');
  const onLog = log && Math.abs(e.x - log.x) < 0.1 && arrival(1, log.from, log.over) > 0;
  const x = e.x * L.w;
  const y = onLog && log ? groundPx(L, log.d) - log.h * L.h * scaleAt(log.d) * 1.9 : groundPx(L, e.d);
  const h = e.h * L.h * s * a;
  const hue = ['#A8B89B', '#D4A5A5', '#B5A8C9', '#E2B594', '#A8BCC9', '#C99B7E', '#D9C58C', '#9FC1B0', '#9AA3AB', '#B89BAA'][e.hue % 10];
  ctx.fillStyle = recede(p, p.dark ? mixHex(hue, p.paper, 0.35) : hue, (1 - e.d) * 0.3);
  ctx.strokeStyle = recede(p, p.dark ? mixHex(hue, '#FFFFFF', 0.4) : mixHex(hue, '#1A1714', 0.55), (1 - e.d) * 0.3);
  ctx.lineWidth = 0.8 * L.px;
  const kind = e.fungus ?? 'cap';
  // Stem.
  if (kind !== 'shelf') {
    ctx.beginPath();
    ctx.moveTo(x - h * 0.14, y);
    ctx.lineTo(x - h * 0.1, y - h * 0.7);
    ctx.lineTo(x + h * 0.1, y - h * 0.7);
    ctx.lineTo(x + h * 0.14, y);
    ctx.closePath();
    ctx.fillStyle = recede(p, p.dark ? '#5A5246' : '#EEE6D2', 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = recede(p, p.dark ? mixHex(hue, p.paper, 0.35) : hue, (1 - e.d) * 0.3);
  }
  ctx.beginPath();
  if (kind === 'cap') {
    ctx.ellipse(x, y - h * 0.7, h * 0.55, h * 0.4, 0, Math.PI, 0);
    ctx.closePath();
  } else if (kind === 'bell') {
    ctx.moveTo(x - h * 0.35, y - h * 0.65);
    ctx.quadraticCurveTo(x - h * 0.3, y - h * 1.35, x, y - h * 1.4);
    ctx.quadraticCurveTo(x + h * 0.3, y - h * 1.35, x + h * 0.35, y - h * 0.65);
    ctx.closePath();
  } else {
    ctx.ellipse(x, y - h * 0.3, h * 0.6, h * 0.22, 0, Math.PI, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (kind === 'cap' && unit(e.seed, 'spots') < 0.5) {
    ctx.fillStyle = p.dark ? '#EFE9DC' : p.paper;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x + (i - 1.5) * h * 0.22, y - h * (0.85 + (i % 2) * 0.12), Math.max(0.6, h * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTrunk(ctx: CanvasRenderingContext2D, e: LandElement, L: SceneLayout, p: Palette, a: number): void {
  const left = e.x < 0.5;
  const w = L.w * 0.07 * a;
  const x = left ? w * 0.35 : L.w - w * 0.35;
  const bottom = L.ground;
  ctx.globalAlpha = a;
  ctx.fillStyle = recede(p, p.dark ? '#3E352C' : '#D3C3A6', 0.15);
  ctx.strokeStyle = recede(p, p.dark ? '#7D6E5C' : '#8B775F', 0.1);
  ctx.lineWidth = 1.1 * L.px;
  const flare = w * 0.8;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, -2);
  ctx.bezierCurveTo(x - w / 2, bottom * 0.6, x - w / 2, bottom - flare * 0.6, x - w / 2 - flare, bottom);
  ctx.lineTo(x + w / 2 + flare, bottom);
  ctx.bezierCurveTo(x + w / 2, bottom - flare * 0.6, x + w / 2, bottom * 0.6, x + w / 2, -2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Bark: long wavering lines down the trunk.
  ctx.globalAlpha = 0.45 * a;
  ctx.lineWidth = 0.8 * L.px;
  for (let i = 0; i < 6; i++) {
    const bx = x - w * 0.4 + (i / 5) * w * 0.8;
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    for (let yy = 0; yy <= bottom * 0.95; yy += L.h * 0.06) {
      ctx.lineTo(bx + Math.sin(yy * 0.03 + i * 1.7) * w * 0.05, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A hex colour at an alpha, for gradients. */
export function hexA(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.slice(0, 6), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/** The colours of the reader's own tree, for the family standing behind it. */
export function heroColors(course: string, dark: boolean): [string, string, string] {
  return fanShades(course, dark);
}

export { GLOWS };
