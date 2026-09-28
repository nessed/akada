'use client';

import { playSound, SOUNDS } from '@/lib/sounds';

/**
 * The palette, one word each, to hear before deciding. Plays whether the
 * sounds are on or not, since hearing them is how a reader decides.
 */
export default function SoundSampler() {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-[18px] py-3">
      <span className="eyebrow mr-2">Listen</span>
      {SOUNDS.map(({ name, word }) => (
        <button
          key={name}
          type="button"
          data-sound="none"
          onClick={() => playSound(name, { force: true })}
          className="eyebrow rounded-[8px] px-2 py-1.5 text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
        >
          {word}
        </button>
      ))}
    </div>
  );
}
