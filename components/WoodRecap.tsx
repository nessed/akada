'use client';

import { useMemo } from 'react';
import WoodSketch from './WoodSketch';
import { rollWood } from '@/lib/wood/biome';
import { courseKey } from '@/lib/wood/clock';
import { woodRecap } from '@/lib/wood/recap';

/**
 * The wood, read back on the finish sheet: how far the land got, and the
 * rarest animal that came, with a small drawing of it. A field note, lower
 * case. Nothing is counted and nothing is praised; the rare one is named
 * because it happened, not because it scores.
 */
export default function WoodRecap({
  woodKey,
  courseId,
  focusSeconds,
  night,
  className = '',
}: {
  woodKey: string;
  courseId: string;
  focusSeconds: number;
  /** An open sitting grew a night wood, with its own animals. */
  night: boolean;
  className?: string;
}) {
  const recap = useMemo(
    () => woodRecap(rollWood(woodKey, courseKey(courseId)), focusSeconds, night),
    [woodKey, courseId, focusSeconds, night],
  );
  const notable = recap.notable;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {notable && <WoodSketch id={notable.id} genome={notable.genome} className="h-[36px] w-[56px] shrink-0" />}
      <p className="m-0 font-serif text-[13px] leading-snug text-muted">
        grew into {recap.stage} · <span className="font-mono tabular-nums text-[12px]">{recap.years}</span> years
        {notable && (
          <>
            {' · met '}
            <i className="text-ink-soft">{notable.name}</i>
          </>
        )}
      </p>
    </div>
  );
}
