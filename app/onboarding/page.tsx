'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingIndicator, { ButtonSpinner } from '@/components/LoadingIndicator';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/data';
import { createClient } from '@/lib/supabase';
import AkadaMark from '@/components/notebook/AkadaMark';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import DatePicker from '@/components/DatePicker';
import CourseSearchInput from '@/components/CourseSearchInput';
import { useNotice } from '@/components/Notice';
import {
  addCourseOptimistic,
  createSemesterOptimistic,
  markOnboardingComplete,
  updateUserSettingsOptimistic,
} from '@/lib/data-hooks';
import {
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
  cleanDisplayName,
  hasDuplicateCourseCodes,
  isIsoDate,
} from '@/lib/planner-safety';
import {
  courseFromCatalog,
  deriveCourseCode,
  parseCourseInput,
  weeklyGoalForCredits,
  type CatalogCourse,
} from '@/lib/catalog';
import { useClaudeSheet } from '@/components/claude/ClaudeSheet';
import { outlinePrompt } from '@/lib/claude-asks';
import { isoDate, PASTEL_PALETTE, resolveTint, seasonLabel } from '@/lib/utils';

type Step = 'welcome' | 'courses' | 'term' | 'deadlines';

/**
 * Four steps, and the last one is the reason the app works at all. Setup
 * used to ask for a photo, the name signup had just asked for, and a daily
 * hours slider, then left the reader on a Today that said nothing was due,
 * which to someone with no deadlines in reads as "all caught up". It now asks
 * only what the planner cannot guess and ends on getting the deadlines in.
 */
const STEPS: Step[] = ['welcome', 'courses', 'term', 'deadlines'];

