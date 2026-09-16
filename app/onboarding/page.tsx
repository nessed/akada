'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AkadaMark from '@/components/notebook/AkadaMark';
import Marginalia from '@/components/notebook/Marginalia';
import CourseSearchInput from '@/components/CourseSearchInput';
import DatePicker from '@/components/DatePicker';
import LoadingIndicator from '@/components/LoadingIndicator';
import WeeklyGoalSlider from '@/components/WeeklyGoalSlider';
import { useNotice } from '@/components/Notice';
import {
  CheckBox,
  CheckedOption,
  CourseSpine,
  Eyebrow,
  PageButton,
  Swipe,
  TextButton,
} from '@/components/notebook/Marks';
import { db } from '@/lib/data';
import { createClient } from '@/lib/supabase';
import type { CatalogCourse } from '@/lib/catalog';
import { deriveCourseCode, parseCourseInput } from '@/lib/catalog';
import { isUploadedImage, resizeAvatar } from '@/lib/avatar';
import { PASTEL_PALETTE, isoDate, seasonLabel, startOfWeek } from '@/lib/utils';
import { usePreferences } from '@/lib/preferences';
import {
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
  hasDuplicateCourseCodes,
  isIsoDate,
  MEETING_TIME_MAX,
} from '@/lib/planner-safety';
import {
  addCourseOptimistic,
  createSemesterOptimistic,
  markOnboardingComplete,
  updateUserSettingsOptimistic,
} from '@/lib/data-hooks';

/**
 * Setting up the term, in three questions.
 *
 * It was five screens: a welcome, your name, your courses, the semester
 * dates, and a study routine. Two of those were the app asking for things it
 * did not need up front — a display name it can read off the account, and a
 * pair of term dates almost nobody knows on the day they sign up. Both are in
 * Settings, where they can be changed by someone who cares, and the dates
 * default to a fifteen-week term from this Monday.
 *
 * The last question is the one that is new, and it is the most important: the
 * day the week gets read back. Review only works if a reader has agreed to it
 * once, and agreeing to it here is why the nudge is not a notification.
 */

interface DraftCourse {
  code: string;
  name: string;
  color: string;
  tint: string;
  weeklyGoalHours: number;
  section: string | null;
  instructor: string | null;
  meetingTime: string | null;
  credits: number;
}

const SLOTS = [
  { id: 'early', label: 'Early, before class', hours: '06–09' },
  { id: 'afternoon', label: 'Afternoons between classes', hours: '13–17' },
  { id: 'evening', label: 'Late evening', hours: '21–01' },
  { id: 'weekend', label: 'Weekend blocks', hours: 'Sat–Sun' },
];

const REVIEW_DAYS = [
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
];

export default function OnboardingPage() {
  return (
    <Suspense fallback={<Gate label="Loading your setup" />}>
      <OnboardingContent />
    </Suspense>
  );
}

