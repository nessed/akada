'use client';

import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildFan, drawFan, fanShades, mixHex, seedFrom, type FanLayout, type FanTree } from '@/lib/fan';
import { buildJelly, PLAIN_BODY, drawJelly, jellyBeat, jellyFrame, jellyInk, jellyStartle, type JellyBody, type JellyShape } from '@/lib/jelly';
import { JellyAtContext } from '@/lib/ocean/jelly-at';
import type { TimerDrawing } from '@/lib/preferences';
import type { TreeGenome } from '@/lib/wood/tree';
import { registerWallpaperLayer } from '@/lib/wallpaper';

/** What the wood is handed after each frame of the tree, to draw on it. */
export interface FanFrame {
  tree: FanTree;
  layout: FanLayout;
  /** Device pixels to a CSS pixel. */
  px: number;
  /** A hand has hold of the tree right now. */
  held: boolean;
}

interface Props {
  /** 0 to 1. At 1 the fan fills its frame; in block mode that is the target. */
  progress: number;
  /** Anything stable about the session. The same seed redraws the same fan. */
  seed?: string | null;
  /** The course colour. The stem and tips are mixed from it. */
  color?: string;
  /** How many splits deep. 7 inside the block frame, 10 for an open screen. */
  depth?: number;
  tripleP?: number;
  /** Stem thickness in CSS pixels; every branch scales down from it. */
  trunkWidth?: number;
  /** Headroom above the fan at full growth, in CSS pixels. */
  padTop?: number;
  widthFill?: number;
  baseOffset?: number;
  /** Lift the ramp toward white, for the night paper. */
  light?: boolean;
  /** Whether the fan can be taken hold of and pulled. On by default. */
  interactive?: boolean;
  /** Leaves on the growing tips, and flowers once the fan is full. */
  leaves?: boolean;
  /** The pencil underdrawing of the shape still to come. For a block, which
      has a top to reach; an open session has no shape to sketch ahead. */
  sketch?: boolean;
  /** A drawn line for the stem to stand on. Pair it with a `baseOffset` of
      about 20 so the line has room under the foot. */
  ground?: boolean;
  /** The clock is held. The fan closes its branches in and draws itself a
      little shorter, the stem first and the tips after it, and opens back
      out when this goes false again. Never touches progress. */
  resting?: boolean;
  /** What grows: the fan, or the jellyfish (lib/jelly.ts). The same
      progress, pull and pause either way; only the drawing changes. */
  species?: TimerDrawing;
  /** The jelly's counts and proportions. Left out, it is the plain jelly the
      "jellyfish" option has always drawn; the ocean rolls one per block. */
  body?: JellyBody;
  /** The wood's tree: its own habit, leaf and flower. Left out, the fan. */
  habit?: TreeGenome;
  /** The wind the wood is blowing, in radians of lean. Read every frame. */
  wind?: { current: number };
  /** Keep drawing every frame, for a wood whose birds sit on the branches. */
  alive?: boolean;
  /** Drawn onto the tree's own canvas straight after the tree, so whatever
      sits on a branch moves with it. */
  overlay?: (ctx: CanvasRenderingContext2D, frame: FanFrame) => void;
  className?: string;
}

/* How far the tips travel at a full pull, in radians: about twenty-five
   degrees. Far enough to feel like it gave, nowhere near a tree blown flat. */
const SWAY_MAX = 0.42;
/* And how far a vertical pull stretches or squashes it. A branch is not
   elastic; this is the give in it, not a rubber band. */
const SLACK_MAX = 0.08;
/* The spring back. It overshoots once to about half the pull, is down to a
   couple of degrees inside a second, and is done in two. Stiffer than this
   and the fan twangs, which is a different app's idea of fun. */
const STIFFNESS = 0.042;
const DAMPING = 0.07;
/* Frames of delay per depth. A branch answers a moment after the one it grows
   from, so the pull travels out through the fan instead of the whole thing
   turning at once. */
