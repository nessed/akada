'use client';

// Handwritten marginalia (Caveat). Used for streak counts, "do these first",
// "~ on track", and other off-grid annotations that make the UI feel less
// machine-generated.
//
// Honors `prefs.marginalia === false` by rendering null — call sites should
// wrap with the `useMarginalia()` helper or check the pref themselves.

interface Props {
  children: React.ReactNode;
  color?: string;
  size?: number;
  rotate?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function HandNote({
  children,
  color = 'var(--ink-soft)',
  size = 17,
  rotate = -2,
  className = '',
  style,
}: Props) {
  return (
    <span
      className={`font-hand inline-block ${className}`}
      style={{
        color,
        fontSize: size,
        lineHeight: 1.05,
        transform: `rotate(${rotate}deg)`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
