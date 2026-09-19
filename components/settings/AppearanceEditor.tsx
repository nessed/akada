'use client';

import BackButton from '@/components/BackButton';
import HandCheck from '@/components/notebook/HandCheck';
import {
  PAPER_TONES,
  type Density,
  type HeadingFont,
  type PaperTone,
  type Preferences,
  type PrimaryAccent,
} from '@/lib/preferences';
import {
  ChoiceCell,
  SectionHeading,
  VIEW_PADDING,
  FIELD_RADIUS,
} from './SettingsPrimitives';

/**
 * Appearance asks one question about colour, and the answer is which paper
 * the reader works on. Night is the fifth paper, not a switch beside the
 * other four: a separate "dark mode" toggle asked the same question a second
 * time and gave a second answer that could contradict the first.
 */
const PAPER_OPTIONS: { v: PaperTone; l: string; note?: string }[] = [
  { v: 'warm', l: 'Warm' },
  { v: 'paper', l: 'Paper' },
  { v: 'stone', l: 'Stone' },
  { v: 'white', l: 'White' },
  { v: 'night', l: 'Night', note: 'the same page, under a lamp' },
];

const FONT_OPTIONS: { v: HeadingFont; l: string; family: string }[] = [
  { v: 'cormorant', l: 'Cormorant', family: 'var(--font-cormorant), serif' },
  { v: 'fraunces', l: 'Fraunces', family: 'var(--font-fraunces), serif' },
  { v: 'lora', l: 'Lora', family: 'var(--font-lora), serif' },
  { v: 'merriweather', l: 'Merri.', family: 'var(--font-merriweather), serif' },
];

const DENSITY_OPTIONS: { v: Density; l: string }[] = [
  { v: 'cozy', l: 'Cozy' },
  { v: 'comfy', l: 'Comfy' },
  { v: 'compact', l: 'Compact' },
];

const PRIMARY_OPTIONS: { v: PrimaryAccent; l: string; color: string }[] = [
  { v: 'classic', l: 'Ink', color: 'var(--ink)' },
  { v: 'green', l: 'Sage', color: 'var(--sage)' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-[var(--density-section)]">
      <p className="eyebrow mb-2.5 ml-1">{label}</p>
      {children}
    </div>
  );
}

/** The tick that marks the chosen one, drawn rather than filled. */
function ChosenTick({ color = 'var(--ink)' }: { color?: string }) {
  return (
    <span className="absolute right-2.5 top-2.5">
      <HandCheck size={13} color={color} strokeWidth={1.8} />
    </span>
  );
}

export default function AppearanceEditor({
  prefs,
  setPrefs,
  onBack,
}: {
  prefs: Preferences;
  setPrefs: (patch: Partial<Preferences>) => void;
  onBack: () => void;
}) {
  return (
    <div className={`${VIEW_PADDING} animate-fade-in`}>
      <BackButton onClick={onBack} />
      <SectionHeading>Appearance</SectionHeading>

      <Field label="Paper">
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Paper">
          {PAPER_OPTIONS.map((option) => {
            const tone = PAPER_TONES[option.v];
            const selected = prefs.paperTone === option.v;
            const night = option.v === 'night';
            return (
              <ChoiceCell
                key={option.v}
                selected={selected}
                ariaLabel={option.l}
                onClick={() => setPrefs({ paperTone: option.v })}
                className={`relative flex flex-col gap-2.5 px-3.5 py-3.5 text-left ${
                  night ? 'col-span-2' : ''
                }`}
              >
                {/* A scrap of the page itself: its ground, a card lifted off
                    it, and a course rule down the side. */}
                <span
                  className={`flex h-[30px] items-center px-2 ${FIELD_RADIUS}`}
                  style={{ background: tone.bg }}
                >
                  <span
                    className="h-[18px] flex-1 rounded-[5px] border-l-[3px]"
                    style={{
                      background: tone.paper,
                      borderLeftColor: 'var(--sage)',
                      boxShadow: `inset 0 0 0 1px ${tone.line}`,
                    }}
                  />
                </span>
                <span className="flex items-baseline gap-2">
                  <span
                    className={`font-serif text-[13px] font-medium text-ink ${
                      selected ? 'hand-underline' : ''
                    }`}
                  >
                    {option.l}
                  </span>
                  {option.note && (
                    <span className="truncate text-[11px] italic text-muted-soft">
                      {option.note}
                    </span>
                  )}
                </span>
                {selected && <ChosenTick />}
              </ChoiceCell>
            );
          })}
        </div>
      </Field>

      <Field label="Primary">
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Primary">
          {PRIMARY_OPTIONS.map((option) => {
            const selected = prefs.primaryAccent === option.v;
            return (
              <ChoiceCell
                key={option.v}
                selected={selected}
                ariaLabel={option.l}
                onClick={() => setPrefs({ primaryAccent: option.v })}
                className="relative flex items-center gap-2.5 px-3.5 py-3 text-left"
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ background: option.color }}
                />
                <span
                  className={`font-serif text-[13px] font-medium text-ink ${
                    selected ? 'hand-underline' : ''
                  }`}
                >
                  {option.l}
                </span>
                {selected && <ChosenTick color={option.color} />}
              </ChoiceCell>
            );
          })}
        </div>
      </Field>

      <Field label="Heading">
        <div className="flex gap-2" role="radiogroup" aria-label="Heading">
          {FONT_OPTIONS.map((option) => {
            const selected = prefs.headingFont === option.v;
            return (
              <ChoiceCell
                key={option.v}
                selected={selected}
                ariaLabel={option.l}
                onClick={() => setPrefs({ headingFont: option.v })}
                className="flex-1 px-2 py-3.5"
              >
                <span
                  className={`block text-[19px] italic ${selected ? 'text-ink' : 'text-ink-soft'}`}
                  style={{ fontFamily: option.family }}
                >
                  Aa
                </span>
                <span
                  className={`eyebrow mt-1.5 block ${selected ? 'text-ink' : ''}`}
                  style={{ letterSpacing: '0.1em' }}
                >
                  {option.l}
                </span>
              </ChoiceCell>
            );
          })}
        </div>
      </Field>

      <Field label="Density">
        <div className="flex gap-2" role="radiogroup" aria-label="Density">
          {DENSITY_OPTIONS.map((option) => {
            const selected = prefs.density === option.v;
            return (
              <ChoiceCell
                key={option.v}
                selected={selected}
                ariaLabel={option.l}
                onClick={() => setPrefs({ density: option.v })}
                className="flex-1 py-3"
              >
                <span
                  className={`font-serif text-[14px] ${
                    selected ? 'hl-swipe text-ink' : 'text-ink-soft'
                  }`}
                >
                  {option.l}
                </span>
              </ChoiceCell>
            );
          })}
        </div>
      </Field>
    </div>
  );
}
