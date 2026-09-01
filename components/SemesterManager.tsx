'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Course, Semester } from '@/lib/data';
import { db } from '@/lib/data';
import { useSemesters, createSemesterOptimistic, deleteSemesterOptimistic } from '@/lib/data-hooks';
import { formatHM, seasonLabel, totalSeconds } from '@/lib/utils';
import { cleanText, isIsoDate } from '@/lib/planner-safety';
import LoadingIndicator, { ButtonSpinner } from './LoadingIndicator';
import ConfirmSheet from './ConfirmSheet';
import DatePicker from './DatePicker';
import BackButton from './BackButton';
import HandCheck from './notebook/HandCheck';

/**
 * Settings → Semester. The active semester is what Dashboard, Tasks and
 * Timer write into; "Start new semester" switches that pointer, so the
 * courses you add right after belong to the new term instead of piling into
 * the old one. Past semesters stay reachable here, read-only — tap one to
 * see what was in it without risking logging today's session into it by
 * mistake.
 */
export default function SemesterManager({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { semesters, isLoading } = useSemesters();
  const [starting, setStarting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // The semester waiting on its typed confirmation.
  const [pendingDelete, setPendingDelete] = useState<Semester | null>(null);
  const [error, setError] = useState('');

  const active = semesters.find((s) => s.isActive) ?? null;
  const past = semesters.filter((s) => !s.isActive);

  async function deleteSemester(semester: Semester) {
    setError('');
    setDeletingId(semester.id);
    try {
      await deleteSemesterOptimistic(semester.id);
      setViewingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That semester is still here.');
    } finally {
      setDeletingId(null);
      setPendingDelete(null);
    }
  }

  if (viewingId) {
    const semester = semesters.find((s) => s.id === viewingId);
    if (semester) {
      return (
        <SemesterArchive
          semester={semester}
          onBack={() => setViewingId(null)}
          onDelete={() => setPendingDelete(semester)}
          deleting={deletingId === semester.id}
        />
      );
    }
  }

  if (starting) {
    return (
      <StartSemesterForm
        onCancel={() => setStarting(false)}
        onStarted={() => router.push('/onboarding?newSemester=1')}
      />
    );
  }

  return (
    <div className="px-[22px] pt-5 pb-10 app-scroll animate-fade-in">
      <ConfirmSheet
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete ${pendingDelete.label}?` : ''}
        body="Its courses, tasks and study sessions go with it."
        confirmLabel="Delete"
        requirePhrase="delete this semester"
        busy={deletingId !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteSemester(pendingDelete);
        }}
      />

      <BackButton onClick={onBack} />
      <h3 className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
        Semester
      </h3>
      <p className="mt-1.5 mb-0 font-serif text-[13px] italic text-muted">
        Where this term&apos;s work is kept.
      </p>

      <div className="mt-5">
        <p className="eyebrow ml-1 mb-2 text-muted">
          Active
        </p>
        {active ? (
          <div className="rounded-xl border border-line bg-paper px-4 py-3.5">
            <p className="m-0 font-serif text-[16px] font-medium text-ink">{active.label}</p>
            <p className="mt-0.5 mb-0 text-[12px] text-muted">
              {active.startDate && active.endDate
                ? `${active.startDate} → ${active.endDate}`
                : 'No dates set'}
            </p>
          </div>
        ) : (
          !isLoading && (
            <p className="font-serif text-[13px] italic text-muted-soft">Not started yet.</p>
          )
        )}
      </div>

      <button
        type="button"
        onClick={() => setStarting(true)}
        className="mt-4 w-full min-h-[52px] rounded-2xl bg-primary text-primary-contrast text-[14px] font-medium tracking-[0.01em]"
      >
        Start new semester
      </button>
      <p className="mt-2.5 mb-0 text-center font-serif text-[12px] italic text-muted-soft">
        This term&apos;s pages stay where they are.
      </p>

      {active && (
        <button
          type="button"
          onClick={() => setPendingDelete(active)}
          disabled={deletingId === active.id}
          className="mt-4 w-full min-h-[44px] rounded-xl border border-priority/30 text-[13px] font-medium text-priority disabled:opacity-40"
        >
          {deletingId === active.id ? 'Deleting semester…' : 'Delete active semester'}
        </button>
      )}

      {error && <p className="mt-3 text-[13px] text-priority font-serif italic">{error}</p>}

      {past.length > 0 && (
        <div className="mt-6">
          <p className="eyebrow ml-1 mb-2 text-muted">
            Past semesters
          </p>
          <div className="overflow-hidden rounded-xl border border-line bg-paper">
            {past.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setViewingId(s.id)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 bg-transparent text-left cursor-pointer ${
                  i < past.length - 1 ? 'border-b border-line' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="m-0 text-sm font-medium text-ink">{s.label}</p>
                  {s.startDate && s.endDate && (
                    <p className="mt-0.5 mb-0 text-[11px] text-muted">
                      {s.startDate} → {s.endDate}
                    </p>
                  )}
                </div>
                <span className="text-muted-soft shrink-0" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M9 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StartSemesterForm({
  onCancel,
  onStarted,
}: {
  onCancel: () => void;
  onStarted: () => void;
}) {
  const presets = semesterPresets();
  const suggestedPreset = presets.find((preset) => preset.label === seasonLabel()) ?? presets[0];
  const [label, setLabel] = useState(() => suggestedPreset.label);
  const [addDates, setAddDates] = useState(true);
  const [startDate, setStartDate] = useState(() => suggestedPreset.startDate);
  const [endDate, setEndDate] = useState(() => suggestedPreset.endDate);
  const [selectedPreset, setSelectedPreset] = useState(() => suggestedPreset.label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const datesValid =
    !addDates ||
    (!startDate && !endDate) ||
    (isIsoDate(startDate) && isIsoDate(endDate) && endDate >= startDate);

  async function start() {
    setError('');
    if (!cleanText(label, 60)) {
      setError('Give this semester a name.');
      return;
    }
    if (!datesValid) {
      setError('End date must be on or after the start date.');
      return;
    }
    setSaving(true);
    try {
      await createSemesterOptimistic({
        label,
        startDate: addDates && startDate ? startDate : null,
        endDate: addDates && endDate ? endDate : null,
      });
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new semester.');
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(preset: SemesterPreset) {
    setSelectedPreset(preset.label);
    setLabel(preset.label);
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
    setAddDates(true);
    setError('');
  }

  return (
    <div className="px-[22px] pt-5 pb-10 app-scroll animate-fade-in">
      <BackButton onClick={onCancel} />
      <h3 className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
        Start new semester
      </h3>
      <p className="mt-1.5 mb-0 font-serif text-[13px] italic text-muted">
        A fresh page. Nothing before it is touched.
      </p>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow m-0 text-muted">
            Term presets
          </p>
        </div>
        <div className="mt-2.5 grid gap-2">
          {presets.map((preset) => {
            const selected = selectedPreset === preset.label;
            const suggested = preset.label === suggestedPreset.label;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                aria-pressed={selected}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                  selected
                    ? 'border-primary bg-primary/10 text-ink'
                    : 'border-line bg-paper text-ink-soft hover:border-line-strong'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">
                    {preset.label}
                    {suggested && <span className="ml-1.5 font-serif italic text-[11px] text-primary">recommended</span>}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">{preset.range}</span>
                </span>
                {selected && (
                  <span className="text-primary" aria-label="Selected">
                    <HandCheck size={13} color="var(--primary)" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <label className="eyebrow block text-muted mb-2">
          Name
        </label>
        <input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setSelectedPreset('');
          }}
          placeholder="Fall 2026"
          className="w-full bg-transparent border-0 border-b border-line-strong rounded-none px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary transition-colors placeholder:text-muted-soft"
        />
      </div>

      {!addDates ? (
        <button
          type="button"
          onClick={() => setAddDates(true)}
          className="mt-4 text-[13px] text-ink font-serif italic underline underline-offset-4 decoration-line-strong"
        >
          + Add dates (optional)
        </button>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="eyebrow block text-muted mb-2">
                Start
              </label>
              <DatePicker
                value={startDate}
                allowClear={false}
                placeholder="Start"
                onChange={(next) => {
                  setStartDate(next);
                  setSelectedPreset('');
                }}
              />
            </div>
            <div>
              <label className="eyebrow block text-muted mb-2">
                End
              </label>
              <DatePicker
                value={endDate}
                allowClear={false}
                placeholder="End"
                onChange={(next) => {
                  setEndDate(next);
                  setSelectedPreset('');
                }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAddDates(false)}
            className="mt-3 text-[12px] font-serif italic text-muted underline underline-offset-4 decoration-line-strong"
          >
            Remove dates
          </button>
        </>
      )}

      {error && (
        <p className="mt-3 text-[13px] text-priority font-serif italic">{error}</p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 min-h-[52px] rounded-2xl border border-line-strong text-[14px] font-medium text-ink-soft"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={start}
          disabled={saving}
          className="flex-1 min-h-[52px] rounded-2xl bg-primary text-primary-contrast text-[14px] font-medium tracking-[0.01em] disabled:opacity-40"
        >
          {saving ? <span className="flex items-center justify-center gap-2.5"><ButtonSpinner />Starting semester…</span> : 'Start semester'}
        </button>
      </div>
    </div>
  );
}

interface SemesterPreset {
  label: string;
  range: string;
  startDate: string;
  endDate: string;
}

function semesterPresets(today = new Date()): SemesterPreset[] {
  const year = today.getFullYear();
  return [
    {
      label: `Spring ${year}`,
      range: 'Jan 19 – May 20',
      startDate: `${year}-01-19`,
      endDate: `${year}-05-20`,
    },
    {
      label: `Summer ${year}`,
      range: 'Jun 1 – Aug 13',
      startDate: `${year}-06-01`,
      endDate: `${year}-08-13`,
    },
    {
      label: `Fall ${year}`,
      range: 'Aug 31 – Dec 18',
      startDate: `${year}-08-31`,
      endDate: `${year}-12-18`,
    },
  ];
}

function SemesterArchive({
  semester,
  onBack,
  onDelete,
  deleting,
}: {
  semester: Semester;
  onBack: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setCourses(null);
    setTotalHours(null);
    setError('');
    Promise.all([
      db.getCoursesForSemester(semester.id),
      db.getSessionsForSemester(semester.id),
    ])
      .then(([loadedCourses, sessions]) => {
        if (!active) return;
        setCourses(loadedCourses);
        setTotalHours(totalSeconds(sessions) / 3600);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Could not load that semester.');
      });
    return () => {
      active = false;
    };
  }, [semester.id]);

  return (
    <div className="px-[22px] pt-5 pb-10 app-scroll animate-fade-in">
      <BackButton onClick={onBack} />
      <h3 className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
        {semester.label}
      </h3>
      <p className="mt-1.5 mb-0 text-[13px] text-muted leading-[1.5]">
        {semester.startDate && semester.endDate
          ? `${semester.startDate} → ${semester.endDate}`
          : 'No dates kept for this term.'}
      </p>

      {error && (
        <p className="mt-4 text-[13px] text-priority font-serif italic">{error}</p>
      )}

      {courses === null && !error ? (
        <div className="mt-5">
          <LoadingIndicator compact label="Opening semester archive" className="mb-4" />
          <div className="animate-pulse opacity-40" aria-hidden>
            <div className="h-16 bg-paper border border-line rounded-xl mb-2" />
            <div className="h-16 bg-paper border border-line rounded-xl" />
          </div>
        </div>
      ) : (
        courses && (
          <>
            <div className="mt-5 rounded-xl border border-line bg-paper px-4 py-3.5">
              <p className="eyebrow m-0 text-muted">
                Total logged
              </p>
              <p className="mt-1 mb-0 font-mono font-semibold text-[22px] text-ink">
                {formatHM(Math.round((totalHours ?? 0) * 3600))}
              </p>
            </div>

            <p className="eyebrow mt-5 ml-1 mb-2 text-muted">
              Courses
            </p>
            {courses.length === 0 ? (
              <p className="font-serif text-[13px] italic text-muted-soft">
                This term was left blank.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line bg-paper">
                {courses.map((c, i) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 px-4 py-3.5 ${
                      i < courses.length - 1 ? 'border-b border-line' : ''
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: c.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow m-0 text-muted">
                        {c.code}
                      </p>
                      <p className="mt-0.5 mb-0 text-sm font-medium text-ink truncate">
                        {c.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="mt-6 w-full min-h-[44px] rounded-xl border border-priority/30 text-[13px] font-medium text-priority disabled:opacity-40"
            >
              {deleting ? 'Deleting semester…' : 'Delete this semester'}
            </button>
          </>
        )
      )}
    </div>
  );
}

