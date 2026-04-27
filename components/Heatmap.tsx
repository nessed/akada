'use client';

import { useMemo } from 'react';
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
              <span
                key={d}
                title={cell.future ? '' : `${cell.iso} · ${formatHM(cell.sec)}`}
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
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
