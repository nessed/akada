'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useNotice } from '@/components/Notice';
import SelectField from '@/components/SelectField';
import HandCheck from '@/components/notebook/HandCheck';
import HandNote from '@/components/notebook/HandNote';
import Stamp from '@/components/notebook/Stamp';
import DueDateBadge from '@/components/DueDateBadge';
import LoadingIndicator, { ButtonSpinner } from '@/components/LoadingIndicator';
import DatePicker from '@/components/DatePicker';
import TaskItem from '@/components/TaskItem';
import type { Task } from '@/lib/data';
import { formatRelativeDate, isoDate, resolveTint } from '@/lib/utils';
import { cleanTaskTitle } from '@/lib/planner-safety';
import { useTimer } from '@/lib/timer-context';
import {
  useOnboardingComplete,
  useCourses,
  useTasks,
  addTaskOptimistic,
  toggleTaskOptimistic,
  updateTaskOptimistic,
  deleteTaskOptimistic,
} from '@/lib/data-hooks';

type Filter = 'all' | 'today' | 'overdue';
type SortMode = 'smart' | 'due' | 'newest';

export default function TasksPage() {
  return (
    <Suspense fallback={<TasksPageFallback />}>
      <TasksPageContent />
    </Suspense>
  );
}

function TasksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { active, start } = useTimer();
  const { notify } = useNotice();
  // Guards the two writes that were previously fire-and-forget from the UI's
  // point of view: nothing changed on the button while they were in flight.
  const [savingTask, setSavingTask] = useState(false);

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { tasks, isLoading: tasksLoading } = useTasks();

  const [filter, setFilter] = useState<Filter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // The course the page was opened for, straight off the URL. It marks that
  // course's heading so arriving from a dashboard card lands somewhere
  // visible even when nothing had to scroll.
  const focusedCourseId = searchParams.get('course');

  // Inline add per course
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [draftHigh, setDraftHigh] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCourseId, setEditCourseId] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editHigh, setEditHigh] = useState(false);
  const handledTaskIntent = useRef(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=true]')) return;
      if (event.key.toLowerCase() === 'n' && courses[0]) {
        event.preventDefault();
        setAddingFor(courses[0].id);
        setDraftTitle('');
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        setSortMode((current) => current === 'smart' ? 'due' : current === 'due' ? 'newest' : 'smart');
      }
      if (event.key === '?') {
        event.preventDefault();
        setShortcutHelpOpen(true);
      }
      if (event.key === 'Escape') {
        setAddingFor(null);
        setEditingTask(null);
        setViewingTask(null);
        setShortcutHelpOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [courses]);

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) {
      router.replace('/onboarding');
    }
  }, [onboarded, onboardingLoading, onboardingError, router]);

  // Two arrivals from a course card: `?course=` alone means "show me this
  // course", `&newTask=1` means "and start typing". Keeping the course in the
  // URL makes this a useful navigation state, while the ref stops SWR
  // revalidations from repeatedly reopening the form.
  useEffect(() => {
    if (handledTaskIntent.current || coursesLoading || courses.length === 0) return;
    const courseId = searchParams.get('course');
    if (!courseId || !courses.some((course) => course.id === courseId)) return;
    const wantsNewTask = searchParams.get('newTask') === '1';

    handledTaskIntent.current = true;
    setFilter('all');
    setCollapsed((current) => ({ ...current, [courseId]: false }));
    if (wantsNewTask) {
      setAddingFor(courseId);
      setDraftTitle('');
      setDraftDue('');
      setDraftHigh(false);
    }
    requestAnimationFrame(() => {
      document.getElementById(`course-${courseId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [courses, coursesLoading, searchParams]);

  const loading =
    onboardingLoading || onboarded === false || coursesLoading || tasksLoading;

  const visibleTasks = useMemo(() => {
    const today = isoDate();
    if (filter === 'today') {
      return tasks.filter((t) => !t.completed && t.dueDate === today);
    }
    if (filter === 'overdue') {
      return tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < today);
    }
    return tasks;
  }, [tasks, filter]);

  async function toggleTask(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    try {
      await toggleTaskOptimistic(t);
    } catch (error) {
      console.error('Failed to update task:', error);
      notify('That task did not update.');
    }
  }

  async function deleteTask(id: string) {
    try {
      await deleteTaskOptimistic(id);
    } catch (error) {
      console.error('Failed to delete task:', error);
      notify('That task is still here. It did not delete.');
    }
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
    setEditCourseId(task.courseId);
    setEditDue(task.dueDate || '');
    setEditHigh(task.priority === 'high');
  }

  async function saveEditTask() {
    const title = cleanTaskTitle(editTitle);
    if (!editingTask || !title || !editCourseId || savingTask) return;
    setSavingTask(true);
    try {
      await updateTaskOptimistic(editingTask.id, {
        title,
        description: editDescription,
        courseId: editCourseId,
        dueDate: editDue || null,
        priority: editHigh ? 'high' : 'normal',
      });
      setEditingTask(null);
    } catch (error) {
      console.error('Failed to save task:', error);
      notify('Those changes did not save.');
    } finally {
      setSavingTask(false);
    }
  }

  async function saveSubtasks(task: Task, subtasks: NonNullable<Task['subtasks']>) {
    try {
      await updateTaskOptimistic(task.id, { subtasks });
      setViewingTask((current) => current?.id === task.id ? { ...current, subtasks } : current);
    } catch {
      notify('That subtask change did not save.');
    }
  }

  function handleStartTimerForTask(t: Task) {
    if (active) {
      router.push('/timer');
      return;
    }
    start(t.courseId, t.id);
    router.push('/timer');
  }

  async function commitDraft(courseId: string) {
    const title = cleanTaskTitle(draftTitle);
    if (!title) {
      setAddingFor(null);
      return;
    }
    if (savingTask) return;
    setSavingTask(true);
    try {
      await addTaskOptimistic({
        courseId,
        title,
        dueDate: draftDue || null,
        priority: draftHigh ? 'high' : 'normal',
      });
      setDraftTitle('');
      setDraftDue('');
      setDraftHigh(false);
      setAddingFor(null);
    } catch (error) {
      console.error('Failed to add task:', error);
      notify('That task was not added.');
    } finally {
      setSavingTask(false);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Loading your tasks" className="mb-6" />
        <div className="animate-pulse opacity-40" aria-hidden>
          <div className="h-3 w-12 bg-line rounded mb-2.5" />
          <div className="h-8 w-24 bg-line rounded mb-8" />
          <div className="flex gap-2 mb-8">
            <div className="h-7 w-16 bg-line rounded-full" />
            <div className="h-7 w-16 bg-line rounded-full" />
          </div>
          <div className="flex flex-col gap-6">
            {[1, 2].map((i) => (
              <div key={i}>
                <div className="h-5 w-32 bg-line rounded mb-3" />
                <div className="border-b border-line border-dashed py-3 flex gap-3">
                  <div className="w-4 h-4 rounded-full bg-line" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 w-2/3 bg-line rounded" />
                    <div className="h-2 w-1/3 bg-line rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="mb-[var(--density-header)]">
        <p className="eyebrow m-0 text-muted">
          The list
        </p>
        <h1 className="mt-1.5 mb-0 font-serif font-medium text-[36px] tracking-[-0.025em] leading-[1.05]">
          Tasks{' '}
          <span className="font-serif italic text-muted text-[28px]">
            · {tasks.filter((t) => !t.completed).length} open
          </span>
        </h1>
      </header>

      {/* What is shown, and in what order. Both are marks on the page: the
          filter is a swipe of highlighter, the order is a hand underline, so
          the two rows are legible as two different questions. The `?` in the
          margin is all the interface says about the keyboard. */}
      <div className="mb-[var(--density-block)] flex flex-wrap items-baseline gap-x-5 gap-y-3">
        <div className="flex gap-1.5">
          {(
            [
              { v: 'all', l: 'All' },
              { v: 'today', l: 'Today' },
              { v: 'overdue', l: 'Overdue' },
            ] as const
          ).map((f) => (
            <button
              key={f.v}
              type="button"
              aria-pressed={filter === f.v}
              onClick={() => setFilter(f.v)}
              className={`bg-transparent px-0.5 py-1 font-serif text-[15px] transition-colors ${
                filter === f.v ? 'hl-swipe text-ink' : 'text-muted-soft hover:text-ink-soft'
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>

        <div role="group" aria-label="Sort order" className="ml-auto flex items-baseline gap-3.5">
          {(
            [
              { v: 'smart', l: 'Smart' },
              { v: 'due', l: 'Due' },
              { v: 'newest', l: 'Newest' },
            ] as const
          ).map((s) => (
            <button
              key={s.v}
              type="button"
              aria-pressed={sortMode === s.v}
              onClick={() => setSortMode(s.v)}
              className={`bg-transparent p-0 font-serif text-[13px] transition-colors ${
                sortMode === s.v ? 'hand-underline text-ink' : 'text-muted-soft hover:text-ink-soft'
              }`}
            >
              {s.l}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShortcutHelpOpen(true)}
            aria-label="Keyboard shortcuts"
            className="bg-transparent p-0 text-muted-soft transition-colors hover:text-ink"
          >
            <HandNote color="currentColor" size={19} rotate={-8}>
              ?
            </HandNote>
          </button>
        </div>
      </div>

      {/* Sections */}
      {courses.length === 0 ? (
        <EmptyState title="No courses yet" />
      ) : filter !== 'all' && visibleTasks.length === 0 ? (
        <EmptyState title={`No ${filter} tasks`} />
      ) : (
        <div className="flex flex-col gap-[22px]">
          {courses.map((course) => {
          const list = visibleTasks
            .filter((t) => t.courseId === course.id)
            .sort((a, b) => {
              if (sortMode === 'newest') return b.createdAt.localeCompare(a.createdAt);
              if (sortMode === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
              if (a.completed !== b.completed) return a.completed ? 1 : -1;
              if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
              return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
            });
          if (filter !== 'all' && list.length === 0) return null;

          const isCol = collapsed[course.id];
          const open = list.filter((t) => !t.completed).length;

          return (
            <section key={course.id} id={`course-${course.id}`}>
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [course.id]: !c[course.id] }))
                }
                className="w-full flex items-baseline gap-2.5 pb-2.5 border-b border-line text-left"
              >
                <span
                  className="w-[7px] h-[7px] rounded-full"
                  style={{ background: course.color }}
                />
                <span
                  className="eyebrow"
                  style={{ color: course.color }}
                >
                  {course.code}
                </span>
                <span className="min-w-0 flex-1 truncate font-serif text-[17px] font-medium tracking-[-0.01em] text-ink">
                  {/* The swipe goes on the words, not on the flex track, or it
                      runs the width of the row past the end of the name. */}
                  <span
                    className={course.id === focusedCourseId ? 'hl-swipe' : undefined}
                    style={
                      course.id === focusedCourseId
                        ? ({ '--hl': resolveTint(course.color, course.tint) } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {course.name}
                  </span>
                </span>
                <span className="ml-auto text-xs text-muted font-mono">{open}</span>
              </button>

              {!isCol && (
                <div className="pt-1.5">
                  {list.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      course={course}
                      onToggle={toggleTask}
                      onStartTimer={handleStartTimerForTask}
                      onDelete={deleteTask}
                      onEdit={openEditTask}
                      onOpen={setViewingTask}
                    />
                  ))}

                  {filter === 'all' &&
                    (addingFor === course.id ? (
                      <div
                        className="mt-2 px-3 py-2.5 rounded-[10px] bg-paper animate-fade-in"
                        style={{ border: `1px solid ${course.color}` }}
                      >
                        <input
                          autoFocus
                          type="text"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          placeholder="New task"
                          className="w-full bg-transparent border-0 text-sm text-ink font-serif italic outline-none p-1"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitDraft(course.id);
                            if (e.key === 'Escape') setAddingFor(null);
                          }}
                        />
                        <div className="flex gap-2 mt-2 items-center">
                          <DatePicker
                            value={draftDue}
                            onChange={setDraftDue}
                            placeholder="Due"
                            compact
                            className="w-[132px]"
                          />
                          <button
                            type="button"
                            onClick={() => setDraftHigh((v) => !v)}
                            aria-pressed={draftHigh}
                            className="flex items-center gap-1.5 bg-transparent px-1 py-1"
                          >
                            <span className="scribble-box flex h-4 w-4 items-center justify-center">
                              {draftHigh && <HandCheck size={11} color="var(--priority)" strokeWidth={1.6} />}
                            </span>
                            <span
                              className={`font-hand text-[14px] ${draftHigh ? 'text-priority' : 'text-muted-soft'}`}
                            >
                              !! high
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={savingTask}
                            onClick={() => commitDraft(course.id)}
                            className="hand-underline ml-auto bg-transparent px-0.5 font-serif text-[13px] text-ink disabled:opacity-40"
                          >
                            {savingTask ? 'Adding' : 'Add'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingFor(course.id);
                          setDraftTitle('');
                          setDraftDue('');
                          setDraftHigh(false);
                        }}
                        className="w-full text-left px-1 py-3 text-[13px] text-muted-soft font-serif italic transition-colors hover:text-ink"
                      >
                        + jot a task…
                      </button>
                    ))}
                </div>
              )}
            </section>
          );
        })}
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 z-[80] flex items-end animate-fade-in">
          <button
            type="button"
            aria-label="Cancel editing"
            onClick={() => setEditingTask(null)}
            className="absolute inset-0 scrim backdrop-blur-sm"
          />
          <div className="relative w-full md:mx-auto md:max-w-xl bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
            <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />
            <h3 className="mt-0 mb-1.5 font-serif font-medium text-[22px] tracking-[-0.01em]">
              Edit task
            </h3>
            <p className="mt-0 mb-4 text-[13px] text-muted font-serif italic">
              Keep the assignment details current.
            </p>

            {/* Title and notes are one sheet of paper with a ruled line
                between them, not a field and a second field bolted under it. */}
            <div className="rounded-[10px] border border-line bg-paper transition-colors focus-within:border-line-strong">
              <input
                autoFocus
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Task title"
                className="w-full rounded-t-[10px] border-0 bg-transparent px-4 pb-2.5 pt-3 font-serif text-[16px] text-ink outline-none"
              />
              <div className="mx-4 border-t border-dashed border-line" />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Notes, a page reference, what it is really asking for"
                rows={4}
                className="w-full resize-none rounded-b-[10px] border-0 bg-transparent px-4 pb-3 pt-2.5 text-sm leading-relaxed text-ink outline-none"
              />
            </div>

            <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
              <SelectField
                className="min-w-0 flex-1"
                ariaLabel="Course"
                value={editCourseId}
                onChange={setEditCourseId}
                options={courses.map((course) => ({
                  value: course.id,
                  tag: course.code,
                  label: course.name,
                }))}
              />
              <button
                type="button"
                onClick={() => setEditHigh((v) => !v)}
                aria-pressed={editHigh}
                className="flex items-center gap-2 bg-transparent px-1 py-2"
              >
                <span className="scribble-box flex h-4 w-4 items-center justify-center">
                  {editHigh && <HandCheck size={11} color="var(--priority)" strokeWidth={1.6} />}
                </span>
                <span
                  className={`font-hand text-[15px] ${editHigh ? 'text-priority' : 'text-muted-soft'}`}
                >
                  !! high
                </span>
              </button>
            </div>

            <div className="mt-2.5">
              <DatePicker value={editDue} onChange={setEditDue} placeholder="Due date" />
            </div>

            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="flex-1 py-3.5 rounded-[10px] bg-transparent border border-line-strong text-ink-soft text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!editTitle.trim() || !editCourseId || savingTask}
                onClick={saveEditTask}
                className="flex-1 py-3.5 rounded-[10px] bg-primary text-primary-contrast text-sm font-medium disabled:opacity-30"
              >
                {savingTask ? (
                  <span className="flex items-center justify-center gap-2">
                    <ButtonSpinner />
                    Saving
                  </span>
                ) : (
                  'Save task'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The reading view. Not a spec table: the course in its own colour,
          the title set as a title, the notes as prose, the dates written the
          way the rest of the app writes them, and the marks left in the
          margin. */}
      {viewingTask && (() => {
        const course = courses.find((item) => item.id === viewingTask.courseId);
        const subtasks = viewingTask.subtasks ?? [];
        const done = subtasks.filter((item) => item.completed).length;

        return (
          <div className="fixed inset-0 z-[75] flex items-end animate-fade-in">
            <button
              type="button"
              aria-label="Close task details"
              onClick={() => setViewingTask(null)}
              className="absolute inset-0 scrim backdrop-blur-sm"
            />
            <section className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-bg px-6 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-slide-up md:mx-auto md:max-w-xl">
              <div className="mx-auto mb-6 h-1 w-9 rounded-full bg-line-strong" />

              <div className="flex items-baseline gap-2.5">
                <span className="eyebrow shrink-0" style={{ color: course?.color }}>
                  {course?.code ?? 'Task'}
                </span>
                {course && (
                  <span className="min-w-0 flex-1 truncate font-serif text-[13px] italic text-muted">
                    <span
                      className="hl-swipe"
                      style={
                        { '--hl': resolveTint(course.color, course.tint) } as React.CSSProperties
                      }
                    >
                      {course.name}
                    </span>
                  </span>
                )}
              </div>

              <h2 className="mb-0 mt-3 font-serif text-[27px] font-medium leading-[1.16] tracking-[-0.015em] text-ink">
                {viewingTask.title}
              </h2>

              {(viewingTask.completed || viewingTask.priority === 'high' || viewingTask.dueDate) && (
                <div className="mt-3.5 flex flex-wrap items-center gap-3">
                  {viewingTask.completed ? (
                    <Stamp style={course ? { color: course.color } : undefined}>Done</Stamp>
                  ) : (
                    <>
                      {viewingTask.priority === 'high' && (
                        <span
                          className="font-hand inline-block text-[16px] font-semibold tracking-wide text-priority"
                          style={{ transform: 'rotate(-3deg)' }}
                        >
                          !! high
                        </span>
                      )}
                      <DueDateBadge dueDate={viewingTask.dueDate} size="md" />
                    </>
                  )}
                </div>
              )}

              {viewingTask.description && (
                <p className="mb-0 mt-5 whitespace-pre-wrap font-serif text-[15px] leading-[1.7] text-ink-soft">
                  {viewingTask.description}
                </p>
              )}

              <div className="mt-8">
                <div className="flex items-baseline gap-2 border-b border-line pb-2">
                  <p className="eyebrow m-0">Subtasks</p>
                  {subtasks.length > 0 && (
                    <span className="tnum ml-auto font-mono text-[11px] text-muted">
                      {done}/{subtasks.length}
                    </span>
                  )}
                </div>

                {subtasks.map((subtask) => (
                  <button
                    key={subtask.id}
                    type="button"
                    aria-pressed={subtask.completed}
                    onClick={() =>
                      saveSubtasks(
                        viewingTask,
                        subtasks.map((item) =>
                          item.id === subtask.id ? { ...item, completed: !item.completed } : item,
                        ),
                      )
                    }
                    className={`flex w-full items-start gap-3 border-b border-dashed border-line bg-transparent px-0.5 py-2.5 text-left transition-opacity ${
                      subtask.completed ? 'opacity-45' : ''
                    }`}
                  >
                    <span className="scribble-box mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center">
                      {subtask.completed && (
                        <HandCheck size={11} color="var(--ink)" strokeWidth={1.6} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-[14px] leading-[1.45] text-ink">
                      {subtask.title}
                    </span>
                  </button>
                ))}

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = subtaskDraft.trim();
                    if (!title) return;
                    saveSubtasks(viewingTask, [
                      ...subtasks,
                      { id: `subtask-${Date.now()}`, title, completed: false },
                    ]);
                    setSubtaskDraft('');
                  }}
                  className="flex items-center gap-3 px-0.5 py-2.5"
                >
                  <span
                    aria-hidden
                    className="h-[17px] w-[17px] shrink-0 rounded-[5px] border border-dashed border-line-strong opacity-60"
                  />
                  <input
                    value={subtaskDraft}
                    onChange={(event) => setSubtaskDraft(event.target.value)}
                    placeholder="one more step…"
                    aria-label="New subtask"
                    className="min-w-0 flex-1 border-0 bg-transparent font-serif text-[14px] italic text-ink outline-none placeholder:text-muted-soft"
                  />
                  <button
                    type="submit"
                    disabled={!subtaskDraft.trim()}
                    className="hand-underline bg-transparent px-0.5 font-serif text-[13px] text-ink disabled:opacity-30"
                  >
                    Add
                  </button>
                </form>
              </div>

              <p className="mb-0 mt-7">
                <HandNote color="var(--muted-soft)" size={16} rotate={-1.5}>
                  added {formatRelativeDate(isoDate(new Date(viewingTask.createdAt)))}
                  {viewingTask.completedAt
                    ? ` · finished ${formatRelativeDate(
                        isoDate(new Date(viewingTask.completedAt)),
                      )}`
                    : ''}
                </HandNote>
              </p>

              <div className="mt-5 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setViewingTask(null);
                    openEditTask(viewingTask);
                  }}
                  className="flex-1 rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft"
                >
                  Edit
                </button>
                {viewingTask.completed ? (
                  <button
                    type="button"
                    onClick={() => setViewingTask(null)}
                    className="flex-1 rounded-[10px] bg-primary py-3.5 text-sm font-medium text-primary-contrast"
                  >
                    Close
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      handleStartTimerForTask(viewingTask);
                      setViewingTask(null);
                    }}
                    className="flex-1 rounded-[10px] bg-primary py-3.5 text-sm font-medium text-primary-contrast"
                  >
                    Start focus
                  </button>
                )}
              </div>
            </section>
          </div>
        );
      })()}

      {/* The keyboard, asked for rather than announced. Same chrome as every
          other sheet in the app, and the keys are postmarks. */}
      {shortcutHelpOpen && (
        <div className="fixed inset-0 z-[85] flex items-end animate-fade-in">
          <button
            type="button"
            aria-label="Close shortcuts"
            onClick={() => setShortcutHelpOpen(false)}
            className="absolute inset-0 scrim backdrop-blur-sm"
          />
          <section className="relative w-full rounded-t-3xl bg-bg px-6 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-slide-up md:mx-auto md:max-w-xl">
            <div className="mx-auto mb-6 h-1 w-9 rounded-full bg-line-strong" />
            <p className="eyebrow m-0">Keyboard</p>
            <h2 className="mb-0 mt-2 font-serif text-[24px] font-medium tracking-[-0.01em]">
              Shortcuts
            </h2>
            <ul className="mb-0 mt-5 list-none p-0">
              {(
                [
                  { k: 'N', l: 'New task' },
                  { k: 'S', l: 'Change order' },
                  { k: 'Enter', l: 'Save what you are typing' },
                  { k: 'Esc', l: 'Close the sheet' },
                ] as const
              ).map((row) => (
                <li
                  key={row.k}
                  className="flex items-center gap-4 border-b border-dashed border-line py-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 font-serif text-[15px] text-ink-soft">
                    {row.l}
                  </span>
                  <Stamp>{row.k}</Stamp>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShortcutHelpOpen(false)}
              className="mt-6 w-full rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft"
            >
              Close
            </button>
          </section>
        </div>
      )}
    </PageShell>
  );
}

function TasksPageFallback() {
  return (
    <PageShell>
      <LoadingIndicator compact label="Loading your tasks" className="mb-6" />
    </PageShell>
  );
}

function EmptyState({ title }: { title: string }) {
  const prompt = title.includes('courses') 
    ? 'The page is blank. Add a course to begin...' 
    : 'The page is blank. Jot down what\'s next...';
  return (
    <div className="py-16 text-center">
      <p className="m-0 font-serif text-[16px] italic text-muted-soft">
        {prompt}
      </p>
    </div>
  );
}
