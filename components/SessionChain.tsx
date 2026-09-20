'use client';

import type { SessionSegment } from '@/lib/data';

/**
 * One sitting as a row of marks.
 *
 * Blocks are strokes in the course colour, sized by how long they ran; the
 * breaks between them are the thin rules that separate them. The same
 * reasoning as `HourStrokes`: "two blocks of forty-five with ten in the
 * middle" is the shape of an afternoon, and there is no percentage anywhere
 * in it to read.
 *
 * Widths are proportional rather than absolute, so the row fills whatever it
 * is given and a short sitting is not a sliver in the corner. A floor of four
 * pixels keeps a two-minute break from vanishing between its neighbours.
 */

interface Props {
  segments: SessionSegment[];
  /** The course colour, or any ink the blocks should take. */
  color?: string;
  /** Ink for the breaks. The night screen passes its own. */
  restColor?: string;
  height?: number;
  className?: string;
  label?: string;
}

function minutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest > 0 ? `${h}h ${rest}m` : `${h}h`;
  }
  return `${Math.max(1, m)}m`;
}

/** What a reader hears instead of seeing it. */
export function describeChain(segments: SessionSegment[]): string {
  return segments
    .map((segment) =>
      segment.kind === 'focus'
        ? `${minutes(segment.seconds)} studying`
        : `${minutes(segment.seconds)} break`,
    )
    .join(', then ');
}

export default function SessionChain({
  segments,
  color = 'var(--ink)',
  restColor = 'var(--line-strong)',
  height = 9,
  className = '',
  label,
}: Props) {
  if (segments.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-[3px] ${className}`}
      style={{ height }}
      role="img"
      aria-label={label ?? describeChain(segments)}
    >
      {segments.map((segment, i) => {
        const rest = segment.kind === 'break';
        return (
          <span
            key={`${segment.kind}-${segment.ordinal}-${i}`}
            aria-hidden
            className="block min-w-[4px] shrink-0 rounded-[2px]"
            style={{
              flexGrow: Math.max(1, segment.seconds),
              flexBasis: 0,
              flexShrink: 1,
              height: rest ? Math.max(2, Math.round(height / 3)) : height,
              background: rest ? restColor : color,
            }}
          />
        );
      })}
    </div>
  );
}
