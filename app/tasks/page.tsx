'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import DatePicker from '@/components/DatePicker';
import TaskItem from '@/components/TaskItem';
import { db } from '@/lib/data';
import type { Course, Task } from '@/lib/data';
import { isoDate } from '@/lib/utils';
import { cleanTaskTitle } from '@/lib/planner-safety';
import { useTimer } from '@/lib/timer-context';

type Filter = 'all' | 'today' | 'overdue';

export default function TasksPage() {
  const router = useRouter();
  const { active, start } = useTimer();

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Inline add per course
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [draftHigh, setDraftHigh] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCourseId, setEditCourseId] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editHigh, setEditHigh] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const onboarded = await db.isOnboardingComplete();
        if (!onboarded) {
          router.replace('/onboarding');
          return;
        }
        await refresh();
        setLoading(false);
      } catch {
        router.replace('/auth');
      }
    })();
  }, [router]);

  async function refresh() {
    const [c, t] = await Promise.all([db.getCourses(), db.getTasks()]);
    setCourses(c);
    setTasks(t);
  }

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
      await db.updateTask(id, {
        completed: !t.completed,
        completedAt: !t.completed ? new Date().toISOString() : null,
      });
      refresh();
    } catch (error) {
      console.error('Failed to update task:', error);
      alert('Could not update that task.');
    }
  }

  async function deleteTask(id: string) {
    try {
      await db.deleteTask(id);
      refresh();
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Could not delete that task.');
    }
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditCourseId(task.courseId);
    setEditDue(task.dueDate || '');
    setEditHigh(task.priority === 'high');
  }

  async function saveEditTask() {
    const title = cleanTaskTitle(editTitle);
    if (!editingTask || !title || !editCourseId) return;
    try {
      await db.updateTask(editingTask.id, {
        title,
        courseId: editCourseId,
        dueDate: editDue || null,
        priority: editHigh ? 'high' : 'normal',
      });
      setEditingTask(null);
      refresh();
    } catch (error) {
      console.error('Failed to save task:', error);
      alert('Could not save that task.');
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
    try {
      await db.addTask({
        courseId,
        title,
        dueDate: draftDue || null,
        priority: draftHigh ? 'high' : 'normal',
      });
      setDraftTitle('');
      setDraftDue('');
      setDraftHigh(false);
      setAddingFor(null);
      refresh();
    } catch (error) {
      console.error('Failed to add task:', error);
      alert('Could not add that task.');
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="animate-pulse opacity-40">
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
      <header className="mb-[18px]">
        <p className="m-0 text-[11px] tracking-[0.18em] uppercase text-muted font-semibold">
          To do
        </p>
        <h1 className="mt-1.5 mb-0 font-serif font-medium text-[32px] tracking-[-0.02em] leading-[1.1]">
          Tasks
        </h1>
      </header>

      {/* Filter pills */}
      <div className="flex gap-1.5 mb-[22px]">
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
            onClick={() => setFilter(f.v)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === f.v
                ? 'bg-ink text-bg border-ink'
                : 'bg-transparent text-ink-soft border-line'
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {/* Sections */}
      {courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          text="Add courses during setup or from Settings before creating tasks."
        />
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'No tasks yet' : `No ${filter} tasks`}
          text={
            filter === 'all'
              ? 'Add a task under a course and it will show up here.'
              : 'Nothing matches this filter right now.'
          }
        />
      ) : (
        <div className="flex flex-col gap-[22px]">
          {courses.map((course) => {
          const list = visibleTasks
            .filter((t) => t.courseId === course.id)
            .sort((a, b) => {
              if (a.completed !== b.completed) return a.completed ? 1 : -1;
              if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
              return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
            });
          if (filter !== 'all' && list.length === 0) return null;

          const isCol = collapsed[course.id];
          const open = list.filter((t) => !t.completed).length;

          return (
            <section key={course.id}>
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
                  className="text-[10px] font-semibold tracking-[0.16em] uppercase"
                  style={{ color: course.color }}
                >
                  {course.code}
                </span>
                <span className="font-serif font-medium text-[17px] text-ink tracking-[-0.01em]">
                  {course.name}
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
                            className="px-2.5 py-1 rounded-full text-[10px] font-medium tracking-[0.04em] uppercase"
                            style={{
                              background: draftHigh ? '#F4DCD2' : 'var(--bg-tint)',
                              color: draftHigh ? '#A85C42' : 'var(--muted)',
                            }}
                          >
                            {draftHigh ? '● High' : 'Normal'}
                          </button>
                          <button
                            type="button"
                            onClick={() => commitDraft(course.id)}
                            className="ml-auto px-3 py-1.5 rounded-full bg-ink text-bg text-[11px] font-medium"
                          >
                            Add
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
                        className="w-full text-left px-1 py-3 text-[13px] text-muted-soft font-serif italic"
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
            className="absolute inset-0 bg-ink/35 backdrop-blur-sm"
          />
          <div className="relative w-full bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
            <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />
            <h3 className="mt-0 mb-1.5 font-serif font-medium text-[22px] tracking-[-0.01em]">
              Edit task
            </h3>
            <p className="mt-0 mb-4 text-[13px] text-muted font-serif italic">
              Keep the assignment details current.
            </p>

            <input
              autoFocus
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Task title"
              className="w-full bg-paper border border-line rounded-[10px] px-4 py-3 text-sm text-ink outline-none focus:border-line-strong"
            />

            <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
              <select
                value={editCourseId}
                onChange={(e) => setEditCourseId(e.target.value)}
                className="min-w-0 bg-bg-tint border border-line rounded-lg px-3 py-2.5 text-xs text-ink-soft outline-none"
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setEditHigh((v) => !v)}
                className="px-3 py-2 rounded-full text-[10px] font-medium tracking-[0.04em] uppercase"
                style={{
                  background: editHigh ? '#F4DCD2' : 'var(--bg-tint)',
                  color: editHigh ? '#A85C42' : 'var(--muted)',
                }}
              >
                {editHigh ? 'High' : 'Normal'}
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
                disabled={!editTitle.trim() || !editCourseId}
                onClick={saveEditTask}
                className="flex-1 py-3.5 rounded-[10px] bg-ink text-bg text-sm font-medium disabled:opacity-30"
              >
                Save task
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function EmptyState({ title }: { title: string; text: string }) {
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
