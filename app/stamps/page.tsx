'use client';

import { useMemo } from 'react';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import CoursePageRow from '@/components/progression/CoursePage';
import ImpressionSheet from '@/components/progression/ImpressionSheet';
import RunPanel from '@/components/progression/RunPanel';
import TrustPulse from '@/components/progression/TrustPulse';
import { useCourses } from '@/lib/data-hooks';
import { sortCourses } from '@/lib/data/course-order';
import { useProgression } from '@/lib/progression/use-progression';

/**
 * The record.
 *
 * What was the Stamps tab, and what is now the only place the whole
 * progression layer is laid out at once: the run in weeks, every course's
 * page and the marks on it, and the impressions.
 *
 * Nothing on this screen is spendable and nothing is a currency. What
 * accumulates is an accurate picture of the semester, which is exactly why
 * fabricating any of it is pointless: a false picture of your own term is
 * worth nothing to the person who faked it.
 *
 * Every number here is derived from sessions and tasks on read, so this page
 * structurally cannot disagree with Stats about what happened.
 */
export default function RecordPage() {
  const { courses: rawCourses } = useCourses();
  const { progression, sitting, isLoading } = useProgression();
  const courses = useMemo(() => sortCourses(rawCourses), [rawCourses]);

  if (isLoading || !progression) {
    return (
      <PageShell wide>
        <LoadingIndicator label="Reading your term" />
      </PageShell>
    );
  }

  const bound = [...progression.pages.values()].reduce((acc, p) => acc + p.bound, 0);
  // What the sitting on the clock has done, then what is nearest. The same
  // line the timer carries, so the record and the clock never disagree.
  const headline = [
    ...(sitting?.lines ?? []),
    ...(progression.nextMark.shown ? [progression.nextMark.shown.line] : []),
  ];

  return (
    <PageShell wide>
      <header className="mb-8">
        <p className="m-0 mb-1.5 font-serif italic text-[13.5px] text-muted">
          {bound === 0 ? 'no pages bound yet' : `${bound} ${bound === 1 ? 'page' : 'pages'} bound`}
          {progression.runs.current > 0 &&
            ` · ${progression.runs.current} ${progression.runs.current === 1 ? 'week' : 'weeks'} running`}
        </p>
        <h1 className="m-0 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
          The record
        </h1>
        {headline.length > 0 && (
          <p className="m-0 mt-3 text-[13px] text-ink-soft">{headline.join(' · ')}</p>
        )}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <RunPanel runs={progression.runs} shape={progression.weekShape} />

        <section className="rounded-[14px] border border-line bg-paper p-6">
          <p className="eyebrow m-0">Pages</p>

          <div className="mt-5 flex flex-col gap-5">
            {courses.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">
                Add a course and its first page opens.
              </p>
            ) : (
              courses.map((course) => {
                const record = progression.pages.get(course.id);
                if (!record) return null;
                return (
                  <CoursePageRow
                    key={course.id}
                    course={course}
                    record={record}
                    ink={progression.ink.get(course.id) ?? null}
                  />
                );
              })
            )}
          </div>

          {progression.taperedToday && (
            <p className="m-0 mt-5 border-t border-line pt-4 text-[12px] leading-[1.6] text-muted">
              Today is long enough that the pages have stopped counting it at full rate. Stats,
              the heatmap and every export still show every hour you logged.
            </p>
          )}
        </section>
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between px-1 pb-3">
          <p className="eyebrow m-0">Impressions</p>
          <span className="font-mono text-[11px] text-muted">
            {progression.impressions.reduce((acc, i) => acc + i.struck, 0)} struck
          </span>
        </div>

        <ImpressionSheet ladders={progression.ladders} impressions={progression.impressions} />
      </section>

      <TrustPulse termDays={progression.termDays} />
    </PageShell>
  );
}
