'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@/lib/data';
import { isoDate, formatHM } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';

interface Props {
  sessions: Session[];
  accent: string;
  weeks?: number;
  hideWeekends?: boolean;
}

const CELL = 14;
const GAP = 4;
const ROW_LABELS: Record<number, string> = { 0: 'M', 2: 'W', 4: 'F' };

/**
 * Every day of the last few months as a square, inked as deep as the day's
 * hours. A day with nothing on it is the paper's tint, drawn rather than
 * left out, so a gap reads as a gap: at 8% opacity it vanished on the night
 * paper and the grid looked half printed. Months are named over the week
 * they start in, and the strip opens scrolled to today.
 */
export default function Heatmap({ sessions, accent, weeks = 13, hideWeekends }: Props) {
  const [reading, setReading] = useState<{ iso: string; sec: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  const { cells, max, active } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = weeks * 7;

    const start = new Date(today);
    const dow = (start.getDay() + 6) % 7; // Mon = 0
    start.setDate(start.getDate() - dow - (weeks - 1) * 7);

    const byDate: Record<string, number> = {};
    for (const s of sessions) {
      if (isLoggableDuration(s.durationSeconds)) {
        byDate[s.date] = (byDate[s.date] || 0) + clampSessionSeconds(s.durationSeconds);
      }
    }

    const out: {
      iso: string;
      sec: number;
      future: boolean;
      dow: number;
      month: number;
      day: number;
    }[] = [];
    let max = 0;
    let active = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = isoDate(d);
      const sec = byDate[iso] || 0;
      if (sec > max) max = sec;
      if (sec > 0) active += 1;
      out.push({ iso, sec, future: d > today, dow: (d.getDay() + 6) % 7, month: d.getMonth(), day: d.getDate() });
    }
    return { cells: out, max, active };
  }, [sessions, weeks]);

  const todayIso = isoDate();
  // A month is named over the first week that holds its first day.
  const monthAt = (w: number): string | null => {
    const week = cells.slice(w * 7, w * 7 + 7);
    const first = week.find((c) => c.day === 1);
    if (!first && w !== 0) return null;
    // The first column names its month only when the next one does not
    // start straight after it, or the two names run into each other.
    if (!first && cells.slice(7, 21).some((c) => c.day === 1)) return null;
    const cell = first ?? week[0];
    return new Date(cell.iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short' });
  };

  const level = (sec: number) => (max > 0 ? sec / max : 0);

  return (
    <div>
      <div ref={scroller} className="overflow-x-auto app-scroll">
        <div className="inline-grid" style={{ gridTemplateColumns: `18px repeat(${weeks}, ${CELL}px)`, columnGap: GAP }}>
          <span />
          {Array.from({ length: weeks }).map((_, w) => (
            <span key={w} className="h-4 whitespace-nowrap font-serif text-[10.5px] italic leading-none text-muted">
              {monthAt(w)}
            </span>
          ))}

          <span className="flex flex-col" style={{ gap: GAP }} aria-hidden>
            {Array.from({ length: 7 }).map((_, d) => (
              <span key={d} className="eyebrow text-[8.5px] leading-[14px] text-muted-soft" style={{ height: CELL }}>
                {hideWeekends && d >= 5 ? '' : ROW_LABELS[d] ?? ''}
              </span>
            ))}
          </span>
          {Array.from({ length: weeks }).map((_, w) => (
            <div key={w} className="flex flex-col" style={{ gap: GAP }}>
              {Array.from({ length: 7 }).map((_, d) => {
                const cell = cells[w * 7 + d];
                if (!cell || cell.future || (hideWeekends && cell.dow >= 5)) {
                  return <span key={d} style={{ width: CELL, height: CELL }} />;
                }
                const isToday = cell.iso === todayIso;
                const picked = reading?.iso === cell.iso;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={`${cell.iso} · ${formatHM(cell.sec)}`}
                    onClick={() => setReading({ iso: cell.iso, sec: cell.sec })}
                    // The page inks in a week at a time, oldest first, so the
                    // term reads as having been written rather than printed.
                    className="heat-in"
                    style={{
                      animationDelay: `${w * 45 + d * 14}ms`,
                      outline: isToday || picked ? '1.5px solid var(--ink)' : undefined,
                      outlineOffset: isToday || picked ? 1.5 : undefined,
                      width: CELL,
                      height: CELL,
                      borderRadius: 3,
                      background: cell.sec === 0 ? 'var(--bg-tint)' : accent,
                      opacity: cell.sec === 0 ? 1 : 0.28 + level(cell.sec) * 0.72,
                      border: 'none',
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="m-0 min-h-[16px] font-serif text-[12.5px] italic text-muted">
          {reading ? (
            <span className="animate-fade-in">
              {new Date(reading.iso + 'T12:00:00').toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
              <span className="ml-2 font-mono not-italic tabular-nums text-ink">
                {reading.sec > 0 ? formatHM(reading.sec) : 'nothing logged'}
              </span>
            </span>
          ) : (
            <>
              <span className="font-mono not-italic tabular-nums text-ink">{active}</span>{' '}
              {active === 1 ? 'day' : 'days'} with time on them · tap one to read it
            </>
          )}
        </p>
        <span className="flex items-center gap-1.5 font-serif text-[11px] italic text-muted-soft" aria-hidden>
          less
          {[0, 0.25, 0.5, 0.75, 1].map((l) => (
            <span
              key={l}
              className="block h-[10px] w-[10px] rounded-[2px]"
              style={{ background: l === 0 ? 'var(--bg-tint)' : accent, opacity: l === 0 ? 1 : 0.28 + l * 0.72 }}
            />
          ))}
          more
        </span>
      </div>
    </div>
  );
}
