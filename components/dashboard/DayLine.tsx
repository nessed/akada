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
 */

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const SPAN = DAY_END - DAY_START;

function place(minutes: number): number {
  return ((Math.min(DAY_END, Math.max(DAY_START, minutes)) - DAY_START) / SPAN) * 100;
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

  return (
    <>
      <div className="relative mt-3 h-[96px] border-b border-line-strong">
        {/* The hours, ruled faintly the way squared paper is. */}
        <div aria-hidden className="absolute inset-0 flex">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="flex-1 border-l border-line-soft" />
          ))}
        </div>

        <div className="absolute inset-x-0 top-2 h-[34px]">
          {classes.map((block) => (
            <div
              key={block.id}
              className="absolute box-border h-full overflow-hidden px-2 py-1.5"
              style={{
                left: `${place(block.start)}%`,
                width: `${Math.max(4, place(block.end) - place(block.start))}%`,
                background: `color-mix(in srgb, ${block.color} 22%, var(--paper))`,
                borderTop: `2px solid ${block.color}`,
              }}
            >
              <p className="m-0 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
                {block.label}
              </p>
              <p className="m-0 mt-0.5 truncate font-mono text-[10px] text-ink-soft">
                {block.detail}
              </p>
            </div>
          ))}
        </div>

        {/* What was actually sat down for. */}
        <div className="absolute inset-x-0 bottom-4 h-[9px]">
          {study.map((block) => (
            <div
              key={block.id}
              title={`${block.label} · ${formatClock(block.start)}–${formatClock(block.end)}`}
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
              className="absolute -top-1 -translate-x-1/2 bg-bg px-1 font-mono text-[9.5px] font-bold text-ink"
              style={{ left: `${nowPercent}%` }}
            >
              {formatClock(nowMinutes as number)}
            </span>
          </>
        )}
      </div>

      <div aria-hidden className="mt-1.5 flex font-mono text-[9.5px] text-muted-soft">
        {['08', '10', '12', '14', '16', '18', '20'].map((h) => (
          <span key={h} className="flex-1">
            {h}
          </span>
        ))}
        <span className="flex-none">22</span>
      </div>
    </>
  );
}
