'use client';

import { useMemo, useState } from 'react';
import type { Assessment, Course } from '@/lib/data';
import { deleteCourseOptimistic, updateCourseOptimistic } from '@/lib/data-hooks';
import { PASTEL_PALETTE } from '@/lib/utils';
import { gradeStanding } from '@/lib/derive';
import {
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
  hasDuplicateCourseCodes,
} from '@/lib/planner-safety';
import { useTimer } from '@/lib/timer-context';
import { useNotice } from '@/components/Notice';
import WeeklyGoalSlider from '@/components/WeeklyGoalSlider';
import ConfirmSheet from '@/components/ConfirmSheet';
import { RULED_FIELD } from '@/components/Sheet';
import { CourseSpine, Eyebrow, TextButton } from '@/components/notebook/Marks';

/**
 * Courses, edited in place — and how each one is marked.
 *
 * The weighting is the new half. Entering it once is what lets every deadline
 * carry its own percentage, what makes "72% of your grade is still unmarked"
 * something the Term screen can say, and what the course page's grade panel
 * reads from. It is deliberately a plain list of label / weight / score
 * rather than a grading calculator: the app is recording what the syllabus
 * already said, not modelling it.
 *
 * Adding a course is not here. There is one add-course flow and it is the
 * catalog-backed sheet, which this view opens rather than keeping a second,
 * blinder version of.
 */
export default function CoursesEditor({
  courses,
  onAddCourse,
}: {
  courses: Course[];
  onAddCourse: () => void;
}) {
  const { notify } = useNotice();
  const { active } = useTimer();
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const [busy, setBusy] = useState(false);

  async function removeCourse() {
    if (!deleting || busy) return;
    if (active?.courseId === deleting.id) {
      notify('Stop or discard the running timer before deleting this course.');
      setDeleting(null);
      return;
    }
    setBusy(true);
    try {
      await deleteCourseOptimistic(deleting.id);
      setDeleting(null);
    } catch (error) {
      console.error('Failed to delete course:', error);
      notify(error instanceof Error ? error.message : 'That course was not deleted.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="m-0 font-serif text-[30px] font-normal leading-none tracking-[-0.03em] md:text-[38px]">
        Courses
      </h1>
      <p className="mt-3 max-w-[52ch] font-serif text-[15.5px] leading-[1.6] text-ink-soft">
        What you are taking, what you want to give each one, and how each is marked.
      </p>

      <div className="rule-ink mt-7 pt-2">
        {courses.length === 0 ? (
          <p className="py-5 font-serif text-[15px] italic text-muted">
            Nothing on the list yet.
          </p>
        ) : (
          courses.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              courses={courses}
              open={openId === course.id}
              onToggle={() => setOpenId(openId === course.id ? null : course.id)}
              onDelete={() => setDeleting(course)}
            />
          ))
        )}
      </div>

      <TextButton className="mt-5" onClick={onAddCourse}>
        add a course
      </TextButton>

      <ConfirmSheet
        open={Boolean(deleting)}
        title={`Delete ${deleting?.code ?? 'this course'}?`}
        body="Its tasks and its logged sessions go with it. This cannot be undone."
        confirmLabel="Delete it"
        requirePhrase={deleting?.code}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={removeCourse}
      />
    </div>
  );
}

