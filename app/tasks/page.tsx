'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Fortnight from '@/components/tasks/Fortnight';
import ReorderList from '@/components/ReorderList';
import StartTimerPopover, { type StartTarget } from '@/components/StartTimerPopover';
import TaskNoteLine from '@/components/notes/TaskNoteLine';
import { RecallGlyph, VerdictMark } from '@/components/recall/RecallMarks';
import type { Course, Task, TaskKind } from '@/lib/data';
import { useRecall } from '@/lib/recall/use-recall';
import { keepTask, keepTickedSteps } from '@/lib/recall/actions';
import { looksLikeReading, readingPrompt, recallOfTask, type RecallItem } from '@/lib/recall';
import { beforeReadingPrompt } from '@/lib/recall/prompt';
import { daysAgoWords, whenWords } from '@/lib/recall/words';
import { formatHM, formatRelativeDate, isoDate, resolveTint } from '@/lib/utils';
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

const KINDS: { v: TaskKind; l: string }[] = [
  { v: 'task', l: 'Task' },
  { v: 'reading', l: 'Reading' },
  { v: 'exam', l: 'Exam' },
];

const BULK_BUTTON =
  'h-10 rounded-[8px] px-3 text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink';

/** One band of the list: a day, a stretch of days, or a course. */
interface Band {
  key: string;
  label: string;
  sub: string;
  tone?: 'late' | 'today' | 'done';
  course?: Course;
  /** Where a task added from this band lands. Absent: no add row here. */
  addDue?: string;
  tasks: Task[];
}

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
  const { active, start, pause, resume, focusSeconds } = useTimer();
  const { notify } = useNotice();
  // Guards the two writes that were previously fire-and-forget from the UI's
  // point of view: nothing changed on the button while they were in flight.
  const [savingTask, setSavingTask] = useState(false);

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { tasks, isLoading: tasksLoading } = useTasks();
  // Where a finished task, or a ticked step, stands in recall. Read in the
  // task sheet only; the list itself stays a list of things to do.
  const { reading: recall } = useRecall();
  const [keeping, setKeeping] = useState(false);

  const [filter, setFilter] = useState<Filter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const [grouping, setGrouping] = useState<Grouping>('due');
  const [courseFilter, setCourseFilter] = useState<string | null>(null);
  // A day picked on the fortnight strip: an ISO date, or 'overdue' for the
  // pile of late ones at its left edge.
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  // Inline add per course
  const [addingFor, setAddingFor] = useState<string | null>(null);
  // Which band the draft is written into. Null is the top of the list,
  // where New task and N put it.
  const [addingAt, setAddingAt] = useState<string | null>(null);
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
  const [editKind, setEditKind] = useState<TaskKind>('task');
  const [editWeight, setEditWeight] = useState('');
  const [editPages, setEditPages] = useState('');
  const handledTaskIntent = useRef(false);

  /* The keydown listener is bound once, so it reads what it needs through
     refs rather than closing over the render that bound it. */
  const undoRef = useRef<UndoEntry | null>(null);
  const runUndoRef = useRef<() => void>(() => {});
  const sheetOpenRef = useRef(false);
  const moveCursorRef = useRef<(delta: number) => void>(() => {});
  const cursorTaskRef = useRef<Task | null>(null);
  const toggleSelectedRef = useRef<(task: Task) => void>(() => {});

  /**
   * What a row needs to show, and hold, the timer running on it.
   *
   * Passed as one unit because these four belong together: the pause control
   * on a row used to draw whenever a timer was running and call a handler no
   * page ever passed, so it was a live-looking button that did nothing. It
   * now draws only when it is given something to do, and this keeps every
   * list giving it the same thing.
   */
  function timerRowProps(task: Task) {
    const mine = active?.taskId === task.id;
    return {
      running: mine,
      paused: mine && Boolean(active?.isPaused),
      runningLabel: mine ? formatHM(focusSeconds) : undefined,
      onTogglePause: active?.isPaused ? resume : pause,
    };
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=true]')) return;
      if (event.key.toLowerCase() === 'n' && courses[0]) {
        event.preventDefault();
        setAddingAt(null);
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
      // Undo is the only way back from a bulk move, and the hint under the
      // list has always said so. It reaches the same run the toast does.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (!undoRef.current) return;
        event.preventDefault();
        runUndoRef.current();
        return;
      }
      if (event.key === 'Escape') {
        setAddingFor(null);
        setEditingTask(null);
        setViewingTask(null);
        setShortcutHelpOpen(false);
      }
      // Everything below walks the list, so it belongs to the list: with a
      // sheet in front of it, the arrows are the sheet's to answer.
      if (sheetOpenRef.current) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveCursorRef.current(event.key === 'ArrowDown' ? 1 : -1);
      }
      if (event.key.toLowerCase() === 'x') {
        const task = cursorTaskRef.current;
        if (!task) return;
        event.preventDefault();
        toggleSelectedRef.current(task);
      }
      if (event.key === 'Enter') {
        const task = cursorTaskRef.current;
        if (!task) return;
        event.preventDefault();
        setViewingTask(task);
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
    // Courses and tasks are separate reads that can land in either order, and
    // the ref below fires once. Opening a task named in the URL therefore has
    // to wait for the tasks themselves, or the link quietly does nothing.
    if (searchParams.get('task') && tasksLoading) return;
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
  }, [courses, coursesLoading, searchParams, tasks, tasksLoading]);

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
      (t) =>
        matchesFilter(t, filter) &&
        (!courseFilter || t.courseId === courseFilter) &&
        (!dayFilter ||
          (dayFilter === 'overdue'
            ? !t.completed && Boolean(t.dueDate && t.dueDate < bounds.today)
            : t.dueDate === dayFilter)),
    );
    return list.sort((a, b) => {
      if (sortMode === 'newest') return b.createdAt.localeCompare(a.createdAt);
      if (sortMode === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });
  }, [bounds, courseFilter, dayFilter, filter, matchesFilter, sortMode, tasks]);

  /**
   * The list in bands. By due date it is the four answers to "when", in the
   * order the reader has to deal with them; by course it is the term's own
   * order. Either way an empty band is left out rather than shown empty.
   */
  const groups = useMemo((): Band[] => {
    if (grouping === 'course') {
      return courses
        .map((course) => ({
          key: course.id,
          label: course.code,
          sub: course.name,
          course,
          addDue: '',
          tasks: visibleTasks.filter((t) => t.courseId === course.id),
        }))
        .filter((g) => g.tasks.length > 0);
    }

    // The planner's own order: what slipped, today, then each of the next
    // seven days by name, then everything past them.
    const at = (n: number) => {
      const d = new Date(bounds.today + 'T12:00:00');
      d.setDate(d.getDate() + n);
      return d;
    };
    const short = (d: Date) =>
      d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const open = visibleTasks.filter((t) => !t.completed);
    const bands: Band[] = [
      {
        key: 'overdue',
        label: 'Overdue',
        sub: 'carried over',
        tone: 'late',
        tasks: open.filter((t) => t.dueDate && t.dueDate < bounds.today),
      },
      {
        key: 'today',
        label: 'Today',
        sub: at(0).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
        tone: 'today',
        addDue: bounds.today,
        tasks: open.filter((t) => t.dueDate === bounds.today),
      },
      ...Array.from({ length: 7 }, (_, i) => {
        const d = at(i + 1);
        const iso = isoDate(d);
        return {
          key: iso,
          label: i === 0 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' }),
          sub: short(d),
          addDue: iso,
          tasks: open.filter((t) => t.dueDate === iso),
        };
      }),
      {
        key: 'later',
        label: 'Later',
        sub: `after ${short(at(7))}`,
        tasks: open.filter((t) => t.dueDate && t.dueDate > bounds.weekEnd),
      },
      {
        key: 'someday',
        label: 'Open ended',
        sub: 'no date on them',
        addDue: '',
        tasks: open.filter((t) => !t.dueDate),
      },
      {
        key: 'done',
        label: 'Done',
        sub: 'ticked off',
        tone: 'done',
        tasks: visibleTasks.filter((t) => t.completed),
      },
    ];
    // Today stays on the page even when nothing is due, because "nothing
    // today" is an answer, and it is where a task for today gets written.
    const keepToday = !dayFilter && (filter === 'all' || filter === 'today');
    return bands.filter((g) => g.tasks.length > 0 || (g.key === 'today' && keepToday));
  }, [bounds, courses, dayFilter, filter, grouping, visibleTasks]);


  /**
   * The rows in the order they read down the page, and where the keyboard is
   * on them.
   *
   * The hint under the list has always offered "X select" and "undo", and
   * `TaskRow` has always known how to draw a focus ring, but nothing ever
   * moved a cursor or bound either key, so both were promises the screen
   * could not keep. This is the missing half.
   */
  const flatTasks = useMemo(() => groups.flatMap((group) => group.tasks), [groups]);
  const [cursor, setCursor] = useState<string | null>(null);

  /* A cursor on a row that has been filtered away, finished or deleted points
     at nothing, and the next arrow key should start from the top rather than
     from a row nobody can see. */
  useEffect(() => {
    setCursor((current) =>
      current && flatTasks.some((task) => task.id === current) ? current : null,
    );
  }, [flatTasks]);

  /** Walks the cursor, and brings the row it lands on into view. */
  const moveCursor = useCallback(
    (delta: number) => {
      if (flatTasks.length === 0) return;
      setCursor((current) => {
        const at = current ? flatTasks.findIndex((task) => task.id === current) : -1;
        const next =
          at === -1
            ? flatTasks[delta > 0 ? 0 : flatTasks.length - 1]
            : flatTasks[Math.min(flatTasks.length - 1, Math.max(0, at + delta))];
        if (next) {
          window.requestAnimationFrame(() => {
            document
              .querySelector(`[data-task-row="${next.id}"]`)
              ?.scrollIntoView({ block: 'nearest' });
          });
        }
        return next?.id ?? current;
      });
    },
    [flatTasks],
  );

  /* Runs after every render, which is the point: the one bound listener
     always reaches this render's handlers. */
  useEffect(() => {
    undoRef.current = undo;
    runUndoRef.current = runUndo;
    sheetOpenRef.current = Boolean(
      viewingTask || editingTask || addingFor || shortcutHelpOpen,
    );
    moveCursorRef.current = moveCursor;
    cursorTaskRef.current = flatTasks.find((task) => task.id === cursor) ?? null;
    toggleSelectedRef.current = toggleSelected;
  });

  /* A selection only means anything while the rows it points at are on
     screen. Changing filter or course used to leave six invisible tasks
     armed behind a Delete button. */
  useEffect(() => {
    setSelected(new Set());
  }, [filter, courseFilter, dayFilter]);

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
          //
          // Everything else about it does come back. This used to send six
          // fields and drop the three that say what the task is: an exam
          // worth 30% returned as a plain task worth nothing, and a reading
          // lost its page count. An undo that quietly keeps some of a row is
          // worse than one that refuses, because nothing says what went.
          await Promise.all(
            batch.map(async (t) => {
              const written = await addTaskOptimistic({
                courseId: t.courseId,
                title: t.title,
                description: t.description,
                subtasks: t.subtasks,
                dueDate: t.dueDate,
                priority: t.priority,
                kind: t.kind,
                weight: t.weight,
                pages: t.pages,
              });
              // A finished task comes back finished. Adding a task always
              // writes it open, so the tick is put back on the row that was
              // actually written.
              if (t.completed) {
                await updateTaskOptimistic(written.id, {
                  completed: true,
                  completedAt: t.completedAt,
                });
              }
            }),
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

  /**
   * Open ended: the task keeps its place on the list and gives up its date.
   * A date is a promise to a day, and taking it back is a real edit, so it
   * goes through the same undo every other bulk move on this screen does.
   */
  async function openEndTask(task: Task) {
    if (!task.dueDate) return;
    const before = task.dueDate;
    try {
      await updateTaskOptimistic(task.id, { dueDate: null });
      setUndo({
        label: `${task.title} is open ended`,
        restore: async () => {
          await updateTaskOptimistic(task.id, { dueDate: before });
        },
      });
    } catch (error) {
      console.error('Failed to clear the due date:', error);
      notify('That date did not come off.');
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
    setEditKind(task.kind ?? 'task');
    setEditWeight(task.weight == null ? '' : String(task.weight));
    setEditPages(task.pages == null ? '' : String(task.pages));
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
        kind: editKind,
        weight: numberOrNull(editWeight),
        // Pages only mean anything on a reading, and leaving a stale count on
        // a row someone has just retyped as an exam would make the backlog
        // claim hours that are not there.
        pages: editKind === 'reading' ? numberOrNull(editPages) : null,
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

  /**
   * The order the steps were dragged into.
   *
   * Subtasks are stored as the list they read as, so the order is the write:
   * there is no separate column to keep in step. This rethrows where
   * saveSubtasks only notifies, because the list that asked for the move puts
   * the step back where it came from when the write is refused.
   */
  async function reorderSubtasks(task: Task, orderedIds: string[]) {
    const current = task.subtasks ?? [];
    const byId = new Map(current.map((item) => [item.id, item]));
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<Task['subtasks']>[number] => Boolean(item));
    // A step ticked off or added elsewhere mid-carry would make this a
    // shorter list than the one being saved; leave it alone rather than
    // writing a truncated checklist.
    if (next.length !== current.length) return;
    // The open sheet is moved first rather than after the write, so ticking a
    // step off while the order is still in flight cannot write the old order
    // back over it.
    const show = (subtasks: NonNullable<Task['subtasks']>) =>
      setViewingTask((viewing) =>
        viewing?.id === task.id ? { ...viewing, subtasks } : viewing,
      );
    show(next);
    try {
      await updateTaskOptimistic(task.id, { subtasks: next });
    } catch (error) {
      show(current);
      notify('That order did not save.');
      throw error;
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

  function openDraft(courseId: string, due = '', at: string | null = null) {
    setAddingAt(at);
    setAddingFor(courseId);
    setDraftTitle('');
    setDraftDue(due);
    setDraftHigh(false);
  }

  /** The inline draft, wherever it was asked for. */
  function renderDraft(courseId: string) {
    return (
      <div
        className="animate-fade-in rounded-[10px] bg-paper px-3 py-2.5"
        style={{ border: `1px solid ${courses.find((c) => c.id === courseId)?.color ?? 'var(--line)'}` }}
      >
        <input
          autoFocus
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="New task"
          className="w-full border-0 bg-transparent p-1 font-serif text-sm italic text-ink outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft(courseId);
            if (e.key === 'Escape') setAddingFor(null);
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SelectField
            className="w-[180px]"
            ariaLabel="Course"
            value={courseId}
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
            clearLabel="Open ended"
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
            onClick={() => setAddingFor(null)}
            className="ml-auto bg-transparent px-1 font-serif text-[13px] italic text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={savingTask}
            onClick={() => commitDraft(courseId)}
            className="hand-underline bg-transparent px-0.5 font-serif text-[13px] text-ink disabled:opacity-40"
          >
            {savingTask ? 'Adding' : 'Add'}
          </button>
        </div>
      </div>
    );
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
      <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="m-0 mb-1.5 font-serif italic text-[13.5px] text-muted">
            {openCount} open
            {overdueCount > 0 && <span className="text-warn"> · {overdueCount} overdue</span>}
            {counts.week > 0 && <> · {counts.week} more this week</>}
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
            onClick={() => courses[0] && openDraft(courseFilter ?? courses[0].id)}
            className="h-10 rounded-[10px] border border-line-strong px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
          >
            New task
          </button>
        </div>
      </header>

      {/* The fortnight: where the load falls, before the list of what it is. */}
      {courses.length > 0 && (
        <section className="mb-7">
          <Fortnight
            tasks={courseFilter ? tasks.filter((t) => t.courseId === courseFilter) : tasks}
            courses={courses}
            picked={dayFilter}
            onPick={(day) => {
              setDayFilter(day);
              if (day) setFilter('all');
            }}
          />
          <div aria-hidden className="fold mt-0" />
        </section>
      )}

      {/* What is shown. The band filter is a swipe of highlighter, each
          course is its own colour rule, and how the list is cut is two words
          with the chosen one underlined. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="app-scroll -mx-[var(--density-gutter)] flex w-[calc(100%+2*var(--density-gutter))] gap-1 overflow-x-auto px-[var(--density-gutter)] sm:mx-0 sm:w-auto sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              type="button"
              aria-pressed={filter === f.v && !dayFilter}
              onClick={() => {
                setFilter(f.v);
                setDayFilter(null);
              }}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] transition-colors ${
                filter === f.v && !dayFilter
                  ? 'text-ink'
                  : 'text-ink-soft hover:bg-bg-tint hover:text-ink'
              }`}
            >
              <span className={filter === f.v && !dayFilter ? 'hl-swipe' : ''}>{f.l}</span>
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {counts[f.v]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-[13px] sm:ml-auto">
          <span className="eyebrow mr-1">By</span>
          {(
            [
              { v: 'due', l: 'day' },
              { v: 'course', l: 'course' },
            ] as { v: Grouping; l: string }[]
          ).map((g) => (
            <button
              key={g.v}
              type="button"
              aria-pressed={grouping === g.v}
              onClick={() => setGrouping(g.v)}
              className={`h-10 bg-transparent px-1.5 font-serif italic transition-colors ${
                grouping === g.v ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              <span className={grouping === g.v ? 'hand-underline' : ''}>{g.l}</span>
            </button>
          ))}
          <span aria-hidden className="mx-1.5 h-4 w-px bg-line" />
          <button
            type="button"
            onClick={() =>
              setSortMode((m) => (m === 'smart' ? 'due' : m === 'due' ? 'newest' : 'smart'))
            }
            title="Change the order inside each band (S)"
            className="h-10 bg-transparent px-1.5 text-muted transition-colors hover:text-ink"
          >
            <span className="eyebrow mr-1.5">Order</span>
            <span className="font-serif italic text-ink-soft">
              {sortMode === 'smart' ? 'what matters' : sortMode === 'due' ? 'by date' : 'newest'}
            </span>
          </button>
        </div>
      </div>

      {courses.length > 0 && (
        <div
          className="app-scroll -mx-[var(--density-gutter)] mb-6 flex gap-1 overflow-x-auto px-[var(--density-gutter)] md:mx-0 md:flex-wrap md:px-0"
          role="group"
          aria-label="Course"
        >
          <button
            type="button"
            aria-pressed={!courseFilter}
            onClick={() => setCourseFilter(null)}
            className={`flex h-9 shrink-0 items-center rounded-[8px] px-2.5 text-[12.5px] transition-colors ${
              !courseFilter ? 'text-ink' : 'text-muted hover:bg-bg-tint hover:text-ink'
            }`}
          >
            <span className={!courseFilter ? 'hl-swipe' : ''}>Every course</span>
          </button>
          {courses.map((c) => {
            const on = courseFilter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setCourseFilter(on ? null : c.id)}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-[8px] px-2.5 text-[12.5px] transition-colors ${
                  on ? 'text-ink' : 'text-ink-soft hover:bg-bg-tint hover:text-ink'
                }`}
              >
                <span aria-hidden className="course-rule !w-3.5" style={{ ['--c' as string]: c.color }} />
                <span
                  className={on ? 'hl-swipe' : ''}
                  style={on ? ({ '--hl': resolveTint(c.color, c.tint) } as React.CSSProperties) : undefined}
                >
                  {c.code}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {dayFilter && (
        <p className="-mt-2 mb-4 font-serif text-[14px] italic text-muted">
          Only{' '}
          {dayFilter === 'overdue'
            ? 'what is past its date'
            : dayFilter === bounds.today
              ? 'today'
              : new Date(dayFilter + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
          {' · '}
          <button
            type="button"
            onClick={() => setDayFilter(null)}
            className="hand-underline bg-transparent px-0.5 not-italic text-ink"
          >
            every day
          </button>
        </p>
      )}

      {addingFor && addingAt === null && <div className="mb-5">{renderDraft(addingFor)}</div>}

      {courses.length === 0 ? (
        <EmptyState title="No courses yet" />
      ) : groups.length === 0 ? (
        <EmptyState title={filter === 'all' ? 'Nothing on the list' : `No ${filterLabel} tasks`} />
      ) : (
        /* The planner. Each band is a day, or a course, with its name held in
           the left margin while its rows go past, the way the date sits at
           the head of a page in a diary. Nothing boxes it: bands are ended
           by the page's own cutoff rule. */
        <div className="divide-y divide-line">
          {groups.map((group) => (
              <section
                key={group.key}
                className="group/band py-5 first:pt-1 md:grid md:grid-cols-[168px_minmax(0,1fr)] md:gap-x-8"
              >
                <header className="mb-2 flex items-baseline gap-2.5 md:sticky md:top-6 md:mb-0 md:block md:self-start md:pt-2.5">
                  <h2
                    className={`m-0 flex items-center gap-2 font-serif text-[20px] font-medium leading-tight tracking-[-0.01em] ${
                      group.tone === 'late' ? 'text-warn' : group.tone === 'done' ? 'text-muted' : 'text-ink'
                    }`}
                  >
                    {group.course && (
                      <span aria-hidden className="course-rule" style={{ ['--c' as string]: group.course.color }} />
                    )}
                    <span className={group.tone === 'today' ? 'hl-swipe' : ''}>{group.label}</span>
                  </h2>
                  <p className="m-0 mt-0.5 min-w-0 truncate font-serif text-[13px] italic text-muted">
                    {group.sub}
                  </p>
                  {group.tone === 'late' && (
                    <p className="m-0 ml-auto shrink-0 md:ml-0 md:mt-2">
                      <HandNote color="var(--warnSoft)" size={16} rotate={-3}>
                        {group.tasks.length} to catch up
                      </HandNote>
                    </p>
                  )}
                </header>

                <div className="min-w-0">
                  {group.tasks.length === 0 && (
                    <p className="m-0 flex h-12 items-center pl-[11px] font-serif text-[14.5px] italic text-muted-soft">
                      Nothing due. A clear day.
                    </p>
                  )}
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      course={courses.find((c) => c.id === task.courseId)}
                      selected={selected.has(task.id)}
                      focused={cursor === task.id}
                      {...timerRowProps(task)}
                      hideCourse={Boolean(courseFilter) || grouping === 'course'}
                      hideDue={grouping === 'due' && group.addDue !== undefined && group.addDue !== ''}
                      ground="page"
                      onToggle={toggleTask}
                      onStartTimer={(t, el) => {
                        const course = courses.find((c) => c.id === t.courseId);
                        if (course) setStartTarget({ task: t, course, anchor: el });
                      }}
                      onOpen={setViewingTask}
                      onSelect={toggleSelected}
                      onReschedule={snoozeTask}
                      onOpenEnded={openEndTask}
                      onDelete={(t) => deleteTask(t.id)}
                    />
                  ))}
                  {addingFor && addingAt === group.key ? (
                    <div className="mt-2">{renderDraft(addingFor)}</div>
                  ) : (
                    group.addDue !== undefined && (
                      /* Written straight into the band: the date, or the
                         course, is already filled in from where it was asked. */
                      <button
                        type="button"
                        onClick={() =>
                          openDraft(
                            group.course?.id ?? courseFilter ?? courses[0].id,
                            group.addDue ?? '',
                            group.key,
                          )
                        }
                        className="flex h-10 w-full items-center gap-3 bg-transparent pl-[11px] text-left font-serif text-[13.5px] italic text-muted-soft transition-opacity hover:text-ink focus-visible:opacity-100 md:opacity-0 md:group-hover/band:opacity-100"
                      >
                        <span
                          aria-hidden
                          className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border border-dashed border-line-strong not-italic"
                        >
                          +
                        </span>
                        {group.course
                          ? `add to ${group.course.code}`
                          : group.key === 'today'
                            ? 'add something for today'
                            : group.key === 'someday'
                              ? 'add without a date'
                              : `add for ${group.label === 'Tomorrow' ? 'tomorrow' : group.label}`}
                      </button>
                    )
                  )}
                </div>
              </section>
          ))}
        </div>
      )}

      {/* Every one of these is bound. The line used to offer X and undo with
          nothing behind either, which is a worse lie than saying nothing. */}
      <p className="key-hint mt-4 px-1 font-mono text-[11px] text-muted-soft">
        ↑↓ move · X select · Enter open · N new · S sort · ⌘Z undo
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEditTask();
                }}
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
              <DatePicker
                value={editDue}
                onChange={setEditDue}
                placeholder="Due date"
                clearLabel="Open ended"
              />
            </div>

            {/* What this row actually is. A reading carries pages, anything
                graded carries a weight, a plain task carries neither — and
                plain is the default, so nothing already written down changes
                meaning by this existing. */}
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex h-11 flex-1 items-center rounded-[10px] border border-line bg-paper p-1">
                {KINDS.map((kind) => (
                  <button
                    key={kind.v}
                    type="button"
                    onClick={() => setEditKind(kind.v)}
                    aria-pressed={editKind === kind.v}
                    className={`h-9 flex-1 rounded-[7px] text-[13px] transition-colors ${
                      editKind === kind.v
                        ? 'bg-bg-tint font-medium text-ink'
                        : 'bg-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {kind.l}
                  </button>
                ))}
              </div>

              {editKind === 'reading' && (
                <label className="flex h-11 w-[92px] shrink-0 items-center gap-1 rounded-[10px] border border-line bg-paper px-3">
                  <input
                    value={editPages}
                    onChange={(e) => setEditPages(e.target.value.replace(/[^\d]/g, ''))}
                    inputMode="numeric"
                    placeholder="—"
                    aria-label="Pages"
                    className="w-full min-w-0 border-0 bg-transparent p-0 text-right font-mono text-[14px] text-ink outline-none placeholder:text-muted-soft"
                  />
                  <span aria-hidden className="font-mono text-[11px] text-muted">pp</span>
                </label>
              )}

              <label className="flex h-11 w-[80px] shrink-0 items-center gap-1 rounded-[10px] border border-line bg-paper px-3">
                <input
                  value={editWeight}
                  onChange={(e) => setEditWeight(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  placeholder="—"
                  aria-label="Worth, as a percentage of the course grade"
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-right font-mono text-[14px] text-ink outline-none placeholder:text-muted-soft"
                />
                <span aria-hidden className="font-mono text-[11px] text-muted">%</span>
              </label>
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
        const today = isoDate();
        // Null until the recall rows have been read, and then nothing about
        // recall is offered: keeping against a list that never arrived would
        // be keeping blind. See useRecall.
        const standing = recall ? recallOfTask(recall, viewingTask.id) : null;
        const inRecall = standing?.kept ?? null;
        const keptSteps = new Map(
          (recall?.states ?? [])
            .filter((state) => state.source === 'step' && state.task?.id === viewingTask.id)
            .map((state) => [state.subtaskId, state]),
        );
        const unkeptTicked = recall
          ? subtasks.filter((item) => item.completed && !keptSteps.has(item.id))
          : [];

        /** A list of concepts ticked "can do it fresh" is exactly what recall checks. */
        async function keepSteps(task: Task) {
          if (keeping) return;
          setKeeping(true);
          try {
            const kept = await keepTickedSteps(
              task,
              new Set([...keptSteps.keys()].map((id) => `step:${task.id}:${id}`)),
            );
            notify(
              `${kept} ${kept === 1 ? 'step' : 'steps'} kept. Each comes up to be done fresh from tomorrow, and one that has gone gets unticked.`,
            );
          } catch (error) {
            console.error('Failed to keep the steps:', error);
            notify(error instanceof Error ? error.message : 'Those steps were not kept.');
          } finally {
            setKeeping(false);
          }
        }

        /* The clipboard write has to happen in the click's own task or Safari
           treats it as untrusted, so nothing is awaited before it. */
        async function copyBeforeReading(task: Task) {
          try {
            await navigator.clipboard.writeText(
              beforeReadingPrompt({
                courseId: task.courseId,
                courseCode: course?.code ?? 'this course',
                courseName: course?.name ?? '',
                title: readingPrompt(task.title),
                detail: task.description || undefined,
              }),
            );
            notify('Copied. Paste it into a chat with the Akada connector on before you start reading.');
          } catch (error) {
            console.error('Failed to copy the reading prompt:', error);
            notify('Akada could not reach the clipboard.');
          }
        }

        async function keepWhole(task: Task, letGo: RecallItem | null) {
          if (keeping) return;
          setKeeping(true);
          try {
            await keepTask(task, letGo);
          } catch (error) {
            console.error('Failed to keep the task:', error);
            notify(error instanceof Error ? error.message : 'That was not kept.');
          } finally {
            setKeeping(false);
          }
        }

        /** One step, whether it is sitting in a plain list or being carried. */
        const renderSubtask = (subtask: NonNullable<Task['subtasks']>[number]) => (
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
              {subtask.completed && <HandCheck size={11} color="var(--ink)" strokeWidth={1.6} />}
            </span>
            <span className="min-w-0 flex-1 text-[14px] leading-[1.45] text-ink">
              {subtask.title}
            </span>
            {/* In recall: the last answer's mark, or the loop until it has
                been asked. In the margin where the grip is not. */}
            {keptSteps.has(subtask.id) && (
              <span className="mt-[3px] shrink-0 opacity-70" title="Kept for recall">
                {keptSteps.get(subtask.id)?.last ? (
                  <VerdictMark
                    verdict={keptSteps.get(subtask.id)!.last!.verdict}
                    size={14}
                    color={course?.color ?? 'var(--ink-soft)'}
                  />
                ) : (
                  <RecallGlyph size={14} color={course?.color ?? 'var(--ink-soft)'} />
                )}
              </span>
            )}
          </button>
        );

        return (
          <div className="fixed inset-0 z-[75] flex items-end animate-fade-in">
            <button
              type="button"
              aria-label="Close task details"
              onClick={() => setViewingTask(null)}
              className="absolute inset-0 scrim backdrop-blur-sm"
            />
            <section className="relative max-h-[92vh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-bg px-6 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-slide-up md:mx-auto md:max-w-xl">
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

              {/* The strip always draws now: every task says what it is due
                  for, and a task with no date says that. */}
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
                    {viewingTask.dueDate ? (
                      <DueDateBadge dueDate={viewingTask.dueDate} size="md" />
                    ) : (
                      /* No date is a state the task is in, not a blank. */
                      <span className="font-serif text-[13px] italic text-muted">
                        open ended
                      </span>
                    )}
                  </>
                )}
                {/* What it is and what it is worth, in the margin the way a
                    mark would be, rather than as a row of chips. */}
                {viewingTask.kind && viewingTask.kind !== 'task' && (
                  <span className="eyebrow text-muted">
                    {viewingTask.kind}
                    {viewingTask.kind === 'reading' && viewingTask.pages
                      ? ` · ${viewingTask.pages}pp`
                      : ''}
                  </span>
                )}
                {(viewingTask.weight ?? 0) > 0 && (
                  <span className="font-mono text-[11px] text-muted">
                    worth {Math.round(viewingTask.weight as number)}% of {course?.code ?? 'the course'}
                  </span>
                )}
              </div>

              {/* A reading not read yet can be gone into with questions, the
                  ones it answers, which then come back in recall. */}
              {!viewingTask.completed && looksLikeReading(viewingTask) && (
                <button
                  type="button"
                  onClick={() => copyBeforeReading(viewingTask)}
                  title="Copy a prompt that has Claude ask you three questions this reading answers, and keep them for recall"
                  className="hand-underline mt-3 bg-transparent px-0.5 font-serif text-[13px] text-ink"
                >
                  Questions before you read
                </button>
              )}

              {/* The note this task is studied from, and the way back in. */}
              <TaskNoteLine taskId={viewingTask.id} />

              {/* Where a finished task stands in recall, in one line; or, for
                  one that is not in it, the word that keeps it. An open task
                  is still being done and is not asked about yet. */}
              {viewingTask.completed &&
                recall &&
                (inRecall ? (
                  <p className="m-0 mt-3 flex flex-wrap items-center gap-x-2 font-serif text-[13px] italic text-muted">
                    <RecallGlyph size={13} color={course?.color ?? 'var(--muted)'} />
                    <span>
                      in recall ·{' '}
                      {inRecall.last
                        ? `${inRecall.last.verdict} ${daysAgoWords(inRecall.last.on, today)}`
                        : 'not asked yet'}
                      {' · '}
                      {inRecall.due ? 'due now' : `next ${whenWords(inRecall.dueOn, today)}`}
                    </span>
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={keeping}
                    onClick={() => keepWhole(viewingTask, standing?.letGo ?? null)}
                    className="hand-underline mt-3 bg-transparent px-0.5 font-serif text-[13px] text-ink disabled:opacity-40"
                  >
                    {standing?.letGo ? 'Bring this back into recall' : 'Keep this for recall'}
                  </button>
                ))}

              {viewingTask.description && (
                <p className="mb-0 mt-5 whitespace-pre-wrap font-serif text-[15px] leading-[1.7] text-ink-soft">
                  {viewingTask.description}
                </p>
              )}

              <div className="mt-8">
                <div className="flex items-baseline gap-2 border-b border-line pb-2">
                  <p className="eyebrow m-0">Subtasks</p>
                  {/* Ticked steps on a list of concepts are claims to be able
                      to do each one fresh; keeping them is how the claim gets
                      checked. Offered only while there are ticked steps not
                      yet kept. */}
                  {unkeptTicked.length > 0 && (
                    <button
                      type="button"
                      disabled={keeping}
                      onClick={() => keepSteps(viewingTask)}
                      className="hand-underline ml-2 bg-transparent px-0.5 font-serif text-[12.5px] italic text-ink-soft disabled:opacity-40"
                    >
                      keep {unkeptTicked.length} ticked for recall
                    </button>
                  )}
                  {subtasks.length > 0 && (
                    <span className="tnum ml-auto font-mono text-[11px] text-muted">
                      {done}/{subtasks.length}
                    </span>
                  )}
                </div>

                {/* The steps read in the order they are meant to be done, so
                    the order is worth being able to change. The grip is out
                    in the margin rather than on the row, because the row
                    itself already ticks the step off; with one step there is
                    no order to change and it does not draw at all. */}
                {subtasks.length > 1 ? (
                  <ReorderList
                    items={subtasks}
                    getId={(subtask) => subtask.id}
                    getLabel={(subtask) => subtask.title}
                    label="Subtasks, in the order you arranged them"
                    shape="row"
                    carry="grip"
                    className=""
                    onReorder={(orderedIds) => reorderSubtasks(viewingTask, orderedIds)}
                    renderItem={(subtask) => renderSubtask(subtask)}
                  />
                ) : (
                  subtasks.map((subtask) => renderSubtask(subtask))
                )}

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
                  { k: '↑ ↓', l: 'Move down the list' },
                  { k: 'X', l: 'Select the row you are on' },
                  { k: 'Enter', l: 'Open it, or save what you are typing' },
                  { k: 'N', l: 'New task' },
                  { k: 'S', l: 'Change order' },
                  // The clock's two keys, listed only while a sitting is
                  // actually running, because that is the only time they do
                  // anything. A help sheet naming a dead key is the lie this
                  // sheet was rewritten to stop telling.
                  ...(active
                    ? [
                        { k: 'P', l: 'Hold the running clock, or let it go' },
                        { k: 'K', l: 'Finish the sitting and log it' },
                      ]
                    : []),
                  { k: '⌘Z', l: 'Undo the last bulk change' },
                  { k: 'Esc', l: 'Close the sheet' },
                ] as { k: string; l: string }[]
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

/** An empty numeric field means "not set", which is not the same as zero. */
function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
