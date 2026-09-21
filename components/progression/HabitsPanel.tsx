'use client';

import { useEffect, useState } from 'react';
import {
  HABIT_MIN_BLOCKS,
  HABIT_MIN_SITTINGS,
  HABIT_MIN_WEEKS,
  LEARN_MIN_IMPRESSIONS,
  hourLabel,
  roughMinutes,
  settled,
  WEEKDAY_NAMES,
  windowLabel,
  type Habits,
  type MarkKind,
} from '@/lib/progression';
import { readFollowRates } from '@/lib/progression/log';
import type { Course } from '@/lib/data';
import { formatHM } from '@/lib/utils';

/**
 * How you study.
 *
 * What the term has taught the app about this reader, laid out so it can be
 * seen filling in. A habit that has taken shape is a figure beside a
 * sentence; one that has not is a dashed line saying how much more it needs,
 * which is the honest way to show that the app is still getting to know you
 * and will know you better next week.
 *
 * The last block is the ranking's own lesson: which kinds of Next Mark line
 * this reader has actually followed with a sitting, and so which the
 * ranking now leans toward. Nothing on this panel is a target.
 */

const KIND_LABEL: Record<MarkKind, string> = {
  'course-mark': 'a mark on a course',
  'course-page': 'a page binding',
  'week-goal': "a course's week",
  'week-counts': 'the week itself',
  'untouched-course': 'an untouched course',
  'day-threshold': 'the day counting',
};

