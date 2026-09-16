'use client';

import Link from 'next/link';
import { Eyebrow } from '../notebook/Marks';
import type { Course, Task } from '@/lib/data';
import { gradeStanding } from '@/lib/derive';
import { daysBetween } from '@/lib/utils';

/**
 * Where the grade stands.
 *
 * The headline is deliberately two numbers, not one: how much of the course
 * has actually been marked, and what was scored out of that. A single "86%"
 * on its own is a lie by omission when only a quarter of the course has been
 * handed back, and it is the number every other planner shows.
 *
 * A piece that has not come back yet takes a dash rather than a zero. A score
 * under two thirds takes the warn clay — the one place the app comments on a
 * mark at all, and it does it by tinting a number rather than saying anything.
 */
export default function GradeStanding({
  course,
  tasks,
  today,
}: {
  course: Course;
  tasks: Task[];
  today: string;
}) {
  const standing = gradeStanding(course);

  if (standing.rows.length === 0) {
    return (
      <div className="rule-ink pb-3.5 pt-4">
        <Eyebrow>Where the grade stands</Eyebrow>
        <p className="mt-2 font-serif text-[17px] leading-[1.3] text-ink-soft">
          Akada does not know how {course.code} is marked yet.
        </p>
        <Link
          href="/settings"
          className="mt-3 inline-block border-b border-line-strong pb-0.5 font-serif text-[13.5px] italic text-ink-soft"
        >
          set the weighting →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="rule-ink pb-3.5 pt-4">
        <Eyebrow>Where the grade stands</Eyebrow>
        <div className="mt-2.5 flex items-end justify-between gap-2.5">
          <p className="m-0 max-w-[20ch] font-serif text-[20px] leading-[1.25]">
            {Math.round(standing.marked)}% marked
            {standing.percent !== null && `, and you are at ${Math.round(standing.earned)} of it.`}
          </p>
          {standing.percent !== null && (
            <p className="m-0 flex-none font-mono text-[26px] font-bold leading-[0.9]">
              {standing.percent}
              <span className="text-[13px] text-muted">%</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-3.5">
        {standing.rows.map((row, i) => {
          const marked = row.score !== null && row.outOf;
          const ratio = marked ? (row.score as number) / (row.outOf as number) : null;
          // The dated piece this row is waiting on, so an unmarked midterm can
          // say how far away it is rather than just sitting blank.
          const upcoming = tasks.find(
            (t) =>
              !t.completed &&
              t.dueDate &&
              t.dueDate >= today &&
              t.title.toLowerCase() === row.label.toLowerCase(),
          );
          return (
            <div
              key={row.id}
              className={`flex items-baseline gap-2.5 py-2.5 ${
                i === standing.rows.length - 1 ? '' : 'row-rule'
              }`}
            >
              <span className="flex-1 text-[13.5px]" style={{ color: marked ? undefined : 'var(--ink-soft)' }}>
                {row.label}
                {upcoming && (
                  <span className="ml-1.5 font-serif italic text-warn">
                    in {daysBetween(today, upcoming.dueDate as string)} days
                  </span>
                )}
              </span>
              <span className="font-mono text-xs text-muted">{row.weight}%</span>
              <span className="w-[52px] flex-none text-right">
                {marked ? (
                  <span
                    className="font-mono text-[13px] font-bold"
                    style={{ color: (ratio as number) < 0.66 ? 'var(--warn)' : undefined }}
                  >
                    {row.outOf === 100 ? row.score : `${row.score}/${row.outOf}`}
                  </span>
                ) : (
                  <span aria-hidden className="flex justify-end">
                    <i className="block h-[1.4px] w-[22px] bg-line-strong" />
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {standing.unmarked > 0 && (
        <p className="mt-3 font-serif text-[13.5px] italic leading-[1.5] text-muted">
          {Math.round(standing.unmarked)}% of {course.code} has not happened yet.
        </p>
      )}
    </div>
  );
}
