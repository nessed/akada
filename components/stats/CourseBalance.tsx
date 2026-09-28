'use client';

import Link from 'next/link';
import type { CourseStanding } from '@/lib/stats-lens';
import { STANDING_WEEKS } from '@/lib/stats-lens';
import { daysBetween, formatHM, isoDate } from '@/lib/utils';

/**
 * Every course set against every other, for the span being read.
 *
 * Each row carries four readings: the span's hours against what the course's
 * weekly goal asks for over the same stretch (a rule with a pencil tick where
 * the goal falls, on one scale for every course so the longest rule is the
 * course that got the most), the last eight weeks as a row of small bars
 * with the goal as a dash, how many whole weeks met the goal, and when the
 * course was last sat. Nothing here is a percentage.
 */
export default function CourseBalance({
  standings,
  /** Weeks the span covers, to turn a weekly goal into the span's. */
  spanWeeks,
  againstName,
}: {
  standings: CourseStanding[];
  spanWeeks: number;
  againstName: string | null;
}) {
  const today = isoDate();
  const scale = Math.max(
    1,
    ...standings.map((s) => Math.max(s.seconds, (s.course.weeklyGoalHours || 0) * 3600 * spanWeeks)),
  );
  const sorted = [...standings].sort((a, b) => b.seconds - a.seconds);

  if (sorted.length === 0) {
    return (
      <p className="m-0 py-3 font-serif text-[13px] italic text-muted-soft">
        Add a course and it is weighed here.
      </p>
    );
  }

  return (
    <ul className="m-0 list-none p-0">
      {sorted.map((s, index) => {
        const goal = (s.course.weeklyGoalHours || 0) * 3600;
        const spanGoal = goal * spanWeeks;
        const weekTop = Math.max(goal, ...s.weekly, 1800);
        const since = s.lastStudied ? daysBetween(s.lastStudied, today) : null;
        const diff = s.before !== null ? s.seconds - s.before : null;
        return (
          <li key={s.course.id} className="border-b border-dashed border-line py-3.5 last:border-0">
            <Link
              href={`/courses/${s.course.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 text-ink no-underline md:grid-cols-[180px_minmax(0,1fr)_92px_84px]"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="course-rule" style={{ '--c': s.course.color } as React.CSSProperties} />
                  <span className="eyebrow text-ink-soft">{s.course.code}</span>
                </span>
                <span className="mt-0.5 block truncate font-serif text-[14.5px] font-medium">{s.course.name}</span>
              </span>

              {/* The span's hours against what the goal asks for over it. */}
              <span className="order-3 col-span-2 md:order-none md:col-span-1">
                <span className="relative block h-[12px]">
                  <span aria-hidden className="absolute inset-x-0 top-[5.5px] block h-px bg-line-soft" />
                  <span
                    className="rule-draw absolute left-0 top-[4.5px] block h-[3px] rounded-full"
                    style={{
                      width: `${Math.max(s.seconds > 0 ? 1.5 : 0, (s.seconds / scale) * 100)}%`,
                      background: s.course.color,
                      animationDelay: `${0.2 + index * 0.08}s`,
                    }}
                  />
                  {spanGoal > 0 && (
                    <span
                      aria-hidden
                      className="absolute top-0 block h-full w-px bg-ink-soft"
                      style={{ left: `calc(${Math.min(100, (spanGoal / scale) * 100)}% - 0.5px)` }}
                    />
                  )}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-3 font-serif text-[11.5px] italic text-muted">
                  {spanGoal > 0 && (
                    <span>
                      asks <span className="font-mono not-italic text-ink-soft">{formatHM(spanGoal)}</span>
                    </span>
                  )}
                  {s.sittings > 0 && (
                    <span>
                      <span className="font-mono not-italic text-ink-soft">{s.sittings}</span>{' '}
                      {s.sittings === 1 ? 'sitting' : 'sittings'}
                      {s.medianSitting > 0 && (
                        <>
                          , usually <span className="font-mono not-italic text-ink-soft">{formatHM(s.medianSitting)}</span>
                        </>
                      )}
                    </span>
                  )}
                  <span className={since !== null && since >= 7 ? 'text-warn' : undefined}>
                    {since === null ? 'never sat' : since === 0 ? 'sat today' : since === 1 ? 'sat yesterday' : `last sat ${since}d ago`}
                  </span>
                </span>
              </span>

              {/* The last eight weeks, a bar each, the goal as a dash. */}
              <span
                className="order-4 hidden items-end gap-[3px] md:order-none md:flex"
                role="img"
                aria-label={`Last ${STANDING_WEEKS} weeks: ${s.weekly.map((w) => formatHM(w)).join(', ')}`}
                title={goal > 0 ? `on goal ${s.weeksOnGoal} of ${s.weeksCounted} whole weeks` : undefined}
              >
                <span className="relative flex h-[30px] items-end gap-[3px]">
                  {goal > 0 && (
                    <span
                      aria-hidden
                      className="absolute inset-x-[-2px] border-t border-dashed border-line-strong"
                      style={{ bottom: Math.round((goal / weekTop) * 30) }}
                    />
                  )}
                  {s.weekly.map((sec, i) => (
                    <span
                      key={i}
                      className="bar-grow block w-[5px] rounded-t-[1.5px]"
                      style={{
                        height: Math.max(sec > 0 ? 2 : 1, Math.round((sec / weekTop) * 30)),
                        background: sec > 0 ? s.course.color : 'var(--line)',
                        opacity: i === s.weekly.length - 1 ? 1 : 0.75,
                        animationDelay: `${200 + i * 35}ms`,
                      }}
                    />
                  ))}
                </span>
                {goal > 0 && s.weeksCounted > 0 && (
                  <span className="ml-2 font-mono text-[10.5px] tabular-nums text-muted">
                    {s.weeksOnGoal}/{s.weeksCounted}
                  </span>
                )}
              </span>

              <span className="text-right">
                <span className="block font-mono text-[18px] font-semibold leading-none tabular-nums tracking-[-0.02em]">
                  {formatHM(s.seconds)}
                </span>
                {diff !== null && againstName && Math.abs(diff) >= 60 && (
                  <span className="mt-1 block text-[11px] text-muted">
                    <span aria-hidden style={{ color: diff > 0 ? 'var(--sage)' : 'var(--warn)' }}>
                      {diff > 0 ? '↑' : '↓'}
                    </span>{' '}
                    <span className="font-mono tabular-nums">{formatHM(Math.abs(diff))}</span>
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