function Gate({ label }: { label: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-8">
      <LoadingIndicator label={label} detail="Getting your planner ready." />
    </div>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify } = useNotice();
  const [, setPrefs] = usePreferences();

  // Settings → Term sends people here to start the next semester, which skips
  // the welcome and keeps the reader's existing profile untouched.
  const newSemesterMode = searchParams.get('mode') === 'semester';

  const [step, setStep] = useState(newSemesterMode ? 1 : 0);
  const [gate, setGate] = useState<'checking' | 'open'>('checking');
  const [saving, setSaving] = useState(false);

  const [courses, setCourses] = useState<DraftCourse[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<CatalogCourse | null>(null);
  const [section, setSection] = useState('');
  const [manualName, setManualName] = useState('');
  const [goal, setGoal] = useState(8);

  const [slots, setSlots] = useState<string[]>(['afternoon']);
  const [reviewDay, setReviewDay] = useState(0);
  const [avatar, setAvatar] = useState('');

  // A fifteen-week term from this Monday, which is right often enough that
  // most people will never open Settings → Term to correct it.
  const [start, setStart] = useState(() => isoDate(startOfWeek(new Date())));
  const [end, setEnd] = useState(() => {
    const d = startOfWeek(new Date());
    d.setDate(d.getDate() + 15 * 7 - 1);
    return isoDate(d);
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      // The gate is decided on its own. Bundling it with the prefill calls
      // meant any one of them failing (createClient() throws when Supabase is
      // unconfigured) opened setup to an already-onboarded user.
      let onboarded = false;
      try {
        onboarded = await db.isOnboardingComplete();
      } catch {
        onboarded = false;
      }
      if (!alive) return;

      // Someone who has already finished setup must not be able to run it
      // again by typing the URL: it would duplicate every course.
      if (onboarded && !newSemesterMode) {
        router.replace('/dashboard');
        return;
      }

      // Prefill is best-effort and must never block the form.
      try {
        const settings = await db.getUserSettings();
        if (alive) setAvatar((current) => current || settings?.avatarUrl || '');
      } catch {
        // Local mode or an unauthenticated edge: keep the form usable.
      }
      if (alive) setGate('open');
    })();
    return () => {
      alive = false;
    };
  }, [newSemesterMode, router]);

  function nextColor() {
    const used = new Set(courses.map((c) => c.color));
    return PASTEL_PALETTE.find((p) => !used.has(p.value)) ||
      PASTEL_PALETTE[courses.length % PASTEL_PALETTE.length];
  }

  /** What the search box and the section picker currently add up to. */
  function resolveDraft(): DraftCourse | null {
    const pastel = nextColor();
    if (picked) {
      const chosen = picked.sections?.find((sec) => sec.id === section);
      const withRoom = [chosen?.meets, chosen?.room].filter(Boolean).join(' · ');
      return {
        code: cleanCourseCode(picked.code),
        name: cleanCourseName(picked.title),
        color: pastel.value,
        tint: pastel.tint,
        weeklyGoalHours: clampWeeklyGoalHours(goal),
        section: section || null,
        instructor: chosen?.instructor ?? null,
        meetingTime: (withRoom.length <= MEETING_TIME_MAX ? withRoom : chosen?.meets) || null,
        credits: picked.credits ?? 4,
      };
    }
    const parsed = parseCourseInput(query);
    const name = cleanCourseName(manualName || parsed.name);
    if (!name) return null;
    return {
      code: cleanCourseCode(parsed.code || deriveCourseCode(name)),
      name,
      color: pastel.value,
      tint: pastel.tint,
      weeklyGoalHours: clampWeeklyGoalHours(goal),
      section: null,
      instructor: null,
      meetingTime: null,
      credits: 4,
    };
  }

  const draft = resolveDraft();

  function addDraft() {
    if (!draft?.code || !draft.name) return;
    if (courses.some((c) => c.code === draft.code)) {
      notify(`${draft.code} is already on the list.`);
      return;
    }
    setCourses([...courses, draft]);
    setQuery('');
    setPicked(null);
    setSection('');
    setManualName('');
    setGoal(8);
  }

  const valid = courses.length >= 1 && !hasDuplicateCourseCodes(courses);
  const datesValid = isIsoDate(start) && isIsoDate(end) && end >= start;

  async function finish() {
    if (!valid || !datesValid || saving) return;
    setSaving(true);
    try {
      const stored = avatar && isUploadedImage(avatar) ? await resizeAvatar(avatar) : avatar;
      await updateUserSettingsOptimistic(
        newSemesterMode ? {} : { avatarUrl: stored },
      );

      // The semester has to exist and be active *before* any course is added:
      // every course attaches to whichever semester is active, so adding them
      // first would create a nameless placeholder and strand them in it.
      if (!newSemesterMode) {
        await createSemesterOptimistic({
          label: seasonLabel(new Date(start + 'T00:00:00')),
          startDate: start,
          endDate: end,
        });
      }

      for (const course of courses) {
        await addCourseOptimistic({
          code: course.code,
          name: course.name,
          color: course.color,
          tint: course.tint,
          weeklyGoalHours: course.weeklyGoalHours,
          credits: course.credits,
          section: course.section,
          instructor: course.instructor,
          meetingTime: course.meetingTime,
        });
      }

      // The review day is a preference, not a record, so it is written last
      // and a failure here cannot cost anybody their courses.
      setPrefs({ reviewDay });
      await markOnboardingComplete();
      router.replace('/dashboard');
    } catch (error) {
      console.error('Onboarding setup failed:', error);
      notify(error instanceof Error ? error.message : 'Setup did not finish.');
      setSaving(false);
    }
  }

  if (gate === 'checking') return <Gate label="Loading your setup" />;

  const totalSteps = newSemesterMode ? 2 : 3;
  const shownStep = newSemesterMode ? step : step;

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      {step === 0 && (
        <span
          aria-hidden
          className="ruled pointer-events-none absolute inset-0"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
          }}
        />
      )}

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-7">
        {/* The rule at the top is the progress: three strokes, one filled per
            answered question. No percentage and no "step 2 of 3" chip. */}
        {step > 0 && (
          <div className="flex gap-1.5 pt-[max(env(safe-area-inset-top),26px)]">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className="h-0.5 flex-1"
                style={{ background: i < shownStep ? 'var(--ink)' : 'var(--line)' }}
              />
            ))}
          </div>
        )}

        {step === 0 && (
          <Welcome onNext={() => setStep(1)} />
        )}

        {step === 1 && (
          <CoursesStep
            courses={courses}
            draft={draft}
            query={query}
            picked={picked}
            section={section}
            manualName={manualName}
            goal={goal}
            onQuery={(v) => {
              setQuery(v);
              setManualName('');
            }}
            onPick={(course) => {
              setPicked(course);
              setSection('');
              if (course?.credits) setGoal(clampWeeklyGoalHours(course.credits * 2));
            }}
            onSection={setSection}
            onManualName={setManualName}
            onGoal={setGoal}
            onAdd={addDraft}
            onRemove={(code) => setCourses(courses.filter((c) => c.code !== code))}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <RoutineStep
            slots={slots}
            onToggleSlot={(id) =>
              setSlots(slots.includes(id) ? slots.filter((s) => s !== id) : [...slots, id])
            }
            reviewDay={reviewDay}
            onReviewDay={setReviewDay}
            start={start}
            end={end}
            onStart={setStart}
            onEnd={setEnd}
            datesValid={datesValid}
            showDates={!newSemesterMode}
            saving={saving}
            onFinish={finish}
          />
        )}
      </div>
    </div>
  );
}

