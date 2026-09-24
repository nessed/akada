'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import HandNote from '@/components/notebook/HandNote';
import Stamp from '@/components/notebook/Stamp';
import CoursePageRow from '@/components/progression/CoursePage';
import ImpressionSheet from '@/components/progression/ImpressionSheet';
import HabitsPanel from '@/components/progression/HabitsPanel';
import RunPanel from '@/components/progression/RunPanel';
import TrustPulse from '@/components/progression/TrustPulse';
import { useActiveSemester, useCourses } from '@/lib/data-hooks';
import { sortCourses } from '@/lib/data/course-order';
import { MARKS_PER_PAGE } from '@/lib/progression';
import { useProgression } from '@/lib/progression/use-progression';
import {
  diffRecord,
  readSnapshot,
  snapshotOf,
  writeSnapshot,
  type RecordNews,
} from '@/lib/progression/visits';
import type { Course } from '@/lib/data';
import type { Ladder } from '@/lib/progression';

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
 *
 * It is laid out the way Stats is, since the two are read side by side: a
 * masthead with the one figure the page is about, a ledger line under a
 * newspaper rule, deckle cards with serif headings, and the impressions
 * dealt onto the desk.
 */
export default function RecordPage() {
  const { courses: rawCourses } = useCourses();
  const { semester } = useActiveSemester();
  const { progression, logged, sitting, isLoading } = useProgression();
  const courses = useMemo(() => sortCourses(rawCourses), [rawCourses]);

  /* What changed since the reader last opened this page. Read once, from
     the logged record rather than the sitting on the clock, then the new
     baseline is written straight away: the news belongs to this visit, and
     the dot on the nav clears the moment the page is open. */
  const [news, setNews] = useState<RecordNews | null>(null);
  const seen = useRef(false);
  useEffect(() => {
    if (!logged || seen.current) return;
    seen.current = true;
    const before = readSnapshot();
    if (before) setNews(diffRecord(before, logged));
    writeSnapshot(snapshotOf(logged));
  }, [logged]);

  const semesterWeek = useMemo(() => {
    if (!semester?.startDate || !semester?.endDate) return null;
    const start = new Date(semester.startDate + 'T00:00:00').getTime();
    const end = new Date(semester.endDate + 'T00:00:00').getTime();
    const total = Math.max(1, Math.ceil((end - start) / 86400000 / 7));
    const elapsed = Math.max(0, (Date.now() - start) / 86400000);
    return { current: Math.min(total, Math.max(1, Math.ceil(elapsed / 7))), total };
  }, [semester]);

  if (isLoading || !progression) {
    return (
      <PageShell wide>
        <LoadingIndicator compact label="Reading your term" className="mb-6" />
        {/* The shape of the page being set, not a grid of grey boxes. */}
        <div className="opacity-30" aria-hidden>
          <div className="mb-3 h-2 w-24 rounded-full bg-line" />
          <div className="mb-8 h-8 w-[38%] rounded-full bg-line" />
          <div className="mb-[var(--density-gap)] h-10 border-y border-line" />
          <div className="grid gap-[var(--density-gap)] lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="deckle h-[260px] border border-line bg-paper" />
            <div className="deckle h-[260px] border border-line bg-paper" />
          </div>
        </div>
      </PageShell>
    );
  }

  const pages = [...progression.pages.values()];
  const bound = pages.reduce((acc, p) => acc + p.bound, 0);
  const marks = pages.reduce((acc, p) => acc + p.marks, 0);
  const struck = progression.impressions.reduce((acc, i) => acc + i.struck, 0);
  const { runs } = progression;
  const empty = progression.termDays === 0;

  // What the sitting on the clock has done, then what is nearest. The same
  // line the timer carries, so the record and the clock never disagree.
  const landed = sitting?.lines ?? [];
  const next = progression.nextMark.shown?.line ?? null;
  // The few things nearest after the one Next Mark names. Today and the
  // timer say one line and then go quiet; this is where the rest are looked
  // up, so a reader choosing what to sit next can see the whole board.
  const reach = progression.nextMark.candidates.slice(0, 4);

  return (
    <PageShell wide>
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 font-serif text-[13.5px] italic text-muted">
              {bound === 0
                ? 'no pages bound yet'
                : `${bound} ${bound === 1 ? 'page' : 'pages'} bound`}
              {` · ${struck} ${struck === 1 ? 'impression' : 'impressions'} struck`}
            </p>
            {semesterWeek && (
              <Stamp>
                Wk {semesterWeek.current} / {semesterWeek.total}
              </Stamp>
            )}
          </div>
          <h1 className="m-0 mt-2 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
            The <span className="italic">record</span>
          </h1>
          {(landed.length > 0 || next) && <NextLine landed={landed} next={next} />}
        </div>

        {/* The one figure this page is about: weeks running, with the best
            written beside it in the margin so losing a run never hides it. */}
        <div className="shrink-0 md:text-right">
          <span className="font-mono text-[44px] font-semibold leading-[0.9] tracking-[-0.04em] tabular-nums text-ink md:text-[52px]">
            {runs.current}
          </span>
          <p className="m-0 mt-1 text-[12px] text-muted">
            {runs.current === 1 ? 'week' : 'weeks'} running
          </p>
          {runs.best > 0 && (
            <HandNote className="animate-settle mt-1.5" size={18} rotate={-2.5}>
              {runs.current >= runs.best
                ? runs.current === 0
                  ? 'this week starts one'
                  : 'your longest yet'
                : `best is ${runs.best}`}
            </HandNote>
          )}
        </div>
      </header>

      {/* The term so far, as a line in a ledger under a newspaper rule. */}
      <div
        className="mb-[var(--density-gap)] py-3.5"
        style={{ borderTop: '1.5px solid var(--ink)', borderBottom: '1px solid var(--line)' }}
      >
        <p className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 font-serif text-[13px] italic text-muted">
          <span>
            <Figure>{marks}</Figure> {marks === 1 ? 'mark' : 'marks'} inked
          </span>
          <span>
            <Figure>{bound}</Figure> {bound === 1 ? 'page' : 'pages'} bound
          </span>
          <span>
            best run <Figure>{runs.best}</Figure> {runs.best === 1 ? 'week' : 'weeks'}
          </span>
          {runs.grace > 0 && (
            <span>
              <Figure>{runs.grace}</Figure> margin {runs.grace === 1 ? 'day' : 'days'} banked
            </span>
          )}
        </p>
      </div>

      {news?.any && <SinceLastLooked news={news} courses={courses} ladders={progression.ladders} />}

      {empty && (
        <div className="deckle mb-[var(--density-gap)] border border-dashed border-line-strong px-[var(--density-gutter)] py-6 text-center">
          <p className="m-0 font-serif text-[16px] italic text-ink-soft">
            The record starts with the first sitting you log.
          </p>
          <Link
            href="/timer"
            className="hand-underline mt-2 inline-block font-serif text-[14px] text-ink no-underline"
          >
            Open the timer
          </Link>
        </div>
      )}

      <div className="grid items-start gap-[var(--density-gap)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="settle-in min-w-0">
          <section className="deckle border border-line bg-paper px-[var(--density-gutter)] pt-5 pb-2">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="m-0 font-serif text-[20px] font-medium">Course pages</h2>
              <span className="font-serif text-[12.5px] italic text-muted">
                every {MARKS_PER_PAGE} marks binds a page
              </span>
            </div>

            {courses.length === 0 ? (
              <div className="my-4 rounded-[10px] border border-dashed border-line px-4 py-8 text-center">
                <p className="m-0 font-serif text-[14px] italic text-muted-soft">
                  Add a course and its first page opens.
                </p>
              </div>
            ) : (
              <div>
                {courses.map((course, index) => {
                  const record = progression.pages.get(course.id);
                  if (!record) return null;
                  return (
                    <CoursePageRow
                      key={course.id}
                      course={course}
                      record={record}
                      ink={progression.ink.get(course.id) ?? null}
                      delay={500 + index * 120}
                      fresh={news?.marks.find((m) => m.courseId === course.id)?.n ?? 0}
                    />
                  );
                })}
              </div>
            )}

            {progression.taperedToday && (
              <p className="m-0 mb-3 mt-1 border-t border-line pt-3 font-serif text-[12.5px] italic leading-[1.6] text-muted">
                Today is long enough that the pages have stopped counting it at full rate. Stats,
                the heatmap and every export still show every hour you logged.
              </p>
            )}
          </section>
        </div>

        <aside className="settle-in grid grid-cols-[minmax(0,1fr)] gap-[var(--density-gap)]">
          <RunPanel runs={runs} shape={progression.weekShape} />
          {reach.length > 0 && (
            <section className="deckle border border-line bg-paper px-[var(--density-gutter)] pt-5 pb-2">
              <h2 className="m-0 font-serif text-[20px] font-medium">Within reach</h2>
              <ul className="m-0 mt-1 list-none p-0">
                {reach.map((c, i) => (
                  <li
                    key={c.id}
                    className="flex items-baseline gap-3 border-b border-dashed border-line py-3 last:border-0"
                  >
                    <span className="w-3 shrink-0 font-mono text-[11px] text-muted-soft">
                      {i + 1}
                    </span>
                    <span
                      className={`font-serif text-[14px] leading-snug ${
                        i === 0 ? 'text-ink' : 'text-ink-soft'
                      }`}
                    >
                      {c.line}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {/* What the term has taught the app about the reader. Reads the record
          without the sitting on the clock, so a figure here is a habit and
          not the last ten minutes. */}
      <div className="settle-in mt-[var(--density-gap)]">
        <HabitsPanel habits={(logged ?? progression).habits} courses={courses} />
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between gap-3 px-1">
          <h2 className="m-0 font-serif text-[20px] font-medium">Impressions</h2>
          <span className="font-serif text-[12.5px] italic text-muted">
            <Figure>{struck}</Figure> struck so far
          </span>
        </div>

        <ImpressionSheet
          ladders={progression.ladders}
          impressions={progression.impressions}
          fresh={news?.struck ?? null}
        />
      </section>

      <TrustPulse termDays={progression.termDays} />
    </PageShell>
  );
}

/**
 * What the record gained while the reader was away, taped to the top of the
 * page. Facts only, in the Next Mark voice: what was inked, bound, struck and
 * added, and nothing about what was missed. A visit with nothing new shows
 * nothing at all.
 */
function SinceLastLooked({
  news,
  courses,
  ladders,
}: {
  news: RecordNews;
  courses: Course[];
  ladders: Ladder[];
}) {
  const byCourse = new Map(courses.map((c) => [c.id, c]));
  const byLadder = new Map(ladders.map((l) => [l.id, l]));
  const totalMarks = news.marks.reduce((acc, m) => acc + m.n, 0);

  const rows: { key: string; figure: string; text: React.ReactNode }[] = [];
  if (totalMarks > 0) {
    rows.push({
      key: 'marks',
      figure: `+${totalMarks}`,
      text: (
        <>
          {totalMarks === 1 ? 'mark inked' : 'marks inked'}
          {news.marks.length > 0 && (
            <span className="text-muted">
              {' · '}
              {news.marks
                .map((m) => `${byCourse.get(m.courseId)?.code ?? 'a course'} ${m.n}`)
                .join(', ')}
            </span>
          )}
        </>
      ),
    });
  }
  for (const b of news.bound) {
    rows.push({
      key: `bound-${b.courseId}`,
      figure: `+${b.n}`,
      text: (
        <>
          {b.n === 1 ? 'page bound' : 'pages bound'} on{' '}
          <span className="text-ink">{byCourse.get(b.courseId)?.code ?? 'a course'}</span>
        </>
      ),
    });
  }
  for (const [id, n] of news.struck) {
    const ladder = byLadder.get(id);
    if (!ladder) continue;
    const reached = ladder.thresholds.filter((t) => t <= ladder.value).length;
    const rung = ladder.thresholds[reached - 1];
    rows.push({
      key: `struck-${id}`,
      figure: rung !== undefined ? ladder.format(rung) : `+${n}`,
      text: (
        <>
          struck on <span className="text-ink">{ladder.name}</span>
          {n > 1 && <span className="text-muted"> · {n} rungs</span>}
        </>
      ),
    });
  }
  if (news.run > 0) {
    rows.push({
      key: 'run',
      figure: `+${news.run}`,
      text: <>{news.run === 1 ? 'week added to the run' : 'weeks added to the run'}</>,
    });
  }

  return (
    <section
      className="deal-in deckle relative mb-[var(--density-gap)] border border-line-strong bg-paper px-[var(--density-gutter)] pt-6 pb-3"
      aria-label="Since you last looked"
    >
      <span aria-hidden className="tape" style={{ top: -9, left: 28 }} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <HandNote size={22} rotate={-1.5}>
          since you last looked
        </HandNote>
        <span className="font-serif text-[12.5px] italic text-muted">{ago(news.since)}</span>
      </div>
      <ul className="m-0 mt-2 grid list-none gap-x-10 p-0 md:grid-cols-2">
        {rows.map((row, i) => (
          <li
            key={row.key}
            className="deal-in flex items-baseline gap-4 border-b border-dashed border-line py-2.5 last:border-0"
            style={{ animationDelay: `${200 + i * 90}ms` }}
          >
            <span className="w-[56px] shrink-0 font-mono text-[15px] font-semibold tabular-nums text-ink">
              {row.figure}
            </span>
            <span className="font-serif text-[14px] leading-snug text-ink-soft">{row.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return 'earlier today';
  const hours = Math.round(minutes / 60);
  if (hours < 20) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.max(1, Math.round(hours / 24));
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
}

/**
 * Next Mark, read off the progression this page already has, so it does not
 * log an impression the way the Today and Timer lines do: the record is where
 * the line is looked up, not where it is offered.
 */
function NextLine({ landed, next }: { landed: string[]; next: string | null }) {
  return (
    <p className="m-0 mt-3 flex items-baseline gap-2.5 text-[13px] leading-[1.5] text-ink-soft">
      <span aria-hidden className="translate-y-[1px] text-muted-soft">
        <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
          <path
            d="M1.6 1.4v9.2M4.2 1.2v9.4M6.8 1.5v9.1M9.6 1.1L1 10.9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>
        {landed.map((line, i) => (
          <span key={line}>
            {i > 0 && ' · '}
            <span className="text-ink">{line}</span>
          </span>
        ))}
        {next && (
          <>
            {landed.length > 0 && ' · '}
            {next}
          </>
        )}
      </span>
    </p>
  );
}

/** A number inside a sentence: mono, upright, the app's ink. */
function Figure({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[15px] font-semibold not-italic text-ink tabular-nums">
      {children}
    </span>
  );
}
