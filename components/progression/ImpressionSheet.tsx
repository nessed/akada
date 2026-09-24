'use client';

import { useId } from 'react';
import type { Impression, Ladder } from '@/lib/progression';

/**
 * The impressions sheet.
 *
 * Each ladder is a rubber stamp, drawn as the mark it leaves: its name set
 * round the rim like a postmark, its own small emblem and colour, the figure
 * it counts in the middle, and an inner ring that fills toward the next rung.
 * The rungs already struck are the pips along the foot. A finished ladder is
 * pressed hard, double ringed and off the square; one under way is inked in
 * its colour with a wash behind it; one not started is a pencilled outline.
 *
 * Only the next rung is ever named, and the line under each stamp says what
 * it takes in plain words ("17 more hours for the 50h stamp"). The one
 * nearest to striking is pulled out and drawn large at the head of the sheet,
 * since that is the one a sitting this week could actually land.
 *
 * None of these confers any benefit. They do not feed the pages, the run or
 * Next Mark. They are a record, and the record is the reward.
 */

type Look = { color: string; tint: string; glyph: React.ReactNode };

const LOOKS: Record<string, Look> = {
  hours: {
    color: 'var(--peach)',
    tint: 'var(--peach-tint)',
    glyph: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
  },
  run: {
    color: 'var(--rose)',
    tint: 'var(--rose-tint)',
    glyph: <path d="M5 7l5 5-5 5M12 7l5 5-5 5" />,
  },
  pages: {
    color: 'var(--lav)',
    tint: 'var(--lav-tint)',
    glyph: (
      <>
        <path d="M8 5h9v13H8z" />
        <path d="M6 7v13h9" />
        <path d="M10.5 9h4M10.5 12h4" />
      </>
    ),
  },
  breadth: {
    color: 'var(--sky)',
    tint: 'var(--sky-tint)',
    glyph: (
      <>
        <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />
      </>
    ),
  },
  sitting: {
    color: 'var(--clay)',
    tint: 'var(--clay-tint)',
    glyph: <path d="M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8s8 3 8 8" />,
  },
  early: {
    color: 'var(--mint)',
    tint: 'var(--mint-tint)',
    glyph: (
      <>
        <path d="M5 7h14v12H5zM5 11h14M9 4.5v4M15 4.5v4" />
        <path d="M9.5 15l1.8 1.8 3.4-3.6" />
      </>
    ),
  },
  days: {
    color: 'var(--sage)',
    tint: 'var(--sage-tint)',
    glyph: <path d="M6 6v12M9.5 6v12M13 6v12M16.5 6v12M4 16.5L19 7.5" />,
  },
};

const FALLBACK: Look = {
  color: 'var(--ink-soft)',
  tint: 'var(--bg-tint)',
  glyph: <circle cx="12" cy="12" r="6" />,
};

/** What the next rung takes, in words. Only the next rung is ever named. */
function nextLine(ladder: Ladder, next: number): string {
  const left = Math.max(1, next - ladder.value);
  const s = (n: number, one: string, many: string) => `${n} more ${n === 1 ? one : many}`;
  switch (ladder.id) {
    case 'hours':
      return `${s(left, 'hour', 'hours')} for the ${next}h stamp`;
    case 'run':
      return `a run of ${next} weeks strikes it`;
    case 'pages':
      return `${s(left, 'page', 'pages')} bound for ${next}`;
    case 'breadth':
      return `${s(left, 'week', 'weeks')} touching every course`;
    case 'sitting':
      return `one ${next} hour sitting strikes it`;
    case 'early':
      return `${s(left, 'task', 'tasks')} done three days early`;
    case 'days':
      return `${s(left, 'study day', 'study days')} for ${next}`;
    default:
      return `${left} more for ${ladder.format(next)}`;
  }
}

interface Reading {
  impression: Impression;
  ladder: Ladder | undefined;
  look: Look;
  next: number | null;
  /** Share of the way from the last rung struck to the next, 0 to 1. */
  toward: number;
  line: string;
}

