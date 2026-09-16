'use client';

import Link from 'next/link';
import Tally from '../notebook/Tally';
import { CourseSpine } from '../notebook/Marks';
import type { Course } from '@/lib/data';

/**
 * One course, as a row on the index: its colour down the left, its code and
 * name, and the hours it got this week as tally strokes beside their own
 * reading. A course nobody has opened says so in words instead, with how long
 * it has been since anyone did.
 *
 * This used to be written inline on Today, where it was the seventh block on
 * a screen that answers one question. The rows themselves were never the
 * problem, so they moved rather than went.
 */
export default function CourseRow({
  course,
  seconds,
  daysQuiet,
}: {
  course: Course;
  /** Logged against this course this week. */
  seconds: number;
  /** Days since it was last opened, null if it never has been. */
  daysQuiet: number | null;
}) {
  const hours = seconds / 3600;

  return (
    <Link href={`/courses/${course.id}`} className="row-rule flex items-center gap-3 px-0.5 py-2.5">
      <CourseSpine color={course.color} height={26} />
      <span className="min-w-0 flex-1">
        {/* The spine beside it is the colour cue. The code is a word, so it is
            set in ink a person can read rather than in a pastel that scores
            under two to one. */}
        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
          {course.code}
        </span>
        <span className="block truncate font-serif text-[15px] text-ink">{course.name}</span>
      </span>
      {hours > 0 ? (
        <Tally hours={hours} goal={course.weeklyGoalHours} color="var(--ink)" className="flex-none" />
      ) : (
        <span className="flex-none font-serif text-[13px] italic text-warn">
          {daysQuiet === null
            ? '0h this week'
            : `0h this week · ${daysQuiet} ${daysQuiet === 1 ? 'day' : 'days'} quiet`}
        </span>
      )}
    </Link>
  );
}
