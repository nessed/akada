'use client';

import { useMemo } from 'react';
import type { Course, Session } from '@/lib/data';
import { isoDate } from '@/lib/utils';

interface Props {
  sessions: Session[];
  courses: Course[];
}

// Last 7 days, stacked bar per day, segmented by course color.
export default function WeeklyChart({ sessions, courses }: Props) {
  const totals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { date: string; label: string; byC: Record<string, number>; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = isoDate(d);
      const byC: Record<string, number> = {};
      for (const s of sessions) {
        if (s.date === iso) byC[s.courseId] = (byC[s.courseId] || 0) + s.durationSeconds;
      }
      const total = Object.values(byC).reduce((a, b) => a + b, 0);
      days.push({
        date: iso,
        label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        byC,
        total,
      });
    }
    return days;
  }, [sessions]);

  const max = Math.max(3600, ...totals.map((t) => t.total));

  return (
    <div className="flex items-end gap-2 h-[120px]">
      {totals.map((t, idx) => (
        <div key={idx} className="flex-1 flex flex-col items-center gap-2">
          <div
            className="w-full relative flex flex-col-reverse rounded overflow-hidden bg-bg-tint"
            style={{ height: 90 }}
          >
            {t.total > 0 &&
              courses.map((c) => {
                const sec = t.byC[c.id] || 0;
                if (!sec) return null;
                const pct = (sec / max) * 100;
                return (
                  <div
                    key={c.id}
                    style={{
                      width: '100%',
                      height: `${pct}%`,
                      background: c.color,
                    }}
                  />
                );
              })}
          </div>
          <span className="text-[10px] text-muted font-mono">{t.label}</span>
        </div>
      ))}
    </div>
  );
}
