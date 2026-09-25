'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** How long a sheet takes to go back down. Matches `.sheet-leaving`. */
export const LEAVE_MS = 220;

/**
 * Hold a value for one exit's worth of time after it goes falsy.
 *
 * A sheet used to be drawn while its state was set and gone the frame it was
 * cleared, so every one of them slid up and then simply vanished. This keeps
 * the last value on screen while the sheet slides back down, and says so, so
 * the caller can swap its arrival class for `.sheet-leaving`. A value that
 * comes back before the exit ends cancels it.
 */
export function useLeaving<T>(value: T): [T, boolean] {
  const [held, setHeld] = useState(value);
  const [leaving, setLeaving] = useState(false);

  // Adjusted during render rather than in an effect, so the frame that
  // clears the value is already the first frame of the exit.
  if (value && value !== held) {
    setHeld(value);
    if (leaving) setLeaving(false);
  } else if (!value && held && !leaving) {
    setLeaving(true);
  }

  useEffect(() => {
    if (!leaving) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(
      () => {
        setHeld(value);
        setLeaving(false);
      },
      still ? 0 : LEAVE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [leaving, value]);

  return [value ? value : held, leaving];
}

/**
 * The same thing as a wrapper, for a sheet written inline as
 * `{value && (...)}`. The render function gets the held value under the same
 * name, so the body of the sheet does not change.
 */
export default function Leaving<T>({
  value,
  children,
}: {
  value: T;
  children: (value: NonNullable<T>, leaving: boolean) => ReactNode;
}) {
  const [shown, leaving] = useLeaving(value);
  if (!shown) return null;
  return <>{children(shown as NonNullable<T>, leaving)}</>;
}
