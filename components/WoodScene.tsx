'use client';

import { useEffect, useMemo, useRef } from 'react';
import StudyFan, { type FanFrame } from '@/components/StudyFan';
import { fanGrown, fanPointAt, seedFrom, type FanLayout, type FanTree } from '@/lib/fan';
import { rollWood, type Wood } from '@/lib/wood/biome';
import {
  BREAK_PACE,
  courseKey,
  finishedBlocks,
  heroBlock,
  woodKey,
  woodKeyFromSegments,
  woodTime,
  woodTimeFromSegments,
  type SittingState,
  type WoodTime,
} from '@/lib/wood/clock';
import {
  animalPx,
  bushSprite,
  drawFigure,
  drawFlowerHead,
  drawGrass,
  drawSpeck,
  drawStanding,
  figureFor,
  groundPx,
  heroColors,
  hexA,
  inksFor,
  scaleAt,
  spriteStore,
  treeFor,
  treeSprite,
  windAt,
  type SceneLayout,
  type SpriteStore,
} from '@/lib/wood/draw';
import { GLOWS } from '@/lib/wood/fauna';
import type { LandElement } from '@/lib/wood/flora';
import { leafHue, luminance, makePalette, recede, type Palette } from '@/lib/wood/palette';
import { unit } from '@/lib/wood/random';
import { firefliesAt, MIN_DENSITY, SpawnCache, visitorsAt, type View, type Visitor } from '@/lib/wood/schedule';
import { arrival, successionAt } from '@/lib/wood/succession';
import { treeForBlock } from '@/lib/wood/tree';
import type { SessionSegment } from '@/lib/data/types';
import { mixHex } from '@/lib/fan';

/**
 * The wood: the timer's tree standing in a land that ages as the reader
 * sits. See "The wood" in readmedesign.md.
 *
 * Two canvases and the tree between them. The back one holds the land and
 * everything behind the tree; the front one the grass at the very front,
 * whatever comes close, and the rain. The tree is the same StudyFan as
 * ever, handed its habit, the wind, and a hook to draw the birds that land
 * on it, so a bird on a branch moves with the branch in the same frame.
 *
 * Nothing here is remembered. Every frame is worked out from the timer's
 * state and the clock: the key names the wood, focus time says how far the
 * land has aged, and the scene clock says where every animal is.
 */

type HeroProps = {
  progress: number;
  seed: string;
  depth: number;
  tripleP?: number;
  trunkWidth: number;
  padTop: number;
  widthFill?: number;
  baseOffset?: number;
  light?: boolean;
  sketch?: boolean;
  ground?: boolean;
  resting?: boolean;
  interactive?: boolean;
};

