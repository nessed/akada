'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { db } from '@/lib/data';
import { PASTEL_PALETTE } from '@/lib/utils';

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
  weeklyGoalHours: 6,
});

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [displayName, setDisplayName] = useState('');
  const [courses, setCourses] = useState<DraftCourse[]>([emptyDraft()]);
  const [editIdx, setEditIdx] = useState(0);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [dailyGoal, setDailyGoal] = useState(4);
  const [avatarPreview, setAvatarPreview] = useState('');

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
      { code: '', name: '', color: next.value, tint: next.tint, weeklyGoalHours: 6 },
    ]);
    setEditIdx(courses.length);
  }

  function removeCourse(i: number) {
    if (courses.length === 1) return;
    setCourses((prev) => prev.filter((_, idx) => idx !== i));
    setEditIdx(Math.max(0, editIdx - (i <= editIdx ? 1 : 0)));
  }

  const valid = courses.filter((c) => c.code.trim() && c.name.trim()).length >= 1;
  const canFinishSemester = !!start && !!end && end >= start;

  function resizeImage(base64: string, maxWidth = 160, maxHeight = 160): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(base64);
    });
  }

  async function finish() {
    try {
      let finalAvatar = avatarPreview;
      if (avatarPreview) {
        finalAvatar = await resizeImage(avatarPreview);
      }

      // Save user settings (name + daily goal + avatar)
      await db.updateUserSettings({
        displayName: displayName.trim(),
        dailyGoalHours: dailyGoal,
        avatarUrl: finalAvatar,
      });
      // Save courses
      for (const c of courses.filter((x) => x.code.trim() && x.name.trim())) {
        await db.addCourse({
          code: c.code.trim(),
          name: c.name.trim(),
          color: c.color,
          tint: c.tint,
          weeklyGoalHours: c.weeklyGoalHours,
        });
      }
      await db.setSemester({ startDate: start, endDate: end });
      await db.setOnboardingComplete();
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error('Onboarding setup failed:', err);
      alert('Setup failed: ' + msg);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Step dots */}
      <div className="flex gap-1.5 px-6 pt-[max(env(safe-area-inset-top),3.5rem)]">
        {STEPS.map((s, i) => {
          const active = i <= STEPS.indexOf(step);
          return (
            <span
              key={s}
              className={`h-0.5 flex-1 rounded-full transition-colors duration-200 ${
                active ? 'bg-ink' : 'bg-line'
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
            onBack={() => setStep('name')}
            onNext={() => setStep('semester')}
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
              .reduce((sum, c) => sum + c.weeklyGoalHours, 0)}
            onBack={() => setStep('semester')}
            onFinish={finish}
          />
        )}
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 animate-fade-in">
      <div className="mb-7">
        <svg width="56" height="68" viewBox="0 0 56 68" fill="none">
          <path d="M6 4 H50 V60 L28 48 L6 60 Z" stroke="#1A1915" strokeWidth="1.4" fill="#FAFAF6" />
          <text
            x="28"
            y="32"
            textAnchor="middle"
            fontFamily="var(--font-serif), Georgia, serif"
            fontSize="22"
            fontStyle="italic"
            fill="#1A1915"
          >
            A
          </text>
        </svg>
      </div>
      <h1 className="font-serif font-medium text-[40px] leading-[1.05] tracking-[-0.02em] m-0">
        A quiet place
        <br />
        <span className="italic font-normal">to study.</span>
      </h1>
      <p className="mt-5 text-[15px] text-ink-soft max-w-[280px] leading-[1.5]">
        Track courses, tasks, and study sessions. Stay close to the work that matters.
      </p>
      <button
        type="button"
        onClick={onNext}
        className="mt-12 w-full max-w-[280px] py-4 px-6 rounded-xl bg-ink text-bg text-[15px] font-medium tracking-[0.01em]"
      >
        Start planning
      </button>
      <p className="mt-4 text-xs italic text-muted font-serif">
        Takes a minute to set up.
      </p>
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
  function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
            className="w-24 h-24 rounded-full border-2 border-dashed border-line-strong flex items-center justify-center overflow-hidden transition-colors group-hover:border-ink"
            style={avatarPreview ? { borderStyle: 'solid', borderColor: 'var(--line)' } : {}}
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="font-serif italic text-[32px] text-muted-soft">{initials}</span>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-ink text-bg flex items-center justify-center text-sm shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              className="w-full bg-transparent border-0 border-b border-line-strong px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink rounded-none"
            />
          </Field>
        </div>
      </div>

      <div className="px-7 pt-8 pb-7 mt-auto">
        <button
          type="button"
          disabled={!name.trim()}
          onClick={onNext}
          className="w-full py-4 rounded-xl bg-ink text-bg text-[15px] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
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
              className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={{
                background: i === editIdx ? c.tint : 'transparent',
                borderColor: i === editIdx ? c.color : 'var(--line)',
                color: i === editIdx ? 'var(--ink)' : 'var(--muted)',
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: c.color }}
              />
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
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={editing.weeklyGoalHours}
              onChange={(e) => update({ weeklyGoalHours: parseFloat(e.target.value) })}
              className="pl-range flex-1"
              style={{ color: editing.color }}
            />
            <div className="font-mono font-semibold text-sm text-ink w-14 text-right">
              {editing.weeklyGoalHours}
              <span className="text-muted ml-1">h</span>
            </div>
          </div>
        </Field>

        <GoalGuidance hours={editing.weeklyGoalHours} color={editing.color} tint={editing.tint} />

        {/* WYSIWYG preview */}
        <div className="relative bg-paper rounded-[14px] border border-line overflow-hidden mt-1">
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ background: editing.color }}
          />
          <div className="py-[18px] pl-6 pr-5">
            <p
              className="m-0 text-[10px] font-semibold tracking-[0.14em] uppercase"
              style={{ color: editing.color }}
            >
              {editing.code || 'COURSE CODE'}
            </p>
            <h3 className="mt-1 mb-0 font-serif font-medium text-[20px] tracking-[-0.01em]">
              {editing.name || 'Course name'}
            </h3>
            <div className="mt-3.5 h-1 rounded-full bg-bg-tint">
              <div
                className="h-full rounded-full"
                style={{ width: '24%', background: editing.color }}
              />
            </div>
            <p className="mt-2.5 mb-0 text-xs text-muted font-serif italic">
              Goal · {editing.weeklyGoalHours} hrs / week
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
            className="self-start py-2.5 px-3.5 rounded-full border border-dashed border-line-strong text-muted text-xs font-medium"
          >
            + Add another
          </button>
        )}
      </div>

      <div className="px-7 pt-8 pb-7 mt-auto">
        <button
          type="button"
          disabled={!valid}
          onClick={onNext}
          className="w-full py-4 rounded-xl bg-ink text-bg text-[15px] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
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

const SEMESTERS = [
  { label: 'Spring 2026', range: 'Jan 19 – May 20', start: '2026-01-19', end: '2026-05-20' },
  { label: 'Summer 2026', range: 'Jun 1 – Aug 13', start: '2026-06-01', end: '2026-08-13' },
  { label: 'Fall 2026', range: 'Aug 31 – Dec 18', start: '2026-08-31', end: '2026-12-18' },
];

function SemesterStep({
  start,
  end,
  setStart,
  setEnd,
  canFinish,
  onBack,
  onNext,
}: SemesterStepProps) {
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
        {SEMESTERS.map((sem) => {
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
                borderColor: active ? 'var(--ink)' : 'var(--line)',
                outline: active ? '1px solid var(--ink)' : 'none',
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
                style={{
                  borderColor: active ? 'var(--ink)' : 'var(--line-strong)',
                  background: active ? 'var(--ink)' : 'transparent',
                }}
              >
                {active && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}

        <div className="mt-4 py-5 px-[22px] bg-paper rounded-[14px] border border-line">
          <p className="m-0 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted">
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
          className="w-full py-4 rounded-xl bg-ink text-bg text-[15px] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
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

  // Compute a helpful comparison
  const weeklyFromDaily = dailyGoal * 7;
  const surplus = weeklyFromDaily - totalWeeklyGoal;

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
              onChange={(e) => setDailyGoal(parseFloat(e.target.value))}
              className="pl-range flex-1"
              style={{ color: 'var(--ink)' }}
            />
            <div className="font-mono font-semibold text-sm text-ink w-14 text-right">
              {dailyGoal}
              <span className="text-muted ml-1">h</span>
            </div>
          </div>
        </Field>

        {/* Tier indicators */}
        <div className="flex gap-2">
          {[
            { label: 'Light', range: '1–3h', note: 'easy days' },
            { label: 'Focused', range: '4–6h', note: 'most students' },
            { label: 'Deep', range: '7+h', note: 'exam season' },
          ].map((t, i) => {
            const tier = dailyGoal >= 7 ? 2 : dailyGoal >= 4 ? 1 : 0;
            const active = tier === i;
            return (
              <div
                key={t.label}
                className="flex-1 px-2.5 py-2 rounded-[8px] text-center transition-all duration-150"
                style={{
                  background: active ? 'var(--bg-tint)' : 'transparent',
                  outline: active ? '1.5px solid var(--line-strong)' : '1.5px solid transparent',
                }}
              >
                <p
                  className="m-0 text-[9px] font-semibold tracking-[0.08em] uppercase leading-none"
                  style={{ color: active ? 'var(--ink)' : 'var(--muted-soft)' }}
                >
                  {t.label}
                </p>
                <p className="m-0 font-mono font-semibold text-[12px] text-ink mt-1">{t.range}</p>
                <p className="m-0 text-[9px] text-muted font-serif italic mt-0.5 leading-[1.3]">
                  {t.note}
                </p>
              </div>
            );
          })}
        </div>

        {/* Summary card */}
        <div className="py-5 px-[22px] bg-paper rounded-[14px] border border-line">
          <p className="m-0 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted">
            Your plan
          </p>
          <p className="mt-1.5 mb-0 font-serif font-medium text-[20px] tracking-[-0.01em]">
            {dailyGoal}h daily · {totalWeeklyGoal}h weekly
          </p>
          <p className="mt-2 mb-0 text-[12px] text-ink-soft leading-[1.5] font-serif italic">
            {surplus >= 2
              ? `That's ${surplus.toFixed(0)}h buffer above your course goals — great for review.`
              : surplus >= 0
              ? 'Right on track with your course goals.'
              : `You'll need to prioritize — ${Math.abs(surplus).toFixed(0)}h short of course goals per week.`}
          </p>
        </div>
      </div>

      <div className="px-7 pt-8 pb-7 mt-auto">
        <button
          type="button"
          disabled={saving}
          onClick={handleFinish}
          className="w-full py-4 rounded-xl bg-ink text-bg text-[15px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Setting up…' : displayName ? `Let's go, ${displayName}` : 'Begin'}
        </button>
      </div>
    </div>
  );
}

function GoalGuidance({ hours, color, tint }: { hours: number; color: string; tint: string }) {
  const tier = hours >= 14 ? 2 : hours >= 9 ? 1 : hours >= 6 ? 0 : -1;
  const tiers = [
    { label: 'Minimum', range: '6–8h', note: 'easier electives' },
    { label: 'Standard', range: '10–12h', note: 'aim for 3.6+' },
    { label: 'High', range: '14+h', note: 'midterms & projects' },
  ];
  return (
    <div>
      <p className="m-0 text-[11px] text-muted font-serif italic mb-2.5 leading-[1.5]">
        ~2–3 hrs independent study per credit hour.
      </p>
      <div className="flex gap-2">
        {tiers.map((t, i) => {
          const active = tier === i;
          return (
            <div
              key={t.label}
              className="flex-1 px-2.5 py-2 rounded-[8px] text-center transition-all duration-150"
              style={{
                background: active ? tint : 'var(--bg-tint)',
                outline: active ? `1.5px solid ${color}` : '1.5px solid transparent',
              }}
            >
              <p
                className="m-0 text-[9px] font-semibold tracking-[0.08em] uppercase leading-none"
                style={{ color: active ? color : 'var(--muted-soft)' }}
              >
                {t.label}
              </p>
              <p className="m-0 font-mono font-semibold text-[12px] text-ink mt-1">{t.range}</p>
              <p className="m-0 text-[9px] text-muted font-serif italic mt-0.5 leading-[1.3]">
                {t.note}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold tracking-[0.12em] uppercase text-muted mb-2.5">
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
      className="w-full bg-transparent border-0 border-b border-line-strong px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink rounded-none"
    />
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent border-0 border-b border-line-strong px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink rounded-none"
    />
  );
}
