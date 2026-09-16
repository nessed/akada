'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import Tally from '@/components/notebook/Tally';
import HandCheck from '@/components/notebook/HandCheck';
import Marginalia from '@/components/notebook/Marginalia';
import WeekSpine, { buildWeek } from '@/components/notebook/WeekSpine';
import WeekStrip from '@/components/dashboard/WeekStrip';
import { CheckBox, Eyebrow, PageButton, Swipe, TextButton } from '@/components/notebook/Marks';
import { formatHM, isoDate, startOfWeek } from '@/lib/utils';
import TermSoFar from '@/components/review/TermSoFar';
import { loggable } from '@/lib/derive';
import { termWeek, useReview } from '@/lib/review';
import { usePreferences } from '@/lib/preferences';
import { FEELINGS, headline, oneQuestion, summary, weekFacts } from '@/lib/review-prose';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  useActiveSemester,
  toggleTaskOptimistic,
} from '@/lib/data-hooks';

/**
 * Review. This was Stats.
 *
 * The difference is not cosmetic: Stats was a dashboard you browsed, with a
 * heatmap and a streak and a set of totals that were the same shape every
 * week. Review is a week you close — it reads the week back to you in
 * sentences, asks one question, takes the answer, and then gets out of the
 * way until the next one. The charts that survived are the two that say
 * something a sentence cannot: where the hours went, and the shape of the
 * term behind you.
 */