interface Props {
  mode: 'frame' | 'open';
  courseId: string;
  color: string;
  /** The sitting on the clock, or the one held behind the log sheet. */
  sitting?: SittingState | null;
  /** A sitting that has ended with no held frame: its segments. */
  ended?: readonly SessionSegment[] | null;
  /** For the Settings preview: a wood at this much focus, drawn once. */
  preview?: { focus: number; key: string };
  /** Draw once and stop: a held frame. */
  still?: boolean;
  sessionId?: string | null;
  hero: HeroProps;
  /** The chrome over the scene. Animals fade out behind it. */
  clearRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

/* The land and its animals are soft; they are drawn at up to one and a half
   device pixels to the CSS pixel, and the tree, which is ink, at its own. */
const DPR_CAP = 1.5;
/* The wood moves slowly; thirty frames a second is all it needs. */
const FRAME_MS = 1000 / 30;

/* Where the finished trees of the sitting stand behind the one on the clock,
   alternating sides and stepping back. */
function groveSpot(i: number): { x: number; d: number } {
  const side = i % 2 ? 1 : -1;
  const row = Math.floor(i / 2);
  return { x: Math.min(0.94, Math.max(0.06, 0.5 + side * (0.24 + 0.1 * row))), d: Math.max(0.2, 0.62 - 0.1 * row) };
}

export default function WoodScene({ mode, courseId, color, sitting, ended, preview, still = false, sessionId, hero, clearRef, className = '' }: Props) {
  const night = mode === 'open';
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLCanvasElement | null>(null);
  const frontRef = useRef<HTMLCanvasElement | null>(null);
  const windRef = useRef({ current: 0 });
  const wakeRef = useRef<() => void>(() => {});

  const key = preview?.key ?? (sitting ? woodKey(courseId, sitting.sittingStartedAt) : ended ? woodKeyFromSegments(courseId, ended) : null) ?? `still:${courseId}`;
  const isPreview = !!preview;
  const wood = useMemo<Wood>(() => {
    const w = rollWood(key, courseKey(courseId));
    // The Settings preview shows the wood as it usually is: a clear summer
    // day, not whatever weather its key happened to roll.
    return isPreview ? { ...w, env: { ...w.env, weather: 'clear', season: 'summer' } } : w;
  }, [key, courseId, isPreview]);

  // The live inputs, read every frame without re-rendering.
  const sittingRef = useRef(sitting);
  sittingRef.current = sitting;
  const endedRef = useRef(ended);
  endedRef.current = ended;
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const stillRef = useRef(still);
  stillRef.current = still;

  const timeNow = (): WoodTime => {
    const p = previewRef.current;
    if (p) return { focus: p.focus, rest: 0, scene: p.focus, phase: 'focus', paused: true, blocks: 0 };
    const s = sittingRef.current;
    if (s) return woodTime(s, Date.now());
    const e = endedRef.current;
    if (e && e.length) return woodTimeFromSegments(e);
    return { focus: 0, rest: 0, scene: 0, phase: 'focus', paused: true, blocks: 0 };
  };

  // Which block's tree is on the clock, and its habit.
  const t0 = timeNow();
  const block = heroBlock(t0);
  const habit = useMemo(() => treeForBlock(key, block), [key, block]);
  const running = !still && !preview && !!sitting && !sitting.isPaused;

  // Birds on the tree, shared between the scene's loop and the tree's.
  const shared = useRef<{
    layout: SceneLayout | null;
    palette: Palette | null;
    visitors: Visitor[];
    scene: number;
    flushed: Map<string, { at: number; x: number; y: number }>;
    seats: Map<string, { x: number; y: number }>;
  }>({ layout: null, palette: null, visitors: [], scene: 0, flushed: new Map(), seats: new Map() });

  const perchCache = useRef<{ tree: FanTree | null; list: number[] }>({ tree: null, list: [] });

  const overlay = (ctx: CanvasRenderingContext2D, frame: FanFrame) => {
    const S = shared.current;
    const L = S.layout;
    const pal = S.palette;
    if (!L || !pal) return;
    const { tree, layout } = frame;
    if (perchCache.current.tree !== tree) {
      const list: number[] = [];
      tree.segs.forEach((s, i) => {
        if (s.d >= 3 && s.d <= tree.depthMax - 1 && s.kids > 0) list.push(i);
      });
      perchCache.current = { tree, list };
    }
    const cands = perchCache.current.list;
    if (!cands.length) return;
    for (const v of S.visitors) {
      if (v.seat?.on !== 'hero') continue;
      const seat = v.seat;
      // On the tree on the clock a bird is a bird on a branch, not a figure
      // standing in front of it: sized to sit, not to be looked at.
      const size = animalPx(L, v.genome, 0.55);
      let point = seatOnHero(tree, layout, cands, seat.pick, seat.u);
      const flushed = S.flushed.get(v.id);
      if (!flushed && frame.held && point && seat.landing >= 1) {
        S.flushed.set(v.id, { at: S.scene, x: point.x, y: point.y });
      }
      const from = { x: seat.from[0] * L.w, y: seat.from[1] * L.ground };
      const to = { x: seat.to[0] * L.w, y: seat.to[1] * L.ground };
      let x: number;
      let y: number;
      let flying = false;
      if (!point) {
        // Its branch is gone (a new block's tree is younger): it leaves from
        // where it last sat.
        const last = S.seats.get(v.id);
        if (!last) continue;
        if (!S.flushed.has(v.id)) S.flushed.set(v.id, { at: S.scene, x: last.x, y: last.y });
        point = { x: last.x, y: last.y, a: 0 };
      }
      const f = S.flushed.get(v.id);
      if (f) {
        const k = Math.min(1, (S.scene - f.at) / 1.4);
        if (k >= 1) continue;
        x = f.x + (to.x - f.x) * k;
        y = f.y + (to.y - f.y) * k - Math.sin(k * Math.PI) * size * 0.8;
        flying = true;
      } else if (seat.landing < 1) {
        const k = seat.landing;
        x = from.x + (point.x - from.x) * k;
        y = from.y + (point.y - from.y) * k - Math.sin(k * Math.PI) * size * 0.6;
        flying = true;
      } else if (seat.leaving > 0) {
        const k = seat.leaving;
        x = point.x + (to.x - point.x) * k;
        y = point.y + (to.y - point.y) * k - Math.sin(k * Math.PI) * size * 0.6;
        flying = true;
      } else {
        x = point.x;
        y = point.y;
        S.seats.set(v.id, { x, y });
      }
      const pose = flying ? { kind: 'fly' as const, t: (S.scene * 3.4) % 1 } : v.pose;
      const facing: 1 | -1 = flying ? (to.x > x ? 1 : -1) : v.facing;
      drawFigure(ctx, figureFor(v.spawn.species.id, v.genome, pose), {
        x,
        y,
        size,
        facing,
        alpha: 1,
        inks: inksFor(pal, v.genome, 0),
        px: L.px,
      });
    }
  };

  useEffect(() => {
    const back = backRef.current;
    const front = frontRef.current;
    const wrap = wrapRef.current;
    if (!back || !front || !wrap) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const store: SpriteStore = spriteStore();
    const cache = new SpawnCache(wood);
    const standing = document.createElement('canvas');
    let standingKey = '';
    let raf: number | null = null;
    let disposed = false;
    let shown = timeNow().scene;
    let last = performance.now();
    let lastStage = successionAt(timeNow().focus).index;
    let gustAt = -1e9;
    let lite = false;
    let slowFrames = 0;
    let settledFor = 0;
    let clear: { x: number; y: number; w: number; h: number } | null = null;
    // A soft patch the size of the chrome, for letting the land go quiet
    // behind the clock and the buttons.
    const hush = document.createElement('canvas');

    const measure = (): { L: SceneLayout; pal: Palette } => {
      const rect = wrap.getBoundingClientRect();
      const px = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const w = Math.max(1, Math.round(rect.width * px));
      const h = Math.max(1, Math.round(rect.height * px));
      for (const c of [back, front, standing]) {
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
      }
      const base = (hero.baseOffset ?? -2) * px;
      const L: SceneLayout = { w, h, px, ground: h - Math.max(0, base) };
      const paper = night ? '#1A1815' : getComputedStyle(wrap).getPropertyValue('--paper').trim() || '#FBF8EF';
      const pal = makePalette(paper, color, wood.env.season, night || luminance(paper) < 0.4);
      const chrome = clearRef?.current?.getBoundingClientRect();
      clear = chrome ? { x: (chrome.left - rect.left) * px, y: (chrome.top - rect.top) * px, w: chrome.width * px, h: chrome.height * px } : null;
      hush.width = w;
      hush.height = h;
      const hctx = hush.getContext('2d');
      if (hctx) {
        hctx.clearRect(0, 0, w, h);
        if (clear) {
          const feather = 36 * px;
          hctx.filter = `blur(${feather / 2}px)`;
          hctx.fillStyle = 'rgba(0,0,0,0.72)';
          hctx.fillRect(clear.x - feather / 2, clear.y - feather / 2, clear.w + feather, clear.h + feather);
          hctx.filter = 'none';
        }
      }
      return { L, pal };
    };
    let { L, pal } = measure();

    const inClear = (x: number, y: number) => {
      if (!clear) return 1;
      const pad = 24 * L.px;
      const dx = Math.max(clear.x - x, 0, x - (clear.x + clear.w));
      const dy = Math.max(clear.y - y, 0, y - (clear.y + clear.h));
      const dist = Math.hypot(dx, dy);
      return Math.min(1, 0.12 + dist / pad);
    };

    const frame = (now: number) => {
      if (disposed) return;
      if (now - last < FRAME_MS - 2 && !stillRef.current) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const started = performance.now();
      const t = timeNow();
      const frozen = reduced || stillRef.current || !!previewRef.current;
      // The scene clock follows the timer's, eased, so a pause lets the wood
      // come to rest over a moment rather than stopping dead.
      if (frozen || Math.abs(t.scene - shown) > 4) shown = t.scene;
      else shown += (t.scene - shown) * (1 - Math.exp(-dt / 0.3));
      const succ = successionAt(t.focus);
      if (succ.index !== lastStage) {
        if (succ.index > lastStage && !frozen) gustAt = shown;
        lastStage = succ.index;
      }
      const gust = Math.max(0, 1 - Math.abs(shown - gustAt - 2) / 2.5);
      const pace = t.paused ? 0 : t.phase === 'break' ? BREAK_PACE : 1;
      const wind = frozen ? 0 : windAt(wood.env, wood.key, shown) + gust * 1.4 * wood.env.windDir;
      windRef.current.current = wind * 0.035 * (0.3 + 0.7 * pace);

      const view: View = {
        night,
        density: Math.min(1, Math.max(MIN_DENSITY, (L.w * L.h) / (L.px * L.px) / (1440 * 900))),
        aspect: L.w / Math.max(1, L.ground),
      };
      const segments = (sittingRef.current?.segments ?? endedRef.current ?? []) as SessionSegment[];
      const visitors = previewRef.current
        ? []
        : visitorsAt(wood, { focus: t.focus, scene: shown, segments }, view, cache, wood.land.elements);
      const S = shared.current;
      S.layout = L;
      S.palette = pal;
      S.visitors = visitors;
      S.scene = shown;

      // The standing land, redrawn only when it has grown a step.
      const zq = Math.round(succ.z * 200);
      const sk = `${zq}|${L.w}x${L.h}|${pal.paper}`;
      if (sk !== standingKey) {
        standingKey = sk;
        const sctx = standing.getContext('2d');
        if (sctx) drawStanding(sctx, L, pal, wood.land, wood.env, succ.z, night);
      }

      const bctx = back.getContext('2d');
      const fctx = front.getContext('2d');
      if (!bctx || !fctx) return;
      bctx.clearRect(0, 0, L.w, L.h);
      fctx.clearRect(0, 0, L.w, L.h);
      bctx.drawImage(standing, 0, 0);

      const sway = (e: LandElement) => wind * (0.012 + 0.02 * e.h) + Math.sin(shown * 1.3 + e.seed % 7) * 0.004 * pace;

      // The land's own trees, far ones first.
      const elements = wood.land.elements.filter((e) => e.rank < Math.max(0.55, view.density) || e.kind === 'tree');
      const treeSeats = new Map<number, { x: number; y: number; tree: FanTree; layout: FanLayout; rot: number; w: number; h: number }>();
      const trees = elements.filter((e) => e.kind === 'tree').sort((a, b) => a.d - b.d);
      for (const e of trees) {
        const grown = arrival(succ.z, e.from, e.over);
        if (grown <= 0) continue;
        const tree = treeFor(e.seed, e.depth ?? 6, e.tripleP ?? 0.2, e.shape!);
        const s = scaleAt(e.d);
        const back = (1 - e.d) * 0.55 + (pal.dark ? 0.25 : 0);
        const leaf = recede(pal, leafHue(pal, e.hue), back);
        const stem = recede(pal, pal.dark ? '#7D6E5C' : '#8B775F', back + 0.1);
        // A tree comes up as a sapling and fades in, rather than standing
        // there as a bare trunk waiting for its crown.
        // The tall ones come in already branching, so they never stand
        // there as a bare fork.
        const floor = e.h > 0.7 ? 0.5 : 0.25;
        const drawn = floor + (1 - floor) * grown;
        // On the page the tall ones stop short of the top: that edge is the
        // reader's own tree's to reach.
        const tall = night ? e.h : Math.min(e.h, 0.78);
        const sp = treeSprite(store, pal, tree, `t${e.id}`, tall * L.ground * s, drawn, { stem, leaf }, L.px);
        const x = e.x * L.w;
        const y = groundPx(L, e.d);
        const rot = sway(e);
        bctx.save();
        bctx.globalAlpha = Math.min(1, grown * 3);
        bctx.translate(x, y);
        bctx.rotate(rot);
        bctx.drawImage(sp.canvas, -sp.footX, -sp.footY);
        bctx.restore();
        const span = tree.maxX - tree.minX;
        const sc = Math.min((sp.w * 0.9) / span, (sp.h - 2 * L.px) / -tree.minY);
        treeSeats.set(e.id, {
          x,
          y,
          tree,
          layout: { sc, ox: sp.w / 2 - ((tree.minX + tree.maxX) / 2) * sc, oy: sp.h, bent: false, progress: Math.min(0.96, drawn) },
          rot,
          w: sp.w,
          h: sp.h,
        });
      }

      // The family: every block already finished this sitting, standing back.
      const fin = finishedBlocks(segments, t);
      const heroCols = heroColors(color, pal.dark);
      for (const b of fin) {
        const spot = groveSpot(b.index);
        const g = treeForBlock(key, b.index);
        const seed = seedFrom(sessionId ? `${sessionId}-${b.index}` : `${key}-${b.index}`);
        const tree = treeFor(seed, Math.min(hero.depth, 8), hero.tripleP ?? 0.2, g.shape);
        const s = scaleAt(spot.d);
        const backAmt = 0.3 + (1 - spot.d) * 0.3;
        const sp = treeSprite(store, pal, tree, `grove${b.index}`, L.ground * 0.62 * s, b.grown, { stem: recede(pal, heroCols[0], backAmt), leaf: recede(pal, heroCols[2], backAmt) }, L.px);
        bctx.save();
        bctx.translate(spot.x * L.w, groundPx(L, spot.d));
        bctx.rotate(wind * 0.018);
        bctx.drawImage(sp.canvas, -sp.footX, -sp.footY);
        bctx.restore();
      }

      // Bushes, flowers and grass behind the front row.
      for (const e of elements) {
        if (e.kind !== 'bush') continue;
        const grow = arrival(succ.z, e.from, e.over);
        if (grow <= 0) continue;
        const sp = bushSprite(store, e, L, pal, grow);
        bctx.save();
        bctx.globalAlpha = inClear(e.x * L.w, groundPx(L, e.d) - sp.h / 2) * (night ? 0.85 : 1);
        bctx.translate(e.x * L.w, groundPx(L, e.d));
        bctx.transform(1, 0, wind * 0.04, 1, 0, 0);
        bctx.drawImage(sp.canvas, -sp.w / 2, -sp.h);
        bctx.restore();
      }
      for (const e of elements) {
        if (e.kind !== 'grass' && e.kind !== 'flower') continue;
        const grow = arrival(succ.z, e.from, e.over);
        const ctx = e.d >= 0.93 ? fctx : bctx;
        const w = wind * (0.6 + 0.4 * Math.sin(shown * 2.1 + e.id));
        ctx.globalAlpha = clear ? inClear(e.x * L.w, groundPx(L, e.d)) : 1;
        if (e.kind === 'grass') drawGrass(ctx, e, L, pal, grow, w);
        else if (!lite || e.rank < 0.6) drawFlowerHead(ctx, e, L, pal, grow, w);
        ctx.globalAlpha = 1;
      }

      // The animals, far to near. Walkers are big and slow, so only a few at
      // a time: a herd crossing a small page is a wall.
      const walkCap = Math.round(2 + 3 * view.density);
      let walking = 0;
      const sorted = visitors.slice().sort((a, b) => a.d - b.d);
      for (const v of sorted) {
        if (v.seat?.on === 'hero') continue;
        const plan = v.genome.plan;
        if (plan === 'deer' || plan === 'fox' || plan === 'hare' || plan === 'hedgehog') {
          if (walking >= walkCap) continue;
          walking++;
        }
        const near = v.spawn.depth === 'near';
        const ctx = near ? fctx : bctx;
        const size = animalPx(L, v.genome, v.d);
        let x = v.x * L.w;
        let y = v.y * L.ground;
        let pose = v.pose;
        let facing = v.facing;
        if (v.seat?.on === 'tree') {
          const seat = v.seat.tree != null ? treeSeats.get(v.seat.tree) : undefined;
          if (!seat) continue;
          const pick = seatOnTree(seat.tree, seat.layout, v.seat.pick, v.seat.u);
          if (!pick) continue;
          const lx = pick.x - seat.w / 2;
          const ly = pick.y - seat.h;
          const c = Math.cos(seat.rot);
          const sn = Math.sin(seat.rot);
          const px = seat.x + lx * c - ly * sn;
          const py = seat.y + lx * sn + ly * c;
          const from = { x: v.seat.from[0] * L.w, y: v.seat.from[1] * L.ground };
          const to = { x: v.seat.to[0] * L.w, y: v.seat.to[1] * L.ground };
          const perchSize = animalPx(L, v.genome, 0.55);
          if (v.seat.landing < 1) {
            const k = v.seat.landing;
            x = from.x + (px - from.x) * k;
            y = from.y + (py - from.y) * k - Math.sin(k * Math.PI) * perchSize;
          } else if (v.seat.leaving > 0) {
            const k = v.seat.leaving;
            x = px + (to.x - px) * k;
            y = py + (to.y - py) * k - Math.sin(k * Math.PI) * perchSize;
          } else {
            x = px;
            y = py;
          }
          if (v.seat.landing < 1 || v.seat.leaving > 0) {
            pose = { kind: 'fly', t: (shown * 3.4) % 1 };
            facing = (v.seat.leaving > 0 ? to.x > x : px > x) ? 1 : -1;
          }
          const back = 0.25;
          drawFigure(ctx, figureFor(v.spawn.species.id, v.genome, pose), { x, y, size: perchSize, facing, alpha: v.alpha * inClear(x, y), inks: inksFor(pal, v.genome, back), px: L.px });
          continue;
        }
        const back = (1 - v.d) * 0.75;
        const alpha = v.alpha * inClear(x, y);
        if (alpha <= 0.02) continue;
        // Anything on the ground casts a little shadow onto it.
        if (plan === 'deer' || plan === 'fox' || plan === 'hare' || plan === 'hedgehog' || v.pose.kind === 'perch') {
          ctx.save();
          ctx.globalAlpha = alpha * (pal.dark ? 0.35 : 0.14);
          ctx.fillStyle = pal.dark ? '#000000' : '#6B5A40';
          ctx.beginPath();
          ctx.ellipse(x, y, size * 0.45, size * 0.06, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (size < 9 * L.px && (v.genome.plan === 'songbird' || v.genome.plan === 'raptor' || v.genome.plan === 'owl' || v.genome.plan === 'bat')) {
          drawSpeck(ctx, x, y, size, v.pose.t, inksFor(pal, v.genome, back).ink, L.px, alpha);
          continue;
        }
        drawFigure(ctx, figureFor(v.spawn.species.id, v.genome, pose), {
          x,
          y,
          size,
          facing,
          heading: v.heading,
          alpha,
          inks: inksFor(pal, v.genome, back),
          px: L.px,
        });
      }

      // Fireflies, low among the bushes, on their own rhythms.
      const flies = firefliesAt(wood, t.focus, shown, view);
      for (const f of lite ? flies.filter((_, i) => i % 2 === 0) : flies) {
        const x = f.x * L.w;
        const y = f.y * L.ground;
        const ctx = f.id % 3 === 0 ? fctx : bctx;
        const glow = GLOWS[f.species.genome.glow ?? 0];
        const r = Math.max(3, L.h * 0.012) * (0.6 + 0.4 * f.lit);
        if (f.lit > 0.02) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
          g.addColorStop(0, hexA(glow, 0.55 * f.lit));
          g.addColorStop(1, hexA(glow, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = hexA(mixHex(glow, '#FFFFFF', 0.4), 0.15 + 0.85 * f.lit);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.9, 1.2 * L.px), 0, Math.PI * 2);
        ctx.fill();
      }

      // Autumn lets its leaves go on the wind; a drizzle sets its lines.
      if (wood.env.season === 'autumn' && succ.z > 0.4) {
        const n = lite ? 8 : 16;
        for (let i = 0; i < n; i++) {
          const speed = 0.018 + 0.02 * unit(wood.key, 'leaf', i);
          const life = 1 / speed;
          const tt = (shown + unit(wood.key, 'leafAt', i) * life) % life;
          const k = tt / life;
          const x = ((unit(wood.key, 'leafX', i) + k * 0.6 * wood.env.windDir + 1) % 1) * L.w;
          const y = k * L.ground;
          const spin = shown * (1.5 + unit(wood.key, 'spin', i)) + i;
          fctx.fillStyle = recede(pal, leafHue(pal, i), pal.dark ? 0.35 : 0.05);
          fctx.beginPath();
          fctx.ellipse(x + Math.sin(spin) * 10 * L.px, y, 3.2 * L.px, 1.4 * L.px * Math.abs(Math.cos(spin)) + 0.4, spin, 0, Math.PI * 2);
          fctx.fill();
        }
      }
      if (wood.env.weather === 'drizzle') {
        fctx.strokeStyle = hexA(pal.dark ? '#C8C0B0' : '#8C9BA5', pal.dark ? 0.22 : 0.28);
        fctx.lineWidth = 0.8 * L.px;
        fctx.beginPath();
        const n = lite ? 40 : 80;
        for (let i = 0; i < n; i++) {
          const fall = 0.9 + 0.3 * unit(wood.key, 'rain', i);
          const y = ((unit(wood.key, 'rainY', i) + shown * fall) % 1) * L.h;
          const x = unit(wood.key, 'rainX', i) * L.w + y * 0.12 * wood.env.windDir;
          fctx.moveTo(x, y);
          fctx.lineTo(x + 3 * L.px * wood.env.windDir, y + 11 * L.px);
        }
        fctx.stroke();
      }

      // Behind the clock and the buttons the land goes quiet, so the page's
      // one piece of chrome is never read against a log or a thicket.
      if (clear) {
        for (const c of [bctx, fctx]) {
          c.save();
          c.globalCompositeOperation = 'destination-out';
          c.drawImage(hush, 0, 0);
          c.restore();
        }
      }

      // The governor: if drawing takes too long, thin the wood; if there is
      // room again, bring it back.
      const cost = performance.now() - started;
      slowFrames = cost > 14 ? slowFrames + 1 : cost < 8 ? slowFrames - 1 : slowFrames;
      if (slowFrames > 20) {
        lite = true;
        slowFrames = 0;
      } else if (slowFrames < -120) {
        lite = false;
        slowFrames = 0;
      }

      // Park once there is nothing left to move.
      settledFor = t.paused && Math.abs(t.scene - shown) < 0.01 ? settledFor + dt : 0;
      if (frozen || settledFor > 1.5) {
        raf = null;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (raf == null && !disposed) raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      ({ L, pal } = measure());
      standingKey = '';
      kick();
    };
    window.addEventListener('resize', onResize);
    kick();
    // Held or reduced, it still grows: a fresh frame every thirty seconds.
    const slow = window.setInterval(() => {
      if (raf == null) kick();
    }, 30 * 1000);
    wakeRef.current = kick;
    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      window.clearInterval(slow);
      if (raf != null) cancelAnimationFrame(raf);
      wakeRef.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wood, night, color, hero.baseOffset, hero.depth, hero.tripleP, sessionId, key]);

  // A resumed clock, a new stretch, a new block: wake the loop.
  const phase = sitting?.phase;
  const paused = sitting?.isPaused;
  const blocks = sitting?.segments.length;
  useEffect(() => {
    wakeRef.current();
  }, [phase, paused, blocks, still]);

  return (
    <div ref={wrapRef} aria-hidden className={`absolute inset-0 ${className}`}>
      <canvas ref={backRef} data-no-doodle className="pointer-events-none absolute inset-0 h-full w-full" />
      <StudyFan
        {...hero}
        species="tree"
        color={color}
        habit={habit}
        wind={windRef.current}
        alive={running && !hero.resting}
        overlay={overlay}
        className="absolute inset-0 h-full w-full"
      />
      <canvas ref={frontRef} data-no-doodle className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}

/**
 * A seat on the tree on the clock: one of the settled branches, picked by
 * the bird, and if that one has not grown yet, the nearest grown branch it
 * would have grown from. The pick never moves as the tree grows.
 */
function seatOnHero(tree: FanTree, layout: FanLayout, cands: number[], pick: number, u: number): { x: number; y: number; a: number } | null {
  let i = cands[Math.floor(pick * cands.length) % cands.length];
  while (i >= 0 && fanGrown(tree, layout.progress, i) < 1) i = tree.segs[i].p;
  if (i < 0 || tree.segs[i].d < 2) return null;
  return fanPointAt(tree, layout, i, u);
}

function seatOnTree(tree: FanTree, layout: FanLayout, pick: number, u: number): { x: number; y: number } | null {
  const list: number[] = [];
  tree.segs.forEach((s, i) => {
    if (s.d >= 2 && s.d <= tree.depthMax - 1 && s.kids > 0) list.push(i);
  });
  if (!list.length) return null;
  let i = list[Math.floor(pick * list.length) % list.length];
  while (i >= 0 && fanGrown(tree, layout.progress, i) < 1) i = tree.segs[i].p;
  if (i < 0) return null;
  return fanPointAt(tree, layout, i, u);
}
