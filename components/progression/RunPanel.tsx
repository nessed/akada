'use client';

import {
  describeWeek,
  DAY_QUALIFY_SECONDS,
  WEEK_BREADTH_COURSES,
  WEEK_BREADTH_DAYS,
  WEEK_CONSISTENT_DAYS,
  type RunReading,
  type RunWeek,
  type WeekShape,
} from '@/lib/progression';
import { formatHM } from '@/lib/utils';

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
 */
export default function RunPanel({
  runs,
  shape,
}: {
  runs: RunReading;
  shape: WeekShape | null;
}) {
  const recent = runs.weeks.slice(-8);
  const minutes = Math.round(DAY_QUALIFY_SECONDS / 60);

  return (
    <section className="rounded-[14px] border border-line bg-paper p-6">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow m-0">Run</p>
        <span className="font-mono text-[11px] text-muted">
          best <span className="text-ink">{runs.best}</span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-[36px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
          {runs.current}
        </span>
        <span className="text-[13px] text-ink-soft">
          {runs.current === 1 ? 'week' : 'weeks'}
        </span>
        {runs.grace > 0 && (
          <span className="ml-auto font-mono text-[11px] text-muted">
            {runs.grace} margin {runs.grace === 1 ? 'day' : 'days'} banked
          </span>
        )}
      </div>

      {/* This week beside a typical one. Two facts, no verb between them.
          There is nothing here to beat: a personal best you are pushed to top
          would make a bigger number the goal, and hours are the easiest thing
          in this app to type in by hand. */}
      {shape && (
        <p className="m-0 mt-3 font-mono text-[11px] text-muted">
          this week <span className="text-ink">{formatHM(shape.thisWeek)}</span>
          {' · '}your weeks usually <span className="text-ink">{formatHM(shape.typical)}</span>
        </p>
      )}

      <div className="mt-5 flex flex-col gap-1.5">
        {recent.map((week) => (
          <WeekRow key={week.start} week={week} />
        ))}
      </div>

      <p className="m-0 mt-4 text-[12px] leading-[1.6] text-muted">
        A day counts on {minutes} minutes logged, a task finished, or pages read. A week counts
        on {WEEK_CONSISTENT_DAYS} such days, or on {WEEK_BREADTH_DAYS} spread across{' '}
        {WEEK_BREADTH_COURSES} courses.
      </p>
    </section>
  );
}

function WeekRow({ week }: { week: RunWeek }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[52px] shrink-0 font-mono text-[10px] text-muted-soft">
        {new Date(week.start + 'T12:00:00').toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        })}
      </span>

      <div className="flex flex-1 gap-1.5">
        {week.days.map((day) => (
          <span
            key={day.iso}
            title={`${day.iso} · ${day.state}`}
            className="h-5 flex-1 rounded-[3px]"
            style={
              day.state === 'qualified'
                ? { background: 'var(--ink)' }
                : day.state === 'margin'
                  ? // Hollow. Covered, never claimed as studied.
                    { border: '1.3px solid var(--line-strong)' }
                  : day.state === 'future'
                    ? { background: 'transparent' }
                    : { background: 'var(--bg-tint)' }
            }
          />
        ))}
      </div>

      <span className="w-[112px] shrink-0 text-right font-mono text-[10px] text-muted-soft">
        {week.inProgress ? 'this week' : describeWeek(week)}
      </span>
    </div>
  );
}
