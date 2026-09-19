'use client';

import Link from 'next/link';
import type { Course, Task } from '@/lib/data';
import { gradeStanding, unmarkedShare } from '@/lib/derive';
import { resolveTint } from '@/lib/utils';

/**
 * What is still to be decided, across the term.
 *
 * Hours are drawn as strokes everywhere else in the app because an hour is a
 * countable thing and a percentage of an hour is not. A grade genuinely is a
 * percentage, so this is the one band left: solid in the course's colour for
 * what has been marked, its tint with a dashed edge for the next weighted
 * piece coming, and bare paper for the part of the term that has not happened
 * yet.
 *
 * Draws nothing for a term nobody has entered grading for.
 */
export default function GradeWeighting({
  courses,
  tasks,
  today,
}: {
  courses: Course[];
  tasks: Task[];
  today: string;
}) {
  const weighted = courses.filter((c) => (c.assessments?.length ?? 0) > 0);
  if (weighted.length === 0) return null;

  const share = unmarkedShare(courses);

  return (
    <section className="rounded-[14px] border border-line bg-paper p-5">
      <div className="flex items-baseline justify-between border-b border-line-soft pb-2.5">
        <p className="eyebrow m-0">Still to be decided</p>
        <span className="font-mono text-[11px] text-muted">
          {weighted.length} of {courses.length}
        </span>
      </div>

      {share !== null && (
        <p className="m-0 mt-3.5 font-serif text-[17px] leading-[1.3]">
          {share}% of your grade is still unmarked.
        </p>
      )}

      <div className="mt-3">
        {weighted.map((course) => {
          const standing = gradeStanding(course);
          const total = standing.marked + standing.unmarked || 100;
          // The next weighted thing still to come for this course: the slice
          // worth calling out between "done" and "someday".
          const next = tasks
            .filter(
              (t) =>
                t.courseId === course.id &&
                !t.completed &&
                t.dueDate &&
                t.dueDate >= today &&
                (t.weight ?? 0) > 0,
            )
            .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))[0];
          const nextWeight = Math.min(next?.weight ?? 0, standing.unmarked);
          const rest = Math.max(0, standing.unmarked - nextWeight);

          return (
            <div key={course.id} className="border-b border-line-soft py-3 last:border-b-0">
              <div className="flex items-baseline gap-2.5">
                <span className="eyebrow" style={{ color: course.color }}>
                  {course.code}
                </span>
                <span className="tnum ml-auto font-mono text-[11px] text-ink-soft">
                  {Math.round(standing.marked)}% marked
                  {standing.percent !== null && ` · at ${standing.percent}%`}
                </span>
              </div>

              <div
                aria-hidden
                className="mt-2 flex h-[9px] gap-0.5 overflow-hidden rounded-[2px]"
              >
                {standing.marked > 0 && (
                  <span
                    style={{
                      width: `${(standing.marked / total) * 100}%`,
                      background: course.color,
                    }}
                  />
                )}
                {nextWeight > 0 && (
                  <span
                    className="box-border border border-dashed border-line-strong"
                    style={{
                      width: `${(nextWeight / total) * 100}%`,
                      background: resolveTint(course.color, course.tint),
                    }}
                  />
                )}
                {rest > 0 && (
                  <span
                    className="box-border border border-dashed border-line bg-bg-tint"
                    style={{ width: `${(rest / total) * 100}%` }}
                  />
                )}
              </div>

              {next && (
                <p className="m-0 mt-1.5 truncate text-[11px] text-muted">
                  next: <span className="text-ink-soft">{next.title}</span>, worth{' '}
                  {Math.round(next.weight as number)}%
                </p>
              )}
            </div>
          );
        })}
      </div>

      {weighted.length < courses.length && (
        <p className="m-0 mt-3 font-serif text-[12.5px] italic leading-[1.5] text-muted">
          {courses.length - weighted.length} other{' '}
          {courses.length - weighted.length === 1 ? 'course has' : 'courses have'} no grading
          entered. It goes on{' '}
          <Link href="/courses" className="hand-underline text-ink no-underline">
            the course&rsquo;s own page
          </Link>
          .
        </p>
      )}
    </section>
  );
}
