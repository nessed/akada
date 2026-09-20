/**
 * Marks in the margin, drawn the way anybody counts by hand: four uprights
 * and a fifth struck across them.
 *
 * `total` is how many the page holds, `inked` how many are there. The rest
 * are drawn faintly rather than left out, so a page always shows its own
 * length and the reader can see what binding it would take without being
 * told a number.
 */
export default function TallyMarks({
  inked,
  total,
  size = 18,
  color = 'var(--ink)',
  className,
}: {
  inked: number;
  total: number;
  size?: number;
  color?: string;
  className?: string;
}) {
  const gates = Math.ceil(total / 5);
  const gateWidth = size * 0.85;
  const width = gates * gateWidth + (gates - 1) * (size * 0.3);
  const height = size;

  const strokes: { x1: number; y1: number; x2: number; y2: number; on: boolean }[] = [];

  for (let g = 0; g < gates; g++) {
    const left = g * (gateWidth + size * 0.3);
    const inGate = Math.min(5, total - g * 5);
    for (let i = 0; i < inGate; i++) {
      const index = g * 5 + i;
      const on = index < inked;
      if (i < 4) {
        const x = left + size * 0.12 + i * (size * 0.18);
        strokes.push({ x1: x, y1: height * 0.12, x2: x + size * 0.04, y2: height * 0.88, on });
      } else {
        // The fifth is the one struck across the other four.
        strokes.push({
          x1: left + size * 0.02,
          y1: height * 0.82,
          x2: left + size * 0.72,
          y2: height * 0.18,
          on,
        });
      }
    }
  }

  return (
    <svg
      aria-hidden
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      {strokes.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={s.on ? color : 'var(--line)'}
          strokeWidth={s.on ? 1.6 : 1}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
