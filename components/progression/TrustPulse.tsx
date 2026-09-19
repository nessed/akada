'use client';

import { useEffect, useState } from 'react';
import { answerPulse, pulseIsDue, type PulseAnswer } from '@/lib/progression/pulse';

/**
 * The one question.
 *
 * "Does this term still feel like an honest record of your work?"
 *
 * It is here because the failure this design can actually suffer is not
 * cheating, it is drift: a progression layer that quietly starts inflating a
 * term because an inflated term retains better. That failure would look like
 * success on every other number in the product, and this is the only number
 * that would fall while the rest rose.
 *
 * It is a line with three words under it, dismissible, asked no more than
 * once a fortnight. Closing it is an answer too and is recorded as one.
 */
export default function TrustPulse({ termDays }: { termDays: number }) {
  const [due, setDue] = useState(false);
  const [answered, setAnswered] = useState(false);

  // Read on the client only: it depends on localStorage, and rendering it on
  // the server would flash the question at somebody who answered yesterday.
  useEffect(() => {
    setDue(pulseIsDue(termDays));
  }, [termDays]);

  if (!due || answered) return null;

  const answer = (value: PulseAnswer | null) => {
    setAnswered(true);
    void answerPulse(value);
  };

  return (
    <section className="mt-10 border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
        <p className="m-0 text-[13px] text-ink-soft">
          Does this term still feel like an honest record of your work?
        </p>

        <div className="flex items-center gap-4">
          {(['yes', 'mostly', 'no'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => answer(value)}
              className="hand-underline bg-transparent text-[13px] text-ink"
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            onClick={() => answer(null)}
            className="bg-transparent text-[12px] text-muted-soft"
          >
            not now
          </button>
        </div>
      </div>
    </section>
  );
}
