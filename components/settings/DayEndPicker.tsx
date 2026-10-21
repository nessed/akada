'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import HandNote from '@/components/notebook/HandNote';
import { DAY_ENDING_HOUR_MAX } from '@/lib/student-day';

/** The hours a day is allowed to run over into. Midnight is a plain day. */
const HOURS = Array.from({ length: DAY_ENDING_HOUR_MAX + 1 }, (_, hour) => hour);

/** A line in the margin for each hour, said back when it is picked. */
const QUIPS: Record<number, string> = {
  0: 'a regular day',
  1: 'a session at 1am still counts as tonight',
  2: 'night owl',
  3: 'late one',
  4: 'ambitious',
  5: 'up all night',
  6: 'up all night',
  7: 'basically morning',
  8: 'basically morning',
  9: 'basically morning',
  10: 'sleeping in',
  11: 'nearly noon',
};

/** How the chosen hour reads in a sentence. */
export function dayEndLabel(hour: number): string {
  if (hour <= 0) return 'midnight';
  return `${hour}am`;
}

/** What the hour does, as a sitting the reader might actually have. */
function consequence(hour: number): string {
  if (hour <= 0) return 'A sitting past midnight goes on the new day.';
  const before = hour - 1;
  return `Monday at ${before === 0 ? 12 : before}:30am still counts to Sunday. Today shows those hours in pencil.`;
}

/** How it reads under the strip: a clock face, monospaced. */
function markLabel(hour: number): string {
  return hour === 0 ? '12' : String(hour);
}

/**
 * The hour at which today becomes yesterday.
 *
 * A sentence about the reader's own hours, with what it means for a real
 * sitting written under it. Touched, it opens onto the small hours as a strip
 * from midnight to noon drawn the way Today's ledger draws them: the hours
 * that still belong to the day before in pencil, a dashed line where the new
 * day starts. Tapping an hour moves the line there. It used to be a row of ten
 * bare digits with nothing to say which side of the pick was which.
 */
export default function DayEndPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (hour: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const marks = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (hour: number) => {
    const next = Math.max(0, Math.min(DAY_ENDING_HOUR_MAX, hour));
    onChange(next);
    marks.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') pick(value + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') pick(value - 1);
    else if (e.key === 'Home') pick(0);
    else if (e.key === 'End') pick(DAY_ENDING_HOUR_MAX);
    else return;
    e.preventDefault();
  };

  return (
    <div className="px-[18px] py-3.5 [&+*]:border-t [&+*]:border-line-soft">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 bg-transparent text-left"
      >
        <span className="flex-1 font-serif text-[15px] text-ink">
          My day ends at{' '}
          <span className="hl-swipe text-ink">{dayEndLabel(value)}</span>
        </span>
        <span className="eyebrow">{open ? 'Done' : 'Change'}</span>
      </button>
      <p className="m-0 mt-1 font-serif text-[12.5px] italic leading-snug text-muted">
        {consequence(value)}
      </p>

      {open && (
        <div className="animate-fade-in">
          <div
            role="radiogroup"
            aria-label="Day ends at"
            onKeyDown={onKeyDown}
            className="mt-4 flex"
          >
            {HOURS.map((hour) => {
              const selected = hour === value;
              const yesterdays = hour < value;
              return (
                <button
                  key={hour}
                  ref={(el) => {
                    marks.current[hour] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  aria-label={hour === 0 ? 'Midnight' : `${hour}am`}
                  onClick={() => pick(hour)}
                  className="group relative flex-1 bg-transparent pb-1 pt-2"
                >
                  <span
                    aria-hidden
                    className={`block h-[10px] ${hour === 0 ? 'rounded-l-[3px]' : ''} ${
                      hour === DAY_ENDING_HOUR_MAX ? 'rounded-r-[3px]' : ''
                    } ${yesterdays ? '' : 'bg-bg-tint'}`}
                    style={yesterdays ? { background: 'var(--ink-soft)', opacity: 0.45 } : undefined}
                  />
                  {selected && hour > 0 && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-0.5 h-[22px] border-l border-dashed border-ink-soft"
                    />
                  )}
                  <span
                    aria-hidden
                    className={`absolute left-0 top-[24px] -translate-x-1/2 font-mono text-[11px] tabular-nums ${
                      selected ? 'text-ink' : 'text-muted group-hover:text-ink-soft'
                    }`}
                  >
                    {selected ? <span className="hl-swipe">{markLabel(hour)}</span> : markLabel(hour)}
                  </span>
                  <span aria-hidden className="block h-4" />
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 mb-0 flex items-baseline justify-between gap-3">
            <span className="font-serif text-[12.5px] italic text-muted">
              {value > 0 ? 'pencil is the day before' : 'tap where your day starts'}
            </span>
            <HandNote size={16} rotate={-1.5} color="var(--muted)">
              {QUIPS[value] ?? QUIPS[1]}
            </HandNote>
          </p>
        </div>
      )}
    </div>
  );
}