export default function HabitsPanel({ habits, courses }: { habits: Habits; courses: Course[] }) {
  // Read on the client only: the ledger lives in localStorage, and reading
  // it during the server pass would render a panel the client disagrees with.
  const [rates, setRates] = useState<Map<MarkKind, { shown: number; followed: number }>>(new Map());
  useEffect(() => {
    setRates(readFollowRates());
  }, []);

  const sittingsLeft = Math.max(0, HABIT_MIN_SITTINGS - habits.sittings.n);
  const blocksLeft = Math.max(0, HABIT_MIN_BLOCKS - habits.blocks.n);
  const weeksLeft = Math.max(0, HABIT_MIN_WEEKS - habits.weeks);

  const rows: { key: string; figure: string | null; text: string; needs: string }[] = [
    {
      key: 'sitting',
      figure: settled(habits.sittings) ? formatHM(habits.sittings.median) : null,
      text: 'a usual sitting',
      needs: after(sittingsLeft, 'sitting'),
    },
    {
      key: 'good',
      figure: settled(habits.sittings) ? formatHM(habits.sittings.upper) : null,
      text: 'a good one, and how far Next Mark reaches',
      needs: after(sittingsLeft, 'sitting'),
    },
    {
      key: 'block',
      figure: settled(habits.blocks, HABIT_MIN_BLOCKS) ? formatHM(habits.blocks.median) : null,
      text: 'a usual block',
      needs: after(blocksLeft, 'timed block'),
    },
    {
      key: 'peak',
      figure: habits.peak ? hourLabel(habits.peak.start + 1) : null,
      text: habits.peak
        ? `${windowLabel(habits.peak.start)}, where ${Math.round(habits.peak.share * 100)}% of your focus lands`
        : 'the hour your work mostly lands',
      needs: habits.sittings.n < HABIT_MIN_SITTINGS ? after(sittingsLeft, 'sitting') : 'no hour clearly ahead yet',
    },
    {
      key: 'day',
      figure: habits.fullestDay !== null ? WEEKDAY_NAMES[habits.fullestDay].slice(0, 3) : null,
      text: 'the day that carries the most',
      needs: weeksLeft > 0 ? after(weeksLeft, 'week') : 'no day clearly ahead yet',
    },
    {
      key: 'break',
      figure:
        settled(habits.breaks.taken, HABIT_MIN_BLOCKS) && settled(habits.breaks.meant, HABIT_MIN_BLOCKS)
          ? `${roughMinutes(habits.breaks.meant.median)} → ${roughMinutes(habits.breaks.taken.median)}m`
          : null,
      text: 'a break as set, and as taken',
      needs: after(Math.max(0, HABIT_MIN_BLOCKS - habits.breaks.taken.n), 'break'),
    },
  ];

  const courseRows = courses
    .map((course) => ({ course, habit: habits.byCourse.get(course.id) }))
    .filter((r) => r.habit && settled(r.habit.blocks, HABIT_MIN_BLOCKS));

  const learned = [...rates.entries()]
    .filter(([, r]) => r.shown >= LEARN_MIN_IMPRESSIONS)
    .sort((a, b) => b[1].followed / b[1].shown - a[1].followed / a[1].shown);
  const shownTotal = [...rates.values()].reduce((acc, r) => acc + r.shown, 0);

  return (
    <section className="rounded-[14px] border border-line bg-paper p-6">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow m-0">How you study</p>
        <span className="font-mono text-[11px] text-muted">
          from <span className="text-ink">{habits.sittings.n}</span>{' '}
          {habits.sittings.n === 1 ? 'sitting' : 'sittings'}
        </span>
      </div>

      <div className="mt-4 flex flex-col">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-baseline gap-4 border-b border-line-soft py-2.5 last:border-b-0"
          >
            {row.figure ? (
              <span className="w-[76px] shrink-0 font-mono text-[13px] font-semibold tabular-nums text-ink">
                {row.figure}
              </span>
            ) : (
              <span
                aria-hidden
                className="mt-[7px] h-[3px] w-[76px] shrink-0 rounded-[1px] border-t border-dashed border-line-strong"
              />
            )}
            <span className={`text-[13px] ${row.figure ? 'text-ink-soft' : 'text-muted-soft'}`}>
              {row.figure ? row.text : `${row.text} · ${row.needs}`}
            </span>
          </div>
        ))}
      </div>

      {courseRows.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          {courseRows.map(({ course, habit }) => (
            <div key={course.id} className="flex items-baseline gap-3 text-[12px]">
              <span className="eyebrow w-[76px] shrink-0 truncate" style={{ color: course.color }}>
                {course.code}
              </span>
              <span className="text-ink-soft">
                blocks of{' '}
                <span className="font-mono text-ink">{roughMinutes(habit!.blocks.median)}m</span>
                {habit!.overrun.n >= HABIT_MIN_BLOCKS && (
                  <>
                    {' · '}
                    <span className="font-mono text-ink">
                      {habit!.overrun.over}/{habit!.overrun.n}
                    </span>{' '}
                    ran past the block
                  </>
                )}
                {habit!.pagesPerHour && (
                  <>
                    {' · '}
                    <span className="font-mono text-ink">{habit!.pagesPerHour}</span> pages an hour
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <p className="m-0 text-[12px] leading-[1.6] text-muted">
          {learned.length >= 2 ? (
            <>
              The line under the timer has learned which of its kinds you follow with a sitting, and
              leans toward those.{' '}
              {learned.slice(0, 3).map(([kind, r], i) => (
                <span key={kind}>
                  {i > 0 && ' · '}
                  {KIND_LABEL[kind]}{' '}
                  <span className="font-mono text-ink">
                    {r.followed}/{r.shown}
                  </span>
                </span>
              ))}
            </>
          ) : (
            <>
              The line under the timer learns which of its kinds you follow with a sitting.{' '}
              {shownTotal === 0
                ? 'Nothing shown on this device yet.'
                : `${shownTotal} shown so far; it starts leaning after ${LEARN_MIN_IMPRESSIONS} of a kind.`}
            </>
          )}
        </p>
      </div>
    </section>
  );
}

function after(n: number, unit: string): string {
  if (n <= 0) return 'taking shape';
  return `after ${n} more ${unit}${n === 1 ? '' : 's'}`;
}
