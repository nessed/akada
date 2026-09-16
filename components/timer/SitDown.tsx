'use client';

import { useState } from 'react';
import { CheckBox, CheckedOption, Eyebrow, PageButton, Swipe } from '../notebook/Marks';
import type { Course, Task } from '@/lib/data';

/**
 * Before you start.
 *
 * The screen the app was missing. Choosing the length of a block, and naming
 * the two or three things you intend to get through in it, is most of what
 * makes a session a session rather than an hour with a stopwatch on it — and
 * it is what gives the locked-in screen a list to show instead of a number
 * counting down alone.
 *
 * The durations are three marks, not a slider: 25, 50 and 90 are the blocks
 * people actually work in, and a slider would invite fiddling with a decision
 * that does not reward it.
 */

const BLOCKS = [25, 50, 90];

export default function SitDown({
  course,
  task,
  tasks,
  minutes,
  onMinutesChange,
  noiseError,
  onStart,
  onBack,
}: {
  course: Course | null;
  task: Task | null;
  tasks: Task[];
  minutes: number;
  onMinutesChange: (value: number) => void;
  noiseError?: string;
  onStart: (minutes: number, wantsNoise: boolean) => void;
  onBack: () => void;
}) {
  const [wantsBreak, setWantsBreak] = useState(true);
  const [wantsNoise, setWantsNoise] = useState(false);

  // What is being brought to the desk: the chosen task's own pieces if it has
  // any, otherwise the rest of this course's open list.
  const bringing =
    task?.subtasks?.length
      ? task.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.completed }))
      : tasks
          .filter((t) => t.courseId === course?.id && !t.completed && t.id !== task?.id)
          .slice(0, 3)
          .map((t) => ({ id: t.id, title: t.title, done: false }));

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md animate-fade-in flex-col px-6">
      <div className="flex items-center justify-between pt-[max(env(safe-area-inset-top),22px)]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center border border-line bg-paper"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="var(--ink-soft)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <Eyebrow as="span">Before you start</Eyebrow>
      </div>

      <div className="pt-7">
        {course && (
          <p
            className="m-0 text-[9.5px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: course.color }}
          >
            {course.code}
          </p>
        )}
        <h1 className="mt-2 font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.02em]">
          {task?.title ?? course?.name ?? 'A session'}
        </h1>
        {task?.description && (
          <p className="mt-1.5 font-serif text-[14px] italic text-muted">{task.description}</p>
        )}
      </div>

      <div className="pt-7">
        <Eyebrow className="mb-2.5">How long</Eyebrow>
        <div className="flex items-baseline gap-5">
          {BLOCKS.map((block) => (
            <button
              key={block}
              type="button"
              onClick={() => onMinutesChange(block)}
              aria-pressed={minutes === block}
              className={`bg-transparent font-mono ${
                minutes === block
                  ? 'text-[26px] font-bold text-ink'
                  : 'text-[15px] text-muted-soft hover:text-muted'
              }`}
            >
              {minutes === block ? <Swipe color="var(--sage-tint)">{block}</Swipe> : block}
            </button>
          ))}
          <span className="ml-auto font-serif text-[14px] italic text-muted">minutes</span>
        </div>

        <div className="mt-5 flex flex-col gap-3.5">
          <Option
            checked={wantsBreak}
            onClick={() => setWantsBreak(!wantsBreak)}
            label="Break after, 10 minutes"
          />
          <Option
            checked={wantsNoise}
            onClick={() => setWantsNoise(!wantsNoise)}
            label="Pink noise"
          />
          {noiseError && (
            <p className="m-0 font-serif text-[13px] italic text-warn">{noiseError}</p>
          )}
        </div>
      </div>

      {bringing.length > 0 && (
        <div className="pt-7">
          <Eyebrow className="mb-1.5">Bring the list</Eyebrow>
          {bringing.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 py-2.5 ${
                i === bringing.length - 1 ? '' : 'row-rule'
              } ${item.done ? 'opacity-45' : ''}`}
            >
              <CheckBox checked={item.done} color={course?.color} size={17} />
              <span className="min-w-0 flex-1 text-[13.5px]">{item.title}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto pb-[calc(30px+env(safe-area-inset-bottom))] pt-8">
        <PageButton onClick={() => onStart(minutes, wantsNoise)}>Start</PageButton>
      </div>
    </div>
  );
}

function Option({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className="flex items-center gap-3 bg-transparent text-left"
    >
      {checked ? <CheckedOption size={18} /> : <CheckBox size={18} tone="soft" />}
      <span className={`flex-1 text-sm ${checked ? 'text-ink' : 'text-ink-soft'}`}>{label}</span>
    </button>
  );
}
