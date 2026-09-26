'use client';

// Hand-drawn check mark, paired with .scribble-box to give checkboxes a
// human, written-in feel rather than a pixel-perfect tick.

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Write the check in, as a pen would, rather than drawing it already there. */
  drawn?: boolean;
  /**
   * Struck through: a task taken off the list without being done. The same
   * check with a pen line across it, never a cross and never red.
   */
  struck?: boolean;
}

export default function HandCheck({
  size = 14,
  color = 'currentColor',
  strokeWidth = 1.6,
  drawn = false,
  struck = false,
}: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 8 Q5 11.5 6.5 12 Q9 9 13.5 3.5"
        pathLength={drawn ? 1 : undefined}
        className={drawn ? 'check-draw' : undefined}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {struck && (
        <path
          d="M1.5 10.5 Q8 8.2 14.5 6.5"
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
