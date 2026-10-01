'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface Channel {
  on: boolean;
  toggle: () => void;
}

interface Props {
  /** The pink noise, on every screen. */
  noise: Channel;
  /** The tank, only while the deep is the chosen drawing. */
  tank?: Channel & { volume: number; setVolume: (v: number) => void };
  /** Open mode inverts, so its ink comes in as values and not tokens. */
  night: boolean;
  /** The course colour, for the dot that says something is playing. */
  accent: string;
}

/**
 * Both sounds behind one button that can be seen, in place of a pair of faint
 * icons nobody could tell apart. The tank has a volume; the noise has the
 * level it always had.
 */
export default function SoundMenu({ noise, tank, night, accent }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const playing = noise.on || !!tank?.on;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The sheet is the innermost thing open, so Escape closes it and
        // does not also leave the screen.
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);

  const ink = night ? '#EFE9DC' : 'var(--ink)';
  const soft = night ? '#C8C0B0' : 'var(--ink-soft)';
  const faint = night ? '#958D7E' : 'var(--muted)';
  const line = night ? '#3A352D' : 'var(--line)';
  const panel = night ? '#24211C' : 'var(--paper)';

  const row = (label: string, note: string, ch: Channel) => (
    <button
      type="button"
      onClick={ch.toggle}
      role="switch"
      aria-checked={ch.on}
      className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left transition-colors"
      style={{ color: ink }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-tight">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-tight" style={{ color: faint }}>
          {note}
        </span>
      </span>
      {/* A small switch: the track fills with ink, the knob slides over. */}
      <span
        aria-hidden
        className="relative h-[18px] w-[32px] shrink-0 rounded-full border transition-colors duration-200"
        style={{ borderColor: ch.on ? ink : faint, background: ch.on ? ink : 'transparent' }}
      >
        <span
          className="absolute top-[2px] h-[12px] w-[12px] rounded-full transition-[left,background-color] duration-200"
          style={{ left: ch.on ? 16 : 2, background: ch.on ? panel : faint }}
        />
      </span>
    </button>
  );

  const pct = tank ? Math.round(tank.volume * 100) : 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Sound"
        title="Sound"
        style={{ color: open || playing ? ink : soft }}
        className="relative grid h-10 w-10 place-items-center rounded-[10px] transition-colors"
      >
        <svg aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
          <path d="M15.5 9.2a4 4 0 010 5.6M18 6.8a7.5 7.5 0 010 10.4" />
        </svg>
        {playing ? (
          <span aria-hidden className="absolute right-[7px] top-[7px] h-[7px] w-[7px] rounded-full" style={{ background: accent }} />
        ) : null}
      </button>

      {open ? (
        <div
          role="group"
          aria-label="Sound"
          className="absolute right-0 top-full z-[60] mt-1.5 w-[min(300px,calc(100vw-24px))] animate-fade-in rounded-[14px] border p-3"
          style={{
            background: panel,
            borderColor: line,
            color: ink,
            boxShadow: night ? '0 10px 28px rgba(0,0,0,.5)' : '0 8px 20px rgba(57,48,36,.14)',
          }}
        >
          <p className="eyebrow m-0 px-2 pb-1 pt-1" style={{ color: faint }}>
            Sound
          </p>
          {row('Pink noise', 'A steady hush', noise)}
          {tank ? (
            <>
              <div className="mx-2 h-px" style={{ background: line }} />
              {row('The tank', 'Water, a pump, bubbles', tank)}
              <div
                className="px-2 pb-2 pt-0.5 transition-opacity duration-200"
                style={{ opacity: tank.on ? 1 : 0.45 }}
              >
                <div className="flex items-center gap-3">
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: faint }}>
                    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={pct}
                    onChange={(e) => tank.setVolume(Number(e.target.value) / 100)}
                    aria-label="Tank volume"
                    aria-valuetext={`${pct} percent`}
                    className="pl-volume min-w-0 flex-1"
                    style={
                      {
                        color: ink,
                        '--fill': `${pct}%`,
                        '--track': line,
                        '--knob': panel,
                      } as CSSProperties
                    }
                  />
                  <span className="w-8 text-right font-mono text-[12px] tabular-nums" style={{ color: soft }}>
                    {pct}
                  </span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
