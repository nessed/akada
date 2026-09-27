'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Course, WeakPoint } from '@/lib/data';
import { useNotice } from '@/components/Notice';
import { deleteWeakPointOptimistic, setWeakPointStatusOptimistic, useNotes, useQuizzes, useTasks, useWeakPoints } from '@/lib/data-hooks';
import { groupBySection, rankWeakPoints } from '@/lib/weak-points';

/**
 * What this course keeps going wrong, as the assistant found it marking
 * quizzes: open ones grouped by section, most often missed first, each with
 * the pages to go back to and the quiz it came from. Ticking one fixed moves
 * it to a folded list underneath, where it can be put back. One that should
 * never have been logged can be deleted outright, which takes two taps.
 */
export default function WeakPointsPanel({ course }: { course: Course }) {
  const { weakPoints, loaded, available } = useWeakPoints();
  const [showFixed, setShowFixed] = useState(false);

  const mine = useMemo(() => weakPoints.filter((w) => w.courseId === course.id), [weakPoints, course.id]);
  const open = useMemo(() => groupBySection(mine.filter((w) => w.status === 'open')), [mine]);
  const fixed = useMemo(
    () => rankWeakPoints(mine.filter((w) => w.status === 'fixed')).sort((a, b) => (b.fixedAt ?? '').localeCompare(a.fixedAt ?? '')),
    [mine],
  );
  const openCount = mine.length - fixed.length;

  // Nothing to show until Claude has recorded something for this course: an
  // empty panel explaining a feature is one more section on a page already
  // too deep.
  if (!loaded || !available || mine.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <p className="eyebrow m-0">
          Weak points
          {openCount > 0 && <span className="ml-1.5 font-mono tracking-normal text-ink-soft">{openCount}</span>}
        </p>
        {fixed.length > 0 && (
          <button
            type="button"
            aria-expanded={showFixed}
            onClick={() => setShowFixed((current) => !current)}
            className="-my-3 -mr-2.5 h-10 rounded-[10px] px-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
          >
            {showFixed ? 'Hide' : 'Fixed'} {fixed.length}
          </button>
        )}
      </div>

      {(
        <div className="-mx-4">
          {open.map(({ section, items }) => (
            <div key={section || 'none'}>
              <p className="eyebrow m-0 px-4 pb-1 pt-3 text-muted">{section ? `§ ${section}` : 'No section'}</p>
              {items.map((point) => <WeakPointRow key={point.id} point={point} />)}
            </div>
          ))}
          {openCount === 0 && (
            <p className="m-0 px-4 py-3 font-serif text-[13.5px] italic text-muted">Nothing open. Every one of them has been fixed.</p>
          )}
          {showFixed && (
            <div className="mt-2">
              <p className="eyebrow m-0 px-4 pb-1 pt-3 text-muted">Fixed</p>
              {fixed.map((point) => <WeakPointRow key={point.id} point={point} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function WeakPointRow({ point }: { point: WeakPoint }) {
  const { notify } = useNotice();
  const [busy, setBusy] = useState(false);
  const source = useSource(point);
  const [confirming, setConfirming] = useState(false);
  const isFixed = point.status === 'fixed';

  // The second tap has to come soon after the first, or it stands down.
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  async function remove() {
    if (busy) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await deleteWeakPointOptimistic(point.id);
    } catch (error) {
      console.error('Failed to delete the weak point:', error);
      notify(error instanceof Error ? error.message : 'That did not delete.');
      setBusy(false);
      setConfirming(false);
    }
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      await setWeakPointStatusOptimistic(point.id, isFixed ? 'open' : 'fixed');
    } catch (error) {
      console.error('Failed to update the weak point:', error);
      notify(error instanceof Error ? error.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`group flex items-start gap-3 border-t border-line-soft px-4 py-2.5 ${isFixed ? 'opacity-55' : ''}`}>
      <span
        className="tnum w-[30px] shrink-0 pt-[3px] font-mono text-[11.5px] text-ink-soft"
        title={`Missed ${point.timesMissed} ${point.timesMissed === 1 ? 'time' : 'times'}`}
      >
        ×{point.timesMissed}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-[14px] leading-[1.45] text-ink">
          {point.summary}
        </span>
        {(point.confusion || point.pageRef || source) && (
          <span className="mt-0.5 block font-serif text-[12.5px] italic leading-[1.5] text-muted">
            {[
              point.confusion && <span key="c">{point.confusion}</span>,
              point.pageRef && <span key="p">{point.pageRef}</span>,
              source &&
                (source.href ? (
                  <Link key="s" href={source.href} className="hand-underline text-ink-soft no-underline">
                    {source.label}
                  </Link>
                ) : (
                  <span key="s">{source.label}</span>
                )),
            ]
              .filter(Boolean)
              .flatMap((part, i) => (i ? [<span key={`d${i}`}> · </span>, part] : [part]))}
          </span>
        )}
      </span>
      {/* No hover on a phone, so they stay in view there. */}
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        title={confirming ? 'Tap again to delete it for good' : 'Delete it, it should not be here'}
        className={`h-8 shrink-0 rounded-[8px] px-1.5 touch:h-10 font-serif text-[12px] italic transition-opacity hover:text-ink focus-visible:opacity-100 disabled:opacity-40 ${
          confirming ? 'text-prioritySoft' : 'text-muted-soft md:mouse:opacity-0 md:group-hover:opacity-100'
        }`}
      >
        {confirming ? 'delete it?' : 'delete'}
      </button>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={isFixed}
        title={isFixed ? 'Put it back on the list' : 'You get this right now'}
        className="h-8 shrink-0 rounded-[8px] px-1.5 touch:h-10 font-serif text-[12px] italic text-muted-soft transition-opacity hover:text-ink focus-visible:opacity-100 disabled:opacity-40 md:mouse:opacity-0 md:group-hover:opacity-100"
      >
        {isFixed ? 'reopen' : 'fixed'}
      </button>
    </div>
  );
}

/** Where a weak point came from: its quiz, else the note on its task, else the task by name. */
function useSource(point: WeakPoint): { label: string; href: string | null } | null {
  const { quizzes } = useQuizzes();
  const { notes } = useNotes();
  const { tasks } = useTasks();
  return useMemo(() => {
    const quiz = point.quizId ? quizzes.find((q) => q.id === point.quizId) : undefined;
    if (quiz) return { label: quiz.title, href: `/notes/quiz?q=${encodeURIComponent(quiz.id)}` };
    if (!point.taskId) return null;
    const note = notes.find((n) => n.taskId === point.taskId);
    if (note) return { label: note.title, href: `/notes?n=${encodeURIComponent(note.id)}` };
    const task = tasks.find((t) => t.id === point.taskId);
    return task ? { label: task.title, href: null } : null;
  }, [point.quizId, point.taskId, quizzes, notes, tasks]);
}
