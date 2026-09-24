'use client';

import Link from 'next/link';
import type { Course } from '@/lib/data';
import { MARKS_PER_PAGE, type CoursePages } from '@/lib/progression';
import { formatHM } from '@/lib/utils';
import TallyMarks from './TallyMarks';

/**
 * A course's page, with its marks in the margin.
 *
 * Study time inks marks; enough marks bind the page and a fresh one opens.
 * Bound pages stay in the course record permanently, and at term close they
 * bind into a volume. There is no rate to understand: every mark is the same
 * distance, except the very first one on a new course, which is shorter so
 * that a course added this morning is reachable this afternoon.
 *
 * `ink` fades the whole thing according to how recently this course has been
 * worked. Nothing anywhere announces that it faded. A course you find pale
 * when you open it is a fact about your term; the same fact pushed at you as
 * a notification would be a nag, and this app does not send one.
 *
 * The row is written on the card the way a log row on Stats is, and opens
 * the course, since the course page is where its own panel and its tasks
 * are. `delay` staggers the marks drawing in as the page opens.
 */
export default function CoursePage({
  course,
  record,
  ink,
  delay = 0,
}: {
  course: Course;
  record: CoursePages;
  ink: number | null;
  delay?: number;
}) {
  // A course with no weekly goal has opted out of fading entirely: there is
  // nothing to be behind on, so it is always drawn at full strength.
  const opacity = ink === null ? 1 : 0.45 + ink * 0.55;

  return (
    <Link
      href={`/courses/${encodeURIComponent(course.id)}`}
      className="group -mx-2 flex items-center gap-4 rounded-[10px] border-b border-dashed border-line px-2 py-4 no-underline transition-colors last:border-0 hover:bg-paper-2"
      style={{ opacity }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="course-rule"
            style={{ '--c': course.color } as React.CSSProperties}
          />
          <span className="eyebrow text-ink-soft">{course.code}</span>
        </div>
        <p className="m-0 mt-1 truncate font-serif text-[15px] font-medium text-ink">
          {course.name}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <TallyMarks
            inked={record.onPage}
            total={MARKS_PER_PAGE}
            fresh={record.onPage}
            delay={delay}
            stagger={45}
            size={22}
            color={course.color}
          />
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {record.onPage} / {MARKS_PER_PAGE}
          </span>
        </div>

        <p className="m-0 mt-1.5 font-serif text-[12.5px] italic text-muted">
          {record.marks === 0 ? (
            <>
              <span className="font-mono not-italic text-ink-soft">
                {formatHM(record.toNextMark)}
              </span>{' '}
              to the first mark
            </>
          ) : (
            <>
              <span className="font-mono not-italic text-ink-soft">
                {formatHM(record.toNextMark)}
              </span>{' '}
              to the next mark
              {' · '}
              {record.toBind === 1
                ? 'one more binds the page'
                : `${record.toBind} to bind the page`}
            </>
          )}
        </p>
      </div>

      <BoundStack bound={record.bound} />

      <span
        aria-hidden
        className="shrink-0 text-[15px] text-muted-soft transition-transform group-hover:translate-x-0.5"
      >
        &rarr;
      </span>
    </Link>
  );
}

/**
 * The pages bound so far, drawn as the edge of a stack of sheets: one more
 * sheet showing behind for each page, up to four, with the count beside it.
 */
function BoundStack({ bound }: { bound: number }) {
  const sheets = Math.min(4, bound);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
      {bound === 0 ? (
        <span className="font-serif text-[12px] italic text-muted-soft">first page</span>
      ) : (
        <>
          <span aria-hidden className="relative block h-[26px] w-[24px]">
            {Array.from({ length: sheets }).map((_, i) => (
              <span
                key={i}
                className="absolute h-[20px] w-[16px] rounded-[2px] border border-line-strong bg-paper"
                style={{ right: i * 2.5, top: i * 1.5, zIndex: sheets - i }}
              >
                {i === 0 && (
                  <span className="absolute inset-x-[3px] top-[5px] flex flex-col gap-[3px]">
                    {[0, 1, 2].map((r) => (
                      <span key={r} className="block h-px bg-line-strong" />
                    ))}
                  </span>
                )}
              </span>
            ))}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted">
            <span className="text-ink">{bound}</span> bound
          </span>
        </>
      )}
    </div>
  );
}
