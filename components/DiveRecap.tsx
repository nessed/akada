'use client';

import { useEffect, useMemo, useRef } from 'react';
import { EVENTS } from '@/lib/ocean/events';
import { diveRecap } from '@/lib/ocean/recap';
import { SpriteCache } from '@/lib/ocean/sprites';

/**
 * The dive, read back on the finish sheet: how far down the session went,
 * the one animal most worth naming with a small drawing of it, and the rare
 * thing if one happened. Facts, lowercase, the way a field note is written.
 * Nothing is counted and nothing is praised.
 */
export default function DiveRecap({
  sittingKey,
  courseKey,
  focusSeconds,
  dark,
  className = '',
}: {
  sittingKey: string;
  courseKey: string;
  focusSeconds: number;
  dark: boolean;
  className?: string;
}) {
  const recap = useMemo(() => diveRecap(sittingKey, courseKey, focusSeconds), [sittingKey, courseKey, focusSeconds]);
  const sketchRef = useRef<HTMLCanvasElement | null>(null);
  const notable = recap.notable;

  useEffect(() => {
    const canvas = sketchRef.current;
    if (!canvas || !notable) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 56;
    const h = 36;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    const sprite = new SpriteCache(2e6).get(notable, 64, dark, dpr);
    if (!ctx || !sprite) return;
    const fit = Math.min(canvas.width / sprite.w, canvas.height / sprite.h);
    const sw = sprite.w * fit;
    const sh = sprite.h * fit;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sprite.canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh);
  }, [notable, dark]);

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {notable && <canvas ref={sketchRef} aria-hidden className="h-[36px] w-[56px] shrink-0" />}
      <p className="m-0 font-serif text-[13px] leading-snug text-muted">
        down to <span className="font-mono tabular-nums text-[12px]">{recap.meters.toLocaleString('en-US')} m</span>
        {notable && (
          <>
            {' · met '}
            <i className="text-ink-soft">{notable.name}</i>
          </>
        )}
        {recap.event && <> · {EVENTS[recap.event].phrase}</>}
      </p>
    </div>
  );
}
