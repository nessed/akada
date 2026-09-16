'use client';

import { Eyebrow } from '../notebook/Marks';
import type { Course, Task } from '@/lib/data';
import { countdowns } from '@/lib/derive';

/**
 * What is coming, and what it is worth.
 *
 * Days-out is the loud number here because it is the one that changes. The
 * weight beside it never does, which is exactly why it belongs in the quiet
 * line underneath: a 30% essay three weeks out is less urgent than a 5% set
 * due tomorrow, and a panel that led with the percentage would say otherwise.
 *
 * Anything inside ten days takes the warn clay. Nothing here is red.
 */
export default function WatchList({
  tasks,
  courses,
  today,
}: {
  tasks: Task[];
  courses: Course[];
  today: string;
}) {
  const rows = countdowns(tasks, courses, today, 5);
  if (rows.length === 0) return null;

  return (
    <div className="mt-8 border-t border-line-strong pt-4">
      <Eyebrow className="mb-3">Weighted &amp; watching</Eyebrow>
      {rows.map((row, i) => (
        <div
          key={row.task.id}
          className={`flex items-baseline gap-3 py-2.5 ${i === rows.length - 1 ? '' : 'row-rule'}`}
        >
          <span
            className="flex-none font-mono text-[19px] font-bold"
            style={{ color: row.days <= 10 ? 'var(--warn)' : 'var(--ink-soft)' }}
          >
            {row.days}d
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px]">{row.task.title}</span>
            <span className="block text-[11.5px] text-muted">
              {[
                row.task.weight ? `${row.task.weight}%` : null,
                row.course?.code,
                new Date((row.task.dueDate as string) + 'T00:00:00').toLocaleDateString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
