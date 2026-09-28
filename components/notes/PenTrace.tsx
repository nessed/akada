'use client';

import { useEffect, useRef } from 'react';
import { addMark, marksKey, parseMarks, removeMarkAt, resolveMarks, type Mark } from '@/lib/notes/highlights';
import { readStore, writeStore } from '@/lib/notes/store';

/** How long a stretch of the swipe stays at full strength behind the nib. */
const HOLD = 650;
/** How long it then takes to dry off the page. */
const FADE = 1500;
/** How far past the line a nib can wander and still be on it. */
const SLOP = 6;

type Point = { x: number; t: number };
type Stroke = {
  /** The band, against the top of the note, so a scroll carries it with the words. */
  top: number;
  height: number;
  points: Point[];
  seed: number;
  color: [number, number, number, number];
};
type Line = { top: number; bottom: number; left: number; right: number; section: HTMLElement | null };

type CaretDoc = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/** The text node and offset under a point, in whichever way the browser offers it. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as CaretDoc;
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
  }
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/**
 * The line of type under a point: the glyph box of the letter there and the
 * block it sits in. Null between lines, in the margin, or off the note, so a
 * nib resting in a gap paints nothing.
 */
function lineAt(body: HTMLElement, x: number, y: number): Line | null {
  const caret = caretAt(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !body.contains(caret.node)) return null;
  const text = caret.node as Text;
  const length = text.data.length;
  if (!length) return null;
  const range = document.createRange();
  const at = Math.min(caret.offset, length - 1);
  // The letter after the caret, or the one before it at the end of a line.
  let rect: DOMRect | null = null;
  for (const start of [at, Math.max(0, at - 1)]) {
    range.setStart(text, start);
    range.setEnd(text, Math.min(length, start + 1));
    const rects = Array.from(range.getClientRects()).filter((r) => r.height > 0);
    rect = rects.find((r) => y >= r.top - SLOP && y <= r.bottom + SLOP) ?? null;
    if (rect) break;
  }
  if (!rect) return null;
  const parent = text.parentElement;
  const block = parent?.closest<HTMLElement>('p, li, h1, h2, h3, h4, h5, h6, td, th, dt, dd, pre, figcaption, blockquote') ?? parent;
  if (!block) return null;
  const box = block.getBoundingClientRect();
  if (x < box.left - SLOP * 3 || x > box.right + SLOP * 3) return null;
  // The unit the spotlight lights: a child of the note's own body.
  let section: HTMLElement | null = block;
  while (section && section.parentElement !== body) section = section.parentElement;
  return { top: rect.top, bottom: rect.bottom, left: box.left, right: box.right, section };
}