function read(impression: Impression, ladder: Ladder | undefined): Reading {
  const look = LOOKS[impression.id] ?? FALLBACK;
  if (!ladder || impression.complete) {
    return {
      impression,
      ladder,
      look,
      next: null,
      toward: 1,
      line: `all ${impression.rungs} struck`,
    };
  }
  const next = ladder.thresholds[impression.struck];
  const prev = impression.struck > 0 ? ladder.thresholds[impression.struck - 1] : 0;
  const toward = Math.min(1, Math.max(0, (ladder.value - prev) / Math.max(1, next - prev)));
  return { impression, ladder, look, next, toward, line: nextLine(ladder, next) };
}

export default function ImpressionSheet({
  ladders,
  impressions,
  fresh = null,
}: {
  ladders: Ladder[];
  impressions: Impression[];
  /** Rungs struck since the reader last opened the Record, by impression id. */
  fresh?: Map<string, number> | null;
}) {
  const filter = useId().replace(/:/g, '');
  const byId = new Map(ladders.map((l) => [l.id, l]));
  const readings = impressions.map((i) => read(i, byId.get(i.id)));

  // The one a sitting this week could actually land: furthest along toward
  // its next rung, ties to the one with the least left.
  const closest = readings
    .filter((r) => r.next !== null && r.ladder)
    .sort(
      (a, b) => b.toward - a.toward || a.next! - a.ladder!.value - (b.next! - b.ladder!.value),
    )[0];

  const rest = readings.filter((r) => r !== closest);

  return (
    <section className="deckle border border-line bg-paper px-[var(--density-gutter)] py-6">
      {/* The ink: a faint roughening, so a struck stamp reads as pressed
          rubber rather than a vector circle. */}
      <svg aria-hidden width="0" height="0" className="absolute">
        <filter id={filter}>
          <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="1.1" />
        </filter>
      </svg>

      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        {closest && (
          <div className="flex flex-col items-center border-b border-dashed border-line pb-7 text-center lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
            <p className="eyebrow m-0">Closest to striking</p>
            <div className="mt-4">
              <Stamp
                reading={closest}
                size={188}
                filter={filter}
                fresh={fresh?.has(closest.impression.id) ?? false}
                delay={0}
              />
            </div>
            <p className="m-0 mt-4 font-serif text-[20px] font-medium leading-tight text-ink">
              {closest.impression.name}
            </p>
            <p className="m-0 mt-1.5 font-serif text-[14px] italic leading-snug text-ink-soft">
              {closest.line}
            </p>
            <Toward reading={closest} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 xl:grid-cols-3">
          {rest.map((reading, i) => (
            <div
              key={reading.impression.id}
              className="flex min-w-0 flex-col items-center text-center"
            >
              <Stamp
                reading={reading}
                size={128}
                filter={filter}
                fresh={fresh?.has(reading.impression.id) ?? false}
                delay={120 + i * 80}
              />
              <p
                className={`m-0 mt-3 font-serif text-[15px] font-medium leading-snug ${
                  reading.impression.struck > 0 ? 'text-ink' : 'text-muted'
                }`}
              >
                {reading.impression.name}
              </p>
              <p className="m-0 mt-1 max-w-[190px] font-serif text-[12.5px] italic leading-snug text-muted">
                {reading.line}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** How far toward the next rung, as a ruled line with the two ends named. */
function Toward({ reading }: { reading: Reading }) {
  const { ladder, next, toward, look } = reading;
  if (!ladder || next === null) return null;
  return (
    <div className="mt-4 w-full max-w-[220px]">
      <div className="relative h-[3px] rounded-full bg-bg-tint">
        <span
          className="rule-draw absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${Math.max(4, toward * 100)}%`, background: look.color }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] tabular-nums text-muted">
        <span>{ladder.format(ladder.value)}</span>
        <span>{ladder.format(next)}</span>
      </div>
    </div>
  );
}

function Stamp({
  reading,
  size,
  filter,
  fresh,
  delay,
}: {
  reading: Reading;
  size: number;
  filter: string;
  fresh: boolean;
  delay: number;
}) {
  const { impression, ladder, look, toward } = reading;
  const started = impression.struck > 0 || (ladder?.value ?? 0) > 0;
  const struck = impression.struck > 0;
  const complete = impression.complete;
  const pathId = `${filter}-${impression.id}`;

  const ink = started ? look.color : 'var(--line-strong)';
  const text = struck ? 'var(--ink)' : started ? 'var(--ink-soft)' : 'var(--muted-soft)';
  // A steady tilt per stamp, so the sheet looks struck by hand and the same
  // stamp sits the same way on every visit.
  const tilt = complete ? -7 : ((impression.id.charCodeAt(0) * 7) % 9) - 4;

  // The figure in the middle: where the count stands, or the last rung.
  const figure = ladder
    ? complete
      ? impression.mark
      : ladder.format(ladder.value)
    : impression.mark;

  // Pips along the foot, one a rung, spread over the bottom of the rim.
  const pips = Array.from({ length: impression.rungs }, (_, i) => {
    const spread = Math.min(70, impression.rungs * 14);
    const angle =
      90 + (impression.rungs === 1 ? 0 : spread / 2 - (spread * i) / (impression.rungs - 1));
    const rad = (angle * Math.PI) / 180;
    return {
      x: 60 + Math.cos(rad) * 45.5,
      y: 60 + Math.sin(rad) * 45.5,
      on: i < impression.struck,
    };
  });

  // The inner ring, filling toward the next rung from the top.
  const arc = complete ? 1 : toward;

  return (
    <span className="relative inline-block">
      <svg
        role="img"
        aria-label={`${impression.name}: ${impression.struck} of ${impression.rungs} struck`}
        width={size}
        height={size}
        viewBox="0 0 120 120"
        className={`${fresh ? 'stamp-down' : 'deal-in'} block`}
        style={{
          rotate: `${tilt}deg`,
          animationDelay: `${fresh ? delay + 500 : delay}ms`,
          opacity: started ? 1 : 0.85,
        }}
      >
        <defs>
          <path id={`${pathId}-top`} d="M 21 60 A 39 39 0 0 1 99 60" />
        </defs>

        {started && <circle cx="60" cy="60" r="55" fill={look.tint} />}

        <g filter={struck ? `url(#${filter})` : undefined}>
          <circle
            cx="60"
            cy="60"
            r="56"
            fill="none"
            stroke={ink}
            strokeWidth={complete ? 2.6 : started ? 2 : 1.3}
            strokeDasharray={started ? undefined : '3 3'}
          />
          {complete && (
            <circle cx="60" cy="60" r="51.5" fill="none" stroke={ink} strokeWidth="1.2" />
          )}

          {/* Track and fill for the next rung. */}
          <circle
            cx="60"
            cy="60"
            r="31"
            fill="none"
            stroke={started ? 'var(--line)' : 'var(--line-soft)'}
            strokeWidth="3"
          />
          {arc > 0 && (
            <circle
              cx="60"
              cy="60"
              r="31"
              fill="none"
              stroke={ink}
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${Math.max(1.5, arc * 100)} 100`}
              transform="rotate(-90 60 60)"
            />
          )}

          {pips.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={2.1}
              fill={p.on ? ink : 'none'}
              stroke={p.on ? 'none' : started ? ink : 'var(--line-strong)'}
              strokeWidth="1"
            />
          ))}
        </g>

        <text
          fill={text}
          fontSize="7.4"
          fontWeight="600"
          letterSpacing="1.3"
          style={{ fontFamily: 'var(--font-sans), Inter, sans-serif', textTransform: 'uppercase' }}
        >
          <textPath href={`#${pathId}-top`} startOffset="50%" textAnchor="middle">
            {impression.name}
          </textPath>
        </text>

        <g
          transform="translate(52.5 37) scale(0.62)"
          fill="none"
          stroke={started ? 'var(--ink-soft)' : 'var(--muted-soft)'}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {look.glyph}
        </g>

        <text
          x="60"
          y="72"
          textAnchor="middle"
          fill={text}
          fontSize={figure.length > 4 ? 13 : 16}
          fontWeight="600"
          style={{ fontFamily: 'var(--font-mono), monospace', fontVariantNumeric: 'tabular-nums' }}
        >
          {figure}
        </text>
      </svg>

      {fresh && (
        <span
          className="stamp stamp-down absolute -right-2 -top-1"
          style={{
            animationDelay: `${delay + 900}ms`,
            color: 'var(--warn)',
            borderColor: 'var(--warn)',
            background: 'var(--paper)',
          }}
        >
          New
        </span>
      )}
    </span>
  );
}
