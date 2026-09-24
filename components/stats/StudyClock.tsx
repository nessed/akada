'use client';

import type { Habits } from '@/lib/progression';
import { HABIT_MIN_SITTINGS, windowLabel } from '@/lib/progression';
import type { Persona } from '@/lib/stats-reading';
import HandNote from '@/components/notebook/HandNote';

const SIZE = 200;
const C = SIZE / 2;
const INNER = 44;
const REACH = 44;

/**
 * The day as a clock face, with the hours studied drawn out from it like
 * the strokes of a sundial: midnight at the top, noon at the foot, each hour
 * a stroke as long as the time that has landed in it across the term. The
 * reader's usual three hours are inked; the rest are pencil. A hand points
 * at now.
 *
 * Under it, the kind of studier those strokes make, said plainly and taken
 * back the day it stops being true.
 */
export default function StudyClock({
  habits,
  persona,
  now = new Date(),
}: {
  habits: Habits;
  persona: Persona | null;
  now?: Date;
}) {
  const max = Math.max(1, ...habits.hours);
  const peak = habits.peak
    ? new Set([0, 1, 2].map((i) => (habits.peak!.start + i) % 24))
    : new Set<number>();
  const hourNow = now.getHours() + now.getMinutes() / 60;
  const toRad = (h: number) => (h / 24) * Math.PI * 2 - Math.PI / 2;
  const at = (h: number, r: number) => ({
    x: C + Math.cos(toRad(h)) * r,
    y: C + Math.sin(toRad(h)) * r,
  });
  const handTip = at(hourNow, INNER - 8);
  const sittingsToGo = Math.max(0, HABIT_MIN_SITTINGS - habits.sittings.n);

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block h-auto w-full max-w-[220px] overflow-visible"
        role="img"
        aria-label={
          habits.peak
            ? `Most of your hours land ${windowLabel(habits.peak.start)}.`
            : 'When in the day your hours land.'
        }
      >
        <circle cx={C} cy={C} r={INNER - 2} fill="none" stroke="var(--line)" strokeWidth={1} />
        <circle
          cx={C}
          cy={C}
          r={INNER + REACH + 2}
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={1}
          strokeDasharray="2 4"
        />

        {habits.hours.map((sec, h) => {
          const mid = h + 0.5;
          const length = sec > 0 ? Math.max(3, (sec / max) * REACH) : 1.5;
          const a = at(mid, INNER + 2);
          const b = at(mid, INNER + 2 + length);
          const inPeak = peak.has(h);
          return (
            <line
              key={h}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              pathLength={1}
              className={sec > 0 ? 'ink-draw' : undefined}
              style={sec > 0 ? { animationDelay: `${0.2 + h * 0.035}s`, animationDuration: '0.6s' } : undefined}
              stroke={sec === 0 ? 'var(--line)' : inPeak ? 'var(--ink)' : 'var(--muted-soft)'}
              strokeWidth={sec === 0 ? 1 : inPeak ? 5 : 4}
              strokeLinecap="round"
            />
          );
        })}

        {[
          [0, '12a'],
          [6, '6a'],
          [12, '12p'],
          [18, '6p'],
        ].map(([h, label]) => {
          const p = at(h as number, INNER + REACH + 14);
          return (
            <text
              key={label}
              x={p.x}
              y={p.y + 3}
              textAnchor="middle"
              className="font-mono"
              fontSize={9.5}
              fill="var(--muted)"
            >
              {label}
            </text>
          );
        })}

        {/* The hand, pointing at now. */}
        <line
          className="pop-in"
          style={{ animationDelay: '1.2s' }}
          x1={C}
          y1={C}
          x2={handTip.x}
          y2={handTip.y}
          stroke="var(--warn)"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <circle cx={C} cy={C} r={2.5} fill="var(--warn)" />
      </svg>

      <div className="mt-3 text-center">
        {persona ? (
          <>
            <p className="eyebrow m-0">You study like</p>
            <p className="m-0 mt-1 font-serif text-[22px] font-medium italic leading-tight tracking-[-0.01em] text-ink">
              {persona.title}
            </p>
            {persona.aside && (
              <HandNote className="mt-1" size={18} rotate={-2}>
                {persona.aside}
              </HandNote>
            )}
          </>
        ) : (
          <>
            <p className="m-0 font-serif text-[15px] italic text-ink-soft">
              still getting to know you
            </p>
            <p className="m-0 mt-1 font-serif text-[12.5px] italic text-muted">
              {sittingsToGo > 0
                ? `${sittingsToGo} more sitting${sittingsToGo === 1 ? '' : 's'} and this says what kind of studier you are`
                : 'a few more hours and your time of day shows itself'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
