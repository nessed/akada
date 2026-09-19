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
import TaskRow from '@/components/TaskRow';
import StartTimerPopover, { type StartTarget } from '@/components/StartTimerPopover';
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

type Filter = 'all' | 'overdue' | 'today' | 'week' | 'done';
type SortMode = 'smart' | 'due' | 'newest';
type Grouping = 'due' | 'course';

const FILTERS: { v: Filter; l: string }[] = [
  { v: 'all', l: 'All' },
  { v: 'overdue', l: 'Overdue' },
  { v: 'today', l: 'Today' },
  { v: 'week', l: 'This week' },
  { v: 'done', l: 'Done' },
];

const BULK_BUTTON =
  'h-10 rounded-[8px] px-3 text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink';

/** What an undone bulk action needs to put itself back. */
interface UndoEntry {
  label: string;
  restore: () => Promise<void>;
}

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
  const [grouping, setGrouping] = useState<Grouping>('due');
  const [courseFilter, setCourseFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

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

  /* What the page was opened for, straight off the URL. `?course=` filters
     to that course, `&newTask=1` also opens the form, `?filter=` picks a
     band, and `?task=` opens one task's reading view. The ref stops SWR
     revalidations from replaying any of it over what the reader has since
     chosen. */
  useEffect(() => {
    if (handledTaskIntent.current || coursesLoading || courses.length === 0) return;
    handledTaskIntent.current = true;

    const courseId = searchParams.get('course');
    if (courseId && courses.some((course) => course.id === courseId)) {
      setCourseFilter(courseId);
      if (searchParams.get('newTask') === '1') {
        setAddingFor(courseId);
        setDraftTitle('');
        setDraftDue('');
        setDraftHigh(false);
      }
    }

    const wanted = searchParams.get('filter');
    if (wanted && FILTERS.some((f) => f.v === wanted)) setFilter(wanted as Filter);

    const taskId = searchParams.get('task');
    if (taskId) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) setViewingTask(task);
    }
  }, [courses, coursesLoading, searchParams, tasks]);

  const loading =
    onboardingLoading || onboarded === false || coursesLoading || tasksLoading;

  /* Every filter reads off the same day boundaries, so they are worked out
     once rather than three times with three chances to disagree. */
  const bounds = useMemo(() => {
    const today = isoDate();
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    return { today, weekEnd: isoDate(weekEnd) };
  }, []);

  const matchesFilter = useMemo(
    () => (t: Task, f: Filter) => {
      if (f === 'done') return t.completed;
      if (t.completed) return false;
      if (f === 'overdue') return Boolean(t.dueDate && t.dueDate < bounds.today);
      if (f === 'today') return t.dueDate === bounds.today;
      if (f === 'week') {
        return Boolean(t.dueDate && t.dueDate > bounds.today && t.dueDate <= bounds.weekEnd);
      }
      return true;
    },
    [bounds],
  );

  /** The number beside each filter, over the whole list rather than the view. */
  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) out[f.v] = tasks.filter((t) => matchesFilter(t, f.v)).length;
    return out;
  }, [matchesFilter, tasks]);

  const openCount = tasks.filter((t) => !t.completed).length;
  const overdueCount = counts.overdue ?? 0;
  const filterLabel = FILTERS.find((f) => f.v === filter)?.l.toLowerCase() ?? '';

  const visibleTasks = useMemo(() => {
    const list = tasks.filter(
      (t) => matchesFilter(t, filter) && (!courseFilter || t.courseId === courseFilter),
    );
    return list.sort((a, b) => {
      if (sortMode === 'newest') return b.createdAt.localeCompare(a.createdAt);
      if (sortMode === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });
  }, [courseFilter, filter, matchesFilter, sortMode, tasks]);

  /**
   * The list in bands. By due date it is the four answers to "when", in the
   * order the reader has to deal with them; by course it is the term's own
   * order. Either way an empty band is left out rather than shown empty.
   */
  const groups = useMemo(() => {
    if (grouping === 'course') {
      return courses
        .map((course) => ({
          key: course.id,
          label: `${course.code} · ${course.name}`,
          tasks: visibleTasks.filter((t) => t.courseId === course.id),
        }))
        .filter((g) => g.tasks.length > 0);
    }

    const band = (t: Task) => {
      if (t.completed) return 'done';
      if (!t.dueDate) return 'someday';
      if (t.dueDate < bounds.today) return 'overdue';
      if (t.dueDate === bounds.today) return 'today';
      if (t.dueDate <= bounds.weekEnd) return 'week';
      return 'later';
    };
    const labels: Record<string, string> = {
      overdue: 'Overdue',
      today: 'Today',
      week: 'This week',
      later: 'Later',
      someday: 'No date',
      done: 'Done',
    };
    return ['overdue', 'today', 'week', 'later', 'someday', 'done']
      .map((key) => ({
        key,
        label: labels[key],
        tasks: visibleTasks.filter((t) => band(t) === key),
      }))
      .filter((g) => g.tasks.length > 0);
  }, [bounds, courses, grouping, visibleTasks]);

  /* A selection only means anything while the rows it points at are on
     screen. Changing filter or course used to leave six invisible tasks
     armed behind a Delete button. */
  useEffect(() => {
    setSelected(new Set());
  }, [filter, courseFilter]);

  /* The toast is the only way back from a bulk action, so it stays long
     enough to be read and reached, and a new one replaces it rather than
     stacking. */
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(t);
  }, [undo]);

  function toggleSelected(task: Task) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
  }

  /** The rows a bulk action applies to, resolved at the moment it is run. */
  function selectedTasks(): Task[] {
    return tasks.filter((t) => selected.has(t.id));
  }

  async function bulkComplete() {
    const batch = selectedTasks().filter((t) => !t.completed);
    if (batch.length === 0) return;
    setSelected(new Set());
    try {
      await Promise.all(batch.map((t) => toggleTaskOptimistic(t)));
      setUndo({
        label: `Completed ${batch.length} ${batch.length === 1 ? 'task' : 'tasks'}`,
        restore: async () => {
          await Promise.all(
            batch.map((t) =>
              updateTaskOptimistic(t.id, { completed: false, completedAt: null }),
            ),
          );
        },
      });
    } catch (error) {
      console.error('Failed to complete tasks:', error);
      notify('Some of those did not complete.');
    }
  }

  async function bulkReschedule() {
    const batch = selectedTasks().filter((t) => !t.completed);
    if (batch.length === 0) return;
    setSelected(new Set());
    // The old dates are captured before the write, because undo has to put
    // each task back where it was rather than on one shared day.
    const before = batch.map((t) => ({ id: t.id, dueDate: t.dueDate }));
    try {
      await Promise.all(batch.map((t) => updateTaskOptimistic(t.id, { dueDate: bounds.today })));
      setUndo({
        label: `Moved ${batch.length} to today`,
        restore: async () => {
          await Promise.all(before.map((b) => updateTaskOptimistic(b.id, { dueDate: b.dueDate })));
        },
      });
    } catch (error) {
      console.error('Failed to reschedule tasks:', error);
      notify('Some of those did not move.');
    }
  }

  async function bulkDelete() {
    const batch = selectedTasks();
    if (batch.length === 0) return;
    setSelected(new Set());
    try {
      await Promise.all(batch.map((t) => deleteTaskOptimistic(t.id)));
      setUndo({
        label: `Deleted ${batch.length} ${batch.length === 1 ? 'task' : 'tasks'}`,
        restore: async () => {
          // A deleted row cannot come back with its old id, so undo writes
          // the same task again rather than pretending nothing happened.
          await Promise.all(
            batch.map((t) =>
              addTaskOptimistic({
                courseId: t.courseId,
                title: t.title,
                description: t.description,
                subtasks: t.subtasks,
                dueDate: t.dueDate,
                priority: t.priority,
              }),
            ),
          );
        },
      });
    } catch (error) {
      console.error('Failed to delete tasks:', error);
      notify('Some of those are still here.');
    }
  }

  async function runUndo() {
    if (!undo) return;
    const entry = undo;
    setUndo(null);
    try {
      await entry.restore();
    } catch (error) {
      console.error('Failed to undo:', error);
      notify('That could not be undone.');
    }
  }

  async function snoozeTask(task: Task) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    try {
      await updateTaskOptimistic(task.id, { dueDate: isoDate(tomorrow) });
    } catch (error) {
      console.error('Failed to reschedule task:', error);
      notify('That task did not move.');
    }
  }

  async function toggleTask(t: Task) {
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
    <PageShell wide>
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="m-0 mb-1.5 font-mono text-[12px] tracking-[0.02em] text-muted">
            {openCount} open · {overdueCount} overdue
          </p>
          <h1 className="m-0 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
            Tasks
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShortcutHelpOpen(true)}
            aria-label="Keyboard shortcuts"
            className="grid h-10 w-10 place-items-center rounded-[10px] text-muted transition-colors hover:bg-bg-tint hover:text-ink"
          >
            <HandNote color="currentColor" size={19} rotate={-8}>
              ?
            </HandNote>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!courses[0]) return;
              setAddingFor(courseFilter ?? courses[0].id);
              setDraftTitle('');
              setDraftDue('');
              setDraftHigh(false);
            }}
            className="h-10 rounded-[10px] border border-line-strong px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
          >
            New task
          </button>
        </div>
      </header>

      {/* What is shown, and how it is grouped. The filter is a swipe of
          highlighter; the course and grouping are written choices beside it. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              type="button"
              aria-pressed={filter === f.v}
              onClick={() => setFilter(f.v)}
              className={`flex h-10 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] transition-colors ${
                filter === f.v ? 'text-ink' : 'text-ink-soft hover:bg-bg-tint hover:text-ink'
              }`}
            >
              <span className={filter === f.v ? 'hl-swipe' : ''}>{f.l}</span>
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {counts[f.v]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <label className="sr-only" htmlFor="task-course-filter">
            Course
          </label>
          <select
            id="task-course-filter"
            value={courseFilter ?? ''}
            onChange={(e) => setCourseFilter(e.target.value || null)}
            className="h-10 rounded-[10px] border border-line bg-paper px-2.5 text-[12px] text-ink-soft outline-none"
          >
            <option value="">Course: all</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="task-grouping">
            Group by
          </label>
          <select
            id="task-grouping"
            value={grouping}
            onChange={(e) => setGrouping(e.target.value as Grouping)}
            className="h-10 rounded-[10px] border border-line bg-paper px-2.5 text-[12px] text-ink-soft outline-none"
          >
            <option value="due">Group: due date</option>
            <option value="course">Group: course</option>
          </select>
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState title="No courses yet" />
      ) : groups.length === 0 ? (
        <EmptyState title={filter === 'all' ? 'Nothing on the list' : `No ${filterLabel} tasks`} />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-line bg-paper">
          {/* The column heads. They belong to the whole table, not to each
              group, so a long list keeps meaning as it scrolls past them. */}
          <div className="hidden h-10 items-center border-b border-line bg-paper-2 pl-1 pr-2 md:grid md:grid-cols-[40px_minmax(0,1fr)_132px_128px_88px]">
            <span />
            <span className="eyebrow">Task</span>
            <span className="eyebrow">Course</span>
            <span className="eyebrow">Due</span>
            <span />
          </div>

          {groups.map((group) => (
            <section key={group.key}>
              <div className="flex items-baseline justify-between gap-3 border-b border-line-soft bg-paper-2 px-4 py-2">
                <p className="eyebrow m-0">{group.label}</p>
                <span className="font-mono text-[11px] tabular-nums text-muted">
                  {group.tasks.length}
                </span>
              </div>
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  course={courses.find((c) => c.id === task.courseId)}
                  selected={selected.has(task.id)}
                  running={active?.taskId === task.id}
                  hideCourse={Boolean(courseFilter)}
                  onToggle={toggleTask}
                  onStartTimer={(t, el) => {
                    const course = courses.find((c) => c.id === t.courseId);
                    if (course) setStartTarget({ task: t, course, anchor: el });
                  }}
                  onOpen={setViewingTask}
                  onSelect={toggleSelected}
                  onReschedule={snoozeTask}
                  onDelete={(t) => deleteTask(t.id)}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {/* Inline add, on the course the page is filtered to or the first one. */}
      {addingFor && (
        <div
          className="mt-3 animate-fade-in rounded-[10px] bg-paper px-3 py-2.5"
          style={{ border: `1px solid ${courses.find((c) => c.id === addingFor)?.color ?? 'var(--line)'}` }}
        >
          <input
            autoFocus
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="New task"
            className="w-full border-0 bg-transparent p-1 font-serif text-sm italic text-ink outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft(addingFor);
              if (e.key === 'Escape') setAddingFor(null);
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SelectField
              className="w-[180px]"
              ariaLabel="Course"
              value={addingFor}
              onChange={setAddingFor}
              options={courses.map((course) => ({
                value: course.id,
                tag: course.code,
                label: course.name,
              }))}
            />
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
              onClick={() => commitDraft(addingFor)}
              className="hand-underline ml-auto bg-transparent px-0.5 font-serif text-[13px] text-ink disabled:opacity-40"
            >
              {savingTask ? 'Adding' : 'Add'}
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 px-1 font-mono text-[11px] text-muted-soft">
        N new · S sort · X select · ⌘Z undo
      </p>

      {/* The bulk bar. It only exists while something is selected, and it
          sits above the phone's bottom bar rather than under it. */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-8">
          <div className="flex flex-wrap items-center gap-1 rounded-[12px] border border-line bg-paper p-1.5 shadow-[0_8px_20px_rgba(57,48,36,.12)]">
            <span className="px-2.5 font-mono text-[12px] tabular-nums text-ink">
              {selected.size} selected
            </span>
            <button type="button" onClick={bulkComplete} className={BULK_BUTTON}>
              Complete
            </button>
            <button type="button" onClick={bulkReschedule} className={BULK_BUTTON}>
              To today
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              className={`${BULK_BUTTON} text-warn hover:bg-warnTint`}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="ml-1 grid h-10 w-10 place-items-center rounded-[8px] font-mono text-[11px] text-muted transition-colors hover:bg-bg-tint hover:text-ink"
            >
              Esc
            </button>
          </div>
        </div>
      )}

      {/* The undo toast. Every destructive bulk action leaves one, because
          "Delete 6" with no way back is not a thing to put behind one click. */}
      {undo && (
        <div className="fixed inset-x-0 bottom-[calc(160px+env(safe-area-inset-bottom))] z-40 flex animate-fade-in justify-center px-4 md:bottom-24">
          <div className="flex items-center gap-3 rounded-[10px] border border-line bg-paper py-2 pl-3.5 pr-2 shadow-[0_8px_20px_rgba(57,48,36,.12)]">
            <span className="text-[13px] text-ink">{undo.label}</span>
            <button
              type="button"
              onClick={runUndo}
              className="h-9 rounded-[8px] px-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      <StartTimerPopover target={startTarget} onClose={() => setStartTarget(null)} />

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
