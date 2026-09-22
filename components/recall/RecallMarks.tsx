import type { RecallVerdict } from '@/lib/data';
import type { CourseRecall } from '@/lib/recall';

/**
 * The marks recall is drawn with.
 *
 * A verdict is a hand mark rather than a colour: a tick for clear, a wave for
 * hazy, an open ring for gone. None of them is red and none of them is a
 * cross, see "No Alarmist Indicators": a thing that has slipped is the reason
 * recall exists, not a failure to be flagged.
 */
export function VerdictMark({
  verdict,
  size = 14,
  color = 'currentColor',
  strokeWidth = 1.5,
}: {
  verdict: RecallVerdict;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const path =
    verdict === 'clear'
      ? 'M2.5 8.2 Q5 11.5 6.5 12 Q9 9 13.5 3.5'
      : verdict === 'hazy'
        ? 'M1.8 8.6 Q3.6 5.4 5.4 8.2 T9 8.2 T12.6 8.2 T14.4 7.4'
        : // A ring drawn in one go that does not quite meet itself.
          'M8.6 3.2 C11.8 3.3 13.3 5.8 13 8.3 C12.7 11 10.4 12.9 7.8 12.8 C5 12.7 3 10.6 3.1 7.9 C3.2 5.5 4.9 3.6 7.2 3.3';
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path
        d={path}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * "In recall": a loop drawn in one stroke, coming back round on itself. Set
 * beside a step or a task that is being kept, in the margin where a tick
 * would be, and nowhere else.
 */
export function RecallGlyph({ size = 13, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path
        d="M12.6 6.2 C11.8 3.9 9.6 2.6 7.3 2.9 C4.6 3.3 2.7 5.8 3.1 8.5 C3.5 11.2 6 13.1 8.7 12.7 C10.4 12.4 11.8 11.3 12.4 9.8"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M12.9 3.4 L12.7 6.4 L9.9 5.6" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** The most strokes drawn in a row. Past this the count beside it carries it. */
const MAX_STROKES = 32;

/**
 * Where a course stands, drawn as one upright per thing kept.
 *
 * Pressed hard for the settled ones, clear on several separate days running;
 * inked for the ones clear last time; broken for hazy; and the paper's own
 * rule for the ones that went or have not been asked yet, which is the part
 * still between the reader and ready. The same uprights as the tally in a
 * course's margin, and for the same reason: "nine of fourteen" is a count of
 * things, and a percentage of them would be a number nobody can act on.
 */
export function RecallStrokes({
  recall,
  color,
  height = 12,
  className = '',
  trackColor = 'var(--line-strong)',
}: {
  recall: Pick<CourseRecall, 'settled' | 'clear' | 'hazy' | 'gone' | 'fresh' | 'kept'>;
  color: string;
  height?: number;
  className?: string;
  trackColor?: string;
}) {
  const marks: ('settled' | 'clear' | 'hazy' | 'gone' | 'new')[] = [
    ...Array<'settled'>(recall.settled).fill('settled'),
    ...Array<'clear'>(recall.clear).fill('clear'),
    ...Array<'hazy'>(recall.hazy).fill('hazy'),
    ...Array<'gone'>(recall.gone).fill('gone'),
    ...Array<'new'>(recall.fresh).fill('new'),
  ].slice(0, MAX_STROKES);
  if (marks.length === 0) return null;

  const gap = height * 0.42;
  const width = marks.length * gap + 2;
  return (
    <svg
      aria-hidden
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      {marks.map((mark, i) => {
        const x = 1 + i * gap;
        const on = mark === 'settled' || mark === 'clear' || mark === 'hazy';
        return (
          <line
            key={i}
            x1={x}
            y1={height * 0.1}
            x2={x + height * 0.05}
            y2={height * 0.9}
            stroke={on ? color : trackColor}
            strokeWidth={mark === 'settled' ? 2.4 : on ? 1.5 : 1}
            strokeLinecap="round"
            strokeDasharray={mark === 'hazy' ? '2 2' : mark === 'new' ? '1 2.2' : undefined}
          />
        );
      })}
    </svg>
  );
}
