'use client';

// Postmark-style stamp pill, slightly tilted, mono caps. Used on the Stats
// page header (e.g. "WK 17 / 18") and anywhere a "received" / dated mark is
// useful.

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function Stamp({ children, className = '', style }: Props) {
  return (
    <span className={`stamp ${className}`} style={style}>
      {children}
    </span>
  );
}
