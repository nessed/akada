'use client';

import { useEffect, useRef } from 'react';
import { useCourses } from '@/lib/data-hooks';
import { TIMER_HOLD_EVENT, useTimerState, type TimerHoldDetail } from '@/lib/timer-context';

/**
 * The page answering a pause, wherever it came from.
 *
 * A pause is often made with the eyes on the book rather than the screen (the
 * `P` key, the dock), so the whole page says it heard. It used to blink: a
 * flat veil of ink over everything, which read as the screen flickering
 * rather than as anything happening. Now a ring goes out across the page
 * from wherever the pause was made, like a drop landing in ink, with a
 * fainter one a beat behind it. Holding the clock sends it out in the ink the
 * page is written in; letting it go sends it out in the course's colour.
 *
 * It starts at the last press if there was one a moment ago (the pause
 * button, the dock, a task row), at the dock for the key, and at the middle
 * of the screen if there is no dock. It catches no clicks, and a reader who
 * has asked for less movement does not get it at all.
 */

/** A press this recent is the one that did it. */
const PRESS_WINDOW_MS = 800;
const DURATION_MS = 900;
const ECHO_DELAY_MS = 130;

function origin(lastPress: { x: number; y: number; at: number } | null): { x: number; y: number } {
  if (lastPress && Date.now() - lastPress.at < PRESS_WINDOW_MS) return lastPress;
  const dock = document.querySelector('[data-timer-dock]');
  if (dock) {
    const r = dock.getBoundingClientRect();
    if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/** The ink the page is written in at that point, so the night paper gets a
    light ring and the daylight one a dark ring without either being named. */
function inkAt(x: number, y: number): string {
  // The page around a control, not the control: a filled button's label is
  // set in the paper colour, and a ring in that is invisible on the page.
  const hit = document.elementFromPoint(x, y);
  const el = hit?.closest('button, a, [role="button"]')?.parentElement ?? hit;
  const color = el ? getComputedStyle(el).color : '';
  return color || 'rgb(34, 30, 24)';
}

function ring(x: number, y: number, color: string, delay: number, weight: number, peak: number): void {
  // Big enough that its edge clears the farthest corner of the screen.
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 24;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.className = 'pause-ripple';
  Object.assign(el.style, {
    borderColor: color,
    borderWidth: `${weight}px`,
    // A soft wash just inside the edge, the wave front of the drop, and
    // nothing in the middle: the page is never covered, only crossed.
    background: `radial-gradient(circle closest-side, transparent 55%, color-mix(in srgb, ${color} 16%, transparent) 97%, transparent 100%)`,
  });
  document.body.appendChild(el);
  /* Grown by size rather than scaled, so the line keeps its weight the whole
     way out instead of starting as a hair and thickening. One bare element
     on a fixed layer, for under a second: the layout it costs is nothing. */
  const at = (radius: number) => ({
    left: `${x - radius}px`,
    top: `${y - radius}px`,
    width: `${radius * 2}px`,
    height: `${radius * 2}px`,
  });
  const anim = el.animate(
    [
      { ...at(4), opacity: 0 },
      { ...at(r * 0.06), opacity: peak, offset: 0.06 },
      { ...at(r * 0.7), opacity: peak * 0.45, offset: 0.55 },
      { ...at(r), opacity: 0 },
    ],
    { duration: DURATION_MS, delay, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'both' },
  );
  anim.onfinish = () => el.remove();
  anim.oncancel = () => el.remove();
}

function Ripples({ courseId }: { courseId: string }) {
  const { courses } = useCourses();
  const colorRef = useRef<string | null>(null);
  const color = courses.find((c) => c.id === courseId)?.color ?? null;
  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    let lastPress: { x: number; y: number; at: number } | null = null;
    const onPress = (e: PointerEvent) => {
      lastPress = { x: e.clientX, y: e.clientY, at: Date.now() };
    };
    const onHold = (e: Event) => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const { held } = (e as CustomEvent<TimerHoldDetail>).detail;
      const at = origin(lastPress);
      lastPress = null;
      const color = held ? inkAt(at.x, at.y) : colorRef.current ?? inkAt(at.x, at.y);
      ring(at.x, at.y, color, 0, 2, 0.6);
      ring(at.x, at.y, color, ECHO_DELAY_MS, 1, 0.35);
    };
    window.addEventListener('pointerdown', onPress, { capture: true, passive: true });
    window.addEventListener(TIMER_HOLD_EVENT, onHold);
    return () => {
      window.removeEventListener('pointerdown', onPress, { capture: true });
      window.removeEventListener(TIMER_HOLD_EVENT, onHold);
    };
  }, []);

  return null;
}

export default function PauseRipple() {
  const { active } = useTimerState();
  // Only while a sitting exists, so the courses are never fetched for a
  // screen that has no clock to pause.
  return active ? <Ripples courseId={active.courseId} /> : null;
}
