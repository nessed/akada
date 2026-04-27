'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import Heatmap from '@/components/Heatmap';
import WeeklyChart from '@/components/WeeklyChart';
import { db } from '@/lib/data';
import type { Course, Semester, Session } from '@/lib/data';
import { formatHM, formatRelativeDate, studyStreakDays, totalSeconds } from '@/lib/utils';
import { usePreferences } from '@/lib/preferences';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';

export default function StatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [prefs] = usePreferences();

  useEffect(() => {
    (async () => {
      const onboarded = await db.isOnboardingComplete();
      if (!onboarded) {
        router.replace('/onboarding');
        return;
      }
      await refresh();
      setLoading(false);
    })();
  }, [router]);

  async function refresh() {
    const [c, s, sem] = await Promise.all([
      db.getCourses(),
      db.getSessions(),
      db.getSemester(),
    ]);
    setCourses(c);
    setSessions(s.filter((session) => isLoggableDuration(session.durationSeconds)));
    setSemester(sem);
  }

  async function deleteSession(id: string) {
    await db.deleteSession(id);
    refresh();
  }

  const filteredSessions = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((s) => s.courseId === filter)),
    [sessions, filter]
  );

  const accent =
    filter === 'all'
      ? '#1A1915'
      : courses.find((c) => c.id === filter)?.color || '#1A1915';

  const totals = useMemo(() => {
    return courses.map((c) => {
      const cs = sessions.filter((s) => s.courseId === c.id);
      const sec = totalSeconds(cs);
      const weeksObserved = semester
        ? Math.max(
            1,
            Math.ceil(
              (Date.now() - new Date(semester.startDate + 'T00:00:00').getTime()) /
                86400000 /
                7
            )
          )
        : 5;
      return {
        course: c,
        totalHours: sec / 3600,
        avg: sec / 3600 / weeksObserved,
      };
    });
  }, [courses, sessions, semester]);

  const totalSec = totalSeconds(sessions);
  const dayCount = new Set(sessions.map((s) => s.date)).size;
  const avgPerDay = dayCount ? totalSec / dayCount : 0;
  const streak = studyStreakDays(sessions);

  if (loading) {
    return (
      <PageShell>
        <div className="pt-20 text-center text-muted-soft text-sm font-serif italic">
          Loading…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="mb-[22px]">
        <p className="m-0 text-[11px] tracking-[0.18em] uppercase text-muted font-semibold">
          The semester so far
        </p>
        <h1 className="mt-1.5 mb-0 font-serif font-medium text-[32px] tracking-[-0.02em] leading-[1.1]">
          Stats
        </h1>
      </header>

      <div className="mb-[18px] grid grid-cols-3 gap-2">
        <Kpi label="Total" value={(totalSec / 3600).toFixed(1)} unit="h" />
        <Kpi label="Streak" value={streak.toString()} unit="d" />
        <Kpi label="Avg / day" value={(avgPerDay / 60).toFixed(0)} unit="m" />
      </div>

      {sessions.length === 0 && (
        <EmptyState
          title="No sessions logged"
          text="Start a timer from a course or task to begin building your study history."
        />
      )}

      {/* Heatmap */}
      <section className="bg-paper rounded-[14px] border border-line py-5 px-[22px] mb-4">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="m-0 font-serif font-medium text-[17px]">Activity</h2>
          <div className="flex gap-1 overflow-x-auto app-scroll">
            <FilterChip
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label="All"
            />
            {courses.map((c) => (
              <FilterChip
                key={c.id}
                active={filter === c.id}
                onClick={() => setFilter(c.id)}
                label={c.code}
                color={c.color}
                tint={c.tint}
              />
            ))}
          </div>
        </div>
        <div className="overflow-x-auto app-scroll">
          <Heatmap
            sessions={filteredSessions}
            accent={accent}
            weeks={13}
            hideWeekends={prefs.hideWeekends}
          />
        </div>
        <div className="flex items-center gap-2 mt-3.5">
          <span className="text-[10px] text-muted italic font-serif">less</span>
          {[0.1, 0.3, 0.55, 0.8, 1].map((o) => (
            <span
              key={o}
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: accent,
                opacity: o,
              }}
            />
          ))}
          <span className="text-[10px] text-muted italic font-serif">more</span>
        </div>
      </section>

      {/* Weekly bars */}
      <section className="bg-paper rounded-[14px] border border-line py-5 px-[22px] mb-4">
        <h2 className="m-0 mb-[18px] font-serif font-medium text-[17px]">This week</h2>
        <WeeklyChart sessions={sessions} courses={courses} />
      </section>

      {/* Totals */}
      <section className="bg-paper rounded-[14px] border border-line px-[22px]">
        <h2 className="my-4 font-serif font-medium text-[17px]">Hours by course</h2>
        <div>
          {totals.map(({ course, totalHours, avg }) => (
            <div
              key={course.id}
              className="flex items-center justify-between py-3.5 border-b border-line last:border-0"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: course.color }}
                />
                <div>
                  <p
                    className="m-0 text-[10px] font-semibold tracking-[0.14em] uppercase"
                    style={{ color: course.color }}
                  >
                    {course.code}
                  </p>
                  <p className="mt-0.5 mb-0 font-serif font-medium text-[15px]">
                    {course.name}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="m-0 font-mono font-semibold text-[15px] tabular-nums">
                  {totalHours.toFixed(1)}
                  <span className="text-muted font-sans font-normal text-[11px] ml-[3px]">
                    h
                  </span>
                </p>
                <p className="mt-0.5 mb-0 text-[10px] text-muted italic font-serif">
                  {avg.toFixed(1)} h/wk avg
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 bg-paper rounded-[14px] border border-line px-[22px]">
        <h2 className="my-4 font-serif font-medium text-[17px]">Session history</h2>
        {sessions.length === 0 ? (
          <p className="mt-0 mb-5 text-[13px] text-muted font-serif italic">
            Your logged study sessions will appear here.
          </p>
        ) : (
          <div>
            {sessions.slice(0, 12).map((session) => {
              const course = courses.find((c) => c.id === session.courseId);
              return (
                <div
                  key={session.id}
                  className="group flex items-start justify-between gap-3 border-b border-line py-3.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: course?.color || 'var(--muted)' }}
                      />
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {course?.code || 'Course'} · {formatRelativeDate(session.date)}
                      </p>
                    </div>
                    <p className="mt-1 mb-0 font-serif text-[15px] font-medium text-ink">
                      {course?.name || 'Study session'}
                    </p>
                    {session.note && (
                      <p className="mt-1 mb-0 text-[12px] leading-[1.45] text-ink-soft">
                        {session.note}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-ink tabular-nums">
                      {formatHM(clampSessionSeconds(session.durationSeconds))}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteSession(session.id)}
                      aria-label="Delete session"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-soft opacity-0 transition-opacity hover:text-warn group-hover:opacity-100"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function Kpi({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-3.5 py-3.5">
      <p className="m-0 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-1.5 mb-0 font-mono text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
        {value}
        <span className="ml-[3px] text-[11px] font-medium text-muted">{unit}</span>
      </p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section className="mb-4 rounded-[14px] border border-dashed border-line-strong bg-paper px-5 py-7 text-center">
      <h2 className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em]">
        {title}
      </h2>
      <p className="mx-auto mt-2 mb-0 max-w-[280px] text-[13px] leading-[1.55] text-muted">
        {text}
      </p>
    </section>
  );
}

interface ChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
  tint?: string;
}

function FilterChip({ active, onClick, label, color, tint }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border inline-flex items-center gap-1.5 transition-colors"
      style={{
        background: active ? (color ? tint || 'var(--bg-tint)' : 'var(--ink)') : 'transparent',
        color: active ? (color ? 'var(--ink)' : 'var(--bg)') : 'var(--muted)',
        borderColor: active ? color || 'var(--ink)' : 'var(--line)',
      }}
    >
      {color && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
    </button>
  );
}
