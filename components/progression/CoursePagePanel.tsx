'use client';

import type { Course } from '@/lib/data';
import { MARKS_PER_PAGE, type CoursePages } from '@/lib/progression';
import TallyMarks from './TallyMarks';

/**
 * This course's page, on the course's own screen.
 *
 * The marks sit in the margin the way they would in a notebook, the bound
 * pages behind them are a count that only ever goes up, and the whole panel
 * takes the course's ink density so a course left alone for a fortnight is
 * paler than one worked yesterday.
 *
 * Nothing here is announced anywhere. There is no notification when the ink
 * fades and no sentence in the product telling anyone a value dropped. It is
 * simply how the page looks when you next open it.
 */
export default function CoursePagePanel({
  course,
  record,
  ink,
}: {
  course: Course;
  record: CoursePages;
  ink: number | null;
}) {
  const opacity = ink === null ? 1 : 0.5 + ink * 0.5;

  return (
    <section className="deckle mt-6 border border-line bg-paper px-7 py-6" style={{ opacity }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="eyebrow m-0">Page {record.bound + 1}</p>
        <span className="font-mono text-[11px] text-muted">
          {record.bound === 0
            ? 'nothing bound yet'
            : `${record.bound} ${record.bound === 1 ? 'page' : 'pages'} bound`}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <TallyMarks
          inked={record.onPage}
          total={MARKS_PER_PAGE}
          size={26}
          color={course.color}
        />
        <span className="font-mono text-[12px] text-muted">
          {record.onPage} of {MARKS_PER_PAGE} marks
        </span>
      </div>

      <p className="m-0 mt-4 text-[12px] leading-[1.6] text-muted">
        {record.marks === 0
          ? 'The first mark on a new course is a short one.'
          : record.toBind === 1
            ? 'One more mark binds this page into the course record.'
            : `${record.toBind} marks bind this page into the course record.`}
      </p>
    </section>
  );
}
