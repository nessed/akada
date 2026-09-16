'use client';

import { useEffect, useRef, useState } from 'react';
import WeeklyGoalSlider from '@/components/WeeklyGoalSlider';
import HandNote from '@/components/notebook/HandNote';
import type { Course, Session } from '@/lib/data';
import { clampWeeklyGoalHours } from '@/lib/planner-safety';
import { daysBetween, formatHM, isoDate, lastSeenByCourse, sessionsThisWeek, totalSeconds } from '@/lib/utils';

interface Props {
  course: Course;
  /** This course's sessions, already filtered. */
  sessions: Session[];
  /** Commits a new weekly goal. Called once the slider settles, not per tick. */
  onGoalChange: (hours: number) => void;
}

/** The credit-hour convention the rest of the app reads a goal against. */
function defaultGoal(credits?: number | null) {
  return typeof credits === 'number' && credits > 0 ? credits * 2 : 8;
}

/**
 * The week, as the course's own page tells it: what has been studied against
 * what was asked for, the rule beneath filled in the course's colour, and the
 * goal itself adjustable here rather than only in the edit sheet. This is the
 * one place where the number and the setting that defines it sit together.
 */
export default function CourseWeekCard({ course, sessions, onGoalChange }: Props) {
  const storedGoal =
    Number.isFinite(course.weeklyGoalHours) && course.weeklyGoalHours > 0
      ? course.weeklyGoalHours
      : defaultGoal(course.credits);

  const [goal, setGoal] = useState(storedGoal);
  const touched = useRef(false);

  // A goal changed elsewhere (the dashboard's edit sheet, another tab) should
  // still be what this slider reads, as long as the reader is not mid-drag.
  useEffect(() => {
    if (!touched.current) setGoal(storedGoal);
  }, [storedGoal]);

  // The slider fires on every pixel; the write waits for the hand to stop.
  useEffect(() => {
    if (!touched.current || goal === storedGoal) return;
    const id = window.setTimeout(() => onGoalChange(goal), 500);
    return () => window.clearTimeout(id);
  }, [goal, storedGoal, onGoalChange]);

  const weekSeconds = totalSeconds(sessionsThisWeek(sessions));
  const weekHours = weekSeconds / 3600;
  const whole = Math.floor(weekHours);
  const decimal = `.${Math.round((weekHours - whole) * 10)}`;
  const pct = Math.min(100, (weekHours / Math.max(0.5, goal)) * 100);

  const termSeconds = totalSeconds(sessions);
  const last = lastSeenByCourse(sessions)[course.id];
  const since = last ? daysBetween(last, isoDate()) : null;
  const sinceLabel =
    since === null
      ? 'not yet studied'
      : since === 0
        ? 'studied today'
        : since === 1
          ? 'studied yesterday'
          : `last studied ${since}d ago`;

  return (
    <section className="deckle relative border border-line bg-paper px-[var(--density-gutter)] pt-5 pb-[18px]">
      {since !== null && since >= 4 && (
        <HandNote
          color="var(--warn-soft)"
          size={16}
          rotate={-3}
          style={{ position: 'absolute', top: 14, right: 16 }}
        >
          {since}d quiet
        </HandNote>
      )}

      <p className="eyebrow m-0">This week</p>

      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-[46px] font-semibold leading-[0.9] tracking-[-0.035em] tabular-nums text-ink">
          {whole}
          <span className="text-muted-soft">{decimal}</span>
        </span>
        <span className="font-serif text-[17px] italic text-ink-soft">
          of {goal}h
        </span>
      </div>

      <div
        aria-hidden
        className="mt-3.5 h-[3px] w-full overflow-hidden rounded-full bg-bg-tint"
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: course.color }}
        />
      </div>

      <p className="mt-3 mb-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-serif text-[12.5px] italic text-muted">
        <span>
          <span className="font-mono text-[14px] font-semibold not-italic tabular-nums text-ink">
            {formatHM(termSeconds)}
          </span>{' '}
          this term
        </span>
        <span>{sinceLabel}</span>
      </p>

      <div className="mt-5 border-t border-dashed border-line pt-4">
        <p className="eyebrow m-0 mb-2">Weekly goal</p>
        <WeeklyGoalSlider
          value={goal}
          credits={course.credits}
          label={`Weekly study goal for ${course.code}`}
          onChange={(hours) => {
            touched.current = true;
            setGoal(clampWeeklyGoalHours(hours));
          }}
        />
      </div>
    </section>
  );
}