/* ───────── the three screens ───────── */

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="pt-[max(env(safe-area-inset-top),72px)]">
        <AkadaMark size={44} />
        <h1 className="mt-9 font-serif text-[34px] font-normal leading-[1.06] tracking-[-0.03em] md:text-[40px]">
          A quiet place
          <br />
          <em className="italic">to keep the term.</em>
        </h1>
        <p className="mt-5 max-w-[30ch] font-serif text-[16px] leading-[1.6] text-ink-soft">
          Courses, deadlines and the hours you actually sit down for. Nothing else, and nothing
          shared.
        </p>
        <div className="mt-7 flex items-center gap-2.5">
          <Marginalia mark="squiggle" width={34} />
          <span className="font-serif text-sm italic text-muted">about a minute</span>
        </div>
      </div>

      <div className="mt-auto pb-[calc(40px+env(safe-area-inset-bottom))]">
        <PageButton onClick={onNext}>Set up the term</PageButton>
        <p className="mt-4 text-center text-[13px] text-muted">
          Already have an account?{' '}
          <Link href="/auth" className="border-b border-line-strong pb-px text-ink">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}

function CoursesStep({
  courses,
  draft,
  query,
  picked,
  section,
  manualName,
  goal,
  onQuery,
  onPick,
  onSection,
  onManualName,
  onGoal,
  onAdd,
  onRemove,
  onNext,
}: {
  courses: DraftCourse[];
  draft: DraftCourse | null;
  query: string;
  picked: CatalogCourse | null;
  section: string;
  manualName: string;
  goal: number;
  onQuery: (v: string) => void;
  onPick: (c: CatalogCourse | null) => void;
  onSection: (v: string) => void;
  onManualName: (v: string) => void;
  onGoal: (v: number) => void;
  onAdd: () => void;
  onRemove: (code: string) => void;
  onNext: () => void;
}) {
  const canAdd = Boolean(draft?.code && draft?.name);
  return (
    <>
      <div className="pt-8">
        <Eyebrow>One of two</Eyebrow>
        <h1 className="mt-2 font-serif text-[30px] font-normal leading-[1.1] tracking-[-0.025em]">
          What are you
          <br />
          taking?
        </h1>
      </div>

      <div className="pt-6">
        <CourseSearchInput
          autoFocus
          query={query}
          onQueryChange={onQuery}
          picked={picked}
          onPick={onPick}
          section={section}
          onSectionChange={onSection}
          accent={draft?.color ?? PASTEL_PALETTE[0].value}
          accentTint={draft?.tint ?? PASTEL_PALETTE[0].tint}
          onSubmit={onAdd}
        />

        {!picked && query.trim().length > 0 && !canAdd && (
          <input
            value={manualName}
            onChange={(e) => onManualName(e.target.value)}
            placeholder="Course name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAdd();
            }}
            className="mt-3 w-full animate-fade-in border-0 border-b-[1.4px] border-line-strong bg-transparent px-0.5 pb-2 font-serif text-[15px] italic text-ink outline-none focus:border-ink"
          />
        )}

        {canAdd && (
          <div className="mt-5 animate-fade-in">
            <Eyebrow className="mb-2">Hours a week</Eyebrow>
            <WeeklyGoalSlider
              value={goal}
              onChange={onGoal}
              credits={draft?.credits ?? 4}
              label="Weekly study goal for this course"
            />
            <PageButton size="sheet" className="mt-4" onClick={onAdd}>
              Add {draft?.code}
            </PageButton>
          </div>
        )}
      </div>

      {courses.length > 0 && (
        <div className="pt-7">
          <Eyebrow className="mb-1.5">On the list so far</Eyebrow>
          {courses.map((course) => (
            <div key={course.code} className="row-rule flex items-center gap-3 py-2.5">
              <CourseSpine color={course.color} />
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[9px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: course.color }}
                >
                  {course.code}
                </span>
                <span className="block truncate font-serif text-sm">{course.name}</span>
              </span>
              <span className="flex-none font-mono text-[11px] text-muted">
                {course.weeklyGoalHours}h/wk
              </span>
              <button
                type="button"
                onClick={() => onRemove(course.code)}
                aria-label={`Remove ${course.code}`}
                className="flex-none bg-transparent font-mono text-[13px] text-muted-soft hover:text-priority"
              >
                ×
              </button>
            </div>
          ))}
          <p className="mt-3.5 font-serif text-[13px] italic text-muted">
            Weekly hours come from the credits. Change them whenever.
          </p>
        </div>
      )}

      <div className="mt-auto pb-[calc(34px+env(safe-area-inset-bottom))] pt-8">
        <PageButton onClick={onNext} disabled={courses.length === 0}>
          {courses.length === 0 ? 'Add a course to carry on' : 'Next'}
        </PageButton>
      </div>
    </>
  );
}

