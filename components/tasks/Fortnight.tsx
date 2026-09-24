'use client';

import { useMemo } from 'react';
import type { Course, Task } from '@/lib/data';
import { isoDate } from '@/lib/utils';

/**
 * The next two weeks as a strip of days, each open task a mark on the day
 * it is due.
 *
 * A list says what is next; it cannot say that Thursday has four things on it
 * and the week after is empty, which is the one thing a reader planning an
 * evening needs to see. So the strip draws the load rather than the items:
 * one short bar per task in its course colour, an exam as a hollow ring on
 * top of its day, and whatever slipped past its date piled up in a column of
 * its own at the left. Pressing a day narrows the list under it to that day,
 * and pressing it again lets go.
 */

const DAYS = 14;
/** More than this on one day is drawn as a count rather than a taller stack. */
const STACK = 5;

interface Props {
  tasks: Task[];
  courses: Course[];
  /** `'overdue'`, an ISO date, or null for nothing picked. */
  picked: string | null;
  onPick: (day: string | null) => void;
}

export default function Fortnight({ tasks, courses, picked, onPick }: Props) {
  const today = isoDate();

  const columns = useMemo(() => {
    const open = tasks.filter((t) => !t.completed && t.dueDate);
    const colour = (t: Task) => courses.find((c) => c.id === t.courseId)?.color ?? 'var(--muted)';
    const days = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() + i);
      const iso = isoDate(d);
      const mine = open
        .filter((t) => t.dueDate === iso)
        .sort((a, b) => Number(b.kind === 'exam') - Number(a.kind === 'exam'));
      return {
        key: iso,
        weekday: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
        date: d.getDate(),
        monthStart: d.getDate() === 1 ? d.toLocaleDateString(undefined, { month: 'short' }) : null,
        weekend: d.getDay() === 0 || d.getDay() === 6,
        weekStart: d.getDay() === 1 && i > 0,
        tasks: mine.map((t) => ({ id: t.id, color: colour(t), exam: t.kind === 'exam', title: t.title })),
      };
    });
    const late = open
      .filter((t) => (t.dueDate as string) < today)
      .map((t) => ({ id: t.id, color: colour(t), exam: t.kind === 'exam', title: t.title }));
    return { days, late };
  }, [courses, tasks, today]);

  const busiest = Math.max(1, ...columns.days.map((d) => d.tasks.length));

  return (
    <div
      className="app-scroll -mx-[var(--density-gutter)] overflow-x-auto px-[var(--density-gutter)] md:mx-0 md:px-0"
      role="group"
      aria-label="The next two weeks. Pick a day to see only what is due on it."
    >
      <div className="grid min-w-[760px] grid-cols-[repeat(15,minmax(0,1fr))] md:min-w-0">
        {columns.late.length > 0 ? (
          <Column
            label="Late"
            date={columns.late.length}
            tone="late"
            picked={picked === 'overdue'}
            onPick={() => onPick(picked === 'overdue' ? null : 'overdue')}
            marks={columns.late}
            ariaLabel={`${columns.late.length} past their date`}
          />
        ) : (
          <div className="border-r border-line-soft" aria-hidden />
        )}
        {columns.days.map((day) => (
          <Column
            key={day.key}
            label={day.weekday}
            date={day.date}
            month={day.monthStart}
            tone={day.key === today ? 'today' : day.weekend ? 'weekend' : 'plain'}
            weekStart={day.weekStart}
            heavy={day.tasks.length === busiest && day.tasks.length >= 3}
            picked={picked === day.key}
            onPick={() => onPick(picked === day.key ? null : day.key)}
            marks={day.tasks}
            ariaLabel={`${day.weekday} ${day.date}, ${day.tasks.length} due`}
          />
        ))}
      </div>
    </div>
  );
}

function Column({
  label,
  date,
  month,
  tone,
  weekStart = false,
  heavy = false,
  picked,
  onPick,
  marks,
  ariaLabel,
}: {
  label: string;
  date: number;
  month?: string | null;
  tone: 'late' | 'today' | 'weekend' | 'plain';
  weekStart?: boolean;
  heavy?: boolean;
  picked: boolean;
  onPick: () => void;
  marks: { id: string; color: string; exam: boolean; title: string }[];
  ariaLabel: string;
}) {
  const exams = marks.filter((m) => m.exam);
  const bars = marks.filter((m) => !m.exam);
  const shown = bars.slice(0, STACK);
  const more = bars.length - shown.length;
  const empty = marks.length === 0;

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={picked}
      aria-label={ariaLabel}
      disabled={empty && !picked}
      title={marks.map((m) => m.title).join('\n') || undefined}
      className={`fortnight-day group relative flex min-h-[104px] flex-col items-stretch px-1.5 pb-2.5 pt-2 text-left transition-colors ${
        weekStart ? 'border-l border-line-strong' : ''
      } ${tone === 'weekend' ? 'bg-paper-2/60' : ''} ${
        picked ? 'bg-bg-tint' : empty ? 'cursor-default' : 'hover:bg-bg-tint'
      }`}
    >
      <span
        className={`eyebrow block truncate text-[9.5px] tracking-[0.12em] ${
          tone === 'late' ? 'text-warn' : tone === 'today' ? 'text-ink' : ''
        }`}
      >
        {label}
      </span>
      <span className="mt-0.5 flex items-baseline gap-1">
        <span
          className={`tnum font-mono text-[18px] leading-none ${
            tone === 'late' ? 'text-warn' : empty ? 'text-muted-soft' : 'text-ink'
          } ${tone === 'today' ? 'hl-swipe' : ''}`}
        >
          {date}
        </span>
        {month && <span className="eyebrow text-[9px] tracking-[0.1em]">{month}</span>}
      </span>

      {/* Exams first, as rings: the thing on a day that most changes what
          the days before it are for. */}
      <span className="mt-3 flex min-h-0 flex-1 flex-col justify-end gap-[4px]">
        {exams.length > 0 && (
          <span className="mb-1 flex flex-wrap gap-1">
            {exams.map((m) => (
              <span
                key={m.id}
                aria-hidden
                className="block h-[11px] w-[11px] rounded-full"
                style={{ border: `2px solid ${m.color}` }}
              />
            ))}
          </span>
        )}
        {shown.map((m) => (
          <span
            key={m.id}
            aria-hidden
            className="block h-[7px] w-full rounded-[2px]"
            style={{ background: m.color }}
          />
        ))}
        {more > 0 && (
          <span className="tnum font-mono text-[10px] leading-none text-muted">+{more}</span>
        )}
      </span>

      {/* A day with the most on it gets a note in the margin, once. */}
      {heavy && (
        <span
          aria-hidden
          className="font-hand pointer-events-none absolute -top-3 right-0 text-[13px] text-warnSoft"
          style={{ transform: 'rotate(-6deg)' }}
        >
          busy
        </span>
      )}

      {picked && (
        <span aria-hidden className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-ink" />
      )}
    </button>
  );
}
