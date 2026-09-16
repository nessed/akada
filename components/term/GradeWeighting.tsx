'use client';

import Link from 'next/link';
import { Eyebrow } from '../notebook/Marks';
import type { Course, Task } from '@/lib/data';
import { gradeStanding, unmarkedShare } from '@/lib/derive';
import { resolveTint } from '@/lib/utils';

/**
 * What is still to be decided.
 *
 * Each course gets a single band divided into what has been marked, what is
 * coming next, and what is still unclaimed at the end of term. The marked
 * part is solid in the course's colour, the next weighted piece is its tint
 * with a dashed edge, and the remainder is bare paper with a dashed edge —
 * so "most of this grade has not happened yet" is something you see rather
 * than something you calculate.
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
  const share = unmarkedShare(courses);

  if (weighted.length === 0) {
    return (
      <div className="rule-ink pb-3.5 pt-4">
        <Eyebrow>Still to be decided</Eyebrow>
        <p className="mt-2 font-serif text-[18px] leading-[1.3] text-ink-soft">
          Tell Akada how a course is marked and it will keep track of how much
          of the grade is still unspent.
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
        <Eyebrow>Still to be decided</Eyebrow>
        <p className="mt-2 font-serif text-[21px] leading-[1.3]">
          {share}% of your grade is still unmarked.
        </p>
      </div>

      <div className="mt-4">
        {weighted.map((course, i) => {
          const standing = gradeStanding(course);
          const total = standing.marked + standing.unmarked || 100;
          // The next weighted thing still to come for this course, which is
          // the slice worth calling out between "done" and "someday".
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
            <div key={course.id} className={i === weighted.length - 1 ? 'py-3' : 'row-rule py-3'}>
              <div className="flex items-baseline gap-2.5">
                <span
                  className="text-[9.5px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: course.color }}
                >
                  {course.code}
                </span>
                <span className="ml-auto font-mono text-xs text-ink-soft">
                  {Math.round(standing.marked)}% marked
                </span>
              </div>

              <div aria-hidden className="mt-2.5 flex h-[11px] gap-0.5">
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

              <p className="mt-2 text-[11.5px] leading-[1.45] text-muted">
                {standing.rows
                  .slice(0, 4)
                  .map((row) =>
                    next && row.label.toLowerCase() === next.title.toLowerCase() ? (
                      <span key={row.id} style={{ color: 'var(--warn)' }}>
                        {row.label} {row.weight}%{' · '}
                      </span>
                    ) : (
                      <span key={row.id}>
                        {row.label} {row.weight}%{' · '}
                      </span>
                    ),
                  )}
                {standing.percent !== null && (
                  <span className="text-ink-soft">at {standing.percent}% so far</span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
