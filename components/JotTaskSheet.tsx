'use client';

import { useEffect, useState } from 'react';
import Sheet, { RULED_FIELD, SheetActions, SheetField } from './Sheet';
import { useNotice } from './Notice';
import { CheckedOption, CheckBox, CourseDot, Swipe } from './notebook/Marks';
import type { Course, TaskKind } from '@/lib/data';
import { addTaskOptimistic } from '@/lib/data-hooks';
import { cleanTaskTitle } from '@/lib/planner-safety';
import { isoDate } from '@/lib/utils';

/**
 * Writing something down.
 *
 * One sheet for the whole app — the header's "add a task", the "+ add a
 * task" at the foot of a list, the course page's own add. It also carries
 * the two new kinds: a reading, which takes a page count and joins the
 * backlog, and an exam, which is circled on the month and counted down to.
 *
 * The kind picker is three words with a highlighter swipe under the chosen
 * one, not a segmented control, and the extra field only appears once a kind
 * that needs it is chosen — so the common case stays a title and a date.
 */

const KINDS: { value: TaskKind; label: string }[] = [
  { value: 'task', label: 'a task' },
  { value: 'reading', label: 'a reading' },
  { value: 'exam', label: 'an exam' },
];

const WHEN = [
  { label: 'today', days: 0 },
  { label: 'tomorrow', days: 1 },
  { label: 'this week', days: 4 },
  { label: 'no date', days: -1 },
];

export default function JotTaskSheet({
  open,
  onClose,
  courses,
  defaultCourseId,
}: {
  open: boolean;
  onClose: () => void;
  courses: Course[];
  /** Pre-picks the course, for the sheet opened from a course's own page. */
  defaultCourseId?: string;
}) {
  const { notify } = useNotice();
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [kind, setKind] = useState<TaskKind>('task');
  const [when, setWhen] = useState(0);
  const [pages, setPages] = useState('');
  const [weight, setWeight] = useState('');
  const [high, setHigh] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setCourseId(defaultCourseId || courses[0]?.id || '');
    setKind('task');
    setWhen(0);
    setPages('');
    setWeight('');
    setHigh(false);
  }, [open, defaultCourseId, courses]);

  const clean = cleanTaskTitle(title);
  const canSave = Boolean(clean && courseId);

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await addTaskOptimistic({
        courseId,
        title: clean,
        dueDate: when < 0 ? null : addDays(isoDate(), when),
        priority: high ? 'high' : 'normal',
        kind,
        pages: kind === 'reading' ? numberOr(pages) : null,
        weight: kind === 'exam' || weight ? numberOr(weight) : null,
      });
      onClose();
    } catch (error) {
      console.error('Failed to add task:', error);
      notify('That was not written down.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !saving && onClose()}
      title="Add a task"
      actions={
        <SheetActions
          onCancel={onClose}
          onConfirm={save}
          confirmLabel="Add to the list"
          confirmDisabled={!canSave}
          busy={saving}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
            placeholder="Read Tilly, ch. 4"
            className={RULED_FIELD}
          />
        </div>

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

        {kind === 'reading' && (
          <SheetField label="How many pages">
            <input
              value={pages}
              onChange={(e) => setPages(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="26"
              className={`${RULED_FIELD} font-mono`}
            />
          </SheetField>
        )}

        {(kind === 'exam' || kind === 'task') && (
          <SheetField label="What it is worth, if anything">
            <div className="flex items-baseline gap-2">
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
                inputMode="decimal"
                placeholder="25"
                className={`${RULED_FIELD} font-mono`}
              />
              <span className="font-mono text-sm text-muted">%</span>
            </div>
          </SheetField>
        )}

        <div className="flex flex-wrap items-baseline gap-4">
          <span className="eyebrow">Due</span>
          {WHEN.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setWhen(option.days)}
              aria-pressed={when === option.days}
              className={`bg-transparent font-serif text-[15px] ${
                when === option.days ? 'text-ink' : 'text-muted'
              }`}
            >
              {when === option.days ? <Swipe>{option.label}</Swipe> : option.label}
            </button>
          ))}
        </div>

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
            Mark it as the one that matters
          </span>
        </button>
      </div>
    </Sheet>
  );
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function numberOr(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