interface DraftCourse {
  code: string;
  name: string;
  credits: number;
  section: string | null;
  instructor: string | null;
  meetingTime: string | null;
  color: string;
  tint: string;
  weeklyGoalHours: number;
}

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
  const claude = useClaudeSheet();
  const { notify } = useNotice();
  const searchParams = useSearchParams();
  const newSemesterMode = searchParams.get('newSemester') === '1';
  const setupSteps: Step[] = newSemesterMode ? ['courses', 'deadlines'] : STEPS;
  const [step, setStep] = useState<Step>(() => (newSemesterMode ? 'courses' : 'welcome'));
  const [displayName, setDisplayName] = useState('');
  const [courses, setCourses] = useState<DraftCourse[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
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

      // The name was asked for at signup and rides on the account, so it is
      // carried into the profile here rather than asked for a second time.
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
      } catch {
        // Local mode or unauthenticated edge: the name can be set in Settings.
      }

      if (active) setGate('open');
    })();
    return () => {
      active = false;
    };
  }, [newSemesterMode, router]);

  // The term already under way is the one nearly everybody is setting up
  // for, so it is chosen before the step is reached. Changing it is a tap.
  useEffect(() => {
    if (start || end) return;
    const [current] = upcomingSemesters();
    if (current) {
      setStart(current.start);
      setEnd(current.end);
    }
  }, [start, end]);

  function addCourse(course: Omit<DraftCourse, 'color' | 'tint'>) {
    setCourses((prev) => {
      const used = new Set(prev.map((c) => c.color));
      const next =
        PASTEL_PALETTE.find((p) => !used.has(p.value)) ||
        PASTEL_PALETTE[prev.length % PASTEL_PALETTE.length];
      return [...prev, { ...course, color: next.value, tint: next.tint }];
    });
  }

  function removeCourse(i: number) {
    setCourses((prev) => prev.filter((_, idx) => idx !== i));
  }

  const valid = courses.length >= 1 && !hasDuplicateCourseCodes(courses);
  const canFinishSemester = isIsoDate(start) && isIsoDate(end) && end >= start;

  async function finish() {
    if (!valid || (!newSemesterMode && !canFinishSemester)) return;
    try {
      // Use the optimistic helpers so the SWR cache is hot before we navigate
      // to /dashboard, otherwise the dashboard would briefly read a stale
      // "not onboarded" / empty-courses cache and bounce or flash.
      if (!newSemesterMode && displayName) {
        await updateUserSettingsOptimistic({ displayName: cleanDisplayName(displayName) });
      }
      // The semester has to exist and be active *before* any course is
      // added, every course attaches to whichever semester is currently
      // active, so adding them first would silently create a nameless
      // placeholder semester and then strand the courses there when this
      // one activates right after.
      if (!newSemesterMode) {
        await createSemesterOptimistic({
          // The term they tapped carries its own name. Working it out from
          // the start date called a Fall term that opens on Aug 31 "Summer".
          label:
            upcomingSemesters().find((sem) => sem.start === start && sem.end === end)?.label ??
            seasonLabel(new Date(start + 'T00:00:00')),
          startDate: start,
          endDate: end,
        });
      }
      for (const c of courses) {
        await addCourseOptimistic({
          code: c.code,
          name: c.name,
          credits: c.credits,
          section: c.section,
          instructor: c.instructor,
          meetingTime: c.meetingTime,
          color: c.color,
          tint: c.tint,
          weeklyGoalHours: clampWeeklyGoalHours(c.weeklyGoalHours),
        });
      }
      await markOnboardingComplete();
      setStep('deadlines');
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
        {step === 'welcome' && <Welcome onNext={() => setStep('courses')} />}
        {step === 'courses' && (
          <CoursesStep
            courses={courses}
            addCourse={addCourse}
            removeCourse={removeCourse}
            valid={valid}
            finishing={newSemesterMode}
            onBack={() => (newSemesterMode ? router.replace('/dashboard') : setStep('welcome'))}
            onNext={() => (newSemesterMode ? finish() : setStep('term'))}
          />
        )}
        {step === 'term' && (
          <SemesterStep
            start={start}
            end={end}
            setStart={setStart}
            setEnd={setEnd}
            canFinish={canFinishSemester}
            onBack={() => setStep('courses')}
            onNext={finish}
          />
        )}
        {step === 'deadlines' && (
          <DeadlinesStep
            onClaude={() => {
              // The same sheet every Claude button opens, carried over to
              // Today: what Claude will do, the exact words, how to connect.
              claude.ask({
                does: 'Claude reads your course outlines and puts every deadline into Akada, with its date and weight.',
                prompt: outlinePrompt(courses.map((c) => c.code)),
              });
              router.replace('/dashboard');
            }}
            onManual={() => router.replace('/tasks?newTask=1')}
            onLater={() => router.replace('/dashboard')}
          />
        )}
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="relative flex-1 flex flex-col items-center justify-center text-center px-8 animate-fade-in">
      <AkadaMark size={62} />
      <h1 className="font-serif font-medium text-[40px] leading-[1.06] tracking-[-0.025em] m-0 mt-7">
        Your term,
        <br />
        <span className="italic font-normal">on one page.</span>
      </h1>
      <p className="mt-5 font-serif text-[16px] text-ink-soft max-w-[330px] leading-[1.6]">
        Akada holds what is due in each of your courses and the hours you put in,
        and tells you what to do next.
      </p>
      <p className="mt-3 font-serif italic text-[14px] text-muted max-w-[320px] leading-[1.6]">
        Pick your courses, check the term dates, then get your deadlines in.
      </p>

      <div className="mt-6">
        <HandNote color="var(--peach)" size={22} rotate={-3}>
          ~ two minutes
        </HandNote>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-8 w-full max-w-[280px] min-h-[56px] py-4 px-6 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium tracking-[0.01em]"
      >
        Start
      </button>
      <Link href="/guide" className="hand-underline mt-5 font-serif text-[14px] text-muted">
        or read how it works first
      </Link>
    </div>
  );
}

