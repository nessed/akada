'use client';

import { useEffect, useRef } from 'react';
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
  className?: string;
}

/**
 * The fan on a canvas, sized to its box and redrawn whenever progress moves.
 *
 * Progress is eased toward rather than snapped to, so a session that is
 * restored mid-way grows into place instead of appearing fully formed, and a
 * running timer's once-a-second tick reads as continuous growth rather than
 * a series of steps. The loop parks itself once it has arrived.
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
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const treeRef = useRef<FanTree | null>(null);
  const shownRef = useRef(0);
  const targetRef = useRef(progress);
  const rafRef = useRef<number | null>(null);

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
      });
    };

    const step = () => {
      if (disposed) return;
      const target = targetRef.current;
      const shown = shownRef.current;
      const gap = target - shown;

      if (reduced || Math.abs(gap) < 0.0004) {
        shownRef.current = target;
        paint();
        rafRef.current = null;
        return;
      }
      // Ease toward the target rather than tracking it exactly: the fan
      // catches up over about a second, which is what makes it grow.
      shownRef.current = shown + gap * 0.045;
      paint();
      rafRef.current = requestAnimationFrame(step);
    };

    const kick = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(step);
    };

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
  }, [color, light, trunkWidth, padTop, widthFill, baseOffset, progress]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
