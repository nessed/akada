'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A figure that counts itself up to where it is, the way an odometer rolls,
 * rather than being printed there. From zero on first paint, and from the
 * figure it was showing when the target moves. Anyone who has asked for less
 * movement gets the figure as it is.
 */
export function useCountUp(target: number, duration = 1100, delay = 0): number {
  const [value, setValue] = useState(0);
  const shown = useRef(0);

  useEffect(() => {
    const reduced =
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      shown.current = target;
      setValue(target);
      return;
    }

    const from = shown.current;
    let frame = 0;
    let startedAt: number | null = null;
    const step = (now: number) => {
      if (startedAt === null) startedAt = now + delay;
      const t = Math.min(1, Math.max(0, (now - startedAt) / duration));
      // Ease out: fast off the mark, settling onto the figure.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      shown.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, delay]);

  return value;
}
