'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { mixHex } from '@/lib/fan';
import { buildJelly, drawJelly, jellyBeat, jellyInk, type JellyShape } from '@/lib/jelly';
import { rollBiome } from '@/lib/ocean/biome';
import { depthAt } from '@/lib/ocean/depth';
import {
  drawEye,
  drawFloor,
  drawFloorLife,
  drawSiltPuff,
  drawTrail,
  drawLeviathan,
  drawRules,
  drawShafts,
  drawShimmer,
  drawSnow,
  drawLights,
  drawStorm,
  drawSurface,
  drawVisitor,
  drawWhale,
  floorLine,
  rollSnow,
} from '@/lib/ocean/draw';
import { eventsAt, firstEventUpTo, type OceanEvent } from '@/lib/ocean/events';
import { Caustics } from '@/lib/ocean/caustics';
import { GardenEels } from '@/lib/ocean/garden-eels';
import { darknessAt, drawDarkness, litBy } from '@/lib/ocean/glow';
import { JellyAtContext, type JellyAt } from '@/lib/ocean/jelly-at';
import { rollKelp } from '@/lib/ocean/kelp';
import { drawKelp } from '@/lib/ocean/kelp-draw';
import { Sparkles } from '@/lib/ocean/sparkle';
import { Wash } from '@/lib/ocean/wash';
import { outcropsInView } from '@/lib/ocean/outcrop';
import { drawOutcrops, OutcropCache } from '@/lib/ocean/outcrop-sprite';
import { drawLandmarks, LandmarkCache } from '@/lib/ocean/landmark-draw';
import { landmarksInView } from '@/lib/ocean/landmarks';
import { drawVortex, vortexSpecies } from '@/lib/ocean/vortex';
import { drawDumbo, drawLure, drawWhaleFall } from '@/lib/ocean/sightings-deep';
import { drawManOWar, drawOarfish, drawSiphonophore, drawTurtle } from '@/lib/ocean/sightings-shallow';
import { jellyForBlock } from '@/lib/ocean/lineage';
import { hazed, HUES, waterAt, type Ground, type Water } from '@/lib/ocean/palette';
import { floorLift, hourMark, legAt, legMark } from '@/lib/ocean/places';
import { seasonHaze, seasonOf, seasonSnow } from '@/lib/ocean/season';
import { weatherHaze, weatherOf, weatherReach } from '@/lib/ocean/weather';
import { hash32 } from '@/lib/ocean/random';
import { swimAge, visitorsAt, type Swim } from '@/lib/ocean/schedule';
import { drawFishFall, drawMudslide, drawSnailfishGathering, drawSupergiant } from '@/lib/ocean/sightings-hadal';
import { drawDolphins, drawManta, drawSpermWhale, drawVampire, drawWhaleShark } from '@/lib/ocean/sightings-early';
import { SpriteCache } from '@/lib/ocean/sprites';
import { drawWalls, WallCache } from '@/lib/ocean/walls';
import { registerWallpaperLayer } from '@/lib/wallpaper';
import { BREAK_PACE } from '@/lib/wood/clock';

/**
 * The sitting as the timer holds it: the closed stretches, and the one on
 * the clock now, focus or break. Read afresh every frame, so the ocean moves
 * smoothly without the page re-rendering to move it. Focus time is how deep
 * the water is; the swim clock (focus, plus breaks at a crawl) is where the
 * animals are. `frozen` is a still: the moment after Finish, under the sheet.
 */
export type OceanClock =
  | { segments: Swim['segments']; phase: 'focus' | 'break'; stretchMs: number; runningSince: number | null }
  | { frozen: number; rest?: number; segments?: Swim['segments'] };

/** A share of the scene, 0 to 1 on each axis, that animals keep out of. */
export interface ClearRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  sittingKey: string;
  courseKey: string;
  /** The course colour. */
  color: string;
  clock: OceanClock;
  /** Finished blocks, each of which left a jelly in the bloom. */
  blocks: number;
  resting: boolean;
  paused: boolean;
  /** Draw once and hold: the sheet is up, or it is a preview. */
  still?: boolean;
  ground: Ground;
  clear?: ClearRect[];
  /** The notebook frame: the page's rules show through the shallows. */
  rules?: boolean;
  /** Where the wash thins back to bare paper, so what is written there reads
      at any depth: the frame's corners. */
  pools?: ClearRect[];
  /** The hero, drawn between the far water and the near animals. */
  children?: ReactNode;
  className?: string;
}