export default function StatsPage() {
  const router = useRouter();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { semester } = useActiveSemester();
  const [prefs] = usePreferences();
  const sessions = useMemo(() => loggable(rawSessions), [rawSessions]);

  const today = isoDate();
  // How many weeks back the reader is reading. 1 is last week, which is the
  // week Review is actually for; 0 is the week still in progress.
  const [back, setBack] = useState(1);

  const range = useMemo(() => {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() - back * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: isoDate(start), to: isoDate(end), start, end };
  }, [back]);

  const review = useReview(range.from);
  const facts = useMemo(
    () => weekFacts(courses, sessions, tasks, range.from, range.to),
    [courses, sessions, tasks, range.from, range.to],
  );

  // The seven days of whichever week is being read, which is not always the
  // week today sits in.
  const week = useMemo(
    () => buildWeek(courses, tasks, sessions, prefs.hideWeekends, today, range.from),
    [courses, tasks, sessions, prefs.hideWeekends, today, range.from],
  );

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) router.replace('/onboarding');
  }, [onboarded, onboardingLoading, onboardingError, router]);

  const loading =
    onboardingLoading || onboarded === false || coursesLoading || sessionsLoading || tasksLoading;
  if (loading) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Reading the week back" className="mb-6" />
      </PageShell>
    );
  }

  const weekNo = termWeek(semester?.startDate ?? null, range.start);
  const lead = headline(facts);
  const question = oneQuestion(facts, today);
  const peak = Math.max(1, ...facts.byCourse.map((r) => r.seconds));

  const aside = (
    <>
      {/* The week itself, day by day. It was on Today, where it was a second
          calendar on a screen that had one; here it is the thing being read. */}
      <div className="mb-7">
        <Eyebrow>Day by day</Eyebrow>
        <div className="hidden lg:block">
          <WeekSpine days={week} />
        </div>
        <div className="mt-3 lg:hidden">
          <WeekStrip days={week} />
        </div>
      </div>

      {question ? (
        <>
          <Eyebrow>One question</Eyebrow>
          <h2 className="mt-2.5 font-serif text-[22px] font-normal leading-[1.28] tracking-[-0.015em]">
            {question}
          </h2>
        </>
      ) : (
        <>
          <Eyebrow>One question</Eyebrow>
          <h2 className="mt-2.5 font-serif text-[22px] font-normal leading-[1.28] text-ink-soft">
            Nothing stands out this week. Anything you want to note?
          </h2>
        </>
      )}

      {/* Ruled paper, not a boxed textarea. The lines are the page's. */}
      <textarea
        value={review.answer}
        onChange={(e) => review.save({ answer: e.target.value })}
        rows={4}
        placeholder="…"
        aria-label="Your answer"
        className="ruled-note mt-4 min-h-[132px] w-full resize-none border-y border-line bg-transparent py-3.5 font-serif text-[16px] text-ink placeholder:text-muted"
      />

      <Eyebrow className="mb-2 mt-5">How it felt</Eyebrow>
      <div className="flex flex-wrap items-baseline gap-4">
        {FEELINGS.map((word, i) => {
          const on = review.felt.includes(word);
          return (
            <button
              key={word}
              type="button"
              aria-pressed={on}
              onClick={() =>
                review.save({
                  felt: on ? review.felt.filter((f) => f !== word) : [...review.felt, word],
                })
              }
              className={`bg-transparent font-serif text-[15px] ${on ? 'text-ink' : 'text-muted'}`}
            >
              {on ? (
                <Swipe color={i % 2 === 0 ? 'var(--butter-tint)' : 'var(--peach-tint)'}>{word}</Swipe>
              ) : (
                word
              )}
            </button>
          );
        })}
      </div>

      {/* What is still open goes forward. Ticking one here is the same tick
          as anywhere else in the app: it writes through to the task. */}
      {facts.carried.length > 0 && (
        <>
          <Eyebrow className="mb-2 mt-7">
            Carry into week {weekNo ? weekNo + 1 : 'next'}
          </Eyebrow>
          {facts.carried.slice(0, 5).map((task, i) => (
            <button
              key={task.id}
              type="button"
              onClick={() => toggleTaskOptimistic(task).catch(() => {})}
              className={`flex w-full items-center gap-3 bg-transparent py-2.5 text-left ${
                i === Math.min(facts.carried.length, 5) - 1 ? '' : 'row-rule'
              }`}
            >
              <CheckBox
                checked={task.completed}
                color={courses.find((c) => c.id === task.courseId)?.color}
                size={17}
              />
              <span className="min-w-0 flex-1 text-[13.5px]">{task.title}</span>
            </button>
          ))}
        </>
      )}

      <div className="mb-8 mt-auto pt-8">
        {review.closed ? (
          <div className="text-center">
            <p className="m-0 font-serif text-[15px] italic text-muted">
              This week is closed.
            </p>
            <TextButton tone="quiet" className="mt-2" onClick={review.reopen}>
              open it again
            </TextButton>
          </div>
        ) : (
          <>
            <PageButton onClick={review.close}>
              Close week {weekNo ?? ''}
            </PageButton>
            <p className="mt-3 text-center font-serif text-[13px] italic text-muted">
              Sunday evenings, or whenever you like.
            </p>
          </>
        )}
      </div>
    </>
  );

  return (
    <PageShell aside={aside}>
      <div className="flex items-baseline justify-between gap-4 border-b-[1.5px] border-ink pb-3">
        <Eyebrow as="span" style={{ letterSpacing: '0.18em' }}>
          {weekNo ? `Week ${weekNo} · ` : ''}
          {spanLabel(range.start, range.end)}
        </Eyebrow>
        <span className="font-mono text-[11px] tracking-[0.1em] text-muted">
          {review.closed ? 'CLOSED' : back === 0 ? 'STILL OPEN' : 'UNREAD'}
        </span>
      </div>

      {/* Stepping back through the term. */}
      <div className="mt-3 flex items-baseline gap-4">
        <button
          type="button"
          onClick={() => setBack(back + 1)}
          className="bg-transparent font-serif text-[13.5px] italic text-muted hover:text-ink-soft"
        >
          ← the week before
        </button>
        {back > 0 && (
          <button
            type="button"
            onClick={() => setBack(back - 1)}
            className="bg-transparent font-serif text-[13.5px] italic text-muted hover:text-ink-soft"
          >
            {back === 1 ? 'this week so far →' : 'the week after →'}
          </button>
        )}
      </div>

      {lead && (
        <h1 className="mt-7 font-serif text-[34px] font-normal leading-none tracking-[-0.035em] md:text-[52px]">
          {lead.lead} <em className="italic">{lead.emphasis}</em>
        </h1>
      )}

      <p className="mt-4 max-w-[58ch] font-serif text-[16.5px] leading-[1.62] text-ink-soft">
        {summary(facts, today)}
      </p>

      <div className="mt-8 flex flex-col gap-10 lg:flex-row">
        {/* Where the hours went. Tally strokes rather than bars: the unit is
            an hour, and a bar makes you measure it against an axis. */}
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-2.5">Where it went</Eyebrow>
          {facts.byCourse.length === 0 ? (
            <p className="font-serif text-[15px] italic text-muted">No courses yet.</p>
          ) : (
            facts.byCourse.map((row, i) => (
              <div
                key={row.course.id}
                className={`flex items-center gap-3.5 py-2.5 ${
                  i === facts.byCourse.length - 1 ? '' : 'row-rule'
                }`}
              >
                <span
                  className="w-[64px] flex-none text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft"
                >
                  {row.course.code}
                </span>
                {row.seconds > 0 ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <Tally
                        hours={row.seconds / 3600}
                        height={22}
                        width={2.5}
                        gap={3}
                        color={row.course.color}
                        max={Math.max(8, Math.ceil(peak / 3600))}
                        reading={false}
                      />
                    </span>
                    <span className="flex-none font-mono text-sm font-bold">
                      {formatHM(row.seconds)}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      aria-hidden
                      className="h-px flex-1 border-b border-dashed border-line-strong"
                    />
                    <span className="flex-none font-serif text-[13.5px] italic text-warn">
                      {lastSeenLabel(facts.untouched.find((u) => u.course.id === row.course.id)?.lastDate ?? null)}
                    </span>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* What got done, and what did not. */}
        <div className="w-full flex-none lg:w-[300px]">
          <Eyebrow className="mb-2.5">Finished · carried over</Eyebrow>
          {facts.finished.length === 0 && facts.carried.length === 0 ? (
            <p className="font-serif text-[15px] italic text-muted">Nothing either way.</p>
          ) : (
            <>
              {facts.finished.slice(0, 4).map((task) => (
                <div key={task.id} className="row-rule flex items-baseline gap-2.5 py-2">
                  <HandCheck size={13} color="var(--mint)" />
                  <span className="flex-1 text-[13.5px] text-ink-soft">{task.title}</span>
                </div>
              ))}
              {facts.carried.slice(0, 4).map((task) => (
                <div key={task.id} className="row-rule flex items-baseline gap-2.5 py-2">
                  {/* A carried task takes a dash, not a cross: it did not
                      fail, it moved. */}
                  <span aria-hidden className="flex w-[13px] flex-none justify-center">
                    <i className="block h-[1.4px] w-[7px] bg-warn" />
                  </span>
                  <span className="flex-1 text-[13.5px]">{task.title}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* The term behind this week. It is the one chart Review keeps that a
          sentence cannot replace: the shape of fifteen weeks, with the week
          you are reading marked in it. */}
      <TermSoFar
        courses={courses}
        sessions={sessions}
        tasks={tasks}
        termStart={semester?.startDate ?? null}
        readingWeek={range.from}
        today={today}
      />

      {facts.totalSeconds === 0 && (
        <div className="mt-8 flex justify-center">
          <Marginalia mark="wave" width={150} color="var(--line-strong)" />
        </div>
      )}
    </PageShell>
  );
}

function spanLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function lastSeenLabel(lastDate: string | null): string {
  if (!lastDate) return 'not opened yet';
  const day = new Date(lastDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
  return `nothing since ${day}`;
}
