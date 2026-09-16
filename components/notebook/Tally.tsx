'use client';

/**
 * Tally strokes. The redesign counts hours the way a wall counts days: one
 * leaning stroke per hour, in ink for what was actually sat down for and in
 * the line colour for what is still owed. It replaces every progress bar in
 * the app — a bar says "73% complete", a tally says "you did four, you said
 * eight", which is the same fact without the arithmetic.
 *
 * The last stroke is allowed to be a stub: half an hour is half a mark, so a
 * row reads truthfully at a glance instead of rounding up to flatter the
 * reader.
 */

interface Props {
  /** Hours actually logged. Fractional, the remainder draws a short stroke. */
  hours: number;
  /** Hours wanted. Draws the goal mark, and ghost strokes up to it. */
  goal?: number | null;
  /** Height of a full stroke in px. */
  height?: number;
  /** Ink for the filled strokes. A course's colour, usually. */
  color?: string;
  /** Cap on how many strokes are drawn, so a big week cannot run off a row. */
  max?: number;
  gap?: number;
  width?: number;
  className?: string;
  /** Hidden when the reader has turned the marks in the margin off. */
  hidden?: boolean;
}

export default function Tally({
  hours,
  goal = null,
  height = 18,
  color = 'var(--ink)',
  max = 14,
  gap = 2.5,
  width = 2,
  className = '',
}: Props) {
  const done = Math.max(0, hours);
  const full = Math.floor(done);
  const remainder = done - full;

  // Ghost strokes only reach as far as the goal, and the whole row is capped:
  // past `max` the strokes would be thinner than the gaps between them.
  const wanted = goal && goal > 0 ? Math.ceil(goal) : 0;
  const drawn = Math.min(max, Math.max(full + (remainder > 0.08 ? 1 : 0), wanted));
  const marks: React.ReactNode[] = [];

  for (let i = 0; i < drawn; i += 1) {
    const isFull = i < full;
    const isStub = i === full && remainder > 0.08;
    if (!isFull && !isStub && i >= wanted) break;
    marks.push(
      <i
        key={i}
        className="tally-stroke"
        style={{
          width,
          height: isFull ? height : isStub ? Math.max(4, height * remainder) : height,
          background: isFull || isStub ? color : 'var(--line)',
        }}
      />,
    );
  }

  return (
    <span
      aria-hidden
      className={`flex items-end ${className}`}
      style={{ gap, height: goal ? height + 6 : height }}
    >
      {marks}
      {/* The goal mark: a taller stroke in the warn clay, set just past the
          last hour asked for. It is where the row was supposed to reach. */}
      {goal && goal > 0 && drawn >= Math.min(max, wanted) && (
        <b
          className="block"
          style={{
            width: 1.5,
            height: height + 6,
            marginLeft: 3,
            background: 'var(--warn)',
          }}
        />
      )}
    </span>
  );
}

/**
 * The same marks at a fixed count, for the places that are showing a small
 * number rather than a measurement: three strokes beside a quiet Monday.
 */
export function TallyCount({
  count,
  height = 13,
  color = 'var(--muted)',
  width = 2,
  gap = 2,
}: {
  count: number;
  height?: number;
  color?: string;
  width?: number;
  gap?: number;
}) {
  if (count <= 0) return null;
  return (
    <span aria-hidden className="flex items-end" style={{ gap }}>
      {Array.from({ length: Math.min(count, 12) }).map((_, i) => (
        <i key={i} className="tally-stroke" style={{ width, height, background: color }} />
      ))}
    </span>
  );
}
