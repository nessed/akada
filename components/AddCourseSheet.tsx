'use client';

import { useEffect, useState } from 'react';
import Sheet, { SheetActions, SheetField } from './Sheet';
import CourseSearchInput from './CourseSearchInput';
import WeeklyGoalSlider from './WeeklyGoalSlider';
import { useNotice } from './Notice';
import { CourseSpine } from './notebook/Marks';
import type { Course } from '@/lib/data';
import type { CatalogCourse } from '@/lib/catalog';
import { deriveCourseCode, parseCourseInput } from '@/lib/catalog';
import { PASTEL_PALETTE } from '@/lib/utils';
import { addCourseOptimistic } from '@/lib/data-hooks';
import {
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
  MEETING_TIME_MAX,
} from '@/lib/planner-safety';

/**
 * The one add-course flow in the app.
 *
 * It was written inline on the dashboard, which is also the only screen that
 * could open it — so Settings' course editor had to bounce the reader back to
 * /dashboard?add=course to reach it. It is a component now, and both screens
 * mount it directly.
 */
export default function AddCourseSheet({
  open,
  onClose,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  courses: Course[];
}) {
  const { notify } = useNotice();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<CatalogCourse | null>(null);
  const [section, setSection] = useState('');
  const [manualName, setManualName] = useState('');
  const [color, setColor] = useState(PASTEL_PALETTE[0].value);
  const [tint, setTint] = useState(PASTEL_PALETTE[0].tint);
  const [goal, setGoal] = useState(8);
  const [saving, setSaving] = useState(false);

  // Each opening starts clean, on the next pastel nobody is using. Picking
  // from the palette in order would give every course on an empty list the
  // same colour, which is the one thing a course's colour cannot be.
  useEffect(() => {
    if (!open) return;
    const used = new Set(courses.map((c) => c.color));
    const next =
      PASTEL_PALETTE.find((p) => !used.has(p.value)) ||
      PASTEL_PALETTE[courses.length % PASTEL_PALETTE.length];
    setQuery('');
    setPicked(null);
    setSection('');
    setManualName('');
    setColor(next.value);
    setTint(next.tint);
    setGoal(8);
  }, [open, courses]);

  /** Keeps a derived code from colliding with one already on the list. */
  function uniqueCode(base: string) {
    if (!base) return '';
    const taken = new Set(courses.map((course) => cleanCourseCode(course.code)));
    if (!taken.has(base)) return base;
    let suffix = 2;
    while (taken.has(`${base} ${suffix}`)) suffix += 1;
    return `${base} ${suffix}`;
  }

  /**
   * A catalog pick supplies code/title/credits directly, and the chosen
   * section fills in its instructor and meeting time; anything else is read
   * out of whatever was typed, so submitting without touching the suggestions
   * still creates a normal manual course.
   */
  function resolve() {
    if (picked) {
      const chosen = picked.sections?.find((sec) => sec.id === section);
      const withRoom = [chosen?.meets, chosen?.room].filter(Boolean).join(' · ');
      return {
        code: cleanCourseCode(picked.code),
        name: cleanCourseName(picked.title),
        credits: picked.credits ?? 4,
        section: section || null,
        instructor: chosen?.instructor ?? null,
        // The room earns its place only when it does not push the line past
        // what the field holds; the time is the half that must survive.
        meetingTime: (withRoom.length <= MEETING_TIME_MAX ? withRoom : chosen?.meets) || null,
      };
    }
    const parsed = parseCourseInput(query);
    const name = cleanCourseName(manualName || parsed.name);
    return {
      // Nobody is asked to type a code: one comes off the front of what was
      // typed, or is built from the name.
      code: cleanCourseCode(parsed.code || uniqueCode(deriveCourseCode(name))),
      name,
      credits: 4,
      section: section || null,
      instructor: null,
      meetingTime: null,
    };
  }

  const draft = resolve();
  const canAdd = Boolean(draft.name);
  const detail = [
    draft.section && `Sec ${draft.section}`,
    typeof draft.credits === 'number' && `${draft.credits} cr`,
    draft.instructor,
    draft.meetingTime,
  ]
    .filter(Boolean)
    .join(' · ');

  async function handleAdd() {
    const next = resolve();
    if (!next.code || !next.name || saving) return;
    if (courses.some((course) => cleanCourseCode(course.code) === next.code)) {
      notify(`${next.code} is already on your list.`);
      return;
    }
    setSaving(true);
    try {
      await addCourseOptimistic({
        ...next,
        color,
        tint,
        weeklyGoalHours: clampWeeklyGoalHours(goal),
      });
      onClose();
    } catch (error) {
      console.error('Failed to add course:', error);
      // Surface the real reason, most often a duplicate course code the
      // database rejected, which the reader can act on.
      notify(error instanceof Error ? error.message : 'That course was not added.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !saving && onClose()}
      title="Add a course"
      actions={
        <SheetActions
          onCancel={onClose}
          onConfirm={handleAdd}
          confirmLabel={draft.code ? `Add ${draft.code}` : 'Add course'}
          confirmDisabled={!canAdd}
          busy={saving}
        />
      }
    >
      <div className="flex flex-col gap-[18px]">
        <SheetField label="Course">
          <CourseSearchInput
            autoFocus
            query={query}
            onQueryChange={(v) => {
              setQuery(v);
              // The typed text is the source of truth again, so drop any name
              // that had been filled into the fallback field.
              setManualName('');
            }}
            picked={picked}
            onPick={(course) => {
              setPicked(course);
              setSection('');
              if (course?.credits) setGoal(clampWeeklyGoalHours(course.credits * 2));
            }}
            section={section}
            onSectionChange={setSection}
            accent={color}
            accentTint={tint}
            onSubmit={handleAdd}
          />

          {/* A code alone ("CS 200") is the one thing that leaves nothing to
              name the course by, so that is the only follow-up field. */}
          {!picked && query.trim().length > 0 && !canAdd && (
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Course name"
              className="mt-3 w-full animate-fade-in border-0 border-b-[1.4px] border-line-strong bg-transparent px-0.5 pb-2 font-serif text-[16px] italic text-ink focus:border-ink"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
          )}
        </SheetField>

        <SheetField label="Colour">
          <div className="flex flex-wrap gap-2.5">
            {PASTEL_PALETTE.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-label={p.name}
                aria-pressed={color === p.value}
                onClick={() => {
                  setColor(p.value);
                  setTint(p.tint);
                }}
                className="h-8 w-8 rounded-full border-0"
                style={{
                  background: p.value,
                  // A chosen colour is ringed in ink rather than enlarged or
                  // ticked: the swatch is the only thing here worth looking at.
                  boxShadow:
                    color === p.value ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--ink)' : 'none',
                }}
              />
            ))}
          </div>
        </SheetField>

        <SheetField label="Hours a week">
          <WeeklyGoalSlider
            value={goal}
            onChange={setGoal}
            credits={draft.credits}
            label="Weekly study goal for this course"
          />
        </SheetField>

        {/* The same row the course is about to become, so the colour, the
            code and whatever the catalog filled in are seen rather than
            described. */}
        {canAdd && (
          <div className="flex animate-fade-in items-center gap-3 border-t border-line pt-4">
            <CourseSpine color={color} height={26} />
            <span className="min-w-0 flex-1">
              <span className="eyebrow block" style={{ color }}>
                {draft.code}
              </span>
              <span className="block font-serif text-[15px] text-ink">{draft.name}</span>
              {detail && (
                <span className="mt-0.5 block font-serif text-[11.5px] italic text-muted">
                  {detail}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </Sheet>
  );
}
