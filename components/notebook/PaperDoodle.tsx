'use client';

import { useEffect, useRef } from 'react';

/**
 * Wet ink in the margin.
 *
 * Drag a finger, a pen or a mouse across the empty parts of a page and a line
 * of ink follows it, then dries and lifts off the paper after a few seconds.
 * There is no control for it and nothing announces it; it is marginalia, the
 * kind of thing a hand does while the mind is elsewhere.
 *
 * The whole layer is pointer-events: none, so it can never take a tap from a
 * button, a field or a sheet. Gestures are read from a capture-phase listener
 * on the window instead, and a stroke only begins when the gesture starts on
 * genuinely empty background (see isEmptyBackground below).
 */

/** Ink stops flowing once a stroke is this long, so memory stays flat. */
const MAX_POINTS = 420;
/** Older strokes are retired when this many are alive at once. */
const MAX_STROKES = 6;
/** Movement needed before a drag counts as a doodle rather than a tap. */
const START_SLOP = 7;
/** How long a finished stroke sits before it starts to lift, in ms. */
const DWELL = 900;
/** How long the lift takes, in ms. */
const FADE = 1900;
/** A stroke abandoned to a scroll leaves quickly instead of lingering. */
const FADE_ABANDONED = 420;

const INTERACTIVE = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
  'option',
  '[role="button"]',
  '[role="link"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="tab"]',
  '[contenteditable]',
  '[data-no-doodle]',
].join(',');

interface Point {
  x: number;
  y: number;
  w: number;
  t: number;
}

interface Stroke {
  points: Point[];
  ink: string;
  endedAt: number | null;
  fadeMs: number;
}

/**
 * True when a gesture that began on this element should be allowed to draw.
 *
 * Three things disqualify a target. Anything interactive, or inside something
 * interactive, keeps its own gesture. Anything inside a fixed or sticky
 * ancestor is app chrome rather than page: that one check covers the bottom
 * nav, the timer dock, every sheet and every modal without naming any of
 * them. And an element holding its own text is something a reader may want to
 * select, so the ink stays off it.
 */
function isEmptyBackground(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(INTERACTIVE)) return false;

  const kids = target.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return false;
  }

  let el: Element | null = target;
  while (el && el !== document.body) {
    const position = getComputedStyle(el).position;
    if (position === 'fixed' || position === 'sticky') return false;
    el = el.parentElement;
  }
  return true;
}

function readInk(): string {
  const ink = getComputedStyle(document.documentElement)
    .getPropertyValue('--ink')
    .trim();
  return ink || '#1A1714';
}

