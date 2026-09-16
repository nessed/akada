'use client';

import { usePreferences } from '@/lib/preferences';

/**
 * Marks in the margin, drawn in pencil rather than typed in a script face.
 *
 * The app used to write its marginalia in Caveat, which is a font pretending
 * to be handwriting — at small sizes it reads as a quirky UI font, not as
 * something a person left on the page. These are strokes instead: a squiggle,
 * a wave under a link, a circle round a date. Nothing here carries meaning on
 * its own, so all of it is aria-hidden and all of it disappears when the
 * reader turns "Marks in the margin" off in Settings.
 */

type Mark = 'squiggle' | 'wave' | 'circle' | 'arrow' | 'down';

interface Props {
  mark?: Mark;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  opacity?: number;
}

const PATHS: Record<Mark, { d: string; box: string; extra?: string }> = {
  // The loose scribble that sits at the foot of the rail.
  squiggle: { box: '0 0 30 26', d: 'M3 20 C7 9, 11 22, 15 12 S23 18, 27 6' },
  // A hand-drawn rule under something worth reading back.
  wave: { box: '0 0 150 7', d: 'M2 4 Q30 1 58 3 T114 4 T148 3' },
  // Round a date on the calendar. Not quite closed, the way a real one isn't.
  circle: { box: '0 0 70 30', d: 'M8 15 C8 6, 62 5, 62 15 C62 25, 8 26, 8 15' },
  // Points off toward whatever comes next.
  arrow: {
    box: '0 0 190 64',
    d: 'M4 52 C40 48, 52 16, 86 20 S150 44, 184 12',
    extra: 'M172 10 L184 12 L178 22',
  },
  // Drops onto a day in the term bars: the exam is here.
  down: { box: '0 0 18 24', d: 'M9 2 L9 20 M4 15 L9 21 L14 15' },
};

export default function Marginalia({
  mark = 'squiggle',
  width,
  height,
  color = 'var(--muted-soft)',
  className,
  style,
  opacity = 1,
}: Props) {
  const [prefs] = usePreferences();
  if (!prefs.marginalia) return null;

  const spec = PATHS[mark];
  const [, , boxW, boxH] = spec.box.split(' ').map(Number);
  const w = width ?? boxW;
  const h = height ?? Math.round((w * boxH) / boxW);

  return (
    <svg
      width={w}
      height={h}
      viewBox={spec.box}
      fill="none"
      aria-hidden
      className={className}
      style={{ opacity, ...style }}
    >
      <path d={spec.d} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      {spec.extra && (
        <path
          d={spec.extra}
          stroke={color}
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
