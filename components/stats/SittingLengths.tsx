'use client';

import type { Lengths } from '@/lib/stats-lens';
import { formatHM } from '@/lib/utils';

const TOP_PX = 124;

/**
 * Sittings sorted by how long they ran. The bar is how many sittings; the
 * figure under it is the hours that length carried, since twenty short
 * sittings and two long ones can hold the same afternoon. The length that
 * carried the most is inked; the rest are pencil.
 */
export default function SittingLengths({ lengths, accent }: { lengths: Lengths; accent: string }) {
  const top = Math.max(1, ...lengths.buckets.map((b) => b.n));
  const heavy = lengths.heaviest !== null ? lengths.buckets[lengths.heaviest] : null;

  if (lengths.n === 0) {
    return (
      <p className="m-0 py-3 font-serif text-[13px] italic text-muted-soft">
        No sittings in this stretch yet.
      </p>
    );
  }

  return (
    <div>
      <p className="m-0 font-serif text-[13px] italic text-muted">
        usually <span className="font-mono not-italic tabular-nums text-ink">{formatHM(lengths.median)}</span>
        {heavy && (
          <>
            {' · '}most hours come in{' '}
            <span className="not-italic text-ink">{bucketName(heavy.from, heavy.to)}</span> sittings
          </>
        )}
      </p>

      <div
        className="mt-4 grid grid-cols-7 items-end gap-1.5 border-b border-line"
        style={{ height: TOP_PX + 18 }}
        role="img"
        aria-label={lengths.buckets.map((b) => `${b.label}: ${b.n}`).join(', ')}
      >
        {lengths.buckets.map((b, i) => (
          <div key={b.label} className="flex flex-col items-center justify-end gap-1">
            <span className="font-mono text-[10px] tabular-nums text-muted">{b.n > 0 ? b.n : ''}</span>
            <span
              className="bar-grow block w-full max-w-[28px] rounded-t-[3px]"
              style={{
                height: b.n > 0 ? Math.max(3, Math.round((b.n / top) * TOP_PX)) : 1,
                background: b.n === 0 ? 'var(--line)' : i === lengths.heaviest ? accent : 'var(--line-strong)',
                animationDelay: `${120 + i * 60}ms`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5 text-center">
        {lengths.buckets.map((b) => (
          <span key={b.label} className="min-w-0">
            <span className="block font-mono text-[10px] text-ink-soft">{b.label}</span>
            <span className="block whitespace-nowrap font-mono text-[9.5px] tabular-nums text-muted-soft">
              {b.seconds > 0 ? compact(b.seconds) : '·'}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Hours carried, short enough to sit under a narrow bar: "16h" past ten. */
function compact(seconds: number): string {
  return seconds >= 10 * 3600 ? `${Math.round(seconds / 3600)}h` : formatHM(seconds);
}

function bucketName(from: number, to: number): string {
  const m = (s: number) => (s < 3600 ? `${s / 60}m` : s % 3600 === 0 ? `${s / 3600}h` : `${(s / 3600).toFixed(1)}h`);
  if (from === 0) return `under ${m(to)}`;
  if (to === Infinity) return `${m(from)} and longer`;
  return `${m(from)} to ${m(to)}`;
}
