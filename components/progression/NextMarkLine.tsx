'use client';

import { useEffect } from 'react';
import { useProgression } from '@/lib/progression/use-progression';
import { logImpression } from '@/lib/progression/log';

/**
 * Next Mark, as it appears on Today and on Timer.
 *
 * One line. Lowercase, factual, no praise and no urgency. It names the
 * nearest true thing and then gets out of the way: no box, no colour, no
 * count of anything lost, and nothing at all when there is nothing near
 * enough to be worth saying.
 *
 * Silence is a feature. A line that is always present is wallpaper, and the
 * whole reason this reads as information rather than as a nag is that most of
 * the time it is simply not there.
 */
export default function NextMarkLine({
  surface,
  className = 'mb-6',
}: {
  surface: 'today' | 'timer';
  className?: string;
}) {
  const { progression } = useProgression();
  const reading = progression?.nextMark ?? null;

  // The candidates that lost are logged next to the one that won. See
  // lib/progression/log.ts for why this is worth the two lines it costs.
  useEffect(() => {
    if (!reading) return;
    void logImpression(surface, reading);
  }, [surface, reading]);

  if (!reading?.shown) return null;

  return (
    <p
      className={`m-0 flex items-baseline justify-center gap-2.5 text-[13px] leading-[1.5] text-ink-soft md:justify-start ${className}`}
    >
      <span aria-hidden className="translate-y-[1px] text-muted-soft">
        <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
          <path
            d="M1.6 1.4v9.2M4.2 1.2v9.4M6.8 1.5v9.1M9.6 1.1L1 10.9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>{reading.shown.line}</span>
    </p>
  );
}

/**
 * The same reading, for a page that has already computed the progression and
 * does not want a second pass over the term.
 */
export function NextMarkText({ line }: { line: string }) {
  return <span className="text-[13px] leading-[1.5] text-ink-soft">{line}</span>;
}
