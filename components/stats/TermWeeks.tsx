'use client';

import { useState } from 'react';
import type { Course } from '@/lib/data';
import type { TermWeek } from '@/lib/stats-lens';
import { formatHM, isoDate } from '@/lib/utils';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** The tallest bar, or the goal line, stands this high. */
const TOP_PX = 120;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
}

function dayLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * The term a week at a time: one bar a week, stacked in the colours of the
 * courses it went to, against the week's goal as a dashed line. Weeks still
 * to come stand as empty slots, so the chart says where in the term today is
 * as well as what the weeks held. A tap opens the week underneath: its days,
 * what each course got against what it asks for, and how it sits beside a
 * usual week.
 */
export default function TermWeeks({
  weeks,
  courses,
  goalSeconds,
}: {
  weeks: TermWeek[];
  courses: Course[];
  /** The week's goal: every course's, or the one course being read. */
  goalSeconds: number;
}) {
  const current = weeks.find((w) => w.current) ?? weeks[weeks.length - 1];
  const [picked, setPicked] = useState<string | null>(null);
  const open = weeks.find((w) => w.start === picked) ?? current;

  const lived = weeks.filter((w) => !w.future);
  const whole = lived.filter((w) => !w.current);
  const usual = median(whole.map((w) => w.seconds));
  const top = Math.max(3600, goalSeconds * 1.08, ...lived.map((w) => w.seconds));
  const px = (sec: number) => Math.round((sec / top) * TOP_PX);
  const onGoal = goalSeconds > 0 ? whole.filter((w) => w.seconds >= goalSeconds).length : 0;
  const worked = courses.filter((c) => lived.some((w) => w.byCourse.has(c.id)));
  const dense = weeks.length > 12;

  if (!open) return null;

  return (
    <div>
      <p className="m-0 font-serif text-[13px] italic text-muted">
        {whole.length > 0 ? (
          <>
            a usual week <Figure>{formatHM(usual)}</Figure>
            {goalSeconds > 0 && (
              <>
                {' · '}on goal <Figure>{onGoal}</Figure> of <Figure>{whole.length}</Figure>
              </>
            )}
          </>
        ) : (
          'the first whole week sets what a usual one is'
        )}
      </p>

      <div
        className="relative mt-5 grid items-end border-b border-line"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`, height: TOP_PX + 22 }}
      >
        {goalSeconds > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line-strong"
            style={{ bottom: px(goalSeconds) }}
          />
        )}
        {weeks.map((w, i) => {
          const selected = w.start === open.start;
          const showFigure = !w.future && w.seconds > 0 && (!dense || selected);
          return (
            <button
              key={w.start}
              type="button"
              disabled={w.future}
              onClick={() => setPicked(w.start)}
              aria-pressed={selected}
              aria-label={`Week ${w.n}, from ${dayLabel(w.start)}: ${formatHM(w.seconds)}`}
              className="group relative flex h-full flex-col items-center justify-end gap-1 bg-transparent px-[2px] disabled:cursor-default"
            >
              {showFigure && (
                <span
                  className={`relative z-[1] whitespace-nowrap bg-paper px-0.5 font-mono text-[10px] tabular-nums ${
                    selected ? 'text-ink' : 'text-muted'
                  }`}
                >
                  {formatHM(w.seconds)}
                </span>
              )}
              {w.future ? (
                <span className="block h-[6px] w-full max-w-[26px] rounded-t-[3px] border border-b-0 border-dashed border-line" />
              ) : (
                <span
                  className={`bar-grow flex w-full max-w-[26px] flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity ${
                    selected ? '' : 'opacity-80 group-hover:opacity-100'
                  }`}
                  style={{
                    height: Math.max(w.seconds > 0 ? 3 : 1, px(w.seconds)),
                    animationDelay: `${120 + i * 40}ms`,
                    background: w.seconds > 0 ? undefined : 'var(--line)',
                    outline: selected ? '1.5px solid var(--ink)' : undefined,
                    outlineOffset: selected ? 2 : undefined,
                  }}
                >
                  {courses
                    .filter((c) => w.byCourse.has(c.id))
                    .map((c) => (
                      <span
                        key={c.id}
                        style={{ height: px(w.byCourse.get(c.id) ?? 0), background: c.color }}
                      />
                    ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        aria-hidden
        className="mt-2 grid justify-items-center"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((w) => (
          <span
            key={w.start}
            className={`eyebrow rounded-[3px] px-1 py-0.5 text-[9.5px] tracking-[0.08em] ${
              w.current ? 'text-ink' : w.future ? 'text-muted-soft' : 'text-muted'
            }`}
            style={w.current ? { background: 'var(--highlight-yellow)' } : undefined}
          >
            {dense && !w.current && w.n % 2 === 0 ? '' : w.n}
          </span>
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-ink-soft">
        {goalSeconds > 0 && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="block w-3 border-t border-dashed border-line-strong" />
            goal <span className="font-mono text-muted">{formatHM(goalSeconds)}</span> a week
          </span>
        )}
        {worked.length > 1 &&
          worked.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span aria-hidden className="block h-2 w-2 rounded-[2px]" style={{ background: c.color }} />
              {c.code}
            </span>
          ))}
      </div>

      <WeekOpen key={open.start} week={open} courses={courses} goalSeconds={goalSeconds} usual={usual} hasUsual={whole.length > 0} />
    </div>
  );
}

/** The week a bar stands for, opened: its days, then its courses. */
function WeekOpen({
  week,
  courses,
  goalSeconds,
  usual,
  hasUsual,
}: {
  week: TermWeek;
  courses: Course[];
  goalSeconds: number;
  usual: number;
  hasUsual: boolean;
}) {
  const today = isoDate();
  const dayTop = Math.max(1800, ...week.byDay);
  const dayPx = (sec: number) => Math.round((sec / dayTop) * 64);
  const rows = courses
    .map((c) => ({ course: c, seconds: week.byCourse.get(c.id) ?? 0 }))
    .filter((r) => r.seconds > 0 || (r.course.weeklyGoalHours || 0) > 0)
    .sort((a, b) => b.seconds - a.seconds);
  const scale = Math.max(
    1,
    ...rows.map((r) => Math.max(r.seconds, (r.course.weeklyGoalHours || 0) * 3600)),
  );
  const diff = week.seconds - usual;
  const end = new Date(week.start + 'T12:00:00');
  end.setDate(end.getDate() + 6);

  return (
    <div className="animate-settle mt-5 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="m-0 font-serif text-[15px] font-medium text-ink">
          Week {week.n}
          <span className="ml-2 font-serif text-[13px] font-normal italic text-muted">
            {dayLabel(week.start)} to {dayLabel(isoDate(end))}
            {week.current && ', so far'}
          </span>
        </p>
        <p className="m-0 font-serif text-[12.5px] italic text-muted">
          <Figure>{week.days}</Figure> {week.days === 1 ? 'day' : 'days'} ·{' '}
          <Figure>{week.sittings}</Figure> {week.sittings === 1 ? 'sitting' : 'sittings'}
          {week.tasksDone > 0 && (
            <>
              {' · '}
              <Figure>{week.tasksDone}</Figure> finished
            </>
          )}
          {hasUsual && !week.current && Math.abs(diff) >= 60 && (
            <>
              {' · '}
              <Figure>{formatHM(Math.abs(diff))}</Figure> {diff > 0 ? 'over' : 'under'} usual
            </>
          )}
        </p>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        {/* Its days. */}
        <div>
          <div className="grid h-[84px] grid-cols-7 items-end border-b border-line">
            {week.byDay.map((sec, i) => {
              const d = new Date(week.start + 'T12:00:00');
              d.setDate(d.getDate() + i);
              const iso = isoDate(d);
              const future = iso > today;
              return (
                <div key={i} className="flex flex-col items-center justify-end gap-1" title={`${iso} · ${formatHM(sec)}`}>
                  {!future && (
                    <span className={`whitespace-nowrap font-mono text-[9.5px] tabular-nums ${sec > 0 ? 'text-ink-soft' : 'text-muted-soft'}`}>
                      {sec > 0 ? formatHM(sec) : '·'}
                    </span>
                  )}
                  <span className="flex w-[16px] flex-col-reverse overflow-hidden rounded-t-[2px]">
                    {courses
                      .filter((c) => week.byDayCourse[i].has(c.id))
                      .map((c) => (
                        <span key={c.id} style={{ height: dayPx(week.byDayCourse[i].get(c.id) ?? 0), background: c.color }} />
                      ))}
                  </span>
                </div>
              );
            })}
          </div>
          <div aria-hidden className="mt-1.5 grid grid-cols-7 justify-items-center">
            {DAYS.map((d, i) => (
              <span key={i} className="eyebrow text-[9px] text-muted">
                {d}
              </span>
            ))}
          </div>
        </div>

        {/* Its courses, against what each asks for in a week. */}
        <ul className="m-0 list-none p-0">
          {rows.length === 0 && (
            <li className="font-serif text-[13px] italic text-muted-soft">Nothing logged this week.</li>
          )}
          {rows.map(({ course, seconds }) => {
            const goal = (course.weeklyGoalHours || 0) * 3600;
            return (
              <li key={course.id} className="flex items-center gap-3 border-b border-dashed border-line py-2 last:border-0">
                <span className="flex w-[96px] shrink-0 items-center">
                  <span className="course-rule mr-1.5" style={{ '--c': course.color } as React.CSSProperties} />
                  <span className="eyebrow truncate text-ink-soft">{course.code}</span>
                </span>
                <span className="relative block h-[10px] flex-1">
                  <span
                    className="rule-draw absolute left-0 top-[3.5px] block h-[3px] rounded-full"
                    style={{ width: `${(seconds / scale) * 100}%`, background: course.color }}
                  />
                  {goal > 0 && (
                    <span
                      aria-hidden
                      className="absolute top-0 block h-full w-px bg-ink-soft"
                      style={{ left: `calc(${(goal / scale) * 100}% - 0.5px)` }}
                      title={`goal ${formatHM(goal)}`}
                    />
                  )}
                </span>
                <span className="w-[92px] shrink-0 text-right font-mono text-[12px] tabular-nums text-ink">
                  {formatHM(seconds)}
                  {goal > 0 && <span className="text-muted-soft"> / {formatHM(goal)}</span>}
                </span>
              </li>
            );
          })}
          {goalSeconds > 0 && rows.some((r) => (r.course.weeklyGoalHours || 0) > 0) && (
            <li aria-hidden className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
              <span className="block h-2.5 w-px bg-ink-soft" /> the course&apos;s goal for a week
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12.5px] not-italic tabular-nums text-ink">{children}</span>;
}
