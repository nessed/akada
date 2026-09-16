'use client';

import { ChoiceLine, SettingToggleRow } from './SettingsPrimitives';
import { Eyebrow } from '@/components/notebook/Marks';
import { PAPER_TONES, type Density, type PaperTone, type Preferences } from '@/lib/preferences';

/**
 * Paper.
 *
 * The stock samples are the real values at a real size, drawn from
 * PAPER_TONES rather than hand-picked here, so a sample can never disagree
 * with the page it produces. Each one shows the three things a stock actually
 * changes: how the serif sits on it, how the mono sits on it, and what a
 * ruled line looks like.
 *
 * This replaces the old Appearance view, which asked four questions — tone,
 * dark mode, accent and heading font — where the redesign asks two. Night is
 * a stock like the others rather than a switch beside them, and there is one
 * serif now, so there is nothing to pick.
 */

const STOCKS: { value: PaperTone; label: string }[] = [
  { value: 'paper', label: 'Paper' },
  { value: 'warm', label: 'Warm' },
  { value: 'stone', label: 'Stone' },
  { value: 'night', label: 'Night' },
];

const ROOM: { value: Density; label: string; lines: number; gap: number }[] = [
  { value: 'airy', label: 'Airy', lines: 3, gap: 9 },
  { value: 'normal', label: 'Normal', lines: 4, gap: 6 },
  { value: 'tight', label: 'Tight', lines: 6, gap: 3.5 },
];

const DAY_END_HOURS = [0, 1, 2, 3, 4, 5] as const;

export default function PaperEditor({
  prefs,
  setPrefs,
}: {
  prefs: Preferences;
  setPrefs: (patch: Partial<Preferences>) => void;
}) {
  return (
    <div>
      <h1 className="m-0 font-serif text-[30px] font-normal leading-none tracking-[-0.03em] md:text-[38px]">
        Paper
      </h1>
      <p className="mt-3 max-w-[52ch] font-serif text-[15.5px] leading-[1.6] text-ink-soft">
        Pick the stock and how much room it gets. The samples are the real thing at real size.
      </p>

      <section className="rule-ink mt-7 pt-4">
        <Eyebrow className="mb-3.5">Stock</Eyebrow>
        <div className="flex flex-wrap gap-4">
          {STOCKS.map((stock) => {
            const tone = PAPER_TONES[stock.value];
            const chosen = prefs.paperTone === stock.value;
            return (
              <button
                key={stock.value}
                type="button"
                aria-pressed={chosen}
                onClick={() => setPrefs({ paperTone: stock.value })}
                className="w-[130px] bg-transparent text-left md:w-[150px]"
              >
                <span
                  className="box-border block h-[96px] px-3 py-2.5"
                  style={{
                    background: tone.bg,
                    border: chosen
                      ? `2px solid ${tone.ink}`
                      : `1px solid ${tone.line}`,
                  }}
                >
                  <span className="block font-serif text-[16px]" style={{ color: tone.ink }}>
                    Aa
                  </span>
                  <span
                    className="mt-1.5 block font-mono text-[10px]"
                    style={{ color: tone.muted }}
                  >
                    14:02
                  </span>
                  <span
                    className="mt-2 block"
                    style={{ borderTop: `1px dashed ${tone.line}` }}
                  />
                </span>
                <span
                  className={`mt-2 block text-[12.5px] ${chosen ? 'font-medium text-ink' : 'text-ink-soft'}`}
                >
                  {stock.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8 border-t border-line pt-4">
        <Eyebrow className="mb-3.5">Room to breathe</Eyebrow>
        {/* The choice is shown as line spacing, which is the thing it
            actually changes, rather than as the words Airy / Normal / Tight
            on their own. */}
        <div className="flex flex-wrap items-end gap-8">
          {ROOM.map((option) => {
            const chosen = prefs.density === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={chosen}
                onClick={() => setPrefs({ density: option.value })}
                className="flex flex-col items-start gap-2 bg-transparent"
              >
                <span
                  aria-hidden
                  className="flex w-[82px] flex-col"
                  style={{ gap: option.gap }}
                >
                  {Array.from({ length: option.lines }).map((_, i) => (
                    <i
                      key={i}
                      className="block h-[1.5px]"
                      style={{ background: chosen ? 'var(--ink)' : 'var(--line-strong)' }}
                    />
                  ))}
                </span>
                <span
                  className={`font-serif text-sm ${chosen ? 'hl-swipe text-ink' : 'text-muted'}`}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8 border-t border-line pt-1">
        <SettingToggleRow
          label="Marks in the margin"
          sub="Pencil notes, tally strokes, the drawn underlines"
          checked={prefs.marginalia}
          onChange={(next) => setPrefs({ marginalia: next })}
        />
        <SettingToggleRow
          label="The Sunday nudge"
          sub="One reminder when a week is ready to read back"
          checked={prefs.sundayNudge}
          onChange={(next) => setPrefs({ sundayNudge: next })}
        />
        <SettingToggleRow
          label="Hide weekends"
          sub="In the month and the week spine"
          checked={prefs.hideWeekends}
          onChange={(next) => setPrefs({ hideWeekends: next })}
        />

        <div className="row-rule flex flex-wrap items-center gap-4 py-3.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px]">The day ends at</span>
            <span className="mt-[3px] block text-[12px] text-muted">
              Late sessions still count as the day before
            </span>
          </span>
          <ChoiceLine
            options={DAY_END_HOURS}
            value={prefs.dayEndingHour as (typeof DAY_END_HOURS)[number]}
            onChange={(hour) => setPrefs({ dayEndingHour: hour })}
            format={(hour) => String(hour).padStart(2, '0')}
            className="flex-none font-mono"
          />
        </div>
      </section>
    </div>
  );
}
