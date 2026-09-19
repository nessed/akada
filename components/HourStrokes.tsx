'use client';

/**
 * Hours as strokes, not a percentage bar.
 *
 * A progress bar says "68%", which is a number the reader did not ask for and
 * cannot act on. One stroke per hour of the goal says "four of six", which is
 * the shape of the afternoon. A part-hour fills its stroke from the bottom,
 * the way a column of liquid does, so a glance reads the same as counting.
 *
 * Goals are not always whole hours, so the last stroke of an odd goal stands
 * for whatever is left of it; `strokes` caps how many are drawn on a narrow
 * card and the label beside it carries the exact figure either way.
 */

interface Props {
  /** Seconds logged. */
  seconds: number;
  /** The goal, in hours. Zero or less draws nothing. */
  goalHours: number;
  /** The course colour, or any ink the fill should take. */
  color?: string;
  /** Height of one stroke. */
  height?: number;
  /** Width of one stroke. */
  width?: number;
  /** Cap the count so a long goal does not overflow a narrow card. */
  max?: number;
  className?: string;
  /** Screen-reader text; without one the row is silent to a reader. */
  label?: string;
}

export default function HourStrokes({
  seconds,
  goalHours,
  color = 'var(--ink)',
  height = 28,
  width = 10,
  max = 12,
  className = '',
  label,
}: Props) {
  const goal = Math.max(0, goalHours);
  if (goal <= 0) return null;

  const total = Math.min(max, Math.max(1, Math.ceil(goal)));
  const hours = Math.max(0, seconds) / 3600;

  return (
    <div
      className={`flex items-end gap-1.5 ${className}`}
      style={{ height }}
      role="img"
      aria-label={label ?? `${hours.toFixed(1)} of ${goal} hours`}
    >
      {Array.from({ length: total }, (_, i) => {
        // How much of this particular hour is filled. Everything below the
        // logged total is solid, the hour the reader is inside is partial,
        // and everything above it is an empty outline.
        const filled = Math.min(1, Math.max(0, hours - i));
        const outlined = filled < 1;
        return (
          <span
            key={i}
            aria-hidden
            className="block shrink-0 rounded-[2px]"
            style={{
              width,
              height,
              border: outlined ? '1px solid var(--line)' : undefined,
              background:
                filled >= 1
                  ? color
                  : filled > 0
                    ? `linear-gradient(180deg, transparent ${(1 - filled) * 100}%, ${color} ${(1 - filled) * 100}%)`
                    : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * The same idea at list scale: short marks beside a course name, for the rail
 * and the week panel where a full stroke column would not fit.
 */
export function HourTicks({
  seconds,
  goalHours,
  color = 'var(--ink)',
  max = 8,
  label,
}: Pick<Props, 'seconds' | 'goalHours' | 'color' | 'max' | 'label'>) {
  return (
    <HourStrokes
      seconds={seconds}
      goalHours={goalHours}
      color={color}
      height={10}
      width={7}
      max={max}
      label={label}
    />
  );
}
