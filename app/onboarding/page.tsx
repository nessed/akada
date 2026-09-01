'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import LoadingIndicator, { ButtonSpinner } from '@/components/LoadingIndicator';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/data';
import { createClient } from '@/lib/supabase';
import { PASTEL_PALETTE } from '@/lib/utils';
import AkadaMark from '@/components/notebook/AkadaMark';
import HandNote from '@/components/notebook/HandNote';
import WeeklyGoalSlider from '@/components/WeeklyGoalSlider';
import { useNotice } from '@/components/Notice';
import {
  addCourseOptimistic,
  createSemesterOptimistic,
  markOnboardingComplete,
  updateUserSettingsOptimistic,
} from '@/lib/data-hooks';
import {
  clampDailyGoalHours,
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
  cleanDisplayName,
  hasDuplicateCourseCodes,
  isIsoDate,
} from '@/lib/planner-safety';
import { isoDate, seasonLabel } from '@/lib/utils';
import { isUploadedImage, resizeAvatar } from '@/lib/avatar';
import HandCheck from '@/components/notebook/HandCheck';
import DatePicker from '@/components/DatePicker';

type Step = 'welcome' | 'name' | 'courses' | 'semester' | 'routine';

const STEPS: Step[] = ['welcome', 'name', 'courses', 'semester', 'routine'];

interface DraftCourse {
  code: string;
  name: string;
  color: string;
  tint: string;
  weeklyGoalHours: number;
}

