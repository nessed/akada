'use client';

import type { SpineDay } from '../notebook/WeekSpine';

/**
 * The week spine turned sideways, for a phone.
 *
 * Same seven days, same facts, but stacked vertically per day instead of
 * horizontally: tally strokes for hours already sat down, dots for what is
 * due, and the reader's own day ruled under its letter. It is the one place
 * in the app a whole week fits above the fold.
 */
export default function WeekStrip({ days }: { days: SpineDay[] }) {
  return (
    <div className="flex items-end justify-between border-b border-line pb-2.5">
      {days.map((day) => {
        const hours = Math.round(day.loggedSeconds / 3600);
        return (
          <span
            key={day.iso}
            className={`flex w-9 flex-col items-center gap-1.5 ${
              day.isPast && !day.isToday ? 'opacity-55' : ''
            }`}
          >
            <span aria-hidden className="flex h-5 items-end gap-[3px]">
              {hours > 0
                ? Array.from({ length: Math.min(hours, 4) }).map((_, i) => (
                    <i
                      key={i}
                      className="block w-[2px]"
                      style={{
                        height: day.isToday ? 15 : 11,
                        background: day.isToday ? 'var(--ink)' : 'var(--muted)',
                      }}
                    />
                  ))
                : day.items.slice(0, 3).map((item) => (
                    <i
                      key={item.id}
                      className="block h-[5px] w-[5px] rounded-full"
                      style={{ background: item.color }}
                    />
                  ))}
            </span>
            <span
              className={`text-[9px] uppercase tracking-[0.08em] ${
                day.isToday
                  ? 'border-b-[1.5px] border-ink pb-0.5 font-bold text-ink'
                  : day.items.length || hours
                    ? 'font-semibold text-muted'
                    : 'font-semibold text-muted-soft'
              }`}
            >
              {day.weekday.charAt(0)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
