'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import StartTimerPopover, { type StartTarget } from '@/components/StartTimerPopover';
import { addTaskOptimistic, setNoteStudyOptimistic, useTasks } from '@/lib/data-hooks';
import { useTimer } from '@/lib/timer-context';
import type { Course, StudyNote, Task } from '@/lib/data';

/**
 * The way from a note to the clock.
 *
 * A note is studied under a task: one already on the course's list, or a
 * reading made from the note on the spot. Linking is what lets a read from
 * the top be timed on that task's clock and kept, so "Just time it" is there
 * for a sitting that is not about this note, and says nothing is linked.
 */
export default function StudyThis({
  note,
  courses,
  raised,
  compact,
  onSay,
}: {
  note: Pick<StudyNote, 'id' | 'title' | 'courseId' | 'taskId'>;
  courses: Course[];
  /** Inside focus mode, which sits over the popover's usual layer. */
  raised?: boolean;
  /** An icon and a word, for the focus bar. */
  compact?: boolean;
  onSay: (text: string) => void;
}) {
  const { tasks } = useTasks();
  const { active } = useTimer();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState<string>(note.courseId ?? courses[0]?.id ?? '');
  const [target, setTarget] = useState<StartTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const linked = note.taskId ? tasks.find((t) => t.id === note.taskId) : undefined;
  const linkedCourse = linked ? courses.find((c) => c.id === linked.courseId) : undefined;
  const course = courses.find((c) => c.id === courseId);
  const running = !!active && !!linked && active.taskId === linked.id;

  // Open tasks on the chosen course, readings first, then the ones whose
  // title shares a word with the note's, which is usually the right one.
  const candidates = useMemo(() => {
    const words = new Set(note.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const score = (t: Task) =>
      (t.kind === 'reading' ? 2 : 0) + (t.title.toLowerCase().split(/\W+/).some((w) => words.has(w)) ? 3 : 0);
    return tasks
      .filter((t) => t.courseId === courseId && !t.completed)
      .sort((a, b) => score(b) - score(a) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .slice(0, 6);
  }, [tasks, courseId, note.title]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const startOn = (task: Task | null, on: Course) => {
    setOpen(false);
    setTarget({ task, course: on, anchor: buttonRef.current });
  };

  const link = async (task: Task) => {
    const on = courses.find((c) => c.id === task.courseId);
    if (!on) return;
    setBusy(true);
    try {
      await setNoteStudyOptimistic(note.id, { taskId: task.id, courseId: task.courseId });
      startOn(task, on);
    } catch (cause) {
      onSay(cause instanceof Error && cause.message ? cause.message : 'That didn’t link. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const makeTask = async () => {
    if (!course) return;
    setBusy(true);
    try {
      const task = await addTaskOptimistic({
        courseId: course.id,
        title: note.title,
        dueDate: null,
        priority: 'normal',
        kind: 'reading',
      });
      await setNoteStudyOptimistic(note.id, { taskId: task.id, courseId: course.id });
      onSay(`Made “${task.title}” a reading on ${course.code}.`);
      startOn(task, course);
    } catch (cause) {
      onSay(cause instanceof Error && cause.message ? cause.message : 'The task didn’t save. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    try {
      await setNoteStudyOptimistic(note.id, { taskId: null });
    } catch {
      onSay('That didn’t unlink. Try again in a moment.');
    }
  };

  if (!courses.length) return null;

  return (
    <div className="study" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={compact ? 'nf-tool nf-start' : 'btn btn-ghost'}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={linked ? `Studied under “${linked.title}”` : 'Study this under a task'}
      >
        <Icon name="play" size={compact ? 12 : 14} />
        <span>{running ? 'On the clock' : compact ? 'Study' : 'Study this'}</span>
      </button>

      {open && (
        <div className="popover study-pop" role="dialog" aria-label="Study this">
          {linked && linkedCourse ? (
            <>
              <span className="eyebrow">Studied under</span>
              <p className="study-linked">
                <span className="course-rule" style={{ ['--c' as string]: linkedCourse.color }} />
                <span className="eyebrow" style={{ color: 'var(--ink-soft)' }}>{linkedCourse.code}</span>
                <span className="study-task-title">{linked.title}</span>
              </p>
              <p className="set-note">A read from the top on this task’s clock is timed and kept.</p>
              <div className="study-actions">
                <button type="button" className="btn btn-primary" disabled={running} onClick={() => startOn(linked, linkedCourse)}>
                  <Icon name="play" size={12} />{running ? 'On the clock' : 'Start'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={unlink}>Unlink</button>
              </div>
            </>
          ) : (
            <>
              <span className="eyebrow">Study this on</span>
              <div className="choice-row">
                {courses.map((c) => (
                  <button key={c.id} type="button" className="choice" aria-pressed={courseId === c.id} onClick={() => setCourseId(c.id)}>
                    <span>{c.code}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="study-row study-new" disabled={busy || !course} onClick={makeTask}>
                <Icon name="plus" size={14} />
                <span>New reading: <em>{note.title}</em></span>
              </button>
              {candidates.length > 0 && (
                <>
                  <span className="eyebrow study-sub">Or a task already on {course?.code}</span>
                  <ul className="study-list">
                    {candidates.map((task) => (
                      <li key={task.id}>
                        <button type="button" className="study-row" disabled={busy} onClick={() => void link(task)}>
                          <span className="study-task-title">{task.title}</span>
                          {task.kind === 'reading' && <span className="eyebrow">reading</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {course && (
                <button type="button" className="link study-just" onClick={() => startOn(null, course)}>
                  or just time it, without a task
                </button>
              )}
            </>
          )}
        </div>
      )}

      <StartTimerPopover target={target} onClose={() => setTarget(null)} stayPut raised={raised} />
    </div>
  );
}
