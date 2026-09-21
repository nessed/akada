'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Course } from '@/lib/data';
import {
  deleteCourseOptimistic,
  reorderCoursesOptimistic,
  updateCourseOptimistic,
} from '@/lib/data-hooks';
import { PASTEL_PALETTE } from '@/lib/utils';
import {
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
  hasDuplicateCourseCodes,
} from '@/lib/planner-safety';
import { useTimer } from '@/lib/timer-context';
import WeeklyGoalSlider from '@/components/WeeklyGoalSlider';
import { ButtonSpinner } from '@/components/LoadingIndicator';
import BackButton from '@/components/BackButton';
import ReorderList from '@/components/ReorderList';
import HandCheck from '@/components/notebook/HandCheck';
import {
  PANEL_RADIUS,
  FIELD_RADIUS,
  SectionHeading,
  SHEET_ACTION_PRIMARY,
  SHEET_ACTION_QUIET,
  VIEW_PADDING,
} from './SettingsPrimitives';

interface DraftCourse {
  id: string;
  code: string;
  name: string;
  color: string;
  tint: string;
  credits: number;
  weeklyGoalHours: number;
}

/**
 * Courses already on the list, edited in place: the code, the name, the
 * accent and the weekly goal.
 *
 * Adding is deliberately not here. There is one add-course flow in the app,
 * the catalog-backed one on the dashboard, and this view hands the reader to
 * it rather than keeping a second, blinder version of the same thing.
 */
