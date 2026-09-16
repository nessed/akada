'use client';

import { useEffect, useState } from 'react';
import Sheet, { RULED_FIELD, SheetActions, SheetField } from './Sheet';
import DatePicker from './DatePicker';
import { useNotice } from './Notice';
import { CheckBox, CheckedOption, CourseDot, Swipe, TextButton } from './notebook/Marks';
import type { Course, Task, TaskKind } from '@/lib/data';
import { deleteTaskOptimistic, updateTaskOptimistic } from '@/lib/data-hooks';
import { cleanTaskTitle } from '@/lib/planner-safety';

/**
 * A line of the list, opened up: what it is, when it is due, what it is
 * worth, and the smaller pieces it breaks into.
 *
 * Editing and reading used to be two separate sheets with two different
 * shapes, so the same task looked like two different objects depending on
 * which one you had opened. It is one sheet now.
 */

const KINDS: { value: TaskKind; label: string }[] = [
  { value: 'task', label: 'a task' },
  { value: 'reading', label: 'a reading' },
  { value: 'exam', label: 'an exam' },
];

export default function EditTaskSheet({
  task,
  courses,
  onClose,
}: {
  task: Task | null;
  courses: Course[];
  onClose: () => void;
}) {
  const { notify } = useNotice();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [due, setDue] = useState('');
  const [high, setHigh] = useState(false);
  const [kind, setKind] = useState<TaskKind>('task');
  const [pages, setPages] = useState('');
  const [weight, setWeight] = useState('');
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setCourseId(task.courseId);
    setDue(task.dueDate || '');
    setHigh(task.priority === 'high');
    setKind(task.kind ?? 'task');
    setPages(task.pages ? String(task.pages) : '');
    setWeight(task.weight ? String(task.weight) : '');
    setSubtaskDraft('');
    setConfirmDelete(false);
  }, [task]);

  if (!task) return null;
  const clean = cleanTaskTitle(title);
  const subtasks = task.subtasks ?? [];

  async function save() {
    if (!task || !clean || !courseId || saving) return;
    setSaving(true);
    try {
      await updateTaskOptimistic(task.id, {
        title: clean,
        description,
        courseId,
        dueDate: due || null,
        priority: high ? 'high' : 'normal',
        kind,
        pages: kind === 'reading' ? numberOr(pages) : null,
        weight: numberOr(weight),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
      notify('Those changes did not save.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSubtasks(next: NonNullable<Task['subtasks']>) {
    if (!task) return;
    try {
      await updateTaskOptimistic(task.id, { subtasks: next });
    } catch {
      notify('That change did not save.');
    }
  }

  async function remove() {
    if (!task) return;
    try {
      await deleteTaskOptimistic(task.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
      notify('That task is still here. It did not delete.');
    }
  }

  return (
    <Sheet
      open
      onClose={() => !saving && onClose()}
      title="This one"
      actions={
        <SheetActions
          onCancel={onClose}
          onConfirm={save}
          confirmLabel="Save it"
          confirmDisabled={!clean || !courseId}
          busy={saving}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={RULED_FIELD} />

        <SheetField label="Anything else about it">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Nothing written down."
            className="ruled-note w-full resize-none border-y border-line bg-transparent py-3 font-serif text-[16px] text-ink"
          />
        </SheetField>

        {/* The smaller pieces. These save as they are ticked rather than on
            the sheet's own save, because ticking one off mid-session is the
            whole point of having them. */}
        <SheetField label="The pieces">
          <div className="flex flex-col">
            {subtasks.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() =>
                  saveSubtasks(
                    subtasks.map((s) => (s.id === sub.id ? { ...s, completed: !s.completed } : s)),
                  )
                }
                className={`row-rule flex items-center gap-3 bg-transparent py-2.5 text-left ${
                  sub.completed ? 'opacity-45' : ''
                }`}
              >
                <CheckBox checked={sub.completed} color="var(--mint)" size={17} />
                <span className="min-w-0 flex-1 text-[13.5px]">{sub.title}</span>
              </button>
            ))}
            <input
              value={subtaskDraft}
              onChange={(e) => setSubtaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const next = cleanTaskTitle(subtaskDraft);
                if (!next) return;
                saveSubtasks([
                  ...subtasks,
                  { id: `s-${Date.now().toString(36)}`, title: next, completed: false },
                ]);
                setSubtaskDraft('');
              }}
              placeholder="+ another piece…"
              className="mt-2 w-full bg-transparent py-1 font-serif text-[16px] italic text-ink placeholder:text-muted"
            />
          </div>
        </SheetField>

        <div className="flex flex-wrap items-baseline gap-4">
          <span className="eyebrow">It is</span>
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              aria-pressed={kind === option.value}
              className={`bg-transparent font-serif text-[15.5px] ${
                kind === option.value ? 'text-ink' : 'text-muted'
              }`}
            >
              {kind === option.value ? <Swipe>{option.label}</Swipe> : option.label}
            </button>
          ))}
        </div>

        <div className="flex gap-6">
          {kind === 'reading' && (
            <SheetField label="Pages">
              <input
                value={pages}
                onChange={(e) => setPages(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                className={`${RULED_FIELD} font-mono`}
              />
            </SheetField>
          )}
          <SheetField label="Worth">
            <div className="flex items-baseline gap-2">
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
                inputMode="decimal"
                placeholder="—"
                className={`${RULED_FIELD} font-mono`}
              />
              <span className="font-mono text-sm text-muted">%</span>
            </div>
          </SheetField>
        </div>

        <SheetField label="Due">
          <DatePicker value={due} onChange={setDue} allowClear />
        </SheetField>

        <SheetField label="Which course">
          <div className="flex flex-col">
            {courses.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => setCourseId(course.id)}
                aria-pressed={courseId === course.id}
                className="row-rule flex items-center gap-3 bg-transparent py-2.5 text-left"
              >
                <CourseDot color={course.color} size={8} />
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: course.color }}
                >
                  {course.code}
                </span>
                <span className="min-w-0 flex-1 truncate font-serif text-[14.5px]">
                  {course.name}
                </span>
                {courseId === course.id && <CheckedOption size={17} />}
              </button>
            ))}
          </div>
        </SheetField>

        <button
          type="button"
          onClick={() => setHigh(!high)}
          aria-pressed={high}
          className="flex items-center gap-3 bg-transparent py-1 text-left"
        >
          <CheckBox checked={high} color="var(--priority)" size={17} tone="soft" />
          <span className={`text-sm ${high ? 'text-ink' : 'text-ink-soft'}`}>
            The one that matters
          </span>
        </button>

        {/* Deleting asks once, in place, rather than opening a second sheet
            on top of this one. */}
        <div className="border-t border-line pt-4">
          {confirmDelete ? (
            <div className="flex items-center justify-between gap-4">
              <span className="font-serif text-[14px] italic text-muted">
                Take it off the list for good?
              </span>
              <span className="flex flex-none gap-4">
                <TextButton tone="quiet" onClick={() => setConfirmDelete(false)}>
                  keep it
                </TextButton>
                <button
                  type="button"
                  onClick={remove}
                  className="ink-underline bg-transparent font-serif text-[14px] text-priority"
                  style={{ borderColor: 'var(--priority)' }}
                >
                  delete it
                </button>
              </span>
            </div>
          ) : (
            <TextButton tone="quiet" onClick={() => setConfirmDelete(true)}>
              delete this
            </TextButton>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function numberOr(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
