'use client';

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Course, Session, Task, WeakPoint } from '@/lib/data';
import { useCourses, useTasks } from '@/lib/data-hooks';
import { LIVE_SESSION_PREFIX } from '@/lib/live-session';
import { useTimerState } from '@/lib/timer-context';
import { useMinuteClock, type UpNextView } from '@/lib/use-up-next';
import type { UpNextCandidate } from '@/lib/up-next';
import { dayWord, orLine, pickLine, quietCopy, reasonParts, shortCode, type LinePart } from '@/lib/up-next-copy';
import { bringBackAll } from '@/lib/up-next-day';
import { planFor, type PlanMove, type UpNextSession } from '@/lib/up-next-session';
import { shiftDate } from '@/lib/student-day';
import { formatHM, totalSeconds } from '@/lib/utils';

/**
 * Up next: the one session Today asks for, what it is for, how long to give
 * it tonight, and what to start with.
 *
 * What is up comes in already decided (lib/up-next.ts, through useUpNext),
 * from the record and the date alone. This component adds only the two
 * things that are allowed to move while the reader looks at it: the minute,
 * which sizes the session and nothing else (useMinuteClock, subscribed here
 * and nowhere above, so only this re-renders on the minute), and the sitting
 * on the clock, which changes what the buttons say and the one figure that
 * counts up. Neither can change which task is up.
 *
 * No box and no card. It leads by where it sits and the size of its title,
 * the way the rest of Today does, and the one solid fill on the screen is its
 * Start (Back to the timer, while one runs), so there is never a question of
 * which button is the one.
 */

/** How long Done, Not now and a promoted Or row wait for the body to lift off. Matches .lift-away. */
export const LIFT_MS = 200;
/** A lift whose change never landed (a failed write) puts the body back after this. */
const RESTORE_MS = 1600;

export interface UpNextProps {
  view: UpNextView;
  /**
   * The record with the sitting on the clock folded in (WithLiveSessions'
   * `shown`). Read for the Spent and On the clock figures and nothing else:
   * the pick never sees the live sitting.
   */
  sessions: Session[];
  /** Today's recall queue, for the plan's "Start with". */
  recallQueue: { courseId: string }[];
  /** Null unless the weak points have loaded and the table exists. */
  weakPoints: WeakPoint[] | null;
  onStart(c: UpNextCandidate, minutes: number): void;
  onPickLength(c: UpNextCandidate, minutes: number, anchor: HTMLElement): void;
  onDone(t: Task): void;
  onNotNow(c: UpNextCandidate): void;
  onChoose(c: UpNextCandidate): void;
  onOpen(c: UpNextCandidate): void;
  onToggleStep(t: Task, stepId: string): void;
  onAddTask(courseId: string): void;
}

/* ── Shared pieces ─────────────────────────────────────────────────────── */

/** An eyebrow caption over a figure. The figures row under the title is made of these. */
export function UpNextFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="eyebrow text-muted">{label}</dt>
      <dd className="m-0 flex h-[22px] items-center">{children}</dd>
    </div>
  );
}

