'use client';

import type { Course } from '@/lib/data';
import { MARKS_PER_PAGE, type CoursePages } from '@/lib/progression';
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
 */
export default function CoursePage({
  course,
  record,
  ink,
}: {
  course: Course;
  record: CoursePages;
  ink: number | null;
}) {
  // A course with no weekly goal has opted out of fading entirely: there is
  // nothing to be behind on, so it is always drawn at full strength.
  const opacity = ink === null ? 1 : 0.45 + ink * 0.55;

  return (
    <div className="flex items-center gap-4" style={{ opacity }}>
      <span
        aria-hidden
        className="h-8 w-1 shrink-0 rounded-[1px]"
        style={{ background: course.color }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="eyebrow" style={{ color: course.color }}>
            {course.code}
          </span>
          <span className="truncate text-[12px] text-muted">{course.name}</span>
        </div>

        <div className="mt-1.5 flex items-center gap-3">
          <TallyMarks inked={record.onPage} total={MARKS_PER_PAGE} color={course.color} />
          <span className="font-mono text-[10px] text-muted-soft">
            {record.onPage} / {MARKS_PER_PAGE}
          </span>
        </div>
      </div>

      <span className="shrink-0 text-right font-mono text-[11px] text-muted">
        {record.bound === 0 ? (
          <span className="text-muted-soft">first page</span>
        ) : (
          <>
            <span className="text-ink">{record.bound}</span>{' '}
            {record.bound === 1 ? 'page' : 'pages'} bound
          </>
        )}
      </span>
    </div>
  );
}