const emptyDraft = (): DraftCourse => ({
  code: '',
  name: '',
  color: PASTEL_PALETTE[0].value,
  tint: PASTEL_PALETTE[0].tint,
  weeklyGoalHours: 8,
});

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center px-8">
          <LoadingIndicator label="Loading your setup" detail="Getting your planner ready." />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const { notify } = useNotice();
  const searchParams = useSearchParams();
  const newSemesterMode = searchParams.get('newSemester') === '1';
  const setupSteps: Step[] = newSemesterMode ? ['courses', 'routine'] : STEPS;
  const [step, setStep] = useState<Step>(() => (newSemesterMode ? 'courses' : 'welcome'));
  const [displayName, setDisplayName] = useState('');
  const [courses, setCourses] = useState<DraftCourse[]>([emptyDraft()]);
  const [editIdx, setEditIdx] = useState(0);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [dailyGoal, setDailyGoal] = useState(4);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [gate, setGate] = useState<'checking' | 'open'>('checking');

  useEffect(() => {
    let active = true;
    (async () => {
      // The gate is decided on its own. Bundling it with the prefill calls
      // meant any one of them failing (createClient() throws when Supabase
      // is unconfigured) opened setup to an already-onboarded user.
      let onboarded = false;
      try {
        onboarded = await db.isOnboardingComplete();
      } catch {
        onboarded = false;
      }
      if (!active) return;

      // Someone who has already finished setup must not be able to run it
      // again by typing the URL, it would duplicate every course and
      // overwrite their profile.
      if (onboarded && !newSemesterMode) {
        router.replace('/dashboard');
        return;
      }

      // Prefill is best-effort and must never block the form.
      try {
        const [settings, auth] = await Promise.all([
          db.getUserSettings(),
          createClient().auth.getUser(),
        ]);
        if (!active) return;
        const metadataName =
          typeof auth.data.user?.user_metadata?.display_name === 'string'
            ? auth.data.user.user_metadata.display_name
            : '';
        setDisplayName((current) => current || settings?.displayName || metadataName || '');
        setAvatarPreview((current) => current || settings?.avatarUrl || '');
      } catch {
        // Local mode or unauthenticated edge: keep the form empty but usable.
      }

      if (active) setGate('open');
    })();
    return () => {
      active = false;
    };
  }, [newSemesterMode, router]);

  const editing = courses[editIdx];
  function update(patch: Partial<DraftCourse>) {
    setCourses((prev) => prev.map((c, i) => (i === editIdx ? { ...c, ...patch } : c)));
  }

  function addAnother() {
    const used = new Set(courses.map((c) => c.color));
    const next =
      PASTEL_PALETTE.find((p) => !used.has(p.value)) ||
      PASTEL_PALETTE[courses.length % PASTEL_PALETTE.length];
    setCourses((prev) => [
      ...prev,
      { code: '', name: '', color: next.value, tint: next.tint, weeklyGoalHours: 8 },
    ]);
    setEditIdx(courses.length);
  }

  function removeCourse(i: number) {
    if (courses.length === 1) return;
    setCourses((prev) => prev.filter((_, idx) => idx !== i));
    setEditIdx(Math.max(0, editIdx - (i <= editIdx ? 1 : 0)));
  }

  const validCourses = courses
    .map((course) => ({
      ...course,
      code: cleanCourseCode(course.code),
      name: cleanCourseName(course.name),
      weeklyGoalHours: clampWeeklyGoalHours(course.weeklyGoalHours),
    }))
    .filter((course) => course.code && course.name);
  const valid = validCourses.length >= 1 && !hasDuplicateCourseCodes(validCourses);
  const canFinishSemester = isIsoDate(start) && isIsoDate(end) && end >= start;


  async function finish() {
    if (!valid || (!newSemesterMode && !canFinishSemester)) return;
    try {
      let finalAvatar = avatarPreview;
      if (avatarPreview && isUploadedImage(avatarPreview)) {
        finalAvatar = await resizeAvatar(avatarPreview);
      }

      // Use the optimistic helpers so the SWR cache is hot before we navigate
      // to /dashboard, otherwise the dashboard would briefly read a stale
      // "not onboarded" / empty-courses cache and bounce or flash.
      await updateUserSettingsOptimistic(
        newSemesterMode
          ? { dailyGoalHours: clampDailyGoalHours(dailyGoal) }
          : {
              displayName: cleanDisplayName(displayName),
              dailyGoalHours: clampDailyGoalHours(dailyGoal),
              avatarUrl: finalAvatar,
            },
      );
      // The semester has to exist and be active *before* any course is
      // added, every course attaches to whichever semester is currently
      // active, so adding them first would silently create a nameless
      // placeholder semester and then strand the courses there when this
      // one activates right after.
      if (!newSemesterMode) {
        await createSemesterOptimistic({
          label: seasonLabel(new Date(start + 'T00:00:00')),
          startDate: start,
          endDate: end,
        });
      }
      for (const c of validCourses) {
        await addCourseOptimistic({
          code: c.code,
          name: c.name,
          color: c.color,
          tint: c.tint,
          weeklyGoalHours: c.weeklyGoalHours,
        });
      }
      await markOnboardingComplete();
      router.replace('/dashboard');
    } catch (err: unknown) {
      console.error('Onboarding setup failed:', err);
      notify(err instanceof Error ? err.message : 'Setup did not finish.');
    }
  }

  if (gate === 'checking') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-8">
        <LoadingIndicator
          label="Loading your setup"
          detail="Getting your planner ready."
        />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Step dots */}
      {/* Capped to the same width as the content below, so the progress
          bar tracks the card it belongs to instead of stretching the
          full width of a laptop screen. */}
      <div className="mx-auto flex w-full max-w-xl gap-1.5 px-6 pt-[max(env(safe-area-inset-top),3.5rem)]">
        {setupSteps.map((s, i) => {
          const active = i <= setupSteps.indexOf(step);
          return (
            <span
              key={s}
              className={`h-0.5 flex-1 rounded-full transition-colors duration-200 ${
                active ? 'bg-primary' : 'bg-line'
              }`}
            />
          );
        })}
      </div>

      <div className="flex-1 flex flex-col mx-auto w-full max-w-xl">
        {step === 'welcome' && <Welcome onNext={() => setStep('name')} />}
        {step === 'name' && (
          <NameStep
            name={displayName}
            setName={setDisplayName}
            avatarPreview={avatarPreview}
            setAvatarPreview={setAvatarPreview}
            onBack={() => setStep('welcome')}
            onNext={() => setStep('courses')}
          />
        )}
        {step === 'courses' && (
          <CoursesStep
            courses={courses}
            editIdx={editIdx}
            setEditIdx={setEditIdx}
            editing={editing}
            update={update}
            addAnother={addAnother}
            removeCourse={removeCourse}
            valid={valid}
            onBack={() => (newSemesterMode ? router.replace('/dashboard') : setStep('name'))}
            onNext={() => setStep(newSemesterMode ? 'routine' : 'semester')}
          />
        )}
        {step === 'semester' && (
          <SemesterStep
            start={start}
            end={end}
            setStart={setStart}
            setEnd={setEnd}
            canFinish={canFinishSemester}
            onBack={() => setStep('courses')}
            onNext={() => setStep('routine')}
          />
        )}
        {step === 'routine' && (
          <RoutineStep
            dailyGoal={dailyGoal}
            setDailyGoal={setDailyGoal}
            displayName={displayName}
            totalWeeklyGoal={courses
              .filter((c) => c.code.trim() && c.name.trim())
              .reduce((sum, c) => sum + clampWeeklyGoalHours(c.weeklyGoalHours), 0)}
            onBack={() => setStep(newSemesterMode ? 'courses' : 'semester')}
            onFinish={finish}
          />
        )}
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="relative flex-1 flex flex-col items-center justify-center text-center px-8 animate-fade-in">
      {/* Off-grid arrow pointing toward the title, quiet hand-drawn touch */}
      <div
        aria-hidden
        className="absolute"
        style={{ top: 64, left: 28, transform: 'rotate(-9deg)', opacity: 0.7 }}
      >
        <svg aria-hidden width="42" height="42" viewBox="0 0 36 36" fill="none">
          <path
            d="M6 4 C 14 16, 18 22, 30 28 M22 22 L30 28 L24 32"
            stroke="var(--muted-soft)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <AkadaMark size={62} />
      <h1 className="font-serif font-medium text-[44px] leading-[1.04] tracking-[-0.025em] m-0 mt-7">
        A quiet place
        <br />
        <span className="italic font-normal">to study.</span>
      </h1>
      <p className="mt-5 font-serif italic text-[15px] text-ink-soft max-w-[280px] leading-[1.55]">
        Track courses, tasks, and study sessions. Stay close to the work that matters.
      </p>

      <div className="mt-7">
        <HandNote color="var(--peach)" size={22} rotate={-3}>
          ~ a minute to set up
        </HandNote>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-9 w-full max-w-[280px] min-h-[56px] py-4 px-6 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium tracking-[0.01em]"
      >
        Start planning
      </button>
    </div>
  );
}

