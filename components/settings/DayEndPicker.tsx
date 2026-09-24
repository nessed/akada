'use client';

import { useState } from 'react';
import HandNote from '@/components/notebook/HandNote';

/** The hours a day is allowed to run over into. Midnight is a plain day. */
const HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** How the chosen hour reads in a sentence. */
export function dayEndLabel(hour: number): string {
  if (hour <= 0) return 'midnight';
  return `${hour}:00 in the morning`;
}

/** How it reads in the row of choices: short, monospaced, a clock face. */
function markLabel(hour: number): string {
  return hour === 0 ? '12' : String(hour);
}

/**
 * The hour at which today becomes yesterday.
 *
 * This shipped as a label, a paragraph of explanation and a stock <select>
 * dropping the operating system's own list onto the page. It is a preference
 * about the reader's own hours, so it is written as a line about them: a
 * sentence with the hour marked in it, and the clock face underneath once the
 * line is touched. Nothing about what it stores has changed.
 */
export default function DayEndPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (hour: number) => void;
}) {
  const [open, setOpen] = useState(false);

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
      </button>

      {open && (
        <div className="animate-fade-in">
          <div className="mt-3.5 flex items-stretch gap-1">
            {HOURS.map((hour) => {
              const selected = hour === value;
              return (
                <button
                  key={hour}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={hour === 0 ? 'Midnight' : `${hour} in the morning`}
                  onClick={() => onChange(hour)}
                  className="flex-1 bg-transparent py-1.5 font-mono text-[13px] tabular-nums"
                >
                  <span className={selected ? 'hl-swipe text-ink' : 'text-muted'}>
                    {markLabel(hour)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 mb-0 text-right">
            <HandNote size={16} rotate={-1.5} color="var(--muted)">
              a session at 1am still counts as tonight
            </HandNote>
          </p>
        </div>
      )}
    </div>
  );
}
