'use client';

import {
  describeWeek,
  DAY_QUALIFY_SECONDS,
  WEEK_BREADTH_COURSES,
  WEEK_BREADTH_DAYS,
  WEEK_CONSISTENT_DAYS,
  type RunReading,
  type RunWeek,
} from '@/lib/progression';
import type { WeekShape } from '@/lib/progression';
import { formatHM } from '@/lib/utils';
import HandCheck from '@/components/notebook/HandCheck';

/**
 * The run, in weeks.
 *
 * Current beside best, and best never goes away. That is the whole reason
 * this is safe to lose: breaking a run costs you your position and never your
 * history, so the thing you have built stays visible whatever this week did.
 *
 * A protected day is drawn hollow and counted separately. It is never filled
 * in and the line under it never says six days when five were studied. An app
 * willing to lie about a blank day in your favour is an app whose record of
 * your term is worth nothing.
 *
 * The rules for what counts sit behind a disclosure rather than printed under
 * the grid every time: they are looked up once, and the grid is read daily.
 */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function RunPanel({ runs, shape }: { runs: RunReading; shape: WeekShape | null }) {
  const recent = runs.weeks.slice(-8);
  const minutes = Math.round(DAY_QUALIFY_SECONDS / 60);
  const thisWeek = runs.thisWeek;

  return (
    <section className="deckle border border-line bg-paper px-[var(--density-gutter)] pt-5 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-serif text-[20px] font-medium">The run</h2>
        <span className="font-serif text-[12.5px] italic text-muted">
          best{' '}
          <span className="font-mono text-[13px] font-semibold not-italic text-ink tabular-nums">
            {runs.best}
          </span>
        </span>
      </div>

      {/* This week beside a typical one. Two facts, no verb between them.
          There is nothing here to beat: a personal best you are pushed to top
          would make a bigger number the goal, and hours are the easiest thing
          in this app to type in by hand. */}
      {(thisWeek || shape) && (
        <p className="m-0 mt-1.5 font-serif text-[12.5px] italic leading-snug text-muted">
          {thisWeek && (
            <>
              this week <span className="font-mono not-italic text-ink">{thisWeek.studyDays}</span>{' '}
              {thisWeek.studyDays === 1 ? 'day' : 'days'} in
            </>
          )}
          {shape && (
            <>
              {thisWeek && ' · '}
              <span className="font-mono not-italic text-ink">{formatHM(shape.thisWeek)}</span>
              {', usually '}
              <span className="font-mono not-italic text-ink">{formatHM(shape.typical)}</span>
            </>
          )}
        </p>
      )}

      {recent.length === 0 ? (
        <div className="mt-4 rounded-[10px] border border-dashed border-line px-4 py-7 text-center">
          <p className="m-0 font-serif text-[14px] italic text-muted-soft">
            The first week you log starts the run.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-3" aria-hidden>
            <span className="w-[44px] shrink-0" />
            <div className="flex flex-1 gap-1">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="eyebrow flex-1 text-center text-[9px] text-muted-soft">
                  {d}
                </span>
              ))}
            </div>
            <span className="w-4 shrink-0" />
          </div>
          <div className="flex flex-col gap-1">
            {recent.map((week, i) => (
              <WeekRow key={week.start} week={week} delay={i * 40} />
            ))}
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
            <Legend swatch={{ background: 'var(--ink)' }} label="studied" />
            <Legend swatch={{ border: '1.3px solid var(--line-strong)' }} label="margin day" />
            <Legend swatch={{ background: 'var(--bg-tint)' }} label="blank" />
            {runs.grace > 0 && (
              <span className="ml-auto font-mono text-[10.5px] text-muted">
                {runs.grace} banked
              </span>
            )}
          </div>
        </div>
      )}

      <details className="group mt-4 border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-serif text-[12.5px] italic text-muted transition-colors hover:text-ink-soft [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
            &rsaquo;
          </span>
          what makes a week count
        </summary>
        <p className="m-0 mt-2 text-[12px] leading-[1.6] text-muted">
          A day counts on {minutes} minutes logged, a task finished, or pages read. A week counts on{' '}
          {WEEK_CONSISTENT_DAYS} such days, or on {WEEK_BREADTH_DAYS} spread across{' '}
          {WEEK_BREADTH_COURSES} courses. A blank day can be covered by a margin day you banked,
          drawn hollow and never counted as studied.
        </p>
      </details>
    </section>
  );
}

function Legend({ swatch, label }: { swatch: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={swatch} />
      {label}
    </span>
  );
}

function WeekRow({ week, delay }: { week: RunWeek; delay: number }) {
  const label = new Date(week.start + 'T12:00:00').toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const summary = week.inProgress ? 'this week, in progress' : describeWeek(week);

  return (
    <div className="flex items-center gap-3" title={`Week of ${label} · ${summary}`}>
      <span
        className={`w-[44px] shrink-0 font-mono text-[10.5px] ${
          week.inProgress ? 'text-ink' : 'text-muted-soft'
        }`}
      >
        {label}
      </span>
      <span className="sr-only">{summary}</span>

      <div
        className={`flex flex-1 gap-1 rounded-[5px] ${
          week.inProgress ? 'outline outline-1 outline-offset-2 outline-line-strong' : ''
        }`}
      >
        {week.days.map((day, i) => (
          <span
            key={day.iso}
            title={`${new Date(day.iso + 'T12:00:00').toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })} · ${day.state === 'qualified' ? 'studied' : day.state === 'margin' ? 'margin day' : day.state}`}
            className="heat-in h-[18px] flex-1 rounded-[3px]"
            style={{
              animationDelay: `${delay + i * 18}ms`,
              ...(day.state === 'qualified'
                ? { background: 'var(--ink)' }
                : day.state === 'margin'
                  ? // Hollow. Covered, never claimed as studied.
                    { border: '1.3px solid var(--line-strong)' }
                  : day.state === 'future'
                    ? { border: '1px dashed var(--line)' }
                    : { background: 'var(--bg-tint)' }),
            }}
          />
        ))}
      </div>

      {/* Whether the week counted, as a tick in the margin rather than a
          sentence on every row. The sentence is in the title. */}
      <span aria-hidden className="flex w-4 shrink-0 justify-center text-[12px] leading-none">
        {week.inProgress ? (
          <span className="text-muted-soft">·</span>
        ) : week.counts ? (
          <HandCheck size={12} color="var(--ink)" strokeWidth={1.6} />
        ) : (
          <span className="text-muted-soft">&ndash;</span>
        )}
      </span>
    </div>
  );
}
