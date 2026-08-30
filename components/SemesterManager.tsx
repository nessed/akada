'use client';

import { useEffect, useState } from 'react';
import type { Course, Semester } from '@/lib/data';
import { db } from '@/lib/data';
import { useSemesters, createSemesterOptimistic } from '@/lib/data-hooks';
import { formatHM, seasonLabel, totalSeconds } from '@/lib/utils';
import { cleanText, isIsoDate } from '@/lib/planner-safety';

/**
 * Settings → Semester. The active semester is what Dashboard, Tasks and
 * Timer write into; "Start new semester" switches that pointer, so the
 * courses you add right after belong to the new term instead of piling into
 * the old one. Past semesters stay reachable here, read-only — tap one to
 * see what was in it without risking logging today's session into it by
 * mistake.
 */
export default function SemesterManager({ onBack }: { onBack: () => void }) {
  const { semesters, isLoading } = useSemesters();
  const [starting, setStarting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const active = semesters.find((s) => s.isActive) ?? null;
  const past = semesters.filter((s) => !s.isActive);

  if (viewingId) {
    const semester = semesters.find((s) => s.id === viewingId);
    if (semester) {
      return <SemesterArchive semester={semester} onBack={() => setViewingId(null)} />;
    }
  }

  if (starting) {
    return (
      <StartSemesterForm
        onCancel={() => setStarting(false)}
        onStarted={() => setStarting(false)}
      />
    );
  }

  return (
    <div className="px-[22px] pt-5 pb-10 app-scroll animate-fade-in">
      <BackButtonLocal onClick={onBack} />
      <h3 className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
        Semester
      </h3>
      <p className="mt-1.5 mb-0 text-[13px] text-muted leading-[1.5]">
        Courses, tasks and the timer always work in your active semester.
      </p>

      <div className="mt-5">
        <p className="ml-1 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
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
            <p className="text-[13px] text-muted italic font-serif">No active semester yet.</p>
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
      <p className="mt-2 mb-0 text-[11.5px] text-muted-soft leading-[1.5]">
        Your current courses, tasks and sessions stay exactly as they are —
        they just stop being the default view. Find them anytime below.
      </p>

      {past.length > 0 && (
        <div className="mt-6">
          <p className="ml-1 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
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
  const [label, setLabel] = useState(seasonLabel());
  const [addDates, setAddDates] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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

  return (
    <div className="px-[22px] pt-5 pb-10 app-scroll animate-fade-in">
      <BackButtonLocal onClick={onCancel} />
      <h3 className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
        Start new semester
      </h3>
      <p className="mt-1.5 mb-0 text-[13px] text-muted leading-[1.5]">
        This becomes where new courses, tasks and study sessions go. Nothing
        from your current semester is touched.
      </p>

      <div className="mt-5">
        <label className="block text-[10px] font-semibold tracking-[0.16em] uppercase text-muted mb-2">
          Name
        </label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
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
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold tracking-[0.16em] uppercase text-muted mb-2">
              Start
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-line-strong rounded-none px-0.5 py-2.5 text-[14px] text-ink outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold tracking-[0.16em] uppercase text-muted mb-2">
              End
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-line-strong rounded-none px-0.5 py-2.5 text-[14px] text-ink outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>
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
          {saving ? 'Starting…' : 'Start semester'}
        </button>
      </div>
    </div>
  );
}

function SemesterArchive({ semester, onBack }: { semester: Semester; onBack: () => void }) {
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
      <BackButtonLocal onClick={onBack} />
      <h3 className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
        {semester.label}
      </h3>
      <p className="mt-1.5 mb-0 text-[13px] text-muted leading-[1.5]">
        {semester.startDate && semester.endDate
          ? `${semester.startDate} → ${semester.endDate}`
          : 'No dates were set for this semester.'}
      </p>

      {error && (
        <p className="mt-4 text-[13px] text-priority font-serif italic">{error}</p>
      )}

      {courses === null && !error ? (
        <div className="mt-5 animate-pulse opacity-40">
          <div className="h-16 bg-paper border border-line rounded-xl mb-2" />
          <div className="h-16 bg-paper border border-line rounded-xl" />
        </div>
      ) : (
        courses && (
          <>
            <div className="mt-5 rounded-xl border border-line bg-paper px-4 py-3.5">
              <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Total logged
              </p>
              <p className="mt-1 mb-0 font-mono font-semibold text-[22px] text-ink">
                {formatHM(Math.round((totalHours ?? 0) * 3600))}
              </p>
            </div>

            <p className="mt-5 ml-1 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Courses
            </p>
            {courses.length === 0 ? (
              <p className="text-[13px] text-muted italic font-serif">
                No courses were added in this semester.
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
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
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
          </>
        )
      )}
    </div>
  );
}

function BackButtonLocal({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 bg-transparent border-0 p-0 text-[13px] text-muted cursor-pointer"
    >
      ← Back
    </button>
  );
}