function parseColor(value: string): [number, number, number, number] {
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return [228, 197, 92, 0.42];
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

/** Whether a paper reads as dark, so the swipe lightens rather than darkens. */
function isDark(value: string): boolean {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  let r: number, g: number, b: number;
  if (hex) [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  else [r, g, b] = parseColor(value);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

const strength = (age: number) => (age <= HOLD ? 1 : Math.max(0, 1 - (age - HOLD) / FADE));

/**
 * Trace: a pen run along the lines leaves a stroke of highlighter behind the
 * nib that dries off the page.
 *
 * The swipe snaps to the line of type the nib is on, so a wobbling hand still
 * lays a straight stroke over the words, and it only goes down while the nib
 * moves the way the words run: the sweep back to the start of the next line
 * paints nothing. Behind the nib it holds a moment and then fades, so what is
 * on the paper is only the last few words read. The section under the nib is
 * lit through the spotlight while it moves.
 *
 * A pen draws whether it touches the glass or hovers over it, and a mouse
 * does too while trace is on, since some pens report themselves as one. A
 * finger never does: a finger scrolls.
 */
function useTrace(canvasRef: React.RefObject<HTMLCanvasElement | null>, within: React.RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = within.current;
    if (!on || !canvas || !root) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const strokes: Stroke[] = [];
    let current: Stroke | null = null;
    let frame = 0;
    let penDown = false;
    let lit: HTMLElement | null = null;
    let unlight: number | undefined;
    let seed = 1;

    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      const box = canvas.getBoundingClientRect();
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
    };
    size();

    const draw = () => {
      frame = 0;
      const now = performance.now();
      const dpr = window.devicePixelRatio || 1;
      const origin = canvas.getBoundingClientRect();
      const anchor = root.getBoundingClientRect();
      const dx = anchor.left - origin.left;
      const dy = anchor.top - origin.top;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = strokes.length - 1; i >= 0; i--) {
        const stroke = strokes[i];
        const pts = stroke.points;
        if (!pts.length || strength(now - pts[pts.length - 1].t) <= 0) {
          strokes.splice(i, 1);
          if (stroke === current) current = null;
          continue;
        }
        if (pts.length < 2) continue;
        const [r, g, b, a] = stroke.color;
        const x0 = pts[0].x + dx;
        const x1 = pts[pts.length - 1].x + dx;
        if (x1 - x0 < 1) continue;
        const top = stroke.top + dy;
        const bottom = top + stroke.height;
        // The nib is a chisel held at an angle, so both ends lean the same way.
        const lean = stroke.height * 0.28;

        // One fill per stroke, with its strength carried along a gradient, so
        // the older end fades without seams between the pieces.
        const gradient = ctx.createLinearGradient(x0, 0, x1 + lean, 0);
        const span = x1 + lean - x0;
        for (const p of pts) {
          const at = Math.min(1, Math.max(0, (p.x + dx - x0) / span));
          gradient.addColorStop(at, `rgba(${r}, ${g}, ${b}, ${(a * strength(now - p.t)).toFixed(3)})`);
        }
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${(a * strength(now - pts[pts.length - 1].t)).toFixed(3)})`);

        // Edges with a little of a real nib's wander in them, fixed per stroke.
        const wobble = (x: number, k: number) =>
          Math.sin(x * 0.07 + stroke.seed * k) * 0.55 + Math.sin(x * 0.021 + stroke.seed * 2.3 * k) * 0.75;
        ctx.beginPath();
        ctx.moveTo(x0 + lean, top + wobble(x0, 1));
        for (let x = x0 + lean + 6; x < x1 + lean; x += 6) ctx.lineTo(x, top + wobble(x, 1));
        ctx.lineTo(x1 + lean, top + wobble(x1 + lean, 1));
        ctx.lineTo(x1, bottom + wobble(x1, 1.7));
        for (let x = x1 - 6; x > x0; x -= 6) ctx.lineTo(x, bottom + wobble(x, 1.7));
        ctx.lineTo(x0, bottom + wobble(x0, 1.7));
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      if (strokes.length) frame = requestAnimationFrame(draw);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const light = (section: HTMLElement | null) => {
      window.clearTimeout(unlight);
      if (section !== lit) {
        lit?.removeAttribute('data-pen');
        section?.setAttribute('data-pen', '');
        lit = section;
      }
      unlight = window.setTimeout(() => {
        lit?.removeAttribute('data-pen');
        lit = null;
      }, HOLD + FADE);
    };

    const startStroke = (line: Line, x: number, t: number, anchor: DOMRect) => {
      const style = getComputedStyle(root);
      const color = parseColor(style.getPropertyValue('--highlight-yellow'));
      const dark = isDark(style.getPropertyValue('--paper') || style.backgroundColor);
      canvas.style.mixBlendMode = dark ? 'screen' : 'multiply';
      // A touch more body than the static swipe: this one is moving.
      color[3] = Math.min(0.75, color[3] * (dark ? 1.6 : 1.5));
      const glyph = line.bottom - line.top;
      const height = glyph * 0.66;
      current = {
        top: line.top + glyph * 0.24 - anchor.top,
        height,
        points: [{ x: Math.max(line.left, x) - anchor.left, t }],
        seed: (seed = (seed * 9301 + 49297) % 233280) / 233280 * 10,
        color,
      };
      strokes.push(current);
    };

    const follow = (x: number, y: number, t: number) => {
      const body = root.querySelector<HTMLElement>('.markdown-body');
      if (!body) return;
      const line = lineAt(body, x, y);
      if (!line) {
        current = null;
        return;
      }
      light(line.section);
      const anchor = root.getBoundingClientRect();
      const nx = Math.min(line.right, Math.max(line.left, x)) - anchor.left;
      const lineTop = line.top + (line.bottom - line.top) * 0.24 - anchor.top;
      const same = current && Math.abs(current.top - lineTop) < 3;
      if (!current || !same) {
        startStroke(line, x, t, anchor);
        return;
      }
      const last = current.points[current.points.length - 1];
      if (nx < last.x - 4) {
        // Going back the way it came: the sweep to the next line, or a reread.
        // Nothing goes down; the next stroke starts wherever it turns forward.
        if (current.points.length === 1) Object.assign(last, { x: nx, t });
        else startStroke(line, x, t, anchor);
        return;
      }
      if (nx - last.x < 2) {
        last.t = t;
      } else {
        current.points.push({ x: nx, t });
        // Plenty of stops for a smooth fade, never so many the gradient chokes.
        if (current.points.length > 96) current.points.splice(1, 1);
      }
      schedule();
    };

    const accepts = (event: PointerEvent) => event.pointerType === 'pen' || event.pointerType === 'mouse';

    const onMove = (event: PointerEvent) => {
      if (!accepts(event)) return;
      if (penDown && event.pointerType === 'pen') window.getSelection()?.removeAllRanges();
      const moves = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      const now = performance.now();
      if (moves.length > 1) for (const m of moves) follow(m.clientX, m.clientY, now);
      else follow(event.clientX, event.clientY, now);
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== 'pen' || !root.contains(event.target as Node)) return;
      penDown = true;
      root.setAttribute('data-pen-down', '');
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== 'pen') return;
      penDown = false;
      root.removeAttribute('data-pen-down');
    };
    const onLeave = (event: PointerEvent) => {
      if (accepts(event)) current = null;
    };
    // A pen on the glass traces rather than scrolls. Only its moves are held
    // back, never its first touch, so a tap with the pen still follows a link.
    const onTouchMove = (event: TouchEvent) => {
      if (penDown && event.cancelable) event.preventDefault();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    root.addEventListener('pointerleave', onLeave, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('resize', size);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', size);
      window.clearTimeout(unlight);
      cancelAnimationFrame(frame);
      lit?.removeAttribute('data-pen');
      root.removeAttribute('data-pen-down');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [on, within, canvasRef]);
}

/* ── Highlight ──────────────────────────────────────────────────────── */

type Registry = { set: (name: string, value: unknown) => void; delete: (name: string) => void };
type HighlightCtor = new (...ranges: Range[]) => unknown;

/** The browser's highlight registry, where it has one. */
function registry(): { highlights: Registry; Highlight: HighlightCtor } | null {
  const css = (typeof CSS !== 'undefined' ? CSS : null) as unknown as { highlights?: Registry } | null;
  const ctor = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;
  return css?.highlights && ctor ? { highlights: css.highlights, Highlight: ctor } : null;
}

const SAVED = 'akada-pen';
const LIVE = 'akada-pen-live';

/** Every text node of the note, in reading order, with where each starts. */
function textMap(body: HTMLElement) {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += (node as Text).data;
  }
  return { nodes, starts, text };
}
type TextMap = ReturnType<typeof textMap>;

function offsetOf(map: TextMap, node: Node, offset: number): number | null {
  const i = map.nodes.indexOf(node as Text);
  return i < 0 ? null : map.starts[i] + Math.min(offset, map.nodes[i].data.length);
}

function rangeOf(map: TextMap, s: number, e: number): Range | null {
  const find = (at: number, end: boolean) => {
    // An end on a node's edge belongs to the node before; a start, to the one after.
    for (let i = 0; i < map.nodes.length; i++) {
      const from = map.starts[i];
      const to = from + map.nodes[i].data.length;
      if (end ? at > from && at <= to : at >= from && at < to) return { node: map.nodes[i], offset: at - from };
    }
    return null;
  };
  const a = find(s, false);
  const b = find(e, true);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/**
 * Highlight: the pen pressed on the glass (or a mouse held down) lays a
 * highlighter mark over the words it runs across, snapped to whole words, and
 * the mark stays. Marks are kept with the note in this browser, found again
 * by their words if the note changes, and a tap on one takes it off.
 *
 * They are painted through the browser's own highlight registry rather than
 * on a sheet over the page, so they sit under the ink and ride every scroll,
 * fold, pinch and reflow without being redrawn.
 */
function useHighlighter(within: React.RefObject<HTMLElement | null>, noteId: string, on: boolean) {
  // The marks show whether or not the highlighter is in hand.
  useEffect(() => {
    const root = within.current;
    const reg = registry();
    if (!root || !reg) return;
    let marks: Mark[] = parseMarks(readStore(marksKey(noteId)));
    let pending = 0;
    let observer: MutationObserver | null = null;

    const paint = () => {
      pending = 0;
      const body = root.querySelector<HTMLElement>('.markdown-body');
      if (!body) return;
      const map = textMap(body);
      marks = resolveMarks(marks, map.text);
      const ranges = marks.map((m) => rangeOf(map, m.s, m.e)).filter((r): r is Range => !!r);
      reg.highlights.set(SAVED, new reg.Highlight(...ranges));
    };
    const repaint = () => {
      if (!pending) pending = requestAnimationFrame(paint);
    };
    const save = () => writeStore(marksKey(noteId), JSON.stringify(marks));

    // The note is drawn after this mounts, and a check opened or a fold
    // redraws parts of it; the marks follow the words each time.
    observer = new MutationObserver(repaint);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    paint();

    let stroke: { id: number; start: number; x: number; y: number; moved: boolean } | null = null;
    const bodyOf = () => root.querySelector<HTMLElement>('.markdown-body');
    const at = (x: number, y: number) => {
      const body = bodyOf();
      const caret = caretAt(x, y);
      if (!body || !caret || !body.contains(caret.node)) return null;
      const map = textMap(body);
      const offset = offsetOf(map, caret.node, caret.offset);
      return offset === null ? null : { map, offset };
    };
    const takes = (event: PointerEvent) =>
      on && (event.pointerType === 'pen' || (event.pointerType === 'mouse' && event.button === 0));

    const onDown = (event: PointerEvent) => {
      if (!takes(event)) return;
      const target = event.target as HTMLElement | null;
      if (!target || !bodyOf()?.contains(target) || target.closest('a, button, input, textarea, select, summary')) return;
      const hit = at(event.clientX, event.clientY);
      if (!hit) return;
      // A mouse held down would start a selection; under the highlighter it marks.
      if (event.pointerType === 'mouse') event.preventDefault();
      root.setAttribute('data-pen-down', '');
      stroke = { id: event.pointerId, start: hit.offset, x: event.clientX, y: event.clientY, moved: false };
    };
    const onMove = (event: PointerEvent) => {
      if (!stroke || event.pointerId !== stroke.id) return;
      if (!stroke.moved && Math.hypot(event.clientX - stroke.x, event.clientY - stroke.y) < 6) return;
      stroke.moved = true;
      window.getSelection()?.removeAllRanges();
      const hit = at(event.clientX, event.clientY);
      if (!hit) return;
      const next = addMark([], hit.map.text, stroke.start, hit.offset)[0];
      const range = next ? rangeOf(hit.map, next.s, next.e) : null;
      if (range) reg.highlights.set(LIVE, new reg.Highlight(range));
    };
    const onUp = (event: PointerEvent) => {
      if (!stroke || event.pointerId !== stroke.id) return;
      const done = stroke;
      stroke = null;
      root.removeAttribute('data-pen-down');
      reg.highlights.delete(LIVE);
      const hit = at(event.clientX, event.clientY);
      if (!hit) return;
      marks = resolveMarks(marks, hit.map.text);
      const next = done.moved ? addMark(marks, hit.map.text, done.start, hit.offset) : removeMarkAt(marks, hit.offset);
      if (next === marks) return;
      marks = next;
      save();
      paint();
    };
    const onCancel = (event: PointerEvent) => {
      if (!stroke || event.pointerId !== stroke.id) return;
      stroke = null;
      root.removeAttribute('data-pen-down');
      reg.highlights.delete(LIVE);
    };
    // A pen pressed on the glass marks rather than scrolls.
    const onTouchMove = (event: TouchEvent) => {
      if (stroke && event.cancelable) event.preventDefault();
    };

    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(pending);
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeAttribute('data-pen-down');
      reg.highlights.delete(SAVED);
      reg.highlights.delete(LIVE);
    };
  }, [within, noteId, on]);
}

export type PenMode = 'off' | 'trace' | 'highlight';

/**
 * What a pen can do on a note: trace the lines being read, or highlight them.
 * The marks a highlighter left are drawn in either case.
 */
export default function PenTrace({ within, noteId, mode }: { within: React.RefObject<HTMLElement | null>; noteId: string; mode: PenMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useTrace(canvasRef, within, mode === 'trace');
  useHighlighter(within, noteId, mode === 'highlight');
  if (mode !== 'trace') return null;
  return <canvas ref={canvasRef} className="pen-trace" aria-hidden />;
}
