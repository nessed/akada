'use client';

import Link from 'next/link';
import { CourseDot } from './Marks';
import { TallyCount } from './Tally';
import { formatHM, isoDate, startOfWeek } from '@/lib/utils';
import type { Course, Session, Task } from '@/lib/data';

/**
 * The week spine. Seven days down the right edge of the desktop, today held
 * open on the lighter paper with a rule down its left, the rest of the week
 * reduced to what actually lands on it. It is the piece the redesign is built
 * around: it earns the desktop width, and it is what turns a phone-shaped
 * planner into something worth opening on a laptop.
 *
 * Past days show tallies for what was sat down for; days ahead show what is
 * due. A day with nothing on it says "clear" rather than sitting empty, since
 * an empty row reads as missing data and a clear day is information.
 */

export interface SpineDay {
  iso: string;
  date: number;
  weekday: string;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
  loggedSeconds: number;
  courseCount: number;
  items: { id: string; title: string; color: string; time?: string | null }[];
}

export function buildWeek(
  courses: Course[],
  tasks: Task[],
  sessions: Session[],
  hideWeekends = false,
  today = isoDate(),
): SpineDay[] {
  const start = startOfWeek(new Date(today + 'T00:00:00'));
  const byId = new Map(courses.map((c) => [c.id, c]));
  const days: SpineDay[] = [];

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoDate(d);
    const weekend = i >= 5;
    if (hideWeekends && weekend) continue;

    const daySessions = sessions.filter((s) => s.date === iso);
    days.push({
      iso,
      date: d.getDate(),
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      isToday: iso === today,
      isPast: iso < today,
      isWeekend: weekend,
      loggedSeconds: daySessions.reduce((a, s) => a + s.durationSeconds, 0),
      courseCount: new Set(daySessions.map((s) => s.courseId)).size,
      items: tasks
        .filter((t) => !t.completed && t.dueDate === iso)
        .slice(0, 3)
        .map((t) => ({
          id: t.id,
          title: t.title,
          color: byId.get(t.courseId)?.color || 'var(--muted)',
          time: null,
        })),
    });
  }
  return days;
}

export default function WeekSpine({ days }: { days: SpineDay[] }) {
  return (
    <div className="mt-2">
      {days.map((day, i) => {
        const hours = day.loggedSeconds / 3600;
        const last = i === days.length - 1;
        return (
          <div
            key={day.iso}
            className={`relative flex gap-3.5 ${last ? 'py-2.5' : 'border-b border-line-soft py-2.5'} ${
              day.isPast && !day.isToday ? 'opacity-60' : ''
            }`}
            style={
              day.isToday
                ? {
                    background: 'var(--paper)',
                    // The open day bleeds past the column's padding, so it
                    // reads as a page held open rather than a highlighted row.
                    boxShadow: '-10px 0 0 var(--paper), 10px 0 0 var(--paper)',
                  }
                : undefined
            }
          >
            {day.isToday && (
              <span aria-hidden className="absolute -left-5 bottom-2.5 top-2.5 w-0.5 bg-ink" />
            )}
            <span className="w-[34px] flex-none text-right">
              <span
                className={`block font-mono ${
                  day.isToday ? 'text-[16px] font-bold text-ink' : 'text-[14px] text-ink-soft'
                }`}
              >
                {String(day.date).padStart(2, '0')}
              </span>
              <span
                className={`block text-[9px] font-semibold uppercase tracking-[0.1em] ${
                  day.isToday ? 'text-ink' : 'text-muted-soft'
                }`}
              >
                {day.weekday}
              </span>
            </span>

            <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              {day.items.map((item) => (
                <span key={item.id} className="flex items-center gap-2">
                  <CourseDot color={item.color} size={6} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.title}</span>
                </span>
              ))}

              {hours > 0 && (
                <span className="flex items-center gap-[7px]">
                  <TallyCount
                    count={Math.round(hours)}
                    color={day.isToday ? 'var(--ink)' : 'var(--muted)'}
                  />
                  <span
                    className={`font-serif text-[13px] italic ${
                      day.isToday ? 'text-ink-soft' : 'text-muted'
                    }`}
                  >
                    {formatHM(day.loggedSeconds)}
                    {day.isToday ? ' so far' : day.courseCount > 1 ? ` · ${day.courseCount} courses` : ''}
                  </span>
                </span>
              )}

              {day.items.length === 0 && hours === 0 && (
                <span className="font-serif text-[13px] italic text-muted-soft">clear</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The invitation at the foot of the spine. A week that has been written up and
 * not yet read back is the only thing in the app that asks for attention, and
 * it asks in a sentence rather than with a badge.
 */
export function ReviewInvitation({ weekNumber }: { weekNumber: number }) {
  return (
    <Link href="/stats" className="mb-7 mt-auto block border-t border-line-strong pt-4">
      <span className="flex items-baseline justify-between gap-2.5">
        <span className="max-w-[22ch] font-serif text-[18px] leading-[1.25]">
          Week {weekNumber} is written up and waiting.
        </span>
        <span className="flex-none font-mono text-[11px] text-warn">READ →</span>
      </span>
    </Link>
  );
}
