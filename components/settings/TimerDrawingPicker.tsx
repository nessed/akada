'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import HandNote from '@/components/notebook/HandNote';
import StudyFan from '@/components/StudyFan';
import type { TimerDrawing } from '@/lib/preferences';

/* The ocean's code is only fetched when someone opens this row. */
const OceanScene = dynamic(() => import('@/components/OceanScene'), { ssr: false });

const CHOICES: { v: TimerDrawing; label: string; word: string; color: string }[] = [
  { v: 'tree', label: 'Tree', word: 'a tree', color: '#A8B89B' },
  { v: 'jelly', label: 'Jellyfish', word: 'a jellyfish', color: '#B5A8C9' },
  { v: 'ocean', label: 'The deep', word: 'the deep', color: '#A8BCC9' },
];

/**
 * What the timer draws as a sitting goes on.
 *
 * A line about the reader's own timer, the way `BreakLengthPicker` is, and
 * the choices only appear once it has been touched. Each choice is the real
 * drawing, grown most of the way, not an icon of it: the thing being picked
 * is how it looks, so it is shown.
 */
export default function TimerDrawingPicker({
  value,
  onChange,
}: {
  value: TimerDrawing;
  onChange: (drawing: TimerDrawing) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = CHOICES.find((c) => c.v === value) ?? CHOICES[0];

  return (
    <div className="px-[18px] py-3.5 [&+*]:border-t [&+*]:border-line-soft">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 bg-transparent text-left"
      >
        <span className="flex-1 font-serif text-[15px] text-ink">
          The timer draws <span className="hl-swipe text-ink">{chosen.word}</span>
        </span>
      </button>

      {open && (
        <div className="animate-fade-in">
          <div className="mt-3.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="What the timer draws">
            {CHOICES.map((choice) => {
              const selected = choice.v === value;
              return (
                <button
                  key={choice.v}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange(choice.v)}
                  className={`flex flex-col items-center gap-2 rounded-[10px] border bg-paper-2 px-1.5 pb-3 pt-2.5 ${
                    selected ? 'border-ink-soft' : 'border-line-soft'
                  }`}
                >
                  {choice.v === 'ocean' ? (
                    // Twelve minutes down, held still: the light water, a few
                    // animals, and the jelly in it.
                    <OceanScene
                      sittingKey="settings:preview"
                      courseKey="settings:course"
                      color={choice.color}
                      clock={{ frozen: 12 * 60 }}
                      blocks={0}
                      resting={false}
                      paused={false}
                      still
                      ground="paper"
                      className="pointer-events-none block h-[118px] w-full max-w-[150px] overflow-hidden rounded-[6px]"
                    >
                      <StudyFan
                        species="ocean"
                        progress={0.8}
                        seed="settings"
                        color={choice.color}
                        padTop={14}
                        baseOffset={6}
                        interactive={false}
                        className="pointer-events-none absolute inset-0 h-full w-full"
                      />
                    </OceanScene>
                  ) : (
                    <StudyFan
                      species={choice.v}
                      progress={0.8}
                      seed="settings"
                      color={choice.color}
                      depth={6}
                      trunkWidth={5}
                      padTop={choice.v === 'jelly' ? 12 : 8}
                      baseOffset={14}
                      ground
                      interactive={false}
                      className="pointer-events-none block h-[118px] w-full max-w-[150px]"
                    />
                  )}
                  <span className={`eyebrow ${selected ? 'text-ink' : ''}`}>{choice.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 mb-0 text-right">
            <HandNote size={16} rotate={-1.5} color="var(--muted)">
              same growth all three ways; the deep also sinks as you sit
            </HandNote>
          </p>
        </div>
      )}
    </div>
  );
}