const LAG_PER_DEPTH = 1.6;
const HISTORY = 64;
/* A held fan: each split closed by about a third, and the whole of it a few
   percent shorter, so the crown comes down and in rather than just thinning.
   The spring that takes it there is slower and more damped than the hand's:
   closing is a settling, not a swing. Opening again overshoots a touch, which
   is the tree waking up rather than being switched on. */
const FOLD_REST = 0.34;
const FOLD_SLACK = -0.05;
const FOLD_STIFFNESS = 0.012;
const FOLD_DAMPING = 0.13;
/* The jelly's trails are sampled at this many points from the bell out to
   the tips, and each is this many frames behind the one before, so a pull
   moves the bell first and the tentacles follow it like a wake. */
const TRAIL_SAMPLES = 13;
const TRAIL_LAG = 2;
/* A jelly hangs in water, not on a branch. It is softer than the fan, and
   under-damped enough to bob back past where it started once or twice, which
   is what the trails need to keep streaming after the bell has stopped. */
const BOB_STIFFNESS = 0.028;
const BOB_DAMPING = 0.075;
/* A finger that goes down and comes up within this many milliseconds and this
   many pixels is a poke, not a pull. */
const POKE_MS = 350;
const POKE_PX = 6;

/**
 * One axis of the sway: a spring that remembers where it has been.
 *
 * `step` takes where a hand is holding it, or null once it has been let go.
 * Held, it follows the hand a little behind and keeps the speed of that
 * follow, so letting go mid-pull throws the fan rather than dropping it.
 * `at` reads the position a few frames back, which is what the outer
 * branches are drawn from.
 */
function strand(stiffness = STIFFNESS, damping = DAMPING) {
  const past = new Float64Array(HISTORY);
  let i = 0;
  let x = 0;
  let v = 0;
  let quiet = 0;

  return {
    /** `rest` is where it springs back to once let go: zero, unless held. */
    step(held: number | null, rest = 0) {
      if (held == null) {
        v += -(x - rest) * stiffness - v * damping;
        x += v;
        if (Math.abs(x - rest) < 0.0004 && Math.abs(v) < 0.0004) {
          x = rest;
          v = 0;
        }
      } else {
        v = (held - x) * 0.22;
        x += v;
      }
      i = (i + 1) % HISTORY;
      past[i] = x;
      quiet = x === rest && v === 0 ? quiet + 1 : 0;
    },
    at(lag: number) {
      return past[(i - Math.min(lag, HISTORY - 1) + HISTORY) % HISTORY];
    },
    /** A shove: speed added on the spot, from a poke or a cursor brushing
        past. It springs back like anything else that was let go. */
    push(dv: number) {
      v += dv;
    },
    /** Pixels a frame, which is what a bell leans into. */
    get speed() {
      return v;
    },
    /** Frames of dead calm. The outer branches are drawn from where the
        spring was, not where it is, so the fan is not actually at rest until
        the delay has run out behind it as well — park the loop on `x === 0`
        alone and the tips freeze mid-swing and stay there. */
    get quiet() {
      return quiet;
    },
  };
}

/**
 * The fan on a canvas, sized to its box and redrawn whenever progress moves.
 *
 * Progress is eased toward rather than snapped to, so a session that is
 * restored mid-way grows into place instead of appearing fully formed, and a
 * running timer's once-a-second tick reads as continuous growth rather than
 * a series of steps. The loop parks itself once it has arrived and nothing
 * is still swinging.
 *
 * The fan can also be taken hold of. A drag bends it, the bend arrives at the
 * outer branches a few frames after the stem, and letting go springs it back
 * over a second or so. It is a hand on a branch and nothing more: the pull
 * never touches progress, so the clock and the record are exactly where they
 * were when the fan settles.
 */