function RoutineStep({
  slots,
  onToggleSlot,
  reviewDay,
  onReviewDay,
  start,
  end,
  onStart,
  onEnd,
  datesValid,
  showDates,
  saving,
  onFinish,
}: {
  slots: string[];
  onToggleSlot: (id: string) => void;
  reviewDay: number;
  onReviewDay: (day: number) => void;
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  datesValid: boolean;
  showDates: boolean;
  saving: boolean;
  onFinish: () => void;
}) {
  const [datesOpen, setDatesOpen] = useState(false);
  return (
    <>
      <div className="pt-8">
        <Eyebrow>Last one</Eyebrow>
        <h1 className="mt-2 font-serif text-[30px] font-normal leading-[1.1] tracking-[-0.025em]">
          When do you
          <br />
          actually study?
        </h1>
        <p className="mt-3 font-serif text-[14.5px] leading-[1.55] text-ink-soft">
          So the day has your hours on it, not an office schedule.
        </p>
      </div>

      <div className="pt-6">
        {SLOTS.map((slot) => {
          const on = slots.includes(slot.id);
          return (
            <button
              key={slot.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleSlot(slot.id)}
              className="row-rule flex w-full items-center gap-3.5 bg-transparent py-3.5 text-left"
            >
              {on ? <CheckedOption /> : <CheckBox tone="soft" />}
              <span className={`flex-1 font-serif text-[16px] ${on ? 'text-ink' : 'text-ink-soft'}`}>
                {slot.label}
              </span>
              <span
                className="flex-none font-mono text-[11px]"
                style={{ color: on ? 'var(--muted)' : 'var(--muted-soft)' }}
              >
                {slot.hours}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rule-ink mt-7 pt-4">
        <Eyebrow>Read the week back on</Eyebrow>
        <div className="mt-3 flex items-baseline gap-4">
          {REVIEW_DAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              aria-pressed={reviewDay === day.value}
              onClick={() => onReviewDay(day.value)}
              className={`bg-transparent font-serif text-[17px] ${
                reviewDay === day.value ? 'text-ink' : 'text-muted'
              }`}
            >
              {reviewDay === day.value ? <Swipe>{day.label}</Swipe> : day.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={reviewDay === -1}
            onClick={() => onReviewDay(-1)}
            className={`ml-auto bg-transparent font-serif text-sm italic ${
              reviewDay === -1 ? 'text-ink' : 'text-muted-soft'
            }`}
          >
            never
          </button>
        </div>
        <p className="mt-3.5 font-serif text-[13.5px] italic leading-[1.5] text-muted">
          {reviewDay === -1
            ? 'Review stays there whenever you want it. It just will not ask.'
            : 'One page: where the week went and one thing to change.'}
        </p>
      </div>

      {/* The term's own dates. Prefilled with a fifteen-week span from this
          Monday, folded away because almost nobody knows them on day one. */}
      {showDates && (
        <div className="mt-6">
          {datesOpen ? (
            <div className="animate-fade-in">
              <Eyebrow className="mb-2">The term runs</Eyebrow>
              <div className="flex flex-col gap-3 sm:flex-row">
                <DatePicker value={start} onChange={onStart} />
                <DatePicker value={end} onChange={onEnd} />
              </div>
              {!datesValid && (
                <p className="mt-2 font-serif text-[13px] italic text-priority">
                  The end has to come after the start.
                </p>
              )}
            </div>
          ) : (
            <TextButton tone="quiet" onClick={() => setDatesOpen(true)}>
              the term runs {shortDate(start)} – {shortDate(end)}, change it →
            </TextButton>
          )}
        </div>
      )}

      <div className="mt-auto pb-[calc(34px+env(safe-area-inset-bottom))] pt-8">
        <PageButton onClick={onFinish} disabled={!datesValid || saving}>
          {saving ? 'Opening…' : 'Open the notebook'}
        </PageButton>
      </div>
    </>
  );
}

function shortDate(iso: string): string {
  if (!isIsoDate(iso)) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}
