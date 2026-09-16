'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import AddCourseSheet from '@/components/AddCourseSheet';
import CourseRow from '@/components/course/CourseRow';
import { Eyebrow, TextButton } from '@/components/notebook/Marks';
import { isoDate } from '@/lib/utils';
import { daysQuiet, loggable, secondsByCourse, weekBounds } from '@/lib/derive';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
} from '@/lib/data-hooks';

/**
 * The courses, and the hours each one got this week.
 *
 * These rows were the last block on Today, under everything else, which is
 * the one place a reader never looks for them. They are a list you go to
 * rather than a thing you do now, so they have a page. It is reached from
 * Today's "also" line and from Settings, and it owns no tab: four places is
 * what the nav holds.
 */
export default function CoursesPage() {
  const router = useRouter();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const sessions = useMemo(() => loggable(rawSessions), [rawSessions]);

  const [addingCourse, setAddingCourse] = useState(false);

  const today = isoDate();

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) router.replace('/onboarding');
  }, [onboarded, onboardingLoading, onboardingError, router]);

  const weekByCourse = useMemo(() => {
    const [from, to] = weekBounds(new Date());
    return secondsByCourse(sessions, from, to);
  }, [sessions]);
  const quiet = useMemo(() => daysQuiet(courses, sessions, today), [courses, sessions, today]);

  const loading =
    onboardingLoading || onboarded === false || coursesLoading || sessionsLoading;
  if (loading) {
    return (
      <PageShell width="read">
        <LoadingIndicator compact label="Loading your courses" className="mb-6" />
      </PageShell>
    );
  }

  return (
    <PageShell width="read">
      <div className="flex items-baseline justify-between gap-5 border-b-[1.5px] border-ink pb-3">
        <Eyebrow as="span">Courses</Eyebrow>
        <span className="font-mono text-[11px] text-muted">hours this week</span>
      </div>

      <div className="mt-4">
        {courses.length === 0 ? (
          <div className="border border-dashed border-line-strong px-4 py-6 text-center">
            <p className="m-0 font-serif text-[15px] italic text-muted">
              No courses on the list yet.
            </p>
            <TextButton className="mt-3" onClick={() => setAddingCourse(true)}>
              add the first course
            </TextButton>
          </div>
        ) : (
          courses.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              seconds={weekByCourse[course.id] || 0}
              daysQuiet={quiet[course.id]}
            />
          ))
        )}
      </div>

      {courses.length > 0 && (
        <TextButton tone="quiet" className="mt-2.5" onClick={() => setAddingCourse(true)}>
          + add a course
        </TextButton>
      )}

      <AddCourseSheet
        open={addingCourse}
        onClose={() => setAddingCourse(false)}
        courses={courses}
      />
    </PageShell>
  );
}
