'use client';

import { useEffect, useState } from 'react';
import type { DayBlock } from '@/lib/derive';
import { formatClock } from '@/lib/derive';

/**
 * The day on a line.
 *
 * Classes sit as tinted blocks along the top with the course's colour ruled
 * over them; the hours actually sat down for are a thin bar along the bottom.
 * A single ink hairline marks now. The point of drawing both on one axis is
 * that the gaps between classes become visible as gaps — which is where the
 * studying has to go.
 *
 * None of which a first-time reader can be expected to work out from the
 * picture, so the picture is not asked to carry it alone. A sentence above
 * the axis says how many classes there are and where the long free stretch
 * is, and every class is written out underneath with the hours it runs. A
 * 75-minute block on a fourteen-hour axis is around sixty pixels wide: it can
 * hold a course code and a start time and nothing else, which is why the full
 * "09:00 to 10:30" is set below the chart rather than inside the block.
 *
 * With fewer than two blocks there is nothing for an axis to show that the
 * sentence does not already say, so the chart is not drawn at all.
 */

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const SPAN = DAY_END - DAY_START;
/** Shorter than this and a gap is a corridor, not a stretch worth planning. */
const USEFUL_GAP = 45;

function place(minutes: number): number {
  return ((Math.min(DAY_END, Math.max(DAY_START, minutes)) - DAY_START) / SPAN) * 100;
}

const COUNTS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

function countWord(n: number): string {
  return COUNTS[n] ?? String(n);
}

/**
 * The day in a sentence. How many classes, and the longest run of free time
 * between them — or after the last one, when they are back to back.
 */
export function dayReading(blocks: DayBlock[]): string {
  const classes = blocks.filter((b) => b.kind === 'class').sort((a, b) => a.start - b.start);
  const n = classes.length;
  const first =
    n === 0
      ? 'No classes today.'
      : n === 1
        ? 'One class today.'
        : `${countWord(n)} classes today.`;
  if (n === 0) return first;

  let best: { start: number; end: number } | null = null;
  for (let i = 0; i < classes.length - 1; i += 1) {
    const gap = { start: classes[i].end, end: classes[i + 1].start };
    if (gap.end - gap.start < USEFUL_GAP) continue;
    if (!best || gap.end - gap.start > best.end - best.start) best = gap;
  }
  if (best) return `${first} Free from ${formatClock(best.start)} to ${formatClock(best.end)}.`;

  const last = classes[classes.length - 1].end;
  if (last < DAY_END - USEFUL_GAP) return `${first} Free after ${formatClock(last)}.`;
  return first;
}

export default function DayLine({ blocks }: { blocks: DayBlock[] }) {
  // Rendered only after mount: the marker's position depends on the clock,
  // and the server has a different one. Drawing it during render would give
  // React two different lines to reconcile on hydration.
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    };
    read();
    const id = window.setInterval(read, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const classes = blocks.filter((b) => b.kind === 'class');
  const study = blocks.filter((b) => b.kind === 'study');
  const nowPercent =
    nowMinutes !== null && nowMinutes >= DAY_START && nowMinutes <= DAY_END
      ? place(nowMinutes)
      : null;

  const reading = (
    <p className="m-0 font-serif text-[15px] leading-[1.5] text-ink-soft">{dayReading(blocks)}</p>
  );

  if (blocks.length < 2) return <div className="mt-3">{reading}</div>;

  return (
    <>
      <div className="mt-3">{reading}</div>

      <div className="relative mt-3 h-[104px] border-b border-line-strong">
        {/* The hours, ruled faintly the way squared paper is. */}
        <div aria-hidden className="absolute inset-0 flex">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="flex-1 border-l border-line-soft" />
          ))}
        </div>

        <div className="absolute inset-x-0 top-2 h-[42px]">
          {classes.map((block) => (
            <div
              key={block.id}
              className="absolute box-border h-full overflow-hidden px-2 py-[7px]"
              style={{
                left: `${place(block.start)}%`,
                width: `${Math.max(4, place(block.end) - place(block.start))}%`,
                background: `color-mix(in srgb, ${block.color} 22%, var(--paper))`,
                borderTop: `2px solid ${block.color}`,
              }}
            >
              {/* On a phone the whole axis is 346px wide and a class is a
                  40px band: a code set inside it truncates to "E…", which is
                  worse than no word at all. The band stays as the picture and
                  the list under the chart does the talking. */}
              <div className="hidden sm:block">
                <p className="m-0 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                  {block.label}
                </p>
                <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-ink-soft">
                  {formatClock(block.start)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* What was actually sat down for. */}
        <div className="absolute inset-x-0 bottom-4 h-[9px]">
          {study.map((block) => (
            <div
              key={block.id}
              className="absolute h-full"
              style={{
                left: `${place(block.start)}%`,
                width: `${Math.max(1, place(block.end) - place(block.start))}%`,
                background: block.color,
              }}
            />
          ))}
        </div>

        {nowPercent !== null && (
          <>
            <span
              aria-hidden
              className="absolute inset-y-0 w-[1.5px] bg-ink"
              style={{ left: `${nowPercent}%` }}
            />
            <span
              className="absolute -top-1 -translate-x-1/2 bg-bg px-1 font-mono text-[11px] font-bold text-ink"
              style={{ left: `${nowPercent}%` }}
            >
              {formatClock(nowMinutes as number)}
            </span>
          </>
        )}
      </div>

      <div aria-hidden className="mt-1.5 flex font-mono text-[11px] text-muted">
        {['08', '10', '12', '14', '16', '18', '20'].map((h) => (
          <span key={h} className="flex-1">
            {h}
          </span>
        ))}
        <span className="flex-none">22</span>
      </div>

      {/* Every block written out, because the chart cannot fit the times. */}
      <ul className="m-0 mt-3 list-none p-0">
        {blocks.map((block) => (
          <li key={block.id} className="flex items-baseline gap-2.5 py-1">
            <span
              aria-hidden
              className="block h-[11px] w-[3px] flex-none self-center"
              style={{ background: block.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
              {block.label}
              {block.kind === 'study' ? ' · sat down' : ''}
            </span>
            <span className="tnum flex-none font-mono text-[13px] text-ink-soft">
              {formatClock(block.start)} to {formatClock(block.end)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
