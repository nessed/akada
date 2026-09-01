'use client';

import { useMemo, useState } from 'react';
import type { Session } from '@/lib/data';
import { isoDate, formatHM } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';

interface Props {
  sessions: Session[];
  accent: string;
  weeks?: number;
  hideWeekends?: boolean;
}

export default function Heatmap({ sessions, accent, weeks = 13, hideWeekends }: Props) {
  const [reading, setReading] = useState<{ iso: string; sec: number } | null>(null);

  const cells = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = weeks * 7;

    const start = new Date(today);
    const dow = (start.getDay() + 6) % 7; // Mon = 0
    start.setDate(start.getDate() - dow - (weeks - 1) * 7);

    const byDate: Record<string, number> = {};
    for (const s of sessions) {
      if (isLoggableDuration(s.durationSeconds)) {
        byDate[s.date] = (byDate[s.date] || 0) + clampSessionSeconds(s.durationSeconds);
      }
    }
    let max = 0;
    for (const v of Object.values(byDate)) if (v > max) max = v;

    const out: {
      iso: string;
      sec: number;
      intensity: number;
      future: boolean;
      dow: number;
    }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = isoDate(d);
      const sec = byDate[iso] || 0;
      const intensity = max > 0 ? sec / max : 0;
      out.push({ iso, sec, intensity, future: d > today, dow: (d.getDay() + 6) % 7 });
    }
    return out;
  }, [sessions, weeks]);

  return (
    <div>
      <div className="flex gap-1">
      {Array.from({ length: weeks }).map((_, w) => (
        <div key={w} className="flex flex-col gap-1">
          {Array.from({ length: 7 }).map((_, d) => {
            const cell = cells[w * 7 + d];
            if (!cell) return <span key={d} style={{ width: 14, height: 14 }} />;
            const isWeekend = cell.dow >= 5;
            if (hideWeekends && isWeekend) {
              return <span key={d} style={{ width: 14, height: 14 }} />;
            }
            const op = cell.future
              ? 0
              : cell.sec === 0
                ? 0.08
                : 0.18 + cell.intensity * 0.82;
            return (
              <button
                key={d}
                type="button"
                aria-label={`${cell.iso} · ${formatHM(cell.sec)}`}
                onClick={() => setReading({ iso: cell.iso, sec: cell.sec })}
                disabled={cell.future}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: cell.future
                    ? 'transparent'
                    : cell.sec === 0
                      ? 'var(--bg-tint)'
                      : accent,
                  opacity: cell.future ? 0 : op,
                  border: 'none',
                  padding: 0,
                }}
              />
            );
          })}
        </div>
      ))}
      </div>
      {reading && (
        <p className="mt-2.5 mb-0 font-mono text-[11px] text-muted tabular-nums animate-fade-in">
          {new Date(reading.iso + 'T00:00:00').toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
          <span className="ml-2 text-ink">{formatHM(reading.sec)}</span>
        </p>
      )}
    </div>
  );
}
