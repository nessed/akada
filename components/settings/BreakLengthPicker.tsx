'use client';

import { useState } from 'react';
import HandNote from '@/components/notebook/HandNote';
import { BREAK_LENGTHS } from '@/lib/session-safety';

/** Zero is "no break": a block that ends simply carries on counting. */
const CHOICES = [0, ...BREAK_LENGTHS];

/** How the choice reads in a sentence. */
export function breakLengthLabel(minutes: number): string {
  return minutes <= 0 ? 'keeps going' : `${minutes} minutes off`;
}

/**
 * How long the rest after a block runs.
 *
 * Written as a line about the reader's own habit rather than a labelled
 * field with a dropdown on it, the same way `DayEndPicker` is: the marks
 * only appear once the line has been touched, so the panel stays a page of
 * sentences until something is being changed.
 *
 * "None" sits in the row beside the lengths rather than as a separate switch,
 * because turning breaks off and choosing how long they run are the same
 * decision, and splitting them into two controls would ask it twice.
 */
export default function BreakLengthPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
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
          A block that ends{' '}
          <span className="hl-swipe text-ink">{breakLengthLabel(value)}</span>
        </span>
      </button>

      {open && (
        <div className="animate-fade-in">
          <div className="mt-3.5 flex items-stretch gap-1" role="radiogroup">
            {CHOICES.map((minutes) => {
              const selected = minutes === value;
              return (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={
                    minutes === 0 ? 'No break' : `${minutes} minute break`
                  }
                  onClick={() => onChange(minutes)}
                  className="flex-1 bg-transparent py-1.5 text-[13px] font-medium"
                >
                  <span className={selected ? 'hl-swipe text-ink' : 'text-muted'}>
                    {minutes === 0 ? 'None' : `${minutes}m`}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 mb-0 text-right">
            <HandNote size={16} rotate={-1.5} color="var(--muted)">
              breaks are counted, never added to your hours
            </HandNote>
          </p>
        </div>
      )}
    </div>
  );
}