/* ─── Courses step ─── */
function CoursesStep({
  courses,
  addCourse,
  removeCourse,
  valid,
  finishing,
  onBack,
  onNext,
}: {
  courses: DraftCourse[];
  addCourse: (course: Omit<DraftCourse, 'color' | 'tint'>) => void;
  removeCourse: (i: number) => void;
  valid: boolean;
  /** Adding a new term's courses ends here rather than going on to dates. */
  finishing: boolean;
  onBack: () => void;
  onNext: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<CatalogCourse | null>(null);
  const [section, setSection] = useState('');
  const [typedName, setTypedName] = useState('');
  const [saving, setSaving] = useState(false);

  const nextColor =
    PASTEL_PALETTE.find((p) => !courses.some((c) => c.color === p.value)) ?? PASTEL_PALETTE[0];

  function resolve() {
    if (picked) return courseFromCatalog(picked, section);
    const parsed = parseCourseInput(query);
    const name = cleanCourseName(typedName || parsed.name);
    return {
      // Nobody is asked to type a code: one comes off the front of what was
      // typed, or is built from the name.
      code: cleanCourseCode(parsed.code || deriveCourseCode(name)),
      name,
      credits: 4,
      section: null,
      instructor: null,
      meetingTime: null,
    };
  }

  const draft = resolve();
  const canAdd = Boolean(draft.code && draft.name);
  const duplicate = canAdd && courses.some((c) => c.code === draft.code) ? draft.code : '';

  function add() {
    if (!canAdd || duplicate) return;
    addCourse({ ...draft, weeklyGoalHours: weeklyGoalForCredits(draft.credits) });
    setQuery('');
    setPicked(null);
    setSection('');
    setTypedName('');
  }

  async function next() {
    setSaving(true);
    try {
      await onNext();
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
          Your courses
        </h2>
        <p className="mt-2 font-serif text-[15px] text-ink-soft leading-[1.55]">
          Search by code or name and pick your section. The instructor and class time
          come with it. Not on the list? Type the name and press Add.
        </p>
      </div>

      <div className="px-7 pt-6 flex flex-col gap-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CourseSearchInput
              autoFocus
              query={query}
              onQueryChange={(v) => {
                setQuery(v);
                setTypedName('');
              }}
              picked={picked}
              onPick={(course) => {
                setPicked(course);
                setSection('');
              }}
              section={section}
              onSectionChange={setSection}
              accent={nextColor.value}
              accentTint={resolveTint(nextColor.value, nextColor.tint)}
              onSubmit={add}
            />
          </div>
          <button
            type="button"
            onClick={add}
            disabled={!canAdd || Boolean(duplicate)}
            className="h-[46px] shrink-0 rounded-[10px] border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint disabled:opacity-30"
          >
            Add
          </button>
        </div>

        {/* A code alone ("CS 200") leaves nothing to name the course by, so
            that is the only follow-up field. */}
        {!picked && query.trim().length > 0 && !draft.name && (
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Course name"
            className="w-full bg-paper border border-line rounded-[10px] px-4 py-3 text-sm font-serif italic text-ink outline-none focus:border-line-strong animate-fade-in"
          />
        )}
        {duplicate && (
          <p role="alert" className="m-0 font-serif text-[13px] italic text-priority">
            {duplicate} is already on your list.
          </p>
        )}
      </div>

      {courses.length > 0 && (
        <ul className="m-0 mt-6 list-none px-7">
          {courses.map((c, i) => (
            <li key={c.code} className="flex items-start gap-3 border-t border-line-soft py-3.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="m-0 flex items-center gap-2.5">
                  <span aria-hidden className="course-rule" style={{ ['--c' as string]: c.color }} />
                  <span className="eyebrow text-ink-soft">{c.code}</span>
                </p>
                <p className="m-0 mt-1 truncate font-serif text-[17px] font-medium tracking-[-0.01em] text-ink">
                  {c.name}
                </p>
                <p className="m-0 mt-0.5 truncate text-[12.5px] text-muted">
                  {[c.section && `Sec ${c.section}`, c.instructor, c.meetingTime]
                    .filter(Boolean)
                    .join(' · ') || `${c.credits} credits`}
                </p>
              </div>
              <span className="shrink-0 pt-5 font-mono text-[12px] text-ink-soft">
                {c.weeklyGoalHours}h<span className="text-muted"> / wk</span>
              </span>
              <button
                type="button"
                onClick={() => removeCourse(i)}
                aria-label={`Remove ${c.code}`}
                className="-mr-2 mt-3.5 grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-muted-soft transition-colors hover:bg-bg-tint hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {courses.length > 0 && (
        <p className="m-0 mt-2 px-7 font-serif text-[13px] italic leading-[1.55] text-muted">
          Each course gets a weekly study goal of two hours per credit. Change it any
          time on the course.
        </p>
      )}

      <div className="px-7 pt-8 pb-7 mt-auto">
        <button
          type="button"
          disabled={!valid || saving}
          onClick={next}
          className="w-full py-4 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2.5">
              <ButtonSpinner />
              Adding your courses…
            </span>
          ) : finishing ? (
            'Add these courses'
          ) : courses.length === 0 ? (
            'Add a course to continue'
          ) : (
            'Continue'
          )}
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
  onNext: () => Promise<void>;
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

  const [saving, setSaving] = useState(false);
  async function next() {
    setSaving(true);
    try {
      await onNext();
    } finally {
      setSaving(false);
    }
  }

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
          Your term
        </h2>
        <p className="mt-2 font-serif text-[15px] text-ink-soft leading-[1.55]">
          Week numbers and countdowns run off these dates. The one under way is
          already picked.
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
          disabled={!canFinish || saving}
          onClick={next}
          className="w-full py-4 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? <span className="flex items-center justify-center gap-2.5"><ButtonSpinner />Setting up your planner…</span> : 'Set up my planner'}
        </button>
      </div>
    </div>
  );
}

/* ─── Routine step (daily goal) ─── */
/* ─── Deadlines step ─── */
/**
 * The step that makes the rest of the app work. Up next, Coming, the reading
 * hours and recall all read the deadlines, so setup ends by getting them in
 * rather than by leaving the reader on an empty page.
 */
function DeadlinesStep({
  onClaude,
  onManual,
  onLater,
}: {
  onClaude: () => void;
  onManual: () => void;
  onLater: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      <div className="px-7 pt-6">
        <HandNote color="var(--sage)" size={20} rotate={-2}>
          courses in ✓
        </HandNote>
        <h2 className="mt-3 font-serif font-medium text-[30px] tracking-[-0.02em] m-0">
          Now, what&apos;s due
        </h2>
        <p className="mt-2 font-serif text-[15px] text-ink-soft leading-[1.55]">
          Everything Akada tells you, what to do next, how many hours of reading are
          ahead, when the midterm is, runs off your deadlines. There are two ways to get
          them in.
        </p>
      </div>

      <div className="px-7 pt-7 flex flex-col gap-3">
        <DeadlineChoice
          title="Hand Claude your course outlines"
          body="Connect Akada to Claude once, attach an outline, and ask it to put everything in. Every quiz, assignment and exam goes in with its date and weight. A few minutes for the whole term."
          action="Show me how"
          onClick={onClaude}
          primary
        />
        <DeadlineChoice
          title="Add them yourself"
          body="Type each one in. Give readings their page count and exams their weight, and Akada can do more with them."
          action="Add the first one"
          onClick={onManual}
        />
      </div>

      <div className="px-7 pt-6 pb-7 mt-auto">
        <button
          type="button"
          onClick={onLater}
          className="w-full py-3 text-[13px] text-muted font-serif italic"
        >
          Later, take me to Today
        </button>
      </div>
    </div>
  );
}

function DeadlineChoice({
  title,
  body,
  action,
  onClick,
  primary,
}: {
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[14px] border px-[22px] py-5 text-left transition-colors hover:border-line-strong"
      style={{
        background: primary ? 'var(--paper)' : 'transparent',
        borderColor: primary ? 'var(--line-strong)' : 'var(--line)',
      }}
    >
      <p className="m-0 font-serif text-[19px] font-medium tracking-[-0.01em] text-ink">{title}</p>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-ink-soft">{body}</p>
      <p className="m-0 mt-3 font-serif text-[14px] text-ink">
        <span className="hand-underline">{action}</span> →
      </p>
    </button>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <DatePicker value={value} onChange={onChange} allowClear={false} placeholder="Pick a date" />;
}