export default function StudyFan({
  progress,
  seed,
  color = '#A8B89B',
  depth = 7,
  tripleP = 0.2,
  trunkWidth = 11,
  padTop = 45,
  widthFill = 0.86,
  baseOffset = -2,
  light = false,
  interactive = true,
  leaves = true,
  sketch = false,
  ground = false,
  resting = false,
  species = 'tree',
  body,
  habit,
  wind,
  alive = false,
  overlay,
  className = '',
}: Props) {
  // The deep's hero is the jellyfish; the ocean around it is OceanScene's.
  const jelly = species === 'jelly' || species === 'ocean';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const treeRef = useRef<FanTree | null>(null);
  const jellyRef = useRef<JellyShape | null>(null);
  const shownRef = useRef(0);
  const targetRef = useRef(progress);
  const rafRef = useRef<number | null>(null);
  const kickRef = useRef<() => void>(() => {});

  /* The hand. `from` is where the finger went down and `held` is the pull it
     is asking for; the whole thing goes null once the fan has been let go. */
  const handRef = useRef<{
    from: { x: number; y: number };
    held: { bend: number; slack: number };
    /* For a jelly: when it went down and how far it has travelled since, to
       tell a poke from a pull when the finger comes up. */
    at: number;
    moved: number;
  } | null>(null);
  /* The jelly's own springs. Sideways and vertical are separate, and both
     hold pixels, not radians: the bell goes where the finger takes it. */
  const bellXRef = useRef(strand(BOB_STIFFNESS, BOB_DAMPING));
  const bellYRef = useRef(strand(BOB_STIFFNESS, BOB_DAMPING));
  const startleRef = useRef(-1e9);
  const swayRef = useRef(strand());
  const stretchRef = useRef(strand());
  const foldRef = useRef(strand(FOLD_STIFFNESS, FOLD_DAMPING));
  const restingRef = useRef(resting);
  // Where the bell is, for an ocean drawn round it (see lib/ocean/jelly-at).
  const jellyAt = useContext(JellyAtContext);
  const overlayRef = useRef(overlay);
  const windRef = useRef(wind);
  const aliveRef = useRef(alive);
  const habitRef = useRef(habit);
  // Read by the draw loop, which outlives any one render. Declared ahead of
  // the effects that read them, so they are current by the time those run.
  useEffect(() => {
    overlayRef.current = overlay;
    windRef.current = wind;
    aliveRef.current = alive;
    habitRef.current = habit;
  });
  /* The habit's identity for the geometry effect: a new object every render
     would rebuild the tree sixty times a second. */
  const habitKey = habit ? JSON.stringify(habit) : '';

  /* Whether the fan answers a hand at all. Decided on the client, because it
     turns on the reader's reduced-motion setting: someone who has asked for
     less movement is not given a tree that swings. */
  const [physics, setPhysics] = useState(false);
  useEffect(() => {
    setPhysics(
      interactive && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    );
  }, [interactive]);

  /* How readily each depth gives. The outer branches give most and the stem
     least, though not by much: nearly all of the travel a hand actually sees
     comes from the stem and the first splits, because those are the ones with
     a whole crown hanging off the end of them. Weight it much further toward
     the twigs and the fan whisks about while the tree stands still. The set
     sums to one, so a full pull bends the tips by `SWAY_MAX` however deep the
     fan happens to be.

     `reach` is the running total, and it is what keeps an early block from
     feeling nailed down: ten minutes in, the fan is a stem and one split, so
     the lean is shared out over the little that exists rather than over the
     tree it has not grown yet. A sapling gives more than an oak, which is
     also true of saplings. */
  const { flex, reach } = useMemo(() => {
    const raw = Array.from({ length: depth + 1 }, (_, d) => 0.55 + (0.6 * d) / Math.max(1, depth));
    const total = raw.reduce((a, b) => a + b, 0);
    const share = raw.map((v) => v / total);
    let run = 0;
    return { flex: share, reach: share.map((v) => (run += v)) };
  }, [depth]);

  // The draw loop reads the target off a ref rather than a closure, so a
  // progress tick never has to tear down and rebuild the animation frame.
  //
  // It never runs backwards. "+5 min" lengthens a block, which lowers its
  // fraction; the drawing holds where it stands until the clock catches up,
  // since a fan that shrank would be telling the reader they had lost time.
  // Only a new seed (a new block) starts it from nothing again.
  const floorRef = useRef({ seed, at: 0 });
  useEffect(() => {
    const p = Math.min(1, Math.max(0, progress));
    if (floorRef.current.seed !== seed) floorRef.current = { seed, at: 0 };
    const target = Math.max(p, floorRef.current.at);
    floorRef.current.at = target;
    targetRef.current = target;
    // A parked loop has to be woken for the tick to be drawn at all.
    kickRef.current();
  }, [progress, seed]);

  // Holding the clock sets the fan closing, and letting it go opens it.
  useEffect(() => {
    restingRef.current = resting;
    kickRef.current();
  }, [resting]);

  // Rebuilding the geometry is the expensive half, so it only happens when
  // the shape itself changes, never on a progress tick.
  useEffect(() => {
    treeRef.current = buildFan(seedFrom(seed), depth, tripleP, habitRef.current?.shape);
    jellyRef.current = buildJelly(seedFrom(seed), body ?? PLAIN_BODY);
    shownRef.current = 0;
  }, [seed, depth, tripleP, body, habitKey]);

  // The wood wakes a parked tree when it comes alive again.
  useEffect(() => {
    if (alive) kickRef.current();
  }, [alive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const colors = fanShades(color, light);
    /* The pencil and the paper the leaves are mixed toward. Read off the page
       so a block frame on the night paper gets night pencil; the open screen
       inverts with literal values, so `light` names them outright. */
    const page = getComputedStyle(canvas);
    const pencil = light ? '#4A4438' : page.getPropertyValue('--line-strong').trim() || '#C9C0A8';
    const paper = light ? '#1A1815' : page.getPropertyValue('--paper').trim() || '#FBF8EF';
    /* A wood's tree turns its leaves a little warm or cool of the course's
       colour; the stem stays the course's own. */
    const tint = habitRef.current?.tint ?? 0;
    const leafColor = tint ? mixHex(color, tint > 0 ? '#E2B594' : '#9FC1B0', Math.abs(tint) * 0.22) : color;
    const leaf = leaves
      ? {
          fill: mixHex(leafColor, paper, light ? 0.35 : 0.45),
          edge: light ? mixHex(color, '#FFFFFF', 0.25) : mixHex(color, '#000000', 0.22),
          bloom: light ? mixHex(color, '#FFFFFF', 0.55) : mixHex(color, paper, 0.2),
          eye: light ? paper : mixHex(color, '#000000', 0.45),
          form: habitRef.current?.leaf,
          flower: habitRef.current?.flower,
          every: habitRef.current?.every,
        }
      : undefined;
    const ink = jellyInk(color, paper, light);
    const drift = new Array<number>(TRAIL_SAMPLES).fill(0);
    let stretchNow = 0;
    let contractNow = 0;
    let riseNow = 0;
    let tiltNow = 0;
    const bends = new Array<number>(depth + 1).fill(0);
    const slack = new Array<number>(depth + 1).fill(0);
    const fold = new Array<number>(depth + 1).fill(0);
    const lagMax = Math.max(Math.round(depth * LAG_PER_DEPTH), Math.round(TRAIL_SAMPLES * TRAIL_LAG));
    let disposed = false;
    let lastPaint = 0;
    // A wallpaper being drawn: its own density, the bell open, no pencil.
    let override: number | null = null;
    let overrideSize: { w: number; h: number } | null = null;

    /* The canvas is sized in device pixels so the strokes stay crisp on a
       retina screen, and re-measured on resize because an open-mode fan is
       sized to the viewport rather than to a fixed frame. */
    const fit = () => {
      const rect = overrideSize ? { width: overrideSize.w, height: overrideSize.h } : canvas.getBoundingClientRect();
      const dpr = override ?? Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      return dpr;
    };

    const paint = () => {
      if (disposed) return;
      const ctx = canvas.getContext('2d');
      const tree = treeRef.current;
      if (!ctx || !tree) return;
      const dpr = fit();
      if (jelly) {
        const shape = jellyRef.current;
        if (!shape) return;
        // A held jelly with no hand to settle it (reduced motion, or a
        // drawing nobody can pull) is simply closed.
        const closed = override != null ? 0 : physics ? contractNow : restingRef.current ? 1 : 0;
        drawJelly(ctx, shape, canvas.width, canvas.height, {
          progress: shownRef.current,
          ink,
          padTop: padTop * dpr,
          widthFill,
          baseOffset: baseOffset * dpr,
          px: dpr,
          contract: closed,
          // The beat, and over it whatever a touch has set off.
          pulse: reduced
            ? 0
            : Math.max(jellyBeat(performance.now()), jellyStartle(performance.now() - startleRef.current)),
          // The wave, the bubbles and the snow run on the clock; reduced
          // motion gets them standing still.
          time: reduced ? undefined : performance.now(),
          bubbles: true,
          drift: physics ? drift : undefined,
          rise: physics ? riseNow : 0,
          tilt: physics ? tiltNow : 0,
          sketch: sketch && override == null ? pencil : undefined,
          ground: ground && override == null ? pencil : undefined,
        });
        return;
      }
      const layout = drawFan(ctx, tree, canvas.width, canvas.height, {
        progress: shownRef.current,
        colors,
        trunkWidth: trunkWidth * dpr,
        padTop: padTop * dpr,
        widthFill,
        baseOffset: baseOffset * dpr,
        bends: physics ? bends : undefined,
        slack: physics ? slack : undefined,
        fold: physics ? fold : undefined,
        px: dpr,
        leaf,
        sketch: sketch ? pencil : undefined,
        ground: ground ? pencil : undefined,
      });
      if (layout && overlayRef.current) {
        overlayRef.current(ctx, { tree, layout, px: dpr, held: handRef.current != null });
      }
    };

    /* One frame of the sway, written into the arrays the painter reads. Each
       depth is drawn from where the spring was a few frames ago, so the bend
       runs out along the branches. */
    const settle = () => {
      const hand = handRef.current;
      const sway = swayRef.current;
      const stretch = stretchRef.current;
      const closing = foldRef.current;
      const held = restingRef.current;
      // The wind is where the tree comes to rest, so it leans into a gust
      // and swings back through the spring the hand uses.
      sway.step(hand ? hand.held.bend : null, windRef.current?.current ?? 0);
      stretch.step(hand ? hand.held.slack : null, held ? FOLD_SLACK : 0);
      closing.step(null, held ? FOLD_REST : 0);
      // Only the depths that have actually grown carry the lean, with a floor
      // so that a lone stem leans rather than folding over.
      const grownTo = Math.min(depth, Math.floor(shownRef.current * (depth + 1)));
      const spread = Math.max(reach[Math.max(0, grownTo)], 0.12);
      for (let d = 0; d <= depth; d++) {
        const lag = Math.round(d * LAG_PER_DEPTH);
        const give = flex[d] / spread;
        bends[d] = sway.at(lag) * give;
        // Length is a multiplier rather than a share, so the weights are
        // lifted back to an average of one. A tenth is a tenth whatever has
        // grown, so this one does not take the sapling's extra give.
        slack[d] = stretch.at(lag) * flex[d] * (depth + 1);
        // Every split closes by the same share, a few frames after the one
        // it grows from, so the fold travels up the tree.
        fold[d] = closing.at(lag);
      }
      // The jelly reads the same springs: the sway as a wake down its
      // trails, the stretch as their length, and the fold as its bell
      // closing, where a full fold is a fully held jelly.
      for (let i = 0; i < TRAIL_SAMPLES; i++) drift[i] = sway.at(Math.round(i * TRAIL_LAG));
      stretchNow = stretch.at(0);
      contractNow = Math.min(1, Math.max(0, closing.at(0) / FOLD_REST));
      return hand == null && sway.quiet > lagMax && stretch.quiet > lagMax && closing.quiet > lagMax;
    };

    /* One frame of the jelly's give. The bell has its own two springs and the
       trails read the sideways one a few frames back, so they stream out
       behind it; the lean is how fast the bell is going. */
    const settleJelly = () => {
      const hand = handRef.current;
      const bx = bellXRef.current;
      const by = bellYRef.current;
      const closing = foldRef.current;
      bx.step(hand ? hand.held.bend : null);
      by.step(hand ? hand.held.slack : null);
      closing.step(null, restingRef.current ? FOLD_REST : 0);
      for (let i = 0; i < TRAIL_SAMPLES; i++) drift[i] = bx.at(Math.round(i * TRAIL_LAG));
      riseNow = by.at(0);
      const c = canvasRef.current;
      if (jellyAt && c && c.clientWidth > 0 && c.clientHeight > 0) {
        const f = jellyFrame(c.clientWidth, c.clientHeight, { padTop, widthFill, baseOffset, aspect: jellyRef.current?.aspect });
        jellyAt.current = {
          x: (f.cx + bx.at(0)) / c.clientWidth,
          y: (f.y0 + f.R * 0.45 + by.at(0)) / c.clientHeight,
          r: f.R / c.clientWidth,
        };
      }
      const lean = Math.max(-0.32, Math.min(0.32, bx.speed * 0.022));
      tiltNow += (lean - tiltNow) * 0.16;
      if (Math.abs(tiltNow) < 0.001 && !hand) tiltNow = 0;
      contractNow = Math.min(1, Math.max(0, closing.at(0) / FOLD_REST));
      return (
        hand == null &&
        tiltNow === 0 &&
        bx.quiet > lagMax &&
        by.quiet > lagMax &&
        closing.quiet > lagMax
      );
    };

    const step = () => {
      if (disposed) return;
      const target = targetRef.current;
      const shown = shownRef.current;
      const gap = target - shown;
      const grown = reduced || Math.abs(gap) < 0.0004;
      const rested = physics ? (jelly ? settleJelly() : settle()) : true;

      if (grown) shownRef.current = target;
      // Ease toward the target rather than tracking it exactly: the fan
      // catches up over about a second, which is what makes it grow.
      else shownRef.current = shown + gap * 0.045;

      /* A tree kept alive by the wood only sways in the wind, which reads
         the same at two dozen frames a second as at sixty; the springs still
         step every frame so the swing is right, but the ink is only put
         down when a hand is on it, it is still growing, or a frame is due. */
      const now = performance.now();
      if (!aliveRef.current || handRef.current || !grown || now - lastPaint > 40) {
        paint();
        lastPaint = now;
      }

      /* A jelly swims for as long as it is open, so its loop never parks
         while the clock runs. A hidden tab gets no frames anyway. */
      // A preview that cannot be touched (Settings) is a picture, and parks,
      // unless the wood is keeping it alive for the birds on its branches.
      const swimming = (jelly && !reduced && !restingRef.current && interactive) || aliveRef.current;
      if (grown && rested && !swimming) {
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    const kick = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(step);
    };
    kickRef.current = kick;

    const onResize = () => {
      paint();
      kick();
    };

    window.addEventListener('resize', onResize);
    kick();

    // The deep's jelly is the one hero a wallpaper takes along with the water.
    const unregister = jelly
      ? registerWallpaperLayer({
          canvas,
          render: (ratio, size) => {
            override = ratio;
            overrideSize = size;
            paint();
          },
          restore: () => {
            override = null;
            overrideSize = null;
            paint();
          },
        })
      : () => {};

    return () => {
      disposed = true;
      // Effects that run between this cleanup and the next mount (holding
      // the clock, the wood waking the tree) call the kick; left pointing
      // here it would book a frame for a loop that is already gone, and that
      // stale booking would keep the next loop from ever starting. It did,
      // for every drawing in the Settings preview.
      kickRef.current = () => {};
      unregister();
      window.removeEventListener('resize', onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [color, light, trunkWidth, padTop, widthFill, baseOffset, depth, flex, reach, physics, leaves, sketch, ground, jelly, interactive, habitKey, jellyAt]);

  /* Where the jelly is in the canvas, for a hand to land on. The tree can be
     taken hold of anywhere in its frame; a jelly is a thing in the water, and
     a finger on empty water goes through it. Generous at the edges, because a
     fingertip is not a pin. */
  const frameOf = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const f = jellyFrame(rect.width, rect.height, { padTop, widthFill, baseOffset, aspect: jellyRef.current?.aspect });
    return { rect, f };
  };
  const overJelly = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const fr = frameOf();
    if (!fr) return false;
    const { rect, f } = fr;
    const x = e.clientX - rect.left - f.cx - bellXRef.current.at(0);
    const y = e.clientY - rect.top - bellYRef.current.at(0);
    const slop = e.pointerType === 'mouse' ? 10 : 22;
    const bottom = f.rimFull + f.maxL * Math.max(0.15, shownRef.current);
    return Math.abs(x) < f.R * 1.25 + slop && y > f.y0 - slop && y < bottom + slop;
  };

  /* Taking hold. The tree's pull is read off the distance travelled through a
     curve that gives most of its bend early and then runs out. The jelly's is
     the finger itself: the bell goes where it is taken, close to one for one,
     easing off only as it nears the edge of what the frame can spare, and the
     tentacles stream out behind it. */
  const grab = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!physics) return;
    if (jelly && !overJelly(e)) return;
    handRef.current = {
      from: { x: e.clientX, y: e.clientY },
      held: { bend: 0, slack: 0 },
      at: performance.now(),
      moved: 0,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'grabbing';
    // Touched, the bell clenches.
    if (jelly) startleRef.current = performance.now();
    kickRef.current();
  };

  const drag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const hand = handRef.current;
    if (!hand) {
      // A cursor going past with no button down does nothing to the jelly;
      // it only shows a hand over it, so a click is what moves it.
      if (jelly && physics && e.pointerType === 'mouse') {
        e.currentTarget.style.cursor = overJelly(e) ? 'grab' : '';
      }
      return;
    }
    const dx = e.clientX - hand.from.x;
    const dy = e.clientY - hand.from.y;
    hand.moved = Math.max(hand.moved, Math.hypot(dx, dy));
    if (jelly) {
      const fr = frameOf();
      if (!fr) return;
      const { R, y0 } = fr.f;
      // Up is short (the bell must stay under the header) and down is short
      // (the trails have a floor); sideways gets the most.
      const soft = (d: number, lim: number) => lim * Math.tanh(d / lim);
      const up = Math.max(8, Math.min(R * 0.7, y0 * 0.85));
      hand.held = {
        bend: soft(dx, R * 1.5),
        slack: dy < 0 ? -soft(-dy, up) : soft(dy, R * 0.8),
      };
      return;
    }
    hand.held = {
      bend: Math.tanh(dx / 230) * SWAY_MAX,
      // Pulling the crown down gathers the fan in; lifting draws it out.
      slack: -Math.tanh(dy / 300) * SLACK_MAX,
    };
  };

  const release = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const hand = handRef.current;
    if (!hand) return;
    handRef.current = null;
    e.currentTarget.style.cursor = jelly && e.pointerType === 'mouse' && overJelly(e) ? 'grab' : jelly ? '' : 'grab';
    if (jelly && hand.moved < POKE_PX && performance.now() - hand.at < POKE_MS && e.type === 'pointerup') {
      // A poke. The clench that met the finger is the stroke; this is what
      // it does: jet up and away from the side that was touched, then drift
      // back. A jelly does not stay where it is pushed.
      const fr = frameOf();
      const side = fr ? (e.clientX - fr.rect.left - fr.f.cx - bellXRef.current.at(0)) / fr.f.R : 0;
      bellYRef.current.push(-3.4);
      bellXRef.current.push(-Math.max(-1, Math.min(1, side)) * 1.6);
      startleRef.current = performance.now();
    }
    kickRef.current();
  };

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      // A hand on the drawing is the drawing's, never the margin doodle's.
      data-no-doodle
      className={className}
      onPointerDown={physics ? grab : undefined}
      onPointerMove={physics ? drag : undefined}
      onPointerUp={physics ? release : undefined}
      onPointerCancel={physics ? release : undefined}
      style={
        physics
          ? jelly
            ? // A jelly goes any way it is taken, up and down included, so a
              // finger on the canvas is the jelly's and not the page's.
              { touchAction: 'none' }
            : // Sideways is the pull and up and down is still the page, so a
              // thumb can scroll past the fan without catching on it.
              { cursor: 'grab', touchAction: 'pan-y' }
          : undefined
      }
    />
  );
}
