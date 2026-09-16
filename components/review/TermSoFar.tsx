'use client';

import Link from 'next/link';
import Marginalia from '../notebook/Marginalia';
import { Eyebrow } from '../notebook/Marks';
import type { Course, Session, Task } from '@/lib/data';
import { isoDate, startOfWeek } from '@/lib/utils';

/**
 * The term behind this week.
 *
 * The one chart Review keeps that a sentence cannot replace. Each week is a
 * small stack — one segment per course, in the course's own colour — so the
 * shape of the term reads as both "how much" and "spread across what", which
 * is the pair of facts a single-height bar throws away.
 *
 * Weeks still ahead are drawn as an empty tick rather than left blank, so the
 * fifteen weeks are visible as fifteen weeks from week one. An exam in a week
 * ahead takes a small drawn arrow: it is the thing the term is pointing at.
 */
export default function TermSoFar({
  courses,
  sessions,
  tasks,
  termStart,
  readingWeek,
  today,
  weeks = 15,
}: {
  courses: Course[];
  sessions: Session[];
  tasks: Task[];
  termStart: string | null;
  /** The Monday of the week being read, which gets marked. */
  readingWeek: string;
  today: string;
  weeks?: number;
}) {
  if (!termStart) return null;

  const start = startOfWeek(new Date(termStart + 'T00:00:00'));
  const rows: {
    key: string;
    index: number;
    from: string;
    to: string;
    byCourse: { color: string; seconds: number }[];
    total: number;
    isReading: boolean;
    isFuture: boolean;
    hasExam: boolean;
  }[] = [];

  for (let i = 0; i < weeks; i += 1) {
    const from = new Date(start);
    from.setDate(start.getDate() + i * 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    const fromIso = isoDate(from);
    const toIso = isoDate(to);
    const inWeek = sessions.filter((s) => s.date >= fromIso && s.date <= toIso);
    rows.push({
      key: fromIso,
      index: i + 1,
      from: fromIso,
      to: toIso,
      byCourse: courses
        .map((c) => ({
          color: c.color,
          seconds: inWeek
            .filter((s) => s.courseId === c.id)
            .reduce((acc, s) => acc + s.durationSeconds, 0),
        }))
        .filter((r) => r.seconds > 0),
      total: inWeek.reduce((acc, s) => acc + s.durationSeconds, 0),
      isReading: fromIso === readingWeek,
      isFuture: fromIso > today,
      hasExam: tasks.some(
        (t) => t.kind === 'exam' && t.dueDate && t.dueDate >= fromIso && t.dueDate <= toIso,
      ),
    });
  }

  const peak = Math.max(1, ...rows.map((r) => r.total));
  const height = 96;

  return (
    <section className="mt-9">
      <div className="flex items-baseline justify-between border-t border-line-strong pt-3.5">
        <Eyebrow>The term so far</Eyebrow>
        <Link href="/term" className="font-serif text-[13px] italic text-muted">
          all {weeks} weeks →
        </Link>
      </div>

      <div className="mt-4 flex items-end gap-2" style={{ height: height + 22 }}>
        {rows.map((row) => (
          <span key={row.key} className="flex flex-1 flex-col items-center gap-[7px]">
            <span className="flex items-end gap-[1.5px]" style={{ height }}>
              {row.total > 0 ? (
                row.byCourse.map((seg, i) => (
                  <i
                    key={i}
                    className="block w-[3px]"
                    style={{
                      height: Math.max(6, (seg.seconds / peak) * height),
                      background: seg.color,
                    }}
                    title={`Week ${row.index}`}
                  />
                ))
              ) : row.hasExam ? (
                <Marginalia mark="down" width={16} color="var(--warn)" />
              ) : (
                <i
                  className="block w-[3px]"
                  style={{
                    height: 6,
                    background: row.isFuture ? 'var(--bg-tint)' : 'var(--line)',
                  }}
                />
              )}
            </span>
            <span
              className={`font-mono text-[11px] ${
                row.isReading
                  ? 'border-b-[1.5px] border-ink pb-0.5 font-bold text-ink'
                  : row.isFuture
                    ? 'text-line-strong'
                    : 'text-muted'
              }`}
              style={row.hasExam && !row.isReading ? { color: 'var(--warn)' } : undefined}
            >
              {String(row.index).padStart(2, '0')}
            </span>
          </span>
        ))}
      </div>

      <p className="mt-3 font-serif text-[13.5px] italic text-muted">
        One stack a week, a segment a course. The underlined week is the one you are reading.
      </p>
    </section>
  );
}
