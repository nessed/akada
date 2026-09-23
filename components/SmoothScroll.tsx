'use client';

import { useEffect } from 'react';

/**
 * How the page moves under a wheel or a trackpad.
 *
 * A wheel notch on its own jumps the page 100px in one frame, and nothing
 * happens at the ends: the page hits a wall. This takes the wheel over for
 * the page itself. Each notch moves a target, and the page glides after it,
 * covering a set share of what is left every frame, so it has weight and
 * comes to rest instead of stopping dead. Pushing past the top or the bottom
 * pulls the page a little further than it goes, against resistance, and it
 * springs back once you let go.
 *
 * Touch is left alone. A finger already gets the platform's own momentum,
 * and globals.css keeps the platform's own bounce for it.
 *
 * Anything that is not the page keeps the browser's scrolling: a sheet, the
 * rail, a dropdown, a strip that scrolls sideways, anything inside a fixed
 * layer, and the whole page while something modal is open or the body is
 * locked. Pinch zoom (ctrl + wheel) and sideways swipes are never touched.
 * Anyone who has asked for less motion gets the browser as it is.
 */

/** How fast the page closes on its target, per second. Higher is snappier. */
const GLIDE = 10;
/** The furthest the page can be pulled past an end, in px. */
const MAX_PULL = 96;
/** How much of a push past the end turns into pull. */
const RESISTANCE = 0.5;
/** How fast a pulled page springs home, per second. */
const SPRING = 12;
/** No wheel for this long counts as letting go. */
const RELEASE_MS = 110;

export default function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.documentElement;

    let target = window.scrollY;
    let current = window.scrollY;
    // What this last wrote, so a scroll it did not make (a key, the
    // scrollbar, a link, a route change) can be told apart and followed.
    let written = window.scrollY;
    // Signed: positive is past the bottom, negative past the top.
    let pull = 0;
    // Push past an end made while the page was still gliding towards it.
    // Spent as pull the moment the page arrives, so a hard flick bounces.
    let pending = 0;
    let lastWheel = 0;
    let lastDir = 0;
    let frame = 0;
    let prev = 0;
    let stretched: HTMLElement | null = null;

    const maxY = () => Math.max(0, root.scrollHeight - window.innerHeight);

    const locked = () =>
      document.body.style.overflow === 'hidden' ||
      getComputedStyle(document.body).overflowY === 'hidden' ||
      getComputedStyle(root).overflowY === 'hidden' ||
      document.querySelector('[aria-modal="true"]') !== null;

    // Whether something between the pointer and the page should scroll
    // instead, or is a layer the page scrolling beneath would be wrong for.
    const ownedElsewhere = (start: EventTarget | null, dy: number) => {
      let el = start instanceof Element ? start : null;
      while (el && el !== document.body && el !== root) {
        if (el instanceof HTMLTextAreaElement) return true;
        const style = getComputedStyle(el);
        if (style.position === 'fixed') return true;
        const oy = style.overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
          const canMove =
            dy > 0
              ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
              : el.scrollTop > 0;
          // At its own end, a contained scroller keeps the wheel too, so
          // the page does not lurch behind it.
          if (canMove || style.overscrollBehaviorY !== 'auto') return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    // The pull is drawn by moving the page's content, not the page: the bar,
    // the rail and the dock are fixed siblings of it and stay where they are.
    const drawPull = () => {
      const el = document.querySelector<HTMLElement>('[data-scroll-content]');
      if (stretched && stretched !== el) stretched.style.transform = '';
      stretched = el;
      if (!el) return;
      // A soft cap: the further it goes, the harder it gets.
      const shown = MAX_PULL * Math.tanh(pull / MAX_PULL);
      el.style.transform = Math.abs(shown) < 0.25 ? '' : `translate3d(0, ${-shown}px, 0)`;
    };

    const tick = (now: number) => {
      const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 1 / 60;
      prev = now;
      let moving = false;

      if (Math.abs(target - current) > 0.5) {
        current += (target - current) * (1 - Math.exp(-GLIDE * dt));
        moving = true;
      } else {
        current = target;
      }
      window.scrollTo({ top: current, behavior: 'instant' });
      written = current;

      // Arrived at the end it was flung at: the rest of the flick is pull.
      if (pending !== 0) {
        const atEdge = pending > 0 ? current >= maxY() - 1 : current <= 1;
        if (atEdge) {
          pull += pending;
          pending = 0;
          lastWheel = now;
        } else {
          moving = true;
        }
      }

      if (pull !== 0) {
        const lettingGo = now - lastWheel > RELEASE_MS || Math.sign(lastDir) !== Math.sign(pull);
        if (lettingGo) {
          pull *= Math.exp(-SPRING * dt);
          if (Math.abs(pull) < 0.3) pull = 0;
        }
        moving = true;
      }
      drawPull();

      frame = moving ? requestAnimationFrame(tick) : 0;
      if (!frame) prev = 0;
    };

    const run = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || reduced.matches) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (locked() || ownedElsewhere(e.target, e.deltaY)) return;
      e.preventDefault();

      const dy =
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (!frame) current = target = written = window.scrollY;
      lastWheel = performance.now();
      lastDir = Math.sign(dy);

      if (pending !== 0 && Math.sign(dy) !== Math.sign(pending)) pending = 0;
      // Coming back off a pull gives up the pull first.
      if (pull !== 0 && Math.sign(dy) !== Math.sign(pull)) {
        const back = Math.sign(pull) * Math.min(Math.abs(pull), Math.abs(dy));
        pull -= back;
        run();
        return;
      }

      const max = maxY();
      let next = target + dy;
      if (next > max) {
        pending += (next - max) * RESISTANCE;
        next = max;
      } else if (next < 0) {
        pending += next * RESISTANCE;
        next = 0;
      }
      // A hard flick lands about three quarters of the way to MAX_PULL.
      pending = Math.max(-MAX_PULL, Math.min(MAX_PULL, pending));
      target = next;
      run();
    };

    const onScroll = () => {
      if (Math.abs(window.scrollY - written) <= 2) return;
      // Somebody else moved the page. Follow it rather than drag it back.
      target = current = written = window.scrollY;
      pending = 0;
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (stretched) stretched.style.transform = '';
    };
  }, []);

  return null;
}
