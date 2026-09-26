'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { Course, Task } from '@/lib/data';
import { useWeakPoints } from '@/lib/data-hooks';
import { isoDate } from '@/lib/utils';
import { examsWithin, rankWeakPoints } from '@/lib/weak-points';

const TOP = 5;

/**
 * A week out from an exam, the five things the reader keeps getting wrong in
 * that course, most often missed first, with the pages to go back to. One
 * block per course with an exam that close and anything still open; nothing
 * at all otherwise.
 */
export default function BeforeExamPanel({ tasks, courses }: { tasks: Task[]; courses: Course[] }) {
  const { weakPoints, available } = useWeakPoints();
  const today = isoDate();

  const blocks = useMemo(() => {
    const byId = new Map(courses.map((c) => [c.id, c]));
    return examsWithin(tasks, today)
      .map(({ exam, days }) => {
        const open = weakPoints.filter((w) => w.courseId === exam.courseId && w.status === 'open');
        return { exam, days, course: byId.get(exam.courseId), open: open.length, top: rankWeakPoints(open).slice(0, TOP) };
      })
      .filter((block) => block.course && block.top.length > 0);
  }, [tasks, courses, weakPoints, today]);

  if (!available || blocks.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between pb-1.5">
        <p className="eyebrow m-0">Before the exam</p>
        <span className="font-serif text-[12.5px] italic text-muted">what keeps going wrong</span>
      </div>

      {blocks.map(({ exam, days, course, open, top }) => (
        <div key={exam.id} className="border-b border-line-soft py-2.5 last:border-b-0">
          <p className="m-0 flex items-baseline gap-2.5">
            <span className="eyebrow min-w-0 flex-1 truncate text-ink-soft">
              <span aria-hidden className="course-rule relative -top-px mr-2" style={{ ['--c' as string]: course!.color }} />
              {course!.code}
              <span className="ml-1.5 normal-case tracking-normal text-muted">{exam.title}</span>
            </span>
            <span className={`tnum shrink-0 font-mono text-[12px] ${days <= 2 ? 'text-warn' : 'text-ink'}`}>
              {days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`}
            </span>
          </p>
          <ol className="m-0 mt-1.5 list-none p-0">
            {top.map((point) => (
              <li key={point.id} className="flex items-baseline gap-2.5 py-1">
                <span className="tnum w-[26px] shrink-0 font-mono text-[11px] text-ink-soft">×{point.timesMissed}</span>
                <span className="min-w-0 flex-1 font-serif text-[13px] leading-[1.45] text-ink">
                  {point.summary}
                  {(point.section || point.pageRef) && (
                    <span className="ml-1.5 italic text-muted">
                      {[point.section && `§ ${point.section}`, point.pageRef].filter(Boolean).join(', ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <Link
            href={`/courses/${encodeURIComponent(course!.id)}`}
            className="mt-1 inline-block font-serif text-[12.5px] italic text-muted no-underline transition-colors hover:text-ink"
          >
            {open > top.length ? `All ${open} on ${course!.code} →` : `On ${course!.code} →`}
          </Link>
        </div>
      ))}
    </section>
  );
}
