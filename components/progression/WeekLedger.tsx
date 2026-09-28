'use client';

import { useState } from 'react';
import Link from 'next/link';
import { describeWeek, type LedgerWeek } from '@/lib/progression';
import type { Course } from '@/lib/data';
import { formatHM } from '@/lib/utils';
import HandCheck from '@/components/notebook/HandCheck';
import HandNote from '@/components/notebook/HandNote';

/** Weeks shown before "every week" is asked for. */
const SHOWN = 8;

const ROUTE: Record<NonNullable<LedgerWeek['run']['route']>, string> = {
  consistent: 'counted on its study days',
  breadth: 'counted on breadth, across courses',
  margin: 'counted with a margin day',
};

/**
 * The term as a ledger, a line a week, newest at the top.
 *
 * The run says which weeks counted; this says what each one held. A line is
 * the week's days as the run draws them, its hours with a rule against the
 * best week, the tallies it inked, and a stroke in each course's colour for
 * every course it touched, with the week's tick in the margin. Opened, a
 * line lays out each course's hours, tallies and bound pages for the week,
 * its biggest day, and how it counted. Every figure is read off the same
 * record as the pages above it, so a week's tallies add up to theirs.
 */
export default function WeekLedger({ weeks, courses }: { weeks: LedgerWeek[]; courses: Course[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const newest = [...weeks].reverse();
  const shown = all ? newest : newest.slice(0, SHOWN);
  const best = weeks.reduce<LedgerWeek | null>(
    (acc, w) => (w.seconds > 0 && (!acc || w.seconds > acc.seconds) ? w : acc),
    null,
  );
  const settled = weeks.filter((w) => !w.run.inProgress);
  const counted = settled.filter((w) => w.run.counts).length;
  // Whole weeks only: the one being lived would drag the average down every Monday.
  const averaged = settled.length > 0 ? settled : weeks;
  const average = averaged.reduce((a, w) => a + w.seconds, 0) / Math.max(1, averaged.length);

  if (weeks.length === 0) return null;

  return (
    <section className="deckle border border-line bg-paper px-[var(--density-gutter)] pt-5 pb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="m-0 font-serif text-[20px] font-medium">The term, week by week</h2>
        <p className="m-0 font-serif text-[12.5px] italic text-muted">
          <Figure>{counted}</Figure> of <Figure>{settled.length}</Figure> whole weeks counted ·{' '}
          <Figure>{formatHM(average)}</Figure> a whole week on average
        </p>
      </div>

      {/* Column heads, from the width that can hold the columns. */}
      <div
        aria-hidden
        className="mt-4 hidden grid-cols-[88px_112px_minmax(0,1fr)_64px_minmax(0,120px)_20px] items-center gap-x-4 border-b border-line pb-2 md:grid"
      >
        <span className="eyebrow">Week</span>
        <span className="eyebrow">Days</span>
        <span className="eyebrow">Hours</span>
        <span className="eyebrow text-right">Tallies</span>
        <span className="eyebrow">Courses</span>
        <span />
      </div>

      <ul className="m-0 list-none p-0">
        {shown.map((week, i) => (
          <Row
            key={week.start}
            week={week}
            best={best}
            byId={byId}
            open={open === week.start}
            onToggle={() => setOpen(open === week.start ? null : week.start)}
            delay={i * 40}
          />
        ))}
      </ul>

      {newest.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="mt-2 bg-transparent font-serif text-[12.5px] italic text-muted transition-colors hover:text-ink"
        >
          {all ? 'only the last eight' : `every week, all ${newest.length}`}
        </button>
      )}
    </section>
  );
}

function Row({
  week,
  best,
  byId,
  open,
  onToggle,
  delay,
}: {
  week: LedgerWeek;
  best: LedgerWeek | null;
  byId: Map<string, Course>;
  open: boolean;
  onToggle: () => void;
  delay: number;
}) {
  const date = new Date(week.start + 'T12:00:00').toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const isBest = best !== null && best.start === week.start && best.seconds > 0;
  const width = best && best.seconds > 0 ? (week.seconds / best.seconds) * 100 : 0;
  const summary = week.run.inProgress
    ? 'in progress'
    : week.run.counts
      ? `${describeWeek(week.run)}, counted`
      : `${describeWeek(week.run)}, did not count`;

  return (
    <li className="border-b border-dashed border-line last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Week ${week.n}, from ${date}: ${formatHM(week.seconds)}, ${summary}`}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-x-4 gap-y-2 bg-transparent py-3 text-left md:grid-cols-[88px_112px_minmax(0,1fr)_64px_minmax(0,120px)_20px]"
      >
        <span className="min-w-0">
          <span className={`eyebrow ${week.run.inProgress ? 'text-ink' : ''}`}>Wk {week.n}</span>
          <span className="ml-2 font-serif text-[13px] italic text-muted md:ml-0 md:block">{date}</span>
        </span>

        {/* The days, as the run draws them. */}
        <span className="order-4 col-span-3 flex gap-[3px] md:order-none md:col-span-1" aria-hidden>
          {week.run.days.map((day, i) => (
            <span
              key={day.iso}
              className="heat-in block h-[7px] flex-1 rounded-[2px] md:h-[12px] md:w-[13px] md:flex-none"
              style={{
                animationDelay: `${delay + i * 14}ms`,
                ...(day.state === 'qualified'
                  ? { background: 'var(--ink)' }
                  : day.state === 'margin'
                    ? { border: '1.3px solid var(--line-strong)' }
                    : day.state === 'future'
                      ? { border: '1px dashed var(--line)' }
                      : { background: 'var(--bg-tint)' }),
              }}
            />
          ))}
        </span>

        <span className="order-2 min-w-0 md:order-none">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[14px] font-semibold tabular-nums text-ink">
              {week.seconds > 0 ? formatHM(week.seconds) : '–'}
            </span>
            {week.marks > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-muted md:hidden">+{week.marks}</span>
            )}
            {isBest && (
              <HandNote size={16} rotate={-3}>
                best week
              </HandNote>
            )}
          </span>
          <span aria-hidden className="mt-1 hidden h-[2px] w-full rounded-full bg-line-soft md:block">
            <span
              className="rule-draw block h-full rounded-full bg-ink-soft"
              style={{ width: `${width}%`, animationDelay: `${0.2 + delay / 1000}s` }}
            />
          </span>
        </span>

        <span className="hidden text-right font-mono text-[13px] tabular-nums text-ink-soft md:block">
          {week.marks > 0 ? `+${week.marks}` : '·'}
          {week.bound > 0 && <span className="block text-[10.5px] text-muted">{week.bound} bound</span>}
        </span>

        <span className="hidden flex-wrap items-center gap-[3px] md:flex" aria-hidden>
          {week.courses
            .filter((c) => c.seconds > 0)
            .map((c) => (
              <span
                key={c.courseId}
                className="block h-[3px] w-[14px] rounded-[1px]"
                style={{ background: byId.get(c.courseId)?.color ?? 'var(--muted)' }}
              />
            ))}
        </span>

        <span aria-hidden className="order-3 flex justify-center md:order-none">
          {week.run.inProgress ? (
            <span className="text-muted-soft">·</span>
          ) : week.run.counts ? (
            <HandCheck size={13} color="var(--ink)" strokeWidth={1.6} />
          ) : (
            <span className="text-muted-soft">&ndash;</span>
          )}
        </span>
      </button>

      {open && <Opened week={week} byId={byId} />}
    </li>
  );
}

