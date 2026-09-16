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
 *
 * The strokes are no longer asked to carry the fact on their own. Counting
 * marks is work, and on a first visit nobody knows what one stroke is worth,
 * so the row also says "4h of 8h" in mono beside them and the whole row
 * carries that sentence as its accessible name. The marks are the picture;
 * the words are the reading.
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
  /**
   * Whether the row writes its own "4h of 8h" beside the strokes. On by
   * default: the words are the reading and the marks are the picture. Turn it
   * off only where the same duration is already set larger next to the row,
   * which is the course header and the review's by-course list. The
   * accessible name stays either way.
   */
  reading?: boolean;
  /** Hidden when the reader has turned the marks in the margin off. */
  hidden?: boolean;
}

/** "4h" / "4h 30m" / "30m". Hours are what the tally counts, so hours lead. */
function hoursInWords(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "4h of 8h", or just "4h" where nothing was asked for. */
export function tallyReading(hours: number, goal?: number | null): string {
  const done = hoursInWords(hours);
  return goal && goal > 0 ? `${done} of ${hoursInWords(goal)}` : done;
}

export default function Tally({
  hours,
  goal = null,
  height = 18,
  color = 'var(--ink)',
  max = 14,
  gap = 2.5,
  width = 2,
  reading: showReading = true,
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

  const reading = tallyReading(hours, goal);

  return (
    <span
      role="img"
      aria-label={reading}
      className={`flex items-end gap-2.5 ${className}`}
    >
      <span
        aria-hidden
        className="flex items-end"
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
      {showReading && (
        <span aria-hidden className="tnum flex-none font-mono text-[13px] text-ink-soft">
          {reading}
        </span>
      )}
    </span>
  );
}

/**
 * The same marks at a fixed count, for the places that are showing a small
 * number rather than a measurement: three strokes beside a quiet Monday.
 *
 * This one stays decorative on purpose. It is never the only thing saying
 * how long something took — wherever it appears, the duration is written out
 * in words next to it, and the strokes are the second telling.
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
