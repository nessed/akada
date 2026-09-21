'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFan, drawFan, fanShades, seedFrom, type FanTree } from '@/lib/fan';

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

/**
 * One axis of the sway: a spring that remembers where it has been.
 *
 * `step` takes where a hand is holding it, or null once it has been let go.
 * Held, it follows the hand a little behind and keeps the speed of that
 * follow, so letting go mid-pull throws the fan rather than dropping it.
 * `at` reads the position a few frames back, which is what the outer
 * branches are drawn from.
 */
function strand() {
  const past = new Float64Array(HISTORY);
  let i = 0;
  let x = 0;
  let v = 0;
  let quiet = 0;

  return {
    step(held: number | null) {
      if (held == null) {
        v += -x * STIFFNESS - v * DAMPING;
        x += v;
        if (Math.abs(x) < 0.0004 && Math.abs(v) < 0.0004) {
          x = 0;
          v = 0;
        }
      } else {
        v = (held - x) * 0.22;
        x += v;
      }
      i = (i + 1) % HISTORY;
      past[i] = x;
      quiet = x === 0 && v === 0 ? quiet + 1 : 0;
    },
    at(lag: number) {
      return past[(i - Math.min(lag, HISTORY - 1) + HISTORY) % HISTORY];
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
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const treeRef = useRef<FanTree | null>(null);
  const shownRef = useRef(0);
  const targetRef = useRef(progress);
  const rafRef = useRef<number | null>(null);
  const kickRef = useRef<() => void>(() => {});

  /* The hand. `from` is where the finger went down and `held` is the pull it
     is asking for; the whole thing goes null once the fan has been let go. */
  const handRef = useRef<{
    from: { x: number; y: number };
    held: { bend: number; slack: number };
  } | null>(null);
  const swayRef = useRef(strand());
  const stretchRef = useRef(strand());

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
  useEffect(() => {
    targetRef.current = Math.min(1, Math.max(0, progress));
  }, [progress]);

  // Rebuilding the geometry is the expensive half, so it only happens when
  // the shape itself changes, never on a progress tick.
  useEffect(() => {
    treeRef.current = buildFan(seedFrom(seed), depth, tripleP);
    shownRef.current = 0;
  }, [seed, depth, tripleP]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const colors = fanShades(color, light);
    const bends = new Array<number>(depth + 1).fill(0);
    const slack = new Array<number>(depth + 1).fill(0);
    const lagMax = Math.round(depth * LAG_PER_DEPTH);
    let disposed = false;

    /* The canvas is sized in device pixels so the strokes stay crisp on a
       retina screen, and re-measured on resize because an open-mode fan is
       sized to the viewport rather than to a fixed frame. */
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      drawFan(ctx, tree, canvas.width, canvas.height, {
        progress: shownRef.current,
        colors,
        trunkWidth: trunkWidth * dpr,
        padTop: padTop * dpr,
        widthFill,
        baseOffset: baseOffset * dpr,
        bends: physics ? bends : undefined,
        slack: physics ? slack : undefined,
      });
    };

    /* One frame of the sway, written into the arrays the painter reads. Each
       depth is drawn from where the spring was a few frames ago, so the bend
       runs out along the branches. */
    const settle = () => {
      const hand = handRef.current;
      const sway = swayRef.current;
      const stretch = stretchRef.current;
      sway.step(hand ? hand.held.bend : null);
      stretch.step(hand ? hand.held.slack : null);
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
      }
      return hand == null && sway.quiet > lagMax && stretch.quiet > lagMax;
    };

    const step = () => {
      if (disposed) return;
      const target = targetRef.current;
      const shown = shownRef.current;
      const gap = target - shown;
      const grown = reduced || Math.abs(gap) < 0.0004;
      const rested = physics ? settle() : true;

      if (grown) shownRef.current = target;
      // Ease toward the target rather than tracking it exactly: the fan
      // catches up over about a second, which is what makes it grow.
      else shownRef.current = shown + gap * 0.045;

      paint();

      if (grown && rested) {
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

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [color, light, trunkWidth, padTop, widthFill, baseOffset, depth, flex, reach, physics]);

  /* Taking hold. The pull is read off the distance travelled rather than the
     point grabbed, through a curve that gives most of its bend early and then
     runs out: dragging further and further does not fold the fan in half. */
  const grab = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!physics) return;
    handRef.current = { from: { x: e.clientX, y: e.clientY }, held: { bend: 0, slack: 0 } };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'grabbing';
    kickRef.current();
  };

  const drag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const hand = handRef.current;
    if (!hand) return;
    const dx = e.clientX - hand.from.x;
    const dy = e.clientY - hand.from.y;
    hand.held = {
      bend: Math.tanh(dx / 230) * SWAY_MAX,
      // Pulling the crown down gathers the fan in; lifting draws it out.
      slack: -Math.tanh(dy / 300) * SLACK_MAX,
    };
  };

  const release = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!handRef.current) return;
    handRef.current = null;
    e.currentTarget.style.cursor = 'grab';
    kickRef.current();
  };

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      onPointerDown={physics ? grab : undefined}
      onPointerMove={physics ? drag : undefined}
      onPointerUp={physics ? release : undefined}
      onPointerCancel={physics ? release : undefined}
      style={
        physics
          ? // Sideways is the pull and up and down is still the page, so a
            // thumb can scroll past the fan without catching on it.
            { cursor: 'grab', touchAction: 'pan-y' }
          : undefined
      }
    />
  );
}
