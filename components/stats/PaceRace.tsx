'use client';

import type { Pace, PaceAgainst } from '@/lib/stats-reading';
import { formatHM } from '@/lib/utils';
import HandNote from '@/components/notebook/HandNote';

const W = 300;
const H = 120;
const PAD_X = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const AGAINST: { key: PaceAgainst; label: string }[] = [
  { key: 'last', label: 'last week' },
  { key: 'usual', label: 'usual' },
  { key: 'best', label: 'best' },
];

/**
 * This week against another week, as two lines drawn on the same page. The
 * other week is last week unless the reader picks a usual week (the median
 * of every whole week before this one) or their best, which is what makes a
 * quiet last week stop being the only bar there is.
 *
 * The other week is pencilled in first, the whole of it, in the rule's colour.
 * This week is inked over it up to today, and today carries a dot. Where the
 * two stand today is joined by a short dashed stroke, so ahead or behind is
 * a distance you can see before it is a figure you read. Both lines are
 * running totals, so the only way either goes is up.
 */
export default function PaceRace({
  pace,
  accent = 'var(--ink)',
  choices,
  onAgainst,
}: {
  pace: Pace;
  accent?: string;
  /** Which other weeks can be raced. Omitted, the choice is not offered. */
  choices?: Record<PaceAgainst, boolean>;
  onAgainst?: (against: PaceAgainst) => void;
}) {
  const { thisWeek, lastWeek, todayIndex, lead, lastTotal, name } = pace;
  const now = thisWeek[todayIndex];
  const max = Math.max(3600, lastTotal, now) * 1.08;

  const x = (i: number) => PAD_X + (i / 6) * (W - PAD_X * 2);
  const y = (sec: number) => PAD_TOP + (1 - sec / max) * (H - PAD_TOP - PAD_BOTTOM);
  const line = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const ghostAt = lastWeek[todayIndex];
  const nothingYet = lastTotal === 0 && now === 0;

  let headline: React.ReactNode;
  let sub: string;
  if (nothingYet) {
    headline = <>a fresh week</>;
    sub = 'nothing on either side yet. the first session takes the lead';
  } else if (lead > 59) {
    headline = (
      <>
        <Figure>{formatHM(lead)}</Figure> ahead
      </>
    );
    sub =
      now >= lastTotal
        ? `already past all of ${name}'s ${formatHM(lastTotal)}`
        : `${formatHM(lastTotal - now)} more and you've beaten all of ${name}`;
  } else if (lead < -59) {
    headline = (
      <>
        <Figure>{formatHM(-lead)}</Figure> behind
      </>
    );
    sub = `${name} had ${formatHM(ghostAt)} by ${DAY_NAMES[todayIndex].toLowerCase()}. one session closes it`;
  } else {
    headline = <>neck and neck</>;
    sub = `${formatHM(now)} each by ${DAY_NAMES[todayIndex].toLowerCase()}. the next session breaks the tie`;
  }

  const offered = choices ? AGAINST.filter((a) => choices[a.key]) : [];

  return (
    <div>
      {onAgainst && offered.length > 1 && (
        <div className="mb-2.5 flex items-baseline gap-2.5 font-serif text-[12.5px] italic text-muted">
          <span>against</span>
          {offered.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onAgainst(a.key)}
              aria-pressed={pace.against === a.key}
              className={`bg-transparent px-0.5 transition-colors ${
                pace.against === a.key ? 'hl-swipe not-italic text-ink' : 'hover:text-ink-soft'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <p className="m-0 font-serif text-[22px] font-medium leading-tight tracking-[-0.01em] text-ink">
        {headline}
      </p>
      <p className="m-0 mt-1 font-serif text-[13px] italic text-muted">{sub}</p>

      <svg
        viewBox={`0 0 ${W} ${H + 16}`}
        className="mt-4 block h-auto w-full overflow-visible"
        role="img"
        aria-label={`This week ${formatHM(now)} so far, ${name} ${formatHM(ghostAt)} by the same day and ${formatHM(lastTotal)} in all.`}
      >
        {/* The ruled baseline, and a faint rule for each day. */}
        {DAYS.map((_, i) => (
          <line
            key={i}
            x1={x(i)}
            x2={x(i)}
            y1={PAD_TOP}
            y2={H - PAD_BOTTOM}
            stroke="var(--line-soft)"
            strokeWidth={1}
          />
        ))}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={H - PAD_BOTTOM}
          y2={H - PAD_BOTTOM}
          stroke="var(--line-strong)"
          strokeWidth={1}
        />

        {/* Last week, pencilled. */}
        <path
          d={line(lastWeek)}
          pathLength={1}
          className="ink-draw"
          fill="none"
          stroke="var(--muted-soft)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* This week, inked over it up to today. */}
        <path
          d={line(thisWeek.slice(0, todayIndex + 1))}
          pathLength={1}
          className="ink-draw"
          style={{ animationDelay: '0.45s' }}
          fill="none"
          stroke={accent}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* The gap between the two, today. */}
        {Math.abs(lead) > 59 && (
          <line
            className="pop-in"
            style={{ animationDelay: '1.3s' }}
            x1={x(todayIndex)}
            x2={x(todayIndex)}
            y1={y(ghostAt)}
            y2={y(now)}
            stroke={lead > 0 ? 'var(--sage)' : 'var(--warn)'}
            strokeWidth={1.5}
            strokeDasharray="2 3"
          />
        )}
        <circle
          className="pop-in"
          style={{ animationDelay: '1.1s' }}
          cx={x(todayIndex)}
          cy={y(ghostAt)}
          r={3.5}
          fill="var(--paper)"
          stroke="var(--muted-soft)"
          strokeWidth={1.4}
        />
        <circle
          className="pop-in"
          style={{ animationDelay: '1.45s' }}
          cx={x(todayIndex)}
          cy={y(now)}
          r={5}
          fill={accent}
        />
        <circle
          className="animate-tick"
          cx={x(todayIndex)}
          cy={y(now)}
          r={9}
          fill="none"
          stroke={accent}
          strokeWidth={1}
          opacity={0.5}
        />

        {DAYS.map((d, i) => (
          <text
            key={i}
            x={x(i)}
            y={H + 12}
            textAnchor="middle"
            className="font-mono"
            fontSize={9.5}
            fill={i === todayIndex ? 'var(--ink)' : 'var(--muted-soft)'}
            fontWeight={i === todayIndex ? 600 : 400}
          >
            {d}
          </text>
        ))}
      </svg>

      <div className="mt-1 flex items-center justify-end gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="block h-[2px] w-4 rounded-full" style={{ background: accent }} />
          <span className="font-serif italic">this week</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="block h-[2px] w-4 rounded-full bg-muted-soft" />
          <span className="font-serif italic">{name}</span>
        </span>
      </div>

      {lead > 59 && now >= lastTotal && lastTotal > 0 && (
        <HandNote className="mt-1" rotate={-3}>
          {name} is in the rear view
        </HandNote>
      )}
    </div>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[22px] font-semibold tabular-nums tracking-[-0.03em]">
      {children}
    </span>
  );
}
