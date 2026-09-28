'use client';

import { Fragment, useState } from 'react';
import type { Rhythm } from '@/lib/stats-lens';
import { hourLabel } from '@/lib/progression';
import { formatHM } from '@/lib/utils';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const AXIS: Record<number, string> = { 0: '12a', 6: '6a', 12: '12p', 18: '6p' };
const DAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

/**
 * The week and the day at once: a row per weekday, a column per hour, each
 * cell inked as deep as the time that landed in it. The clock above says
 * when in the day; this says which evenings, which mornings. Each weekday's
 * whole hours sit at the end of its row, from every sitting, placed or not.
 */
export default function WeekRhythm({ rhythm, accent }: { rhythm: Rhythm; accent: string }) {
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null);
  const max = rhythm.peak?.seconds ?? 0;
  const dayMax = Math.max(1, ...rhythm.byWeekday);
  // Columns start at the hour the reader's day does; readings are wall hours.
  const reading = hover
    ? {
        day: hover.day,
        hour: (hover.hour + rhythm.startHour) % 24,
        seconds: rhythm.grid[hover.day][hover.hour],
      }
    : rhythm.peak;

  return (
    <div>
      <p className="m-0 min-h-[20px] font-serif text-[13px] italic text-muted">
        {reading && reading.seconds > 0 ? (
          <>
            {hover ? '' : 'fullest on '}
            <span className="not-italic text-ink">{DAY_NAMES[reading.day].toLowerCase()}</span>{' '}
            {hourLabel(reading.hour)} to {hourLabel((reading.hour + 1) % 24)} ·{' '}
            <span className="font-mono not-italic tabular-nums text-ink">{formatHM(reading.seconds)}</span>
          </>
        ) : hover ? (
          <>nothing at that hour</>
        ) : (
          <>the timer places a sitting on the grid; ones logged by hand count on their day</>
        )}
      </p>

      <div className="mt-3">
        <div className="grid grid-cols-[28px_minmax(0,1fr)_48px] items-center gap-x-2 gap-y-[3px] sm:grid-cols-[30px_minmax(0,1fr)_72px]">
          {DAYS.map((label, day) => (
            <Fragment key={label}>
              <span className="eyebrow text-[9px] text-muted">{label}</span>
              <span
                className="grid gap-[1px] sm:gap-[2px]"
                style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
                onMouseLeave={() => setHover(null)}
              >
                {rhythm.grid[day].map((sec, hour) => {
                  const intensity = max > 0 ? sec / max : 0;
                  return (
                    <span
                      key={hour}
                      onMouseEnter={() => setHover({ day, hour })}
                      onClick={() => setHover({ day, hour })}
                      className="heat-in block aspect-square rounded-[2px]"
                      style={{
                        animationDelay: `${day * 40 + hour * 6}ms`,
                        background: sec > 0 ? accent : 'var(--bg-tint)',
                        opacity: sec > 0 ? 0.2 + intensity * 0.8 : 0.7,
                        outline:
                          hover && hover.day === day && hover.hour === hour
                            ? '1.5px solid var(--ink)'
                            : undefined,
                      }}
                    />
                  );
                })}
              </span>
              {/* The weekday's whole hours, every sitting. */}
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="rule-draw hidden h-[3px] rounded-full sm:block"
                  style={{
                    width: Math.max(rhythm.byWeekday[day] > 0 ? 2 : 0, (rhythm.byWeekday[day] / dayMax) * 18),
                    background: 'var(--ink-soft)',
                  }}
                />
                <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-muted">
                  {rhythm.byWeekday[day] > 0 ? formatHM(rhythm.byWeekday[day]) : '·'}
                </span>
              </span>
            </Fragment>
          ))}
          <span />
          <span
            aria-hidden
            className="mt-1 grid"
            style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="whitespace-nowrap font-mono text-[9px] text-muted-soft">
                {AXIS[(h + rhythm.startHour) % 24] ?? ''}
              </span>
            ))}
          </span>
          <span />
        </div>
      </div>

      <p className="m-0 mt-3 font-serif text-[12px] italic text-muted-soft">
        from <span className="font-mono not-italic">{rhythm.placed}</span> timed{' '}
        {rhythm.placed === 1 ? 'sitting' : 'sittings'}
      </p>
    </div>
  );
}
