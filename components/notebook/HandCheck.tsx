'use client';

// Hand-drawn check mark, paired with .scribble-box to give checkboxes a
// human, written-in feel rather than a pixel-perfect tick.

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Write the check in, as a pen would, rather than drawing it already there. */
  drawn?: boolean;
}

export default function HandCheck({
  size = 14,
  color = 'currentColor',
  strokeWidth = 1.6,
  drawn = false,
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
    </svg>
  );
}
