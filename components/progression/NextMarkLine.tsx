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
 * It reads the sitting on the clock, so the distance moves while the reader
 * sits, and when the sitting crosses something the line says so and moves on
 * to the next thing in the same breath: "a mark inked on MATH · 38 minutes to
 * the next mark on MATH". What has landed is set in the ink; what is next is
 * a step softer. The landed part stays for the rest of the sitting, because
 * it is the sitting's own record and the log sheet will read it back.
 *
 * Silence is a feature. A line that is always present is wallpaper, and the
 * whole reason this reads as information rather than as a nag is that most of
 * the time it is simply not there.
 */
export default function NextMarkLine({
  surface,
  className = 'mb-6',
  night = false,
  onlyLanded = false,
  align = 'center',
}: {
  surface: 'today' | 'timer';
  className?: string;
  /** The open-mode timer inverts with literal values; this follows it. */
  night?: boolean;
  /**
   * Say only what the sitting has done, never what is next. For the one
   * screen that exists to hold a single thing and must not be given a second.
   */
  onlyLanded?: boolean;
  align?: 'center' | 'start';
}) {
  const { progression, sitting } = useProgression();
  const reading = progression?.nextMark ?? null;

  // The candidates that lost are logged next to the one that won. See
  // lib/progression/log.ts for why this is worth the two lines it costs.
  // logImpression writes once per shown line per day and no more, however
  // often the reading is re-read underneath it.
  useEffect(() => {
    if (!reading || onlyLanded) return;
    void logImpression(surface, reading);
  }, [surface, reading, onlyLanded]);

  const landed = sitting?.lines ?? [];
  const next = onlyLanded ? null : (reading?.shown?.line ?? null);
  if (landed.length === 0 && !next) return null;

  const strong = night ? '#EFE9DC' : 'var(--ink)';
  const soft = night ? '#C8C0B0' : 'var(--ink-soft)';
  const faint = night ? '#958D7E' : 'var(--muted-soft)';
  const justify =
    align === 'start' ? 'justify-start' : 'justify-center md:justify-start';

  return (
    <p
      className={`m-0 flex items-baseline gap-2.5 text-[13px] leading-[1.5] ${justify} ${className}`}
      style={{ color: soft }}
    >
      <span aria-hidden className="translate-y-[1px]" style={{ color: faint }}>
        <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
          <path
            d="M1.6 1.4v9.2M4.2 1.2v9.4M6.8 1.5v9.1M9.6 1.1L1 10.9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>
        {landed.map((line, i) => (
          <span key={line}>
            {i > 0 && ' · '}
            <span style={{ color: strong }}>{line}</span>
          </span>
        ))}
        {next && (
          <>
            {landed.length > 0 && ' · '}
            {next}
          </>
        )}
      </span>
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
