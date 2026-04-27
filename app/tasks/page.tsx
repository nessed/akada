'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import DatePicker from '@/components/DatePicker';
import TaskItem from '@/components/TaskItem';
import { db } from '@/lib/data';
import type { Course, Task } from '@/lib/data';
import { isoDate } from '@/lib/utils';
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

  useEffect(() => {
    (async () => {
      const onboarded = await db.isOnboardingComplete();
      if (!onboarded) {
        router.replace('/onboarding');
        return;
      }
      await refresh();
      setLoading(false);
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
    await db.updateTask(id, {
      completed: !t.completed,
      completedAt: !t.completed ? new Date().toISOString() : null,
    });
    refresh();
  }

  async function deleteTask(id: string) {
    await db.deleteTask(id);
    refresh();
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
    if (!draftTitle.trim()) {
      setAddingFor(null);
      return;
    }
    await db.addTask({
      courseId,
      title: draftTitle.trim(),
      dueDate: draftDue || null,
      priority: draftHigh ? 'high' : 'normal',
    });
    setDraftTitle('');
    setDraftDue('');
    setDraftHigh(false);
    setAddingFor(null);
    refresh();
  }

  if (loading) {
    return (
      <PageShell>
        <div className="pt-20 text-center text-muted-soft text-sm font-serif italic">
          Loading…
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
    </PageShell>
  );
}