function Opened({ week, byId }: { week: LedgerWeek; byId: Map<string, Course> }) {
  const best = week.bestDay;
  return (
    <div className="animate-settle mb-3 rounded-[10px] bg-bg-tint px-4 py-3.5">
      <p className="m-0 font-serif text-[13px] italic leading-relaxed text-ink-soft">
        {week.run.inProgress
          ? `${describeWeek(week.run)} so far, still being lived`
          : week.run.counts && week.run.route
            ? `${describeWeek(week.run)}, ${ROUTE[week.run.route]}`
            : `${describeWeek(week.run)}, short of counting`}
        {best && (
          <>
            {' · '}biggest day{' '}
            {new Date(best.iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase()},{' '}
            <Figure>{formatHM(best.seconds)}</Figure>
          </>
        )}
        {week.tasksDone > 0 && (
          <>
            {' · '}
            <Figure>{week.tasksDone}</Figure> {week.tasksDone === 1 ? 'task' : 'tasks'} finished
          </>
        )}
      </p>

      {week.courses.length > 0 && (
        <ul className="m-0 mt-2.5 list-none p-0">
          {week.courses.map((c) => {
            const course = byId.get(c.courseId);
            return (
              <li key={c.courseId} className="flex items-baseline gap-3 py-1.5">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 sm:w-[96px] sm:flex-none">
                  <span className="course-rule" style={{ '--c': course?.color } as React.CSSProperties} />
                  <span className="eyebrow truncate text-ink-soft">{course?.code ?? 'Course'}</span>
                </span>
                {course ? (
                  <Link
                    href={`/courses/${course.id}`}
                    className="hidden min-w-0 flex-1 truncate font-serif text-[13.5px] text-ink no-underline hover:underline sm:block"
                  >
                    {course.name}
                  </Link>
                ) : (
                  <span className="hidden min-w-0 flex-1 sm:block" />
                )}
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink">{formatHM(c.seconds)}</span>
                <span className="w-[86px] shrink-0 text-right font-serif text-[12px] italic text-muted">
                  {c.marks > 0 ? (
                    <>
                      <span className="font-mono not-italic text-ink-soft">+{c.marks}</span>{' '}
                      {c.marks === 1 ? 'tally' : 'tallies'}
                    </>
                  ) : (
                    'no tally'
                  )}
                  {c.bound > 0 && <span className="block">bound {c.bound === 1 ? 'a page' : `${c.bound} pages`}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12.5px] not-italic tabular-nums text-ink">{children}</span>;
}
