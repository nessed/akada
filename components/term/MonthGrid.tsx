'use client';

import Link from 'next/link';
import Marginalia from '../notebook/Marginalia';
import type { Course, Session, Task } from '@/lib/data';
import { isoDate } from '@/lib/utils';

/**
 * The month, on ruled paper.
 *
 * Cells are divided by dashed hairlines rather than boxed in, weekends sit on
 * the lighter stock, and today takes a solid rule down its left edge instead
 * of a coloured fill. An exam gets a pencil circle round it — the one time
 * the app raises its voice, and it does it with a drawn mark rather than a
 * red badge.
 *
 * Tally strokes along the bottom of a cell are hours logged that day, so the
 * month reads as both what is coming and what was actually done.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MonthGrid({
  month,
  today,
  courses,
  tasks,
  sessions,
  hideWeekends,
}: {
  month: Date;
  today: string;
  courses: Course[];
  tasks: Task[];
  sessions: Session[];
  hideWeekends?: boolean;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  // The grid always starts on a Monday, so it opens with whatever tail of the
  // previous month is needed to get there.
  const first = new Date(year, monthIndex, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - lead);

  const columns = hideWeekends ? 5 : 7;
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (hideWeekends && (d.getDay() === 0 || d.getDay() === 6)) continue;
    cells.push(d);
    // Stop once the month is covered and the week has run out.
    if (d.getMonth() > monthIndex && d.getDay() === 0) break;
    if (d.getFullYear() > year && d.getDay() === 0) break;
  }

  const byId = new Map(courses.map((c) => [c.id, c]));
  const tasksByDate = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const list = tasksByDate.get(task.dueDate) ?? [];
    list.push(task);
    tasksByDate.set(task.dueDate, list);
  }

  const hoursByDate = new Map<string, number>();
  for (const s of sessions) {
    hoursByDate.set(s.date, (hoursByDate.get(s.date) || 0) + s.durationSeconds);
  }

  return (
    <div className="mt-6">
      <div
        className="grid border-b-[1.5px] border-ink pb-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {WEEKDAYS.slice(0, columns).map((day, i) => (
          <span
            key={day}
            className="text-[9.5px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: i >= 5 ? 'var(--muted-soft)' : 'var(--muted)' }}
          >
            {day}
          </span>
        ))}
      </div>

      <div
        className="grid auto-rows-[minmax(104px,1fr)]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cells.map((date, index) => {
          const iso = isoDate(date);
          const inMonth = date.getMonth() === monthIndex;
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          const isToday = iso === today;
          const dayTasks = (tasksByDate.get(iso) ?? []).filter((t) => !t.completed);
          const exam = dayTasks.find((t) => t.kind === 'exam');
          const hours = Math.round((hoursByDate.get(iso) || 0) / 3600);
          const lastColumn = (index + 1) % columns === 0;

          return (
            <div
              key={iso}
              className={`relative px-2.5 py-2 ${lastColumn ? '' : 'border-r border-dashed border-line'} border-b border-dashed border-line ${
                inMonth ? '' : 'opacity-50'
              }`}
              style={{
                background: exam
                  ? 'var(--warn-tint)'
                  : isToday
                    ? 'var(--paper)'
                    : weekend
                      ? 'var(--paper-2)'
                      : undefined,
              }}
            >
              {isToday && (
                <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-0.5 bg-ink" />
              )}

              <span
                className={`font-mono ${isToday ? 'text-[14px] font-bold text-ink' : 'text-[13px]'}`}
                style={{ color: isToday ? undefined : weekend ? 'var(--muted-soft)' : 'var(--ink-soft)' }}
              >
                {String(date.getDate()).padStart(2, '0')}
              </span>

              {dayTasks.slice(0, 2).map((task) => {
                const course = byId.get(task.courseId);
                return (
                  <Link
                    key={task.id}
                    href="/tasks"
                    className="mt-1.5 flex items-baseline gap-1.5"
                    title={task.title}
                  >
                    <span
                      aria-hidden
                      className="block h-[11px] w-[2.5px] flex-none"
                      style={{ background: course?.color || 'var(--muted)' }}
                    />
                    <span
                      className={`line-clamp-2 min-w-0 flex-1 text-[11px] leading-[1.3] ${
                        task.kind === 'exam' ? 'font-semibold text-ink' : 'text-ink-soft'
                      }`}
                    >
                      {task.title}
                      {task.weight ? (
                        <span className="ml-1 font-mono text-[10px] text-muted">
                          {task.weight}%
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}

              {dayTasks.length > 2 && (
                <span className="mt-1 block font-mono text-[10px] text-muted-soft">
                  +{dayTasks.length - 2}
                </span>
              )}

              {hours > 0 && (
                <div aria-hidden className="mt-2 flex gap-[2px]">
                  {Array.from({ length: Math.min(hours, 6) }).map((_, i) => (
                    <i
                      key={i}
                      className="tally-stroke"
                      style={{
                        height: 11,
                        background: isToday ? 'var(--ink)' : 'var(--muted-soft)',
                      }}
                    />
                  ))}
                </div>
              )}

              {exam && (
                <Marginalia
                  mark="circle"
                  width={70}
                  color="var(--warn)"
                  opacity={0.55}
                  className="pointer-events-none absolute bottom-1 left-1"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
