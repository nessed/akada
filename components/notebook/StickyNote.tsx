'use client';

// Butter-yellow sticky note with optional tape strip. Used at the bottom of
// task lists or Stats sections to break the grid and add a hand-pinned feel.

interface Props {
  children: React.ReactNode;
  tilt?: 'l' | 'r' | 'l2' | 'r2';
  withTape?: boolean;
  tapeOffset?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function StickyNote({
  children,
  tilt = 'r2',
  withTape = true,
  tapeOffset = '40%',
  className = '',
  style,
}: Props) {
  return (
    <div className={`sticky tilt-${tilt} relative px-[18px] py-[14px] ${className}`} style={style}>
      {withTape && (
        <span className="tape" style={{ position: 'absolute', top: -12, left: tapeOffset }} />
      )}
      <div className="font-hand text-[18px] leading-[1.25] text-ink">{children}</div>
    </div>
  );
}