/* The two eased clocks. Focus time follows the timer's closely and glides to
   a stop on a pause (about 700ms to settle); the ambient clock drives only
   the small movement, and runs slower on a break and not at all when held. */
const FOCUS_TAU = 0.25;
const AMBIENT_TAU = 0.35;
/* Canvas memory: a full screen at 2x on a big monitor is a lot of pixels, and
   there are two of these. Past this many per canvas the density comes down. */
const PIXEL_BUDGET = 2.4e6;

export default function OceanScene({
  sittingKey,
  courseKey,
  color,
  clock,
  blocks,
  resting,
  paused,
  still = false,
  ground,
  clear,
  rules = false,
  pools,
  children,
  className = '',
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLCanvasElement | null>(null);
  const frontRef = useRef<HTMLCanvasElement | null>(null);
  const markRef = useRef<HTMLSpanElement | null>(null);
  const biome = useMemo(() => rollBiome(sittingKey, courseKey), [sittingKey, courseKey]);
  const season = useMemo(() => seasonOf(sittingKey), [sittingKey]);
  const weather = useMemo(() => weatherOf(sittingKey), [sittingKey]);
  // Enough far snow for the thickest place's; a place draws as much of it as its water holds.
  const snow = useMemo(() => ({ back: rollSnow(sittingKey, 230), front: rollSnow(`${sittingKey}:front`, 10) }), [sittingKey]);
  const kelp = useMemo(() => (biome.env.kelp ? rollKelp(biome.key) : null), [biome]);
  // Where the hero jelly is, written by StudyFan every frame it moves.
  const jellyAt = useMemo(() => ({ current: null as JellyAt | null }), []);

  // Everything the loop reads, off a ref, so a per-second render of the page
  // never tears the loop down.
  const live = useRef({ clock, blocks, resting, paused, still, ground, clear, color, rules, pools });
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    const box = boxRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    if (!box || !back || !front) return;
    const bctx = back.getContext('2d');
    const fctx = front.getContext('2d');
    if (!bctx || !fctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const sprites = new SpriteCache();
    const outcrops = new OutcropCache();
    const landmarks = new LandmarkCache();
    const walls = new WallCache();
    const wash = new Wash();
    const caustics = new Caustics();
    const sparkles = new Sparkles();
    const eels = new GardenEels();
    const washSeed = hash32(sittingKey, 'wash');
    /* Touch is the one thing here that is not a function of the sitting:
       sparks and ducking eels die away on their own clock, so while any are
       still going the loop keeps running even on a held clock. */
    let transient = false;
    let dark = false;
    /* The whale fall stays once it has come, so it is looked up a minute at a
       time rather than read off the events under way. */
    let fallMinute = -1;
    let fall: OceanEvent | null = null;
    const blooms = new Map<number, { canvas: HTMLCanvasElement; shape: JellyShape; tint: string }>();
    let css = { w: 1, h: 1 };
    let px = 1;
    let raf: number | null = null;
    let interval: number | null = null;
    let disposed = false;
    let last = performance.now();
    let frame = 0;

    const trueTime = () => {
      const c = live.current.clock;
      if ('frozen' in c) return { focus: c.frozen, scene: c.frozen + BREAK_PACE * (c.rest ?? 0) };
      let focus = 0;
      let rest = 0;
      for (const s of c.segments) {
        if (s.kind === 'break') rest += s.seconds;
        else focus += s.seconds;
      }
      const running = c.runningSince != null ? Math.max(0, Date.now() - c.runningSince) : 0;
      const stretch = (c.stretchMs + running) / 1000;
      if (c.phase === 'break') rest += stretch;
      else focus += stretch;
      return { focus, scene: focus + BREAK_PACE * rest };
    };
    const start = trueTime();
    let shown = start.focus;
    // Where the animals are. It runs with focus, crawls through a break so
    // whoever was there swims on and leaves, and stops when the clock does.
    let scene = start.scene;
    let ambient = hash32(sittingKey, 'ambient') % 1000;
    let micro = live.current.paused ? 0 : 1;
    let held = live.current.paused ? 1 : 0;
    let quality = 1;
    // Resolution, as a share of the budget: the governor's last resort.
    let res = 1;
    let ema = 4;
    let water: Water = waterAt(depthAt(shown).z, live.current.ground, live.current.color);
    let waterKey = '';
    /* A wallpaper being drawn: a pixel density of its own, and none of the
       page's chrome. Only ever true inside one synchronous render. */
    let override: number | null = null;
    let overrideSize: { w: number; h: number } | null = null;
    let saved: { quality: number; held: number } | null = null;
    /* A crossing into a new place: when it happened on the ambient clock,
       and when the last zone crossing did (the shimmer is the zones' only).
       The first paint only notes where the sitting already is, so a reload
       or a still never announces a crossing it did not see. */
    let legSeen = -1;
    let crossedAt = -1e9;
    let crossedMark = '';
    // Hours of focus, marked in the margin the same way; one that lands while
    // a place's name is up waits until it has gone.
    let hourSeen = -1;
    let hourWaiting: string | null = null;
    let shimmerAt = -1e9;

    const fit = () => {
      const rect = overrideSize ? { width: overrideSize.w, height: overrideSize.h } : box.getBoundingClientRect();
      css = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
      const want = Math.min(window.devicePixelRatio || 1, 2);
      px = override ?? Math.max(0.6, Math.min(want, Math.sqrt((PIXEL_BUDGET * res) / (css.w * css.h))));
      for (const c of [back, front]) {
        const w = Math.round(css.w * px);
        const h = Math.round(css.h * px);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
      }
    };

    const bloomOf = (i: number) => {
      let b = blooms.get(i);
      if (!b) {
        const body = jellyForBlock(sittingKey, i);
        const canvas = document.createElement('canvas');
        const tint = mixHex(live.current.color, HUES[body.hue], body.hueMix);
        b = { canvas, shape: buildJelly(hash32(sittingKey, 'bloom', i), body), tint };
        blooms.set(i, b);
      }
      return b;
    };

    const paint = () => {
      const t0 = performance.now();
      const L = override != null ? { ...live.current, clear: undefined, rules: false, pools: undefined } : live.current;
      const W = back.width;
      const H = back.height;
      const depth = depthAt(shown);
      // The place, and the one before it while this one eases in (a minute
      // and a half of focus): its haze, its snow, its floor.
      const li = legAt(biome.route, shown);
      const leg = biome.route[li];
      const prev = li > 0 ? biome.route[li - 1] : leg;
      const ease = Math.min(1, Math.max(0, (shown - leg.from * 60) / 90));
      const wk = `${depth.z.toFixed(3)}|${li}|${ease.toFixed(2)}|${L.ground}|${L.color}`;
      if (wk !== waterKey) {
        const base = waterAt(depth.z, L.ground, L.color);
        // The place's haze, and over the light the season's (a spring bloom's
        // green) and the day's (an overcast or rainy day's grey).
        const bloom = seasonHaze(season, depth.z);
        const sky = weatherHaze(weather, depth.z);
        const was = hazed(hazed(hazed(base, prev.place.haze), bloom), sky);
        const now = hazed(hazed(hazed(base, leg.place.haze), bloom), sky);
        water = { ...now, top: mixHex(was.top, now.top, ease), bottom: mixHex(was.bottom, now.bottom, ease) };
        waterKey = wk;
      }

      // Reduced motion has no clock to fade the name out on, so it gets none.
      if (legSeen < 0 || L.still || reduced) legSeen = li;
      else if (li > legSeen) {
        legSeen = li;
        crossedAt = ambient;
        crossedMark = legMark(leg);
        if (leg.first) shimmerAt = ambient;
      }
      const hour = Math.floor(shown / 3600);
      if (hourSeen < 0 || L.still || reduced) hourSeen = hour;
      else if (hour > hourSeen) {
        hourSeen = hour;
        hourWaiting = hourMark(hour, depth.meters);
      }
      // Its turn once nothing else is in the margin (a breath after a place's name has gone).
      if (hourWaiting && ambient - crossedAt > 7) {
        crossedAt = ambient;
        crossedMark = hourWaiting;
        hourWaiting = null;
      }

      // The far water: the wash, the light, the snow, the floor.
      bctx.globalCompositeOperation = 'source-over';
      bctx.globalAlpha = 1;
      wash.draw(bctx, W, H, water, px, washSeed);
      dark = water.dark;
      const now = performance.now();
      const ja = jellyAt.current;
      const jelly = ja ? { x: ja.x * W, y: ja.y * H, r: ja.r * W } : { x: W / 2, y: H * 0.22, r: W * 0.08 };
      // Below the light, the jelly is what there is to see by. Not in a
      // wallpaper: that is the sea with every animal in it lit and in colour.
      const darkness = override != null ? 0 : darknessAt(depth.z) * 0.8;
      if (L.rules) drawRules(bctx, W, H, depth.z, px, water.dark ? '#FFFFFF' : '#8C8576');
      // Under the paper's bleeds, so the corners still read through a forest.
      if (kelp) drawKelp(bctx, W, H, kelp, shown, water, ambient, biome.env.current, px, L.clear, quality > 0.7);
      // The walls first, so a rock juts out of one.
      drawWalls(bctx, W, H, biome.route, biome.key, shown, walls, water.dark, px, L.clear);
      const rocks = outcropsInView(biome.key, biome.env.kelp, shown);
      drawOutcrops(bctx, W, H, rocks, outcrops, water, px, L.clear);
      // A place's landmark, passed once: the wreck, the brine pool.
      const marks = landmarksInView(biome.key, biome.route, li, shown);
      if (marks.length) drawLandmarks(bctx, W, H, marks, landmarks, water.dark, px, L.clear, ambient, 1, reduced);
      const eelsMoving = eels.draw(bctx, W, H, rocks, ambient, now, px, water.dark, L.clear);
      if (L.pools?.length) {
        // An oval bleed of bare paper, the way a wash stops short of a corner.
        const paper = getComputedStyle(box).getPropertyValue('--paper').trim() || '#FBF8EF';
        const n = parseInt(paper.replace('#', '').slice(0, 6), 16);
        const rgb = Number.isFinite(n) ? `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}` : '251, 248, 239';
        for (const r of L.pools) {
          bctx.save();
          bctx.translate((r.x + r.w / 2) * W, (r.y + r.h / 2) * H);
          // Sized to what sits there, not to the frame: a tall phone frame
          // would otherwise bleed half its page white.
          bctx.scale(Math.min((r.w * W) / 1.4, 190 * px), Math.min((r.h * H) / 1.1, 64 * px));
          const g = bctx.createRadialGradient(0, 0, 0, 0, 0, 1);
          g.addColorStop(0, `rgba(${rgb}, 0.96)`);
          g.addColorStop(0.5, `rgba(${rgb}, 0.85)`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          bctx.fillStyle = g;
          bctx.fillRect(-1, -1, 2, 2);
          bctx.restore();
        }
      }
      // The day's weather, as much of it as reaches this deep.
      const reach = weatherReach(depth.z);
      const surge = 1 + (weather.surge - 1) * reach;
      drawSurface(bctx, W, H, shown, ambient, px, weather.rain);
      drawShafts(bctx, W, H, biome.env, { ...water, light: water.light * (1 + (weather.shafts - 1) * reach) }, ambient, surge);
      // As much snow as the place's water holds, and the leg's own share of
      // it, the change eased in a speck at a time; and the leg's own
      // clarity, the specks finer where the water is clearer.
      const mixW = (a: number, b: number) => a + (b - a) * ease;
      const flakes = 60 * mixW(prev.place.snow * prev.water.snow, leg.place.snow * leg.water.snow) * seasonSnow(season, depth.z);
      const clarity = Math.max(0.5, Math.min(1, biome.env.visibility * mixW(prev.water.clarity, leg.water.clarity)));
      sparkles.glow = mixW(prev.water.glow * (prev.place.glow ?? 1), leg.water.glow * (leg.place.glow ?? 1));
      const whole = Math.min(snow.back.length, Math.floor(flakes));
      drawSnow(bctx, W, H, snow.back.slice(0, whole), water.snow, ambient, biome.env.current, px, clarity, 1, surge);
      if (whole < snow.back.length) drawSnow(bctx, W, H, snow.back.slice(whole, whole + 1), water.snow, ambient, biome.env.current, px, clarity, flakes - whole, surge);
      // A place's own pinpricks of light, easing in and out with it.
      const lit = mixW(prev.place.lights ?? 0, leg.place.lights ?? 0);
      if (lit > 0 && !reduced) drawLights(bctx, W, H, biome.key, lit, ambient, biome.env.current, px);
      // The floor: a vent field's own chimneys, or the sitting's, and what
      // else lies on it; a new place's laid over the last one's as it eases in.
      const ventsOf = (p: typeof leg.place) => p.vents ?? (biome.env.vents ? 2 : 0);
      const dressOf = (p: typeof leg.place) => p.floor ?? null;
      const floorTurns = ease < 1 && (ventsOf(prev.place) !== ventsOf(leg.place) || dressOf(prev.place) !== dressOf(leg.place));
      // A floor with something on it sits a little higher, easing up or down between places.
      const lift = floorLift(prev.place) + (floorLift(leg.place) - floorLift(prev.place)) * ease;
      if (floorTurns) drawFloor(bctx, W, H, depth, biome.env, water, shown, ambient, px, ventsOf(prev.place), 1, dressOf(prev.place), lift);
      drawFloor(bctx, W, H, depth, biome.env, water, shown, ambient, px, ventsOf(leg.place), floorTurns ? ease : 1, dressOf(leg.place), lift);
      const swim: Swim = { scene, segments: L.clock.segments ?? [] };
      const minute = Math.floor(shown / 60);
      if (minute !== fallMinute) {
        fallMinute = minute;
        fall = firstEventUpTo(biome, 'whalefall', (minute + 1) * 60);
      }

      // The rare things, when one is under way: behind everything, the
      // large and far; the eye goes on the front, at the edge.
      const events = eventsAt(biome, shown, swim);
      for (const { event, age } of events) {
        if (event.kind === 'whale') drawWhale(bctx, W, H, age, event.seed, biome.env.current, px, ambient, water.dark);
        else if (event.kind === 'leviathan') drawLeviathan(bctx, W, H, age, event.seed, biome.env.current, px, ambient);
      }

      // Open water's great school, turning in the far water the whole leg long.
      if (leg.place.vortex || prev.place.vortex) {
        const out = Number.isFinite(leg.to) ? Math.min(1, Math.max(0, (leg.to * 60 - shown) / 90)) : 1;
        const amt = (leg.place.vortex ? ease * out : 0) + (prev !== leg && prev.place.vortex ? 1 - ease : 0);
        const kind = vortexSpecies(biome.pools[leg.place.vortex ? li : li - 1] ?? [], biome.key);
        if (amt > 0) drawVortex(bctx, W, H, biome.key, amt, ambient, px, (len) => sprites.get(kind, len, water.dark, px, override != null));
      }

      // The bloom: every finished block's jelly, hanging back in the water.
      const count = Math.min(10, L.blocks);
      for (let i = 0; i < count; i++) {
        const b = bloomOf(i);
        const bw = Math.round(96 * px);
        const bh = Math.round(140 * px);
        if (b.canvas.width !== bw || b.canvas.height !== bh || frame % 3 === i % 3) {
          b.canvas.width = bw;
          b.canvas.height = bh;
          const octx = b.canvas.getContext('2d');
          if (octx) {
            const ink = jellyInk(b.tint, water.dark ? '#1A1815' : '#FBF8EF', water.dark);
            drawJelly(octx, b.shape, bw, bh, {
              progress: 1,
              // No snow and no halo of its own: it is small and far, and a
              // glow would be cut square at the edge of its little canvas.
              ink: { ...ink, snow: undefined, glow: undefined },
              padTop: 8 * px,
              widthFill: 0.9,
              baseOffset: 4 * px,
              px: px * 0.5,
              pulse: reduced ? 0 : jellyBeat(ambient * 1000 + i * 900),
              time: reduced ? undefined : ambient * 1000 + i * 1300,
            });
          }
        }
        const slide = (((0.16 + i * 0.29 + ambient * 0.0016 * biome.env.current) % 1) + 1) % 1;
        const x = slide * (W + bw) - bw;
        const y = H * (0.06 + 0.2 * (((i * 0.53) % 1 + 1) % 1)) + Math.sin(ambient * 0.5 + i) * 6 * px;
        // Hanging back: faint, and fainter still behind the hero.
        const behind = Math.abs(x + bw / 2 - W / 2) < W * 0.2;
        bctx.globalAlpha = Math.max(0.2, 0.55 - i * 0.03) * (behind ? 0.3 : 1);
        bctx.drawImage(b.canvas, x, y);
      }
      bctx.globalAlpha = 1;
      drawDarkness(bctx, W, H, jelly, darkness, px, L.color);
      // The walls stay faintly seen in the dark, the way found things do:
      // what the trench is made of is the one thing that never goes.
      if (darkness > 0.05) {
        bctx.globalAlpha = Math.min(0.45, darkness * 0.55);
        drawWalls(bctx, W, H, biome.route, biome.key, shown, walls, water.dark, px, L.clear);
        bctx.globalAlpha = 1;
        if (marks.length) drawLandmarks(bctx, W, H, marks, landmarks, water.dark, px, L.clear, ambient, Math.min(0.5, darkness * 0.6), reduced);
      }
      // What lies on the floor (a seep, nodules, xenophyophores, sea
      // cucumbers) stays findable over the dark, as the walls do.
      if (depth.zone >= 3) {
        if (floorTurns) drawFloorLife(bctx, W, H, depth, biome.env, water, shown, px, ventsOf(prev.place), dressOf(prev.place), 0.85 * (1 - ease), lift);
        drawFloorLife(bctx, W, H, depth, biome.env, water, shown, px, ventsOf(leg.place), dressOf(leg.place), 0.85 * (floorTurns ? ease : 1), lift);
      }
      // Found things stay findable: the whale fall is drawn over the dark, faint.
      if (fall && fall.start <= shown && depth.zone >= 3) {
        const appear = Math.min(1, swimAge(shown, fall.start, swim) / fall.seconds);
        drawWhaleFall(bctx, W, H, appear, fall.seed, px, ambient, water.dark, floorLine(depth, shown, H, lift));
      }
      for (const { event, age } of events) {
        if (event.kind === 'storm') drawStorm(bctx, W, H, age, event.seed, px, ambient);
        else if (event.kind === 'turtle') drawTurtle(bctx, W, H, age, event.seed, px, ambient, water.dark, jelly);
        else if (event.kind === 'siphonophore') drawSiphonophore(bctx, W, H, age, event.seed, px, ambient, water.dark);
        else if (event.kind === 'oarfish') drawOarfish(bctx, W, H, age, event.seed, px, ambient, water.dark);
        else if (event.kind === 'manowar') drawManOWar(bctx, W, H, age, event.seed, px, ambient, water.dark);
        else if (event.kind === 'lure') drawLure(bctx, W, H, age, event.seed, px, ambient, water.dark);
        else if (event.kind === 'dumbo') drawDumbo(bctx, W, H, age, event.seed, px, ambient, water.dark);
        // The trench's own, on its floor.
        else if (event.kind === 'fishfall') drawFishFall(bctx, W, H, age, event.seed, px, ambient, water.dark, floorLine(depth, shown, H, lift), undefined, depth.zone === 3);
        else if (event.kind === 'mudslide') drawMudslide(bctx, W, H, age, event.seed, px, ambient, water.dark, floorLine(depth, shown, H, lift));
        else if (event.kind === 'supergiant') drawSupergiant(bctx, W, H, age, event.seed, px, ambient, water.dark, floorLine(depth, shown, H, lift));
        else if (event.kind === 'snailfish') drawSnailfishGathering(bctx, W, H, age, event.seed, px, ambient, water.dark, floorLine(depth, shown, H, lift));
        // The first two hours' own.
        else if (event.kind === 'dolphins') drawDolphins(bctx, W, H, age, event.seed, px, ambient, water.dark);
        else if (event.kind === 'manta') drawManta(bctx, W, H, age, event.seed, px, ambient, water.dark);
        else if (event.kind === 'whaleshark') drawWhaleShark(bctx, W, H, age, event.seed, px, ambient, water.dark);
        else if (event.kind === 'spermwhale') drawSpermWhale(bctx, W, H, age, event.seed, px, ambient, water.dark);
        else if (event.kind === 'vampire') drawVampire(bctx, W, H, age, event.seed, px, ambient, water.dark);
      }

      // The animals. Anything that wanders over the clock goes faint there.
      const visitors = visitorsAt(biome, shown, { width: css.w, height: css.h }, quality, swim);
      const strips = quality > 0.8 ? 8 : quality > 0.55 ? 5 : 1;
      fctx.clearRect(0, 0, front.width, front.height);
      for (const v of visitors) {
        const ctx = v.layer === 2 ? fctx : bctx;
        const sprite = sprites.get(v.species, v.len, water.dark, px, override != null);
        if (!sprite) continue;
        let alpha = v.alpha;
        // Out of the jelly's light, only the ones with lights of their own show.
        if (darkness > 0 && !v.species.genome.lit) alpha *= litBy(v.x * px, v.y * px, jelly, darkness);
        if (L.clear) {
          for (const r of L.clear) {
            if (v.x > r.x * css.w && v.x < (r.x + r.w) * css.w && v.y > r.y * css.h && v.y < (r.y + r.h) * css.h) {
              alpha *= 0.3;
            }
          }
        }
        // What lies on the floor leaves a track; what noses it, a puff.
        if (v.trail != null || v.puff) {
          const silt = mixHex(water.bottom, '#FFFFFF', 0.3);
          drawTrail(ctx, v, px, alpha, silt);
          drawSiltPuff(ctx, v, px, alpha, silt);
        }
        drawVisitor(ctx, sprite, v, px, ambient, alpha, strips);
      }
      for (const { event, age } of events) {
        if (event.kind === 'eye') drawEye(fctx, front.width, front.height, age, event.seed, px, water.dark);
      }
      drawSnow(fctx, front.width, front.height, snow.front, water.snow, ambient * 1.3, biome.env.current, px, 1.8, 1, surge);
      // Light off the surface, playing over everything in the shallows.
      if (!reduced) caustics.draw(fctx, front.width, front.height, ambient, water.light * (1 + (weather.light - 1) * reach), px, water.dark);
      const sparking = sparkles.draw(fctx, now, px);
      transient = sparking || eelsMoving;

      // The crossing: into a new zone the shimmer rises through for four
      // seconds; into any new place its name is written in the margin for
      // six, then goes.
      const since = ambient - crossedAt;
      if (!reduced) drawShimmer(fctx, front.width, front.height, (ambient - shimmerAt) / 4, ambient, px, water.dark ? 'rgba(239,233,220,1)' : 'rgba(255,255,255,1)');
      const mark = markRef.current;
      if (mark) {
        const showing = since >= 0 && since < 6;
        const a = showing ? Math.min(1, since / 0.8, (6 - since) / 1.2) : 0;
        if (showing) {
          mark.textContent = crossedMark;
          mark.style.color = water.dark ? '#C8C0B0' : '#6B6459';
        }
        mark.style.opacity = String(a);
      }

      // Held, the water goes grey and still, the way the rest of the screen does.
      // The back canvas is opaque, so its colour can be drawn out in place;
      // the front one is mostly empty, and only fades.
      if (held > 0.01) {
        bctx.save();
        bctx.globalCompositeOperation = 'saturation';
        bctx.globalAlpha = 0.45 * held;
        bctx.fillStyle = '#808080';
        bctx.fillRect(0, 0, W, H);
        bctx.restore();
      }
      front.style.opacity = String(1 - 0.35 * held);

      // The governor: a device that is struggling gets a thinner far layer
      // and plainer swimming, and gets them back once it has recovered.
      const spent = performance.now() - t0;
      ema = ema * 0.94 + spent * 0.06;
      if (override != null) {
        frame++;
        return;
      }
      if (ema > 10 && quality > 0.4) quality = Math.max(0.4, quality - 0.02);
      else if (ema < 5 && quality < 1) quality = Math.min(1, quality + 0.005);
      // Still struggling with the far layer thinned: fewer pixels. Only ever
      // stepped down, and not often, since each step refits the canvases.
      if (quality <= 0.4 && ema > 12 && res > 0.45 && frame % 90 === 0) {
        res = Math.max(0.45, res * 0.8);
        fit();
      }
      frame++;
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as { __ocean?: object }).__ocean = { paintMs: ema, quality, res, px, visitors: visitors.length };
      }
    };

    const step = () => {
      raf = null;
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = live.current;
      const truth = trueTime();
      const target = truth.focus;
      // A reload, a sleep, a hidden tab: jump rather than race to catch up.
      const ease = 1 - Math.exp(-dt / FOCUS_TAU);
      if (Math.abs(target - shown) > 4) shown = target;
      else shown = Math.max(shown, shown + (target - shown) * ease);
      if (Math.abs(truth.scene - scene) > 4) scene = truth.scene;
      else scene = Math.max(scene, scene + (truth.scene - scene) * ease);
      const microTarget = L.paused ? 0 : L.resting ? 0.3 : 1;
      micro += (microTarget - micro) * (1 - Math.exp(-dt / AMBIENT_TAU));
      held += ((L.paused ? 1 : 0) - held) * (1 - Math.exp(-dt / AMBIENT_TAU));
      ambient += dt * micro;
      paint();
      const settled =
        L.paused &&
        micro < 0.002 &&
        held > 0.998 &&
        Math.abs(target - shown) < 0.01 &&
        Math.abs(truth.scene - scene) < 0.01 &&
        !transient;
      if (L.still || settled) return;
      raf = requestAnimationFrame(step);
    };

    const kick = () => {
      if (disposed || raf != null) return;
      last = performance.now();
      if (reduced || live.current.still) {
        const truth = trueTime();
        shown = truth.focus;
        scene = truth.scene;
        held = live.current.paused ? 1 : 0;
        paint();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    kickRef.current = kick;

    const unregister = registerWallpaperLayer({
      canvas: back,
      render: (ratio, size) => {
        overrideSize = size;
        saved = { quality, held };
        override = ratio;
        quality = 1;
        held = 0;
        fit();
        paint();
      },
      restore: () => {
        override = null;
        overrideSize = null;
        if (saved) {
          quality = saved.quality;
          held = saved.held;
          saved = null;
        }
        fit();
        paint();
      },
    });
    const unregisterFront = registerWallpaperLayer({
      canvas: front,
      // Painted with the back one: drawing it again here would be a second
      // frame, and the animals would have moved on.
      render: () => {},
      restore: () => {},
    });

    fit();
    const ro = new ResizeObserver(() => {
      fit();
      if (reduced || live.current.still || raf == null) paint();
    });
    ro.observe(box);
    /* A hand in the water. The jelly takes its own pointer; these only
       listen, so a touch on the jelly still reaches it. Plankton lights up
       only where it is dark enough to see it; the eels duck at any depth. */
    const toCanvas = (e: PointerEvent) => {
      const rect = box.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * px, y: (e.clientY - rect.top) * px };
    };
    const onDown = (e: PointerEvent) => {
      if (reduced || live.current.still) return;
      const p = toCanvas(e);
      const now = performance.now();
      if (dark) sparkles.poke(p.x, p.y, now, px);
      eels.duck(p.x, p.y, now, px);
      transient = true;
      kick();
    };
    const onMove = (e: PointerEvent) => {
      if (reduced || live.current.still || !dark || e.buttons === 0) return;
      const p = toCanvas(e);
      sparkles.stroke(p.x, p.y, performance.now(), px);
      transient = true;
      kick();
    };
    box.addEventListener('pointerdown', onDown, { passive: true });
    box.addEventListener('pointermove', onMove, { passive: true });
    kick();
    // Reduced motion gets a still that is brought up to date now and then,
    // so the water still deepens over a long sitting.
    if (reduced) interval = window.setInterval(kick, 30000);

    return () => {
      disposed = true;
      ro.disconnect();
      box.removeEventListener('pointerdown', onDown);
      box.removeEventListener('pointermove', onMove);
      if (raf != null) cancelAnimationFrame(raf);
      if (interval != null) window.clearInterval(interval);
      kickRef.current = () => {};
      unregister();
      unregisterFront();
    };
  }, [biome, kelp, snow, season, weather, sittingKey, jellyAt]);

  // Every render hands the loop the page's latest, and wakes it if it had
  // parked (a pause settling, a still): a resume, a break or the sheet coming
  // up is then drawn at once.
  useEffect(() => {
    live.current = { clock, blocks, resting, paused, still, ground, clear, color, rules, pools };
    kickRef.current();
  });

  return (
    <div ref={boxRef} data-ocean-scene className={`relative ${className}`}>
      <canvas ref={backRef} aria-hidden data-no-doodle className="pointer-events-none absolute inset-0 h-full w-full" />
      <JellyAtContext.Provider value={jellyAt}>{children}</JellyAtContext.Provider>
      <canvas ref={frontRef} aria-hidden data-no-doodle className="pointer-events-none absolute inset-0 h-full w-full" />
      {/* The zone's name, in the hand, for a few seconds after crossing into it. */}
      <span
        ref={markRef}
        aria-hidden
        className="font-hand pointer-events-none absolute right-[7%] top-[38%] text-[19px]"
        style={{ opacity: 0, transform: 'rotate(-3deg)' }}
      />
    </div>
  );
}
