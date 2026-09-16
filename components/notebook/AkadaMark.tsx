// Akada bookmark glyph: a page with two ruled lines on it, notched at the
// foot the way a bookmark is. It used to carry an italic "A" set in a serif
// the app no longer loads; the redesign draws the lines instead, so the mark
// is a drawing at every size rather than type that stops fitting below 20px.

interface Props {
  size?: number;
  className?: string;
  /** The page behind the rules. Transparent lets the paper show through. */
  fill?: string;
}

export default function AkadaMark({ size = 34, className, fill = 'var(--paper)' }: Props) {
  const w = size;
  const h = Math.round((size * 68) / 56);
  // The stroke thins as the mark grows, so a 62px welcome logo is not drawn
  // with the same heavy pen as a 22px one in the header.
  const stroke = size >= 48 ? 1.8 : 2;
  return (
    <svg width={w} height={h} viewBox="0 0 56 68" fill="none" aria-hidden className={className}>
      <path d="M6 4 H50 V60 L28 48 L6 60 Z" stroke="currentColor" strokeWidth={stroke} fill={fill} />
      <path
        d="M18 24 H38 M18 33 H32"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}