export default function PaperDoodle() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const calmer = window.matchMedia('(prefers-reduced-motion: reduce)');

    const strokes: Stroke[] = [];
    let frame = 0;
    let dpr = 1;

    // The gesture in progress. `stroke` stays null until the pointer has
    // travelled far enough to mean it, so a tap on empty paper leaves nothing.
    let pointerId: number | null = null;
    let origin = { x: 0, y: 0 };
    let stroke: Stroke | null = null;
    let scrolled = false;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    };

    const opacityOf = (s: Stroke, now: number) => {
      if (s.endedAt === null) return 1;
      const age = now - s.endedAt;
      if (age <= DWELL) return 1;
      const gone = (age - DWELL) / s.fadeMs;
      if (gone >= 1) return 0;
      // Ease out, so the last of the ink lingers rather than snapping away.
      return 1 - gone * gone;
    };

    const paint = (s: Stroke, alpha: number) => {
      const pts = s.points;
      ctx.strokeStyle = s.ink;

      if (pts.length === 1) {
        ctx.globalAlpha = alpha * 0.32;
        ctx.lineWidth = pts[0].w;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[0].x + 0.01, pts[0].y);
        ctx.stroke();
        return;
      }

      // Two passes: a wide faint one that reads as ink bleeding into the
      // grain, then the core line on top.
      for (const pass of [
        { widen: 2.1, alpha: alpha * 0.1 },
        { widen: 1, alpha: alpha * 0.34 },
      ]) {
        ctx.globalAlpha = pass.alpha;
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const cur = pts[i];
          const from =
            i === 1
              ? prev
              : { x: (pts[i - 2].x + prev.x) / 2, y: (pts[i - 2].y + prev.y) / 2 };
          const to = { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 };
          ctx.lineWidth = ((prev.w + cur.w) / 2) * pass.widen;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.quadraticCurveTo(prev.x, prev.y, to.x, to.y);
          ctx.stroke();
        }
        const last = pts[pts.length - 1];
        const before = pts[pts.length - 2];
        ctx.lineWidth = last.w * pass.widen;
        ctx.beginPath();
        ctx.moveTo((before.x + last.x) / 2, (before.y + last.y) / 2);
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const tick = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = strokes.length - 1; i >= 0; i--) {
        const alpha = opacityOf(strokes[i], now);
        if (alpha <= 0) {
          strokes.splice(i, 1);
          continue;
        }
        paint(strokes[i], alpha);
      }

      // Nothing left to age, so nothing left to do. The loop restarts on the
      // next stroke rather than spinning against an empty page.
      frame = strokes.length ? requestAnimationFrame(tick) : 0;
    };

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const widthFor = (from: Point, x: number, y: number, t: number) => {
      const dt = Math.max(t - from.t, 1);
      const speed = Math.hypot(x - from.x, y - from.y) / dt;
      // Fast is thin, slow is full, the way a nib behaves. Eased toward the
      // previous width so the line does not stutter between samples.
      const target = 2.5 - Math.min(speed, 1.6) * 0.95;
      return from.w + (target - from.w) * 0.35;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (pointerId !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!isEmptyBackground(e.target)) return;
      pointerId = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
      stroke = null;
      scrolled = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;

      // A scroll means the reader was moving the page, not drawing on it.
      if (scrolled) {
        if (stroke) {
          stroke.endedAt = performance.now();
          stroke.fadeMs = FADE_ABANDONED;
        }
        pointerId = null;
        stroke = null;
        return;
      }

      const now = performance.now();
      if (!stroke) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < START_SLOP) return;
        stroke = {
          points: [{ x: origin.x, y: origin.y, w: 1.9, t: now }],
          ink: readInk(),
          endedAt: null,
          fadeMs: FADE,
        };
        strokes.push(stroke);
        if (strokes.length > MAX_STROKES) {
          const retired = strokes.shift();
          if (retired && retired.endedAt === null) retired.endedAt = now;
        }
        wake();
      }

      if (stroke.points.length >= MAX_POINTS) return;
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < 1.4) return;
      stroke.points.push({
        x: e.clientX,
        y: e.clientY,
        w: widthFor(last, e.clientX, e.clientY, now),
        t: now,
      });
    };

    const endStroke = () => {
      if (stroke && stroke.endedAt === null) stroke.endedAt = performance.now();
      pointerId = null;
      stroke = null;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      endStroke();
    };

    const onScroll = () => {
      scrolled = true;
      if (stroke && stroke.endedAt === null) {
        stroke.endedAt = performance.now();
        stroke.fadeMs = FADE_ABANDONED;
        pointerId = null;
        stroke = null;
      }
    };

    const onHide = () => {
      endStroke();
      strokes.length = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    let listening = false;

    const listen = () => {
      if (listening) return;
      listening = true;
      resize();
      window.addEventListener('resize', resize);
      // Capture phase, but nothing here calls preventDefault or
      // stopPropagation: scrolling, tapping, swiping and text selection all
      // continue exactly as they did.
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('pointercancel', onPointerUp, true);
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('blur', onHide);
      document.addEventListener('visibilitychange', onHide);
    };

    const hush = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onHide);
      document.removeEventListener('visibilitychange', onHide);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      onHide();
    };

    // Someone who has asked for less movement gets none of this, the same
    // policy the reduced-motion block in globals.css applies to the rest of
    // the app. The query is watched, so the answer can change mid-session.
    const settle = () => (calmer.matches ? hush() : listen());
    settle();
    calmer.addEventListener('change', settle);

    return () => {
      calmer.removeEventListener('change', settle);
      hush();
    };
  }, []);

  return <canvas ref={canvasRef} className="doodle-layer" aria-hidden />;
}
