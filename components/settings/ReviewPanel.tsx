'use client';

import { ChoiceLine, SettingToggleRow } from './SettingsPrimitives';
import { Eyebrow } from '@/components/notebook/Marks';
import type { Preferences } from '@/lib/preferences';

const DAYS = [-1, 0, 1, 2, 3, 4, 5, 6] as const;
const DAY_NAMES: Record<number, string> = {
  [-1]: 'never',
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

/**
 * When the week gets read back.
 *
 * This is the only scheduled thing in Akada, and "never" is a first-class
 * answer rather than something buried: a reader who does not want the ritual
 * turns it off here and the dot beside Review never appears again.
 */
export default function ReviewPanel({
  prefs,
  setPrefs,
}: {
  prefs: Preferences;
  setPrefs: (patch: Partial<Preferences>) => void;
}) {
  return (
    <div>
      <h1 className="m-0 font-serif text-[30px] font-normal leading-none tracking-[-0.03em] md:text-[38px]">
        The review
      </h1>
      <p className="mt-3 max-w-[52ch] font-serif text-[15.5px] leading-[1.6] text-ink-soft">
        One page at the end of a week: where the hours went, what moved, and one question. It
        takes about two minutes and nothing happens if you skip it.
      </p>

      <section className="rule-ink mt-7 pt-4">
        <Eyebrow className="mb-3">Read the week back on</Eyebrow>
        <ChoiceLine
          options={DAYS}
          value={prefs.reviewDay as (typeof DAYS)[number]}
          onChange={(day) => setPrefs({ reviewDay: day })}
          format={(day) => DAY_NAMES[day]}
        />
        <p className="mt-4 font-serif text-[13.5px] italic leading-[1.5] text-muted">
          {prefs.reviewDay < 0
            ? 'Review is still there whenever you want it. It just will not ask.'
            : `${DAY_NAMES[prefs.reviewDay]} evening, one page: where the week went and one thing to change.`}
        </p>
      </section>

      <section className="mt-7 border-t border-line pt-1">
        <SettingToggleRow
          label="The Sunday nudge"
          sub="A dot beside Review when a week is ready to read back"
          checked={prefs.sundayNudge}
          onChange={(next) => setPrefs({ sundayNudge: next })}
        />
      </section>
    </div>
  );
}