export default function CoursesEditor({
  courses,
  onBack,
  onSaved,
  onAddCourse,
}: {
  courses: Course[];
  onBack: () => void;
  onSaved: () => void;
  /** Leaves settings for the dashboard's add-course sheet. */
  onAddCourse: () => void;
}) {
  const { active, pendingLog } = useTimer();
  const original = useMemo(
    () =>
      courses.map<DraftCourse>((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        color: c.color,
        tint: c.tint || PASTEL_PALETTE[0].tint,
        credits: typeof c.credits === 'number' && c.credits > 0 ? c.credits : 4,
        weeklyGoalHours: clampWeeklyGoalHours(c.weeklyGoalHours),
      })),
    [courses],
  );

  const [drafts, setDrafts] = useState<DraftCourse[]>(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Keep the most recent originals in a ref so save() sees freshly-removed
  // courses (drafts removed via UI need their server-side delete) without
  // recomputing on every keystroke.
  const originalRef = useRef(original);
  useEffect(() => {
    originalRef.current = original;
  }, [original]);

  function update(i: number, patch: Partial<DraftCourse>) {
    setDrafts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    setDrafts((cs) => (cs.length === 1 ? cs : cs.filter((_, idx) => idx !== i)));
  }

  /**
   * The order the panels were dragged into.
   *
   * It is the same order the dashboard's cards carry, and it rides the same
   * Save as every other edit here rather than writing on its own: the whole
   * view is a draft until it is saved, and an order that wrote itself
   * immediately would be the one thing Cancel could not undo.
   */
  function moveDraft(orderedIds: string[]) {
    setDrafts((cs) => {
      const byId = new Map(cs.map((c) => [c.id, c]));
      const placed = orderedIds
        .map((id) => byId.get(id))
        .filter((c): c is DraftCourse => Boolean(c));
      const seen = new Set(orderedIds);
      return [...placed, ...cs.filter((c) => !seen.has(c.id))];
    });
    return Promise.resolve();
  }

  const dirty = useMemo(
    () => JSON.stringify(drafts) !== JSON.stringify(original),
    [drafts, original],
  );

  /** Writes the drafts back. Returns false when something stopped it. */
  async function persist(): Promise<boolean> {
    setSaving(true);
    setError('');
    // Ordering is the one write here that a database on an older schema can
    // refuse. It is said out loud at the end rather than stopping the save,
    // because the renames and colours in the same form did go through.
    let orderFailed = false;
    try {
      const validDrafts = drafts.filter((d) => d.code.trim() && d.name.trim());
      const incompleteDraft = drafts.some((d) => !d.code.trim() || !d.name.trim());
      if (incompleteDraft) {
        setError('Every course needs both a code and a name.');
        return false;
      }
      if (hasDuplicateCourseCodes(validDrafts)) {
        setError('Course codes must be unique.');
        return false;
      }
      const draftIds = new Set(validDrafts.map((d) => d.id).filter(Boolean));
      const removed = originalRef.current.filter((o) => !draftIds.has(o.id));
      const timerCourseId = active?.courseId ?? pendingLog?.courseId ?? null;
      if (timerCourseId && removed.some((course) => course.id === timerCourseId)) {
        setError(
          active
            ? 'Stop or discard the active timer before deleting that course.'
            : 'Save or discard the pending timer log before deleting that course.',
        );
        return false;
      }

      // Delete removed
      for (const o of removed) {
        await deleteCourseOptimistic(o.id);
      }
      // Then the order, before the field edits, so a database too old to
      // carry an order still saves every rename and colour that follows.
      const order = validDrafts.map((d) => d.id);
      const wasOrder = originalRef.current.map((o) => o.id).filter((id) => draftIds.has(id));
      if (order.some((id, i) => wasOrder[i] !== id)) {
        try {
          await reorderCoursesOptimistic(order);
        } catch (err) {
          console.error('Failed to reorder courses:', err);
          orderFailed = true;
        }
      }
      // Update what is left
      for (const d of validDrafts) {
        const payload = {
          code: cleanCourseCode(d.code),
          name: cleanCourseName(d.name),
          color: d.color,
          tint: d.tint,
          credits: d.credits,
          weeklyGoalHours: clampWeeklyGoalHours(d.weeklyGoalHours),
        };
        await updateCourseOptimistic(d.id, payload);
      }
      if (orderFailed) {
        setError('Everything else saved. The order did not.');
        return false;
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save courses';
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (await persist()) onSaved();
  }

  /**
   * Edits in progress are kept before the reader is handed over, so leaving
   * for the add-course sheet never quietly costs them a rename.
   */
  async function addCourse() {
    if (dirty && !(await persist())) return;
    onAddCourse();
  }

  /** One course's panel, whether it is sitting still or being carried. */
  const panel = (c: DraftCourse, i: number) => (
    <div
      className={`relative overflow-hidden border border-line bg-paper px-4 py-4 pl-[18px] ${PANEL_RADIUS}`}
    >
      <span
        className="absolute bottom-0 left-0 top-0 w-1"
        style={{ background: c.color }}
      />
      <div className="flex gap-2.5">
        <input
          value={c.code}
          onChange={(e) => update(i, { code: e.target.value.toUpperCase() })}
          placeholder="CODE"
          aria-label="Course code"
          className="eyebrow w-[84px] border-0 border-b border-line bg-transparent px-0.5 py-1 outline-none"
          style={{ color: c.color }}
        />
        <input
          value={c.name}
          onChange={(e) => update(i, { name: e.target.value })}
          placeholder="Course name"
          aria-label="Course name"
          className="flex-1 border-0 border-b border-line bg-transparent px-0.5 py-1 font-serif text-[15px] font-medium text-ink outline-none"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex flex-1 flex-wrap gap-2">
          {PASTEL_PALETTE.map((p) => {
            const sel = c.color === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => update(i, { color: p.value, tint: p.tint })}
                aria-label={p.name}
                aria-pressed={sel}
                className="flex h-[18px] w-[18px] items-center justify-center rounded-full"
                style={{ background: p.value }}
              >
                {sel && <HandCheck size={11} color="var(--paper)" strokeWidth={2} />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => remove(i)}
          disabled={drafts.length === 1}
          className="font-serif text-[11px] italic text-muted-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          remove
        </button>
      </div>

      <div className="mt-4">
        <span className="eyebrow mb-1.5 block">Goal</span>
        <WeeklyGoalSlider
          value={c.weeklyGoalHours}
          onChange={(weeklyGoalHours) => update(i, { weeklyGoalHours })}
          credits={c.credits}
          label={`Weekly study goal for ${c.code || c.name || `course ${i + 1}`}`}
        />
      </div>
    </div>
  );

  return (
    <div className={`${VIEW_PADDING} app-scroll animate-fade-in`}>
      <BackButton onClick={onBack} />
      <div className="flex items-baseline justify-between">
        <SectionHeading>Courses</SectionHeading>
        <span className="font-serif text-xs italic text-muted">
          {drafts.length} {drafts.length === 1 ? 'course' : 'courses'}
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-[var(--density-gap)]">
        {/* The dashboard's order, set from the list that shows the whole
            term at once. The grip is in the margin because every inch of the
            panel is already a field, and it rides Save with the rest. */}
        {drafts.length > 1 ? (
          <ReorderList
            items={drafts}
            getId={(c) => c.id}
            getLabel={(c) => c.code || c.name || 'This course'}
            label="Courses, in the order you arranged them"
            shape="row"
            carry="grip"
            className="gap-[var(--density-gap)]"
            onReorder={moveDraft}
            renderItem={panel}
          />
        ) : (
          drafts.map((c, i) => <div key={c.id}>{panel(c, i)}</div>)
        )}

        {drafts.length === 0 && (
          <p className="py-6 text-center font-serif text-[13px] italic text-muted-soft">
            Nothing on the list yet.
          </p>
        )}

        {/* The one dashed affordance the guide allows: there is more you
            could add here. It opens the catalog search rather than a second
            pair of blank fields. */}
        <button
          type="button"
          onClick={addCourse}
          disabled={saving}
          className={`border border-dashed border-line-strong bg-transparent py-3 text-[13px] font-medium text-ink-soft disabled:opacity-50 ${FIELD_RADIUS}`}
        >
          + Add a course
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-center font-serif text-[12px] italic text-priority">
          {error}
        </p>
      )}

      <div className="mt-[var(--density-section)] flex gap-2.5">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className={SHEET_ACTION_QUIET}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={SHEET_ACTION_PRIMARY}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <ButtonSpinner />
              Saving
            </span>
          ) : (
            'Save'
          )}
        </button>
      </div>
    </div>
  );
}
