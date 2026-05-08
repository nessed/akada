'use client';

// Akada bookmark monogram — used in the auth screen, onboarding welcome,
// and as a small wordmark anywhere we want the brand glyph.

interface Props {
  size?: number;
  letter?: string;
  className?: string;
}

export default function AkadaMark({ size = 34, letter = 'A', className }: Props) {
  const w = size;
  const h = Math.round((size * 68) / 56);
  return (
    <svg width={w} height={h} viewBox="0 0 56 68" fill="none" aria-hidden className={className}>
      <path
        d="M6 4 H50 V60 L28 48 L6 60 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="var(--paper)"
      />
      <text
        x="28"
        y="33"
        textAnchor="middle"
        fontFamily="var(--font-cormorant), 'Cormorant Garamond', Georgia, serif"
        fontSize="22"
        fontStyle="italic"
        fontWeight="500"
        fill="currentColor"
      >
        {letter}
      </text>
    </svg>
  );
}