/** A reason or quiet line, styled run by run: warn in the overdue tone, a figure in mono. */
function Line({ parts }: { parts: LinePart[] }) {
  return (
    <>
      {parts.map((part, i) =>
        'warn' in part ? (
          <span key={i} className="text-warn">
            {part.warn}
          </span>
        ) : 'figure' in part ? (
          <span key={i} className="tnum font-mono text-[13.5px] not-italic">
            {part.figure}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** A number inside a serif clause. Mono sets digits and nothing else. */
function Figure({ children }: { children: ReactNode }) {
  return <span className="tnum font-mono text-[13.5px]">{children}</span>;
}

/**
 * An hour in words, "11pm" or "midnight". Only the one with digits in it is
 * set in mono: "midnight" is a word, and mono never sets words.
 */
function Hour({ label }: { label: string }) {
  return /\d/.test(label) ? <span className="tnum font-mono text-[11px] not-italic">{label}</span> : <>{label}</>;
}

const PLAY = (
  <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] mouse:group-hover:translate-x-[2px]">
    <path d="M7 5l12 7-12 7V5z" />
  </svg>
);

/*
 * The button row. On a phone it is the Page CTA, Start full width at 56px
 * with the pair of outlined actions under it the way a sheet pairs Cancel
 * and Confirm; from md it is the header action row, 44px, radius 10. The
 * primary is the one solid fill on the screen.
 */
const PRIMARY =
  'group col-span-2 flex min-h-[56px] items-center justify-center gap-2.5 rounded-2xl bg-primary text-[15px] font-semibold text-primary-contrast transition-[opacity,transform] duration-150 active:scale-[0.97] hover:opacity-90 md:h-11 md:min-h-0 md:rounded-[10px] md:px-5 md:text-[13px]';
const SECONDARY =
  'rounded-[10px] border border-line py-3.5 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink md:h-11 md:px-[18px] md:py-0 md:text-[13px]';
/*
 * A serif text button. The underline sits on the words and the button around
 * them is 40px tall, so a thumb has somewhere to land and the pencil line
 * does not drift to the bottom of a tall box.
 */
const TEXT_BUTTON = 'inline-flex min-h-10 items-center bg-transparent p-0';

/** The sitting running on something other than what Up next is showing, in words. */
function useRunningLine(): { key: string; text: string } | null {
  const { active } = useTimerState();
  const { courses } = useCourses();
  const { tasks } = useTasks();
  if (!active) return null;
  const course = courses.find((c) => c.id === active.courseId);
  if (!course) return null;
  const task = active.taskId ? tasks.find((t) => t.id === active.taskId) : null;
  // The code is prose here, so it is the serif like the rest of the line.
  const text = task
    ? `the timer is running on ${course.code} · ${task.title}`
    : `the timer is running on ${course.code}, no task`;
  return { key: `${active.courseId}|${active.taskId ?? ''}`, text };
}

function TimerLine({ line }: { line: { key: string; text: string } }) {
  return (
    <p key={line.key} className="m-0 mt-6 animate-settle font-serif text-[13.5px] italic text-muted">
      {line.text}
    </p>
  );
}

function CourseLine({ course }: { course: Course }) {
  return (
    <div className="mt-4 flex items-center gap-2.5">
      <span aria-hidden className="course-rule rule-draw" style={{ ['--c' as string]: course.color }} />
      <span className="eyebrow text-ink-soft">{course.code}</span>
      <span className="min-w-0 truncate font-serif text-[13.5px] italic text-muted">{course.name}</span>
    </div>
  );
}

/* ── Up next ───────────────────────────────────────────────────────────── */

export function UpNext({
  view,
  sessions,
  recallQueue,
  weakPoints,
  onStart,
  onPickLength,
  onDone,
  onNotNow,
  onChoose,
  onOpen,
  onToggleStep,
  onAddTask,
}: UpNextProps) {
  const { active } = useTimerState();
  const router = useRouter();
  const now = useMinuteClock();
  const running = useRunningLine();
  const { reading, today, sizeOf } = view;
  const pick = reading.pick;

  // Done, Not now and a promoted row lift the body off first and then hand
  // over, so the next one arrives into a space rather than replacing it
  // mid-frame. Keyed on the candidate, so the next one never inherits the
  // lift, and dropped as soon as another one is up, so the same one brought
  // straight back (Undo, bring back) arrives settled and takes taps; the
  // timeout puts it back if the change never lands.
  const [leaving, setLeaving] = useState<string | null>(null);
  const pickKey = pick?.key ?? null;
  if (leaving !== null && leaving !== pickKey) setLeaving(null);
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), RESTORE_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);

  // What the task has had, with the sitting on the clock folded in so the
  // figure counts up while it runs. A course offered before its exam counts
  // only the sitting running on it now: its all-time untargeted hours are not
  // what "Before Midterm I" has had.
  const pickTaskId = pick?.task?.id ?? null;
  const pickCourseId = pick?.course.id ?? null;
  const { spent, live } = useMemo(() => {
    if (!pickCourseId) return { spent: 0, live: 0 };
    const mine = sessions.filter((s) =>
      pickTaskId ? s.taskId === pickTaskId : s.courseId === pickCourseId && !s.taskId,
    );
    return {
      spent: totalSeconds(mine),
      live: totalSeconds(mine.filter((s) => s.id.startsWith(LIVE_SESSION_PREFIX))),
    };
  }, [sessions, pickTaskId, pickCourseId]);

  if (!pick) return null;

  const letGo = (then: () => void) => {
    if (leaving === pick.key) return;
    setLeaving(pick.key);
    window.setTimeout(then, LIFT_MS);
  };

  const task = pick.task;
  const course = pick.course;
  const onClock = active !== null && active.courseId === course.id && active.taskId === (task?.id ?? null);
  const session = sizeOf(pick, now);
  const plan = planFor(pick, session, { recallQueue, weakPoints });
  const line = pickLine(pick, today);
  const { high } = reasonParts(pick, today);
  // Mirrors the order of the reason's first half (lib/up-next-copy.ts): a
  // course key and a lifted task say something else first, so only then is
  // "you were on this" what the line says, and the Spent suffix would repeat it.
  const whyIsCarry = task !== null && pick.carry !== null && !(pick.lifted && pick.piece);
  const lastSat = pick.lastSat;

  // The parts of the task, as a line of stops: what is done, the one the
  // reader is on, and what is left. The first open one is "now".
  const steps = task?.subtasks ?? [];
  const stepsDone = steps.filter((s) => s.completed).length;
  const current = steps.find((s) => !s.completed)?.id ?? null;

  const showDone = task !== null;
  const showNotNow = !onClock;
  const loneSecondary = showDone !== showNotNow;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow m-0 text-ink-soft">Up next</p>
        {reading.setAside > 0 && (
          <button
            key={reading.setAside}
            type="button"
            onClick={() => bringBackAll(today)}
            className="-my-3 min-h-10 animate-settle bg-transparent p-0 font-serif text-[12.5px] italic text-muted transition-colors hover:text-ink"
          >
            <span className="tnum font-mono text-[11px] not-italic">{reading.setAside}</span> set aside today · bring back
          </button>
        )}
      </div>

      {/* Everything about the candidate itself, keyed on it, so a new one
          settles in and draws its rule fresh. */}
      <div key={pick.key} className={leaving === pick.key ? 'lift-away' : 'animate-settle'}>
        <CourseLine course={course} />

        <h2
          id="up-next-title"
          className="m-0 mt-2.5 break-words font-serif text-[30px] font-medium leading-[1.1] tracking-[-0.025em] md:text-[40px]"
        >
          {task ? (
            <button
              type="button"
              onClick={() => onOpen(pick)}
              className="bg-transparent text-left transition-opacity hover:opacity-80"
            >
              {pick.title}
            </button>
          ) : (
            <Link href={`/courses/${course.id}`} className="text-ink no-underline transition-opacity hover:opacity-80">
              {pick.title}
            </Link>
          )}
        </h2>

        {/* Why this one, and when it is due, in one serif line under the
            title: never a mono kicker over it. */}
        {(line.length > 0 || high) && (
          <p className="m-0 mt-2 max-w-[560px] font-serif text-[15px] italic leading-[1.45] text-ink-soft">
            <Line parts={line} />
            {high && (
              <span
                className={`eyebrow ${line.length > 0 ? 'ml-2' : ''} rounded-[4px] bg-priorityTint px-1.5 py-[3px] !tracking-[0.12em] text-priority not-italic`}
              >
                High
              </span>
            )}
          </p>
        )}

        {/* The facts, each a caption over a figure. There is no Due: the
            line above carries the date, and saying it twice is saying it twice. */}
        <dl className="m-0 mt-5 flex flex-wrap gap-x-8 gap-y-4 md:gap-x-10">
          {onClock ? (
            <UpNextFact label="On the clock">
              <span aria-hidden className="mr-2 inline-block h-[6px] w-[6px] animate-tick rounded-full" style={{ background: course.color }} />
              <span className="tnum font-mono text-[16px] font-medium">{formatHM(task ? spent : live)}</span>
            </UpNextFact>
          ) : (
            <UpNextFact label="Session">
              <span key={session.minutes} className="tnum inline-block animate-settle font-mono text-[16px] font-medium">
                {formatHM(session.minutes * 60)}
              </span>
              <SessionSuffix session={session} />
            </UpNextFact>
          )}
          {!onClock && task && spent >= 60 && (
            <UpNextFact label="Spent">
              <span className="tnum font-mono text-[16px] font-medium">{formatHM(spent)}</span>
              {lastSat && !whyIsCarry && (
                <span className="ml-2 font-serif text-[12.5px] italic text-muted">{spentWhen(lastSat, today)}</span>
              )}
            </UpNextFact>
          )}
          {steps.length > 0 && (
            <UpNextFact label="Steps">
              <span className="tnum font-mono text-[16px] font-medium">
                {stepsDone} / {steps.length}
              </span>
            </UpNextFact>
          )}
        </dl>

        {/* What the session starts with: noun phrases, never orders. */}
        {plan.length > 0 && (
          <ol className="m-0 mt-5 max-w-[560px] list-none p-0">
            {plan.map((move, i) => (
              <li key={move.kind} className="flex items-baseline gap-3 py-1">
                <span className="eyebrow w-[84px] shrink-0 whitespace-nowrap text-muted">{i === 0 ? 'Start with' : 'Then'}</span>
                <span className="min-w-0 flex-1 font-serif text-[15px] leading-[1.45] text-ink-soft">
                  <PlanText move={move} />
                </span>
              </li>
            ))}
          </ol>
        )}

        {/* A course offered before its exam has no task to open, because
            nothing on its list leads up to it. This is the way to put one there. */}
        {!task && (
          <button type="button" onClick={() => onAddTask(course.id)} className={`${TEXT_BUTTON} mt-1.5`}>
            <span className="hand-underline font-serif text-[14px] text-ink">Add a task for it</span>
          </button>
        )}

        {steps.length > 0 && task && (
          <ol aria-label="Steps" className="relative m-0 mt-6 max-w-[560px] list-none p-0">
            <span aria-hidden className="absolute bottom-[21px] left-[7px] top-[21px] w-px bg-line-strong" />
            {steps.map((step) => {
              const isNow = step.id === current;
              return (
                <li key={step.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onToggleStep(task, step.id)}
                    aria-pressed={step.completed}
                    className="flex min-h-[42px] w-full items-center gap-4 bg-transparent py-1.5 text-left disabled:cursor-default"
                  >
                    {step.completed ? (
                      <span aria-hidden className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full bg-muted text-bg">
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6.5l2.6 2.6L10 2.8" />
                        </svg>
                      </span>
                    ) : isNow ? (
                      <span
                        aria-hidden
                        className="h-[15px] w-[15px] shrink-0 rounded-full border-4 bg-bg shadow-[0_0_0_4px_var(--bg)]"
                        style={{ borderColor: course.color }}
                      />
                    ) : (
                      <span aria-hidden className="h-[15px] w-[15px] shrink-0 rounded-full border-[1.5px] border-line-strong bg-bg" />
                    )}
                    <span
                      className={`min-w-0 flex-1 font-serif text-[15px] ${
                        step.completed ? 'text-muted' : isNow ? 'font-medium text-ink' : 'text-ink-soft'
                      }`}
                    >
                      {step.title}
                    </span>
                    {isNow && <span className="eyebrow shrink-0 text-ink-soft">Now</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* A sitting on something else: said once, in words, so Back to the
          timer below is not a mystery. */}
      {running && !onClock && <TimerLine line={running} />}

      <div
        className={`${running && !onClock ? 'mt-3' : 'mt-6'} grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center`}
      >
        {active ? (
          // Never Start while a sitting runs: Start would throw it away.
          <button type="button" onClick={() => router.push('/timer')} className={PRIMARY}>
            Back to the timer
          </button>
        ) : (
          <button type="button" onClick={() => onStart(pick, session.minutes)} className={PRIMARY}>
            {PLAY}
            Start {session.minutes} min
          </button>
        )}
        {showDone && task && (
          <button
            type="button"
            data-sound="tick"
            onClick={() => letGo(() => onDone(task))}
            className={loneSecondary ? `${SECONDARY} col-span-2` : SECONDARY}
          >
            Done
          </button>
        )}
        {showNotNow && (
          <button
            type="button"
            data-sound="paper"
            onClick={() => letGo(() => onNotNow(pick))}
            className={loneSecondary ? `${SECONDARY} col-span-2` : SECONDARY}
          >
            Not now
          </button>
        )}
        {!active && (
          <button
            type="button"
            onClick={(e) => onPickLength(pick, session.minutes, e.currentTarget)}
            className={`${TEXT_BUTTON} col-span-2 justify-self-center md:ml-2`}
          >
            <span className="hand-underline font-serif text-[13px] italic text-muted transition-colors hover:text-ink">
              Another length
            </span>
          </button>
        )}
      </div>

      {/* The two it offers instead. A tap on the row puts it up next (the
          old pick is still in view, as the first of these, so there is
          nothing to undo); the round mark starts it in one tap. */}
      {reading.others.length > 0 && (
        <ul className="m-0 mt-7 max-w-[560px] list-none border-t border-line-soft p-0">
          {reading.others.map((c, i) => (
            <li
              key={c.key}
              className="flex min-h-[52px] animate-settle items-center gap-3 border-b border-line-soft last:border-b-0"
            >
              <button
                type="button"
                onClick={() => letGo(() => onChoose(c))}
                aria-label={`Put ${c.title} up next`}
                className="flex min-w-0 flex-1 items-center gap-3 bg-transparent py-2 text-left"
              >
                <span className="eyebrow w-7 shrink-0 text-muted">{i === 0 ? 'Or' : ''}</span>
                <span aria-hidden className="course-rule !w-3.5" style={{ ['--c' as string]: c.course.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-[15px] text-ink">{c.title}</span>
                  <span className="mt-0.5 block truncate font-serif text-[12.5px] italic text-muted">
                    <span className="eyebrow mr-1.5 not-italic text-ink-soft">{c.course.code}</span>
                    {orLine(c, today)}
                  </span>
                </span>
              </button>
              {!active && <OrPlay c={c} minutes={sizeOf(c, now).minutes} onStart={onStart} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OrPlay({
  c,
  minutes,
  onStart,
}: {
  c: UpNextCandidate;
  minutes: number;
  onStart(c: UpNextCandidate, minutes: number): void;
}) {
  // Outlined, never filled or tinted: the one fill on the screen is Start.
  return (
    <button
      type="button"
      onClick={() => onStart(c, minutes)}
      aria-label={`Start ${minutes} min on ${c.title}`}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
    >
      <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 5l12 7-12 7V5z" />
      </svg>
    </button>
  );
}

/** Why the session is the length it is, when there is something worth saying. */
function SessionSuffix({ session }: { session: UpNextSession }) {
  const note =
    session.basis === 'finishes' ? (
      'finishes it'
    ) : session.basis === 'fits' && session.stopLabel ? (
      <>
        before <Hour label={session.stopLabel} />
      </>
    ) : session.basis === 'usual' ? (
      'your usual'
    ) : null;
  if (!note) return null;
  return <span className="ml-2 font-serif text-[12.5px] italic text-muted">{note}</span>;
}

/** When the task last had time: "earlier today", "yesterday", "on 20 Sep". */
function spentWhen(lastSat: string, today: string): string {
  if (lastSat === today) return 'earlier today';
  if (lastSat === shiftDate(today, -1)) return 'yesterday';
  return `on ${dayWord(lastSat, today)}`;
}

/** One line of the plan, as a noun phrase. */
function PlanText({ move }: { move: PlanMove }) {
  if (move.kind === 'recall') {
    return (
      <>
        the <Figure>{move.count}</Figure> {move.code} {move.count === 1 ? 'card' : 'cards'}{' '}
        <a href="#recall" className="hand-underline text-ink-soft no-underline">
          in recall, just below
        </a>
      </>
    );
  }
  if (move.kind === 'weak-point') {
    return (
      <>
        {move.summary}
        {move.where && <span className="italic text-muted"> · {move.where}</span>}
      </>
    );
  }
  const r = move.reading;
  const pace = `at ${r.measured ? 'your' : 'the usual'} pace`;
  if (r.finishes) {
    if (r.pagesLeft === 1) return <>{move.spent ? 'the last page' : 'its one page'}, {pace}</>;
    return (
      <>
        {move.spent ? 'the last' : 'all'} <Figure>{r.pagesLeft}</Figure> pages, {pace}
      </>
    );
  }
  return move.spent ? (
    <>
      about <Figure>{r.pagesThisSession}</Figure> of the <Figure>{r.pagesLeft}</Figure> pages left, {pace}
    </>
  ) : (
    <>
      about <Figure>{r.pagesThisSession}</Figure> of its <Figure>{r.pages}</Figure> pages, {pace}
    </>
  );
}

/* ── Nothing to pick ───────────────────────────────────────────────────── */

export interface UpNextQuietProps {
  view: UpNextView;
  /** Starts the course in one tap; the task is always null here. */
  onStart(c: Pick<UpNextCandidate, 'task' | 'course'>, minutes: number): void;
  onAddTask(courseId: string): void;
}

/**
 * Up next with nothing to pick. It never says "a clean page", and it always
 * has a Start: the evening a course has gone untouched is exactly the evening
 * a screen saying there is nothing to do would be wrong. So it says why there
 * is no task (everything set aside, nothing dated soon, nothing open), names
 * the one course worth a session and the one true thing that makes it that
 * course, and offers it at the length Up next would give it.
 */
export function UpNextQuiet({ view, onStart, onAddTask }: UpNextQuietProps) {
  const { active } = useTimerState();
  const router = useRouter();
  const now = useMinuteClock();
  const running = useRunningLine();
  const { reading, today, sizeOf } = view;
  const quiet = reading.quiet;
  if (!quiet) return null;

  const { course } = quiet;
  const copy = quietCopy(quiet, today);
  const candidate = { task: null, course, spentSeconds: 0 };
  const minutes = sizeOf(candidate, now).minutes;

  return (
    <section>
      <p className="eyebrow m-0 text-ink-soft">Up next</p>
      <div key={`${course.id}|${quiet.why}`} className="animate-settle">
        <CourseLine course={course} />
        <p className="m-0 mt-2.5 max-w-[560px] font-serif text-[22px] leading-[1.3] tracking-[-0.01em] text-ink">
          {copy.heading}
        </p>
        {copy.line && (
          <p className="m-0 mt-1.5 max-w-[560px] font-serif text-[14px] italic leading-[1.55] text-muted">
            <Line parts={copy.line} />
          </p>
        )}
      </div>

      {running && <TimerLine line={running} />}

      <div className={`${running ? 'mt-3' : 'mt-6'} grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center`}>
        {active ? (
          <button type="button" onClick={() => router.push('/timer')} className={PRIMARY}>
            Back to the timer
          </button>
        ) : (
          <button type="button" onClick={() => onStart(candidate, minutes)} className={PRIMARY}>
            {PLAY}
            Start {shortCode(course.code)} {minutes} min
          </button>
        )}
        {quiet.why === 'set-aside' ? (
          <button type="button" onClick={() => bringBackAll(today)} className={`${SECONDARY} col-span-2`}>
            Bring it back
          </button>
        ) : (
          <button type="button" onClick={() => onAddTask(course.id)} className={`${SECONDARY} col-span-2`}>
            Add a task
          </button>
        )}
      </div>
    </section>
  );
}