/* ─── Name step ─── */
function NameStep({
  name,
  setName,
  avatarPreview,
  setAvatarPreview,
  onBack,
  onNext,
}: {
  name: string;
  setName: (v: string) => void;
  avatarPreview: string;
  setAvatarPreview: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { notify } = useNotice();

  function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('That file is not an image.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      notify('That image is over 6 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  const initials = name.trim() ? name.trim().charAt(0).toUpperCase() : '?';

  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      <div className="px-7 pt-2">
        <button type="button" onClick={onBack} className="text-[13px] text-muted mb-[18px]">
          ← Back
        </button>
        <h2 className="font-serif font-medium text-[30px] tracking-[-0.02em] m-0">
          Set up your
          <br />
          <span className="italic font-normal">profile</span>
        </h2>
        <p className="mt-2 text-[14px] text-ink-soft leading-[1.5]">
          Add a photo and your name.
        </p>
      </div>

      <div className="px-7 pt-8 flex flex-col items-center">
        {/* Avatar upload */}
        <label className="relative cursor-pointer group mb-6">
          <div
            className="w-24 h-24 rounded-full border-2 border-dashed border-line-strong flex items-center justify-center overflow-hidden transition-colors group-hover:border-primary"
            style={avatarPreview ? { borderStyle: 'solid', borderColor: 'var(--line)' } : {}}
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="font-serif italic text-[32px] text-muted-soft">{initials}</span>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-contrast flex items-center justify-center text-sm shadow-sm">
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <input type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
        </label>

        <div className="w-full">
          <Field label="Your name">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ali"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) onNext();
              }}
              className="w-full bg-transparent border-0 border-b border-line-strong px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary rounded-none"
            />
          </Field>
        </div>
      </div>

      <div className="px-7 pt-8 pb-7 mt-auto">
        <button
          type="button"
          disabled={!name.trim()}
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={() => {
            setName('');
            onNext();
          }}
          className="w-full mt-2 py-3 text-[13px] text-muted font-serif italic"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

interface CoursesStepProps {
  courses: DraftCourse[];
  editIdx: number;
  setEditIdx: (i: number) => void;
  editing: DraftCourse;
  update: (patch: Partial<DraftCourse>) => void;
  addAnother: () => void;
  removeCourse: (i: number) => void;
  valid: boolean;
  onBack: () => void;
  onNext: () => void;
}

function CoursesStep({
  courses,
  editIdx,
  setEditIdx,
  editing,
  update,
  addAnother,
  removeCourse,
  valid,
  onBack,
  onNext,
}: CoursesStepProps) {
  // Which code is repeated, so the block can say so rather than just
  // greying the button out.
  const duplicateCode = (() => {
    const seen = new Set<string>();
    for (const course of courses) {
      const code = cleanCourseCode(course.code);
      if (!code) continue;
      if (seen.has(code)) return code;
      seen.add(code);
    }
    return '';
  })();

  return (
    <div className="flex-1 flex flex-col overflow-y-auto app-scroll animate-fade-in">
      <div className="px-7 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] text-muted mb-[18px]"
        >
          ← Back
        </button>
        <h2 className="font-serif font-medium text-[30px] tracking-[-0.02em] m-0">
          Add your courses
        </h2>
        <p className="mt-2 text-[14px] text-ink-soft leading-[1.5]">
          Set a weekly goal for each. You can edit anytime.
        </p>
      </div>

      {courses.length > 1 && (
        <div className="flex gap-2 px-7 pt-5 pb-1 overflow-x-auto app-scroll">
          {courses.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setEditIdx(i)}
              className={`shrink-0 bg-transparent px-0.5 py-1 font-mono text-[12px] font-semibold transition-colors ${
                i === editIdx ? 'hl-swipe text-ink' : 'text-muted-soft'
              }`}
              style={
                i === editIdx ? ({ '--hl': c.tint } as React.CSSProperties) : undefined
              }
            >
              {c.code || `Course ${i + 1}`}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  removeCourse(i);
                }}
                className="ml-1 text-muted-soft text-sm leading-none"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="px-7 pt-6 flex flex-col gap-[18px]">
        <Field label="Course code">
          <TextInput
            value={editing.code}
            onChange={(v) => update({ code: v.toUpperCase() })}
            placeholder="e.g. POL 227"
          />
        </Field>
        <Field label="Course name">
          <TextInput
            value={editing.name}
            onChange={(v) => update({ name: v })}
            placeholder="e.g. Comparative Politics"
          />
        </Field>
        <Field label="Accent color">
          <div className="flex flex-wrap gap-2.5">
            {PASTEL_PALETTE.map((p) => {
              const sel = editing.color === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => update({ color: p.value, tint: p.tint })}
                  aria-label={p.name}
                  className="w-8 h-8 rounded-full border-0 transition-transform"
                  style={{
                    background: p.value,
                    boxShadow: sel
                      ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${p.value}`
                      : 'none',
                    transform: sel ? 'scale(1.05)' : 'scale(1)',
                  }}
                />
              );
            })}
          </div>
        </Field>
        <Field label="Weekly study goal">
          <WeeklyGoalSlider
            value={editing.weeklyGoalHours}
            onChange={(weeklyGoalHours) => update({ weeklyGoalHours })}
          />
        </Field>


        {/* WYSIWYG preview */}
        <div className="relative bg-paper rounded-[14px] border border-line overflow-hidden mt-1">
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ background: editing.color }}
          />
          <div className="py-[18px] pl-6 pr-5">
            <p
              className="eyebrow m-0"
              style={{ color: editing.color }}
            >
              {editing.code || 'COURSE CODE'}
            </p>
            <h3 className="mt-1 mb-0 font-serif font-medium text-[20px] tracking-[-0.01em]">
              {editing.name || 'Course name'}
            </h3>
            <p className="mt-2.5 mb-0 text-xs text-muted font-serif italic">
              {editing.weeklyGoalHours} hrs a week
            </p>
          </div>
        </div>

        {courses.length === 1 ? (
          <button
            type="button"
            onClick={addAnother}
            className="mt-1 py-3.5 rounded-xl border border-dashed border-line-strong text-ink-soft text-[13px] font-medium"
          >
            + Add another course
          </button>
        ) : (
          <button
            type="button"
            onClick={addAnother}
            className="self-start rounded-full border border-dashed border-line-strong bg-transparent px-3.5 py-2 font-serif text-[13px] text-muted transition-colors hover:text-ink"
          >
            + Add another
          </button>
        )}
      </div>

      <div className="px-7 pt-8 pb-7 mt-auto">
        {duplicateCode && (
          <p role="alert" className="mb-3 text-center font-serif text-[13px] italic text-priority">
            Two courses share the code {duplicateCode}.
          </p>
        )}
        <button
          type="button"
          disabled={!valid}
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

interface SemesterStepProps {
  start: string;
  end: string;
  setStart: (s: string) => void;
  setEnd: (s: string) => void;
  canFinish: boolean;
  onBack: () => void;
  onNext: () => void;
}

/** Roughly when each term runs, as month/day pairs. */
const TERM_SHAPES = [
  { season: 'Spring', start: [0, 19], end: [4, 20] },
  { season: 'Summer', start: [5, 1], end: [7, 13] },
  { season: 'Fall', start: [7, 31], end: [11, 18] },
];

function iso(year: number, [month, day]: number[]): string {
  return isoDate(new Date(year, month, day));
}

/**
 * The next three terms, counted from today. Hardcoding them meant that by
 * September the list offered two terms that had already finished and one
 * that had started, with no way to say anything else.
 */
function upcomingSemesters(today = new Date()) {
  const options = [];
  for (let year = today.getFullYear(); options.length < 3; year += 1) {
    for (const shape of TERM_SHAPES) {
      const start = iso(year, shape.start);
      const end = iso(year, shape.end);
      // A term already over is no longer upcoming; one in progress still is.
      if (end < isoDate(today) || options.length >= 3) continue;
      options.push({
        label: `${shape.season} ${year}`,
        range: `${new Date(start + 'T00:00:00').toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })} to ${new Date(end + 'T00:00:00').toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}`,
        start,
        end,
      });
    }
  }
  return options;
}

function SemesterStep({
  start,
  end,
  setStart,
  setEnd,
  canFinish,
  onBack,
  onNext,
}: SemesterStepProps) {
  const semesters = useMemo(() => upcomingSemesters(), []);
  const onAPreset = semesters.some((sem) => sem.start === start && sem.end === end);
  // Opened by hand, or already open because the dates came from somewhere
  // other than a preset.
  const [custom, setCustom] = useState(false);
  const showCustom = custom || (Boolean(start || end) && !onAPreset);

  const weeks = canFinish
    ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000 / 7)
    : null;
  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      <div className="px-7 pt-2">
        <button type="button" onClick={onBack} className="text-[13px] text-muted mb-[18px]">
          ← Back
        </button>
        <h2 className="font-serif font-medium text-[30px] tracking-[-0.02em] m-0">
          The semester
        </h2>
        <p className="mt-2 text-[14px] text-ink-soft leading-[1.5]">
          Select your upcoming term for countdowns and stats.
        </p>
      </div>

      <div className="px-7 pt-8 flex flex-col gap-3">
        {semesters.map((sem) => {
          const active = start === sem.start && end === sem.end;
          return (
            <button
              key={sem.label}
              type="button"
              onClick={() => {
                setStart(sem.start);
                setEnd(sem.end);
              }}
              className="flex items-center justify-between p-5 rounded-[14px] transition-all duration-150 text-left border"
              style={{
                background: active ? 'var(--bg-tint)' : 'var(--paper)',
                borderColor: active ? 'var(--line-strong)' : 'var(--line)',
              }}
            >
              <div>
                <p className="m-0 font-serif font-medium text-[20px] text-ink tracking-[-0.01em]">
                  {sem.label}
                </p>
                <p className="m-0 text-[13px] text-ink-soft mt-1 leading-[1.5]">
                  {sem.range}
                </p>
              </div>
              <div
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center transition-colors border"
                style={{ borderColor: active ? 'var(--ink)' : 'var(--line-strong)' }}
              >
                {active && <HandCheck size={13} color="var(--ink)" />}
              </div>
            </button>
          );
        })}

        {showCustom ? (
          <div className="mt-1 grid grid-cols-2 gap-3 animate-fade-in">
            <div>
              <label className="eyebrow mb-2 block">Starts</label>
              <DateInput value={start} onChange={setStart} />
            </div>
            <div>
              <label className="eyebrow mb-2 block">Ends</label>
              <DateInput value={end} onChange={setEnd} />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCustom(true)}
            className="self-start rounded-full border border-dashed border-line-strong bg-transparent px-3.5 py-2 font-serif text-[13px] text-muted transition-colors hover:text-ink"
          >
            + Other dates
          </button>
        )}

        <div className="mt-4 py-5 px-[22px] bg-paper rounded-[14px] border border-line">
          <p className="eyebrow m-0 text-muted">
            Term length
          </p>
          <p className="mt-1.5 mb-0 font-serif font-medium italic text-[22px]">
            {weeks !== null ? `${weeks} weeks ahead` : 'Select a term'}
          </p>
        </div>
      </div>

      <div className="px-7 pt-8 pb-7 mt-auto">
        <button
          type="button"
          disabled={!canFinish}
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ─── Routine step (daily goal) ─── */
function RoutineStep({
  dailyGoal,
  setDailyGoal,
  displayName,
  totalWeeklyGoal,
  onBack,
  onFinish,
}: {
  dailyGoal: number;
  setDailyGoal: (v: number) => void;
  displayName: string;
  totalWeeklyGoal: number;
  onBack: () => void;
  onFinish: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleFinish() {
    setSaving(true);
    try {
      await onFinish();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      <div className="px-7 pt-2">
        <button type="button" onClick={onBack} className="text-[13px] text-muted mb-[18px]">
          ← Back
        </button>
        <h2 className="font-serif font-medium text-[30px] tracking-[-0.02em] m-0">
          Your daily rhythm
        </h2>
        <p className="mt-2 text-[14px] text-ink-soft leading-[1.5]">
          How much study time feels right each day?
        </p>
      </div>

      <div className="px-7 pt-8 flex flex-col gap-6">
        <Field label="Daily study target">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1"
              max="12"
              step="0.5"
              value={dailyGoal}
              onChange={(e) => setDailyGoal(clampDailyGoalHours(e.target.value))}
              className="pl-range flex-1"
              style={{ color: 'var(--ink)' }}
            />
            <div className="font-mono font-semibold text-sm text-ink w-14 text-right">
              {dailyGoal}
              <span className="text-muted ml-1">h</span>
            </div>
          </div>
        </Field>

        <HandNote className="self-start" rotate={-1.5}>
          {dailyGoal >= 7 ? 'exam season' : dailyGoal >= 4 ? 'most students' : 'easy days'}
        </HandNote>

        {/* Summary card */}
        <div className="py-5 px-[22px] bg-paper rounded-[14px] border border-line">
          <p className="eyebrow m-0 text-muted">
            Your plan
          </p>
          <p className="mt-1.5 mb-0 font-serif font-medium text-[20px] tracking-[-0.01em]">
            {dailyGoal}h daily · {totalWeeklyGoal}h weekly
          </p>
        </div>
      </div>

      <div className="px-7 pt-8 pb-7 mt-auto">
        <button
          type="button"
          disabled={saving}
          onClick={handleFinish}
          className="w-full py-4 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <span className="flex items-center justify-center gap-2.5"><ButtonSpinner />Setting up your planner…</span> : displayName ? `Let's go, ${cleanDisplayName(displayName)}` : 'Begin'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="eyebrow block text-muted mb-2.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent border-0 border-b border-line-strong px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary rounded-none"
    />
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <DatePicker value={value} onChange={onChange} allowClear={false} placeholder="Pick a date" />;
}