function CourseRow({
  course,
  courses,
  open,
  onToggle,
  onDelete,
}: {
  course: Course;
  courses: Course[];
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { notify } = useNotice();
  const [code, setCode] = useState(course.code);
  const [name, setName] = useState(course.name);
  const [color, setColor] = useState(course.color);
  const [goal, setGoal] = useState(clampWeeklyGoalHours(course.weeklyGoalHours));
  const [rows, setRows] = useState<Assessment[]>(course.assessments ?? []);
  const [saving, setSaving] = useState(false);

  const standing = useMemo(() => gradeStanding({ ...course, assessments: rows }), [course, rows]);
  const totalWeight = rows.reduce((acc, r) => acc + r.weight, 0);

  const dirty =
    code !== course.code ||
    name !== course.name ||
    color !== course.color ||
    goal !== clampWeeklyGoalHours(course.weeklyGoalHours) ||
    JSON.stringify(rows) !== JSON.stringify(course.assessments ?? []);

  async function save() {
    const nextCode = cleanCourseCode(code);
    const nextName = cleanCourseName(name);
    if (!nextCode || !nextName) {
      notify('A course needs both a code and a name.');
      return;
    }
    if (hasDuplicateCourseCodes([
      ...courses.filter((c) => c.id !== course.id),
      { code: nextCode },
    ])) {
      notify(`${nextCode} is already on your list.`);
      return;
    }
    setSaving(true);
    try {
      await updateCourseOptimistic(course.id, {
        code: nextCode,
        name: nextName,
        color,
        tint: PASTEL_PALETTE.find((p) => p.value === color)?.tint ?? course.tint,
        weeklyGoalHours: clampWeeklyGoalHours(goal),
        assessments: rows.filter((r) => r.label.trim() && r.weight > 0),
      });
      onToggle();
    } catch (error) {
      console.error('Failed to update course:', error);
      notify(error instanceof Error ? error.message : 'That course did not save.');
    } finally {
      setSaving(false);
    }
  }

  function patchRow(id: string, patch: Partial<Assessment>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="row-rule py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-transparent text-left"
      >
        <CourseSpine color={course.color} height={26} />
        <span className="min-w-0 flex-1">
          <span
            className="block text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: course.color }}
          >
            {course.code}
          </span>
          <span className="block truncate font-serif text-[15px]">{course.name}</span>
        </span>
        <span className="flex-none font-mono text-[11px] text-muted">
          {course.weeklyGoalHours}h/wk
          {(course.assessments?.length ?? 0) > 0 && ` · ${Math.round(gradeStanding(course).marked)}% marked`}
        </span>
      </button>

      {open && (
        <div className="mt-5 animate-fade-in pl-6">
          <div className="flex flex-col gap-5 md:flex-row">
            <label className="block w-full md:w-[110px]">
              <span className="eyebrow mb-1.5 block">Code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={`${RULED_FIELD} font-mono`}
              />
            </label>
            <label className="block min-w-0 flex-1">
              <span className="eyebrow mb-1.5 block">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${RULED_FIELD} font-serif`}
              />
            </label>
          </div>

          <div className="mt-5">
            <span className="eyebrow mb-2 block">Colour</span>
            <div className="flex flex-wrap gap-2.5">
              {PASTEL_PALETTE.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-label={p.name}
                  aria-pressed={color === p.value}
                  onClick={() => setColor(p.value)}
                  className="h-7 w-7 rounded-full border-0"
                  style={{
                    background: p.value,
                    boxShadow:
                      color === p.value ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--ink)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span className="eyebrow mb-2 block">Hours a week</span>
            <WeeklyGoalSlider
              value={goal}
              onChange={setGoal}
              credits={course.credits ?? 4}
              label={`Weekly study goal for ${course.code}`}
            />
          </div>

          {/* How the course is marked. */}
          <div className="mt-7 border-t border-line pt-4">
            <div className="flex items-baseline justify-between">
              <Eyebrow>How it is marked</Eyebrow>
              <span
                className="font-mono text-[11px]"
                style={{ color: totalWeight > 100 ? 'var(--priority)' : 'var(--muted)' }}
              >
                {Math.round(totalWeight)}% of 100
              </span>
            </div>

            {rows.map((row) => (
              <div key={row.id} className="row-rule flex items-baseline gap-3 py-2.5">
                <input
                  value={row.label}
                  onChange={(e) => patchRow(row.id, { label: e.target.value })}
                  placeholder="Midterm"
                  className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink placeholder:text-muted"
                />
                <input
                  value={row.weight || ''}
                  onChange={(e) =>
                    patchRow(row.id, { weight: clampPercent(e.target.value) })
                  }
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={`${row.label || 'This piece'} is worth, as a percentage`}
                  className="w-[54px] border-0 bg-transparent text-right font-mono text-[16px] text-muted"
                />
                <span className="font-mono text-[12px] text-muted">%</span>
                <input
                  value={row.score ?? ''}
                  onChange={(e) =>
                    patchRow(row.id, {
                      score: e.target.value === '' ? null : Number(e.target.value) || 0,
                      outOf: row.outOf ?? 100,
                    })
                  }
                  inputMode="decimal"
                  placeholder="—"
                  aria-label={`${row.label || 'This piece'}, what you scored`}
                  className="w-[52px] border-0 bg-transparent text-right font-mono text-[16px] font-bold text-ink placeholder:font-normal placeholder:text-muted"
                />
                <span className="font-mono text-[11px] text-muted">/</span>
                <input
                  value={row.outOf ?? ''}
                  onChange={(e) =>
                    patchRow(row.id, { outOf: e.target.value === '' ? null : Number(e.target.value) || null })
                  }
                  inputMode="decimal"
                  placeholder="100"
                  aria-label={`${row.label || 'This piece'}, out of`}
                  className="w-[50px] border-0 bg-transparent font-mono text-[16px] text-muted"
                />
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                  aria-label={`Remove ${row.label || 'this piece'}`}
                  className="flex-none bg-transparent font-mono text-[13px] text-muted hover:text-priority"
                >
                  ×
                </button>
              </div>
            ))}

            <TextButton
              tone="quiet"
              className="mt-2.5"
              onClick={() =>
                setRows([
                  ...rows,
                  {
                    id: `a-${Date.now().toString(36)}`,
                    label: '',
                    weight: 0,
                    score: null,
                    outOf: 100,
                  },
                ])
              }
            >
              + another piece…
            </TextButton>

            {standing.percent !== null && (
              <p className="mt-3 font-serif text-[13.5px] italic text-muted">
                {Math.round(standing.marked)}% marked so far, and you are at {standing.percent}% of
                it.
              </p>
            )}
            {totalWeight > 100 && (
              <p className="mt-2 font-serif text-[13.5px] italic text-priority">
                That comes to more than 100%.
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center gap-5">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="min-h-[44px] bg-primary px-6 text-sm font-medium text-primary-contrast disabled:opacity-30"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="bg-transparent font-serif text-[13.5px] italic text-priority"
            >
              delete this course
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function clampPercent(value: string): number {
  const n = Number(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
