'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useAnimation, PanInfo } from 'framer-motion';
import PageShell from '@/components/PageShell';
import Heatmap from '@/components/Heatmap';
import WeeklyChart from '@/components/WeeklyChart';
import type { Course, Session } from '@/lib/data';
import { formatHM, formatRelativeDate, studyStreakDays, totalSeconds } from '@/lib/utils';
import { usePreferences } from '@/lib/preferences';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useSemester,
  addSessionOptimistic,
  deleteSessionOptimistic,
} from '@/lib/data-hooks';

export default function StatsPage() {
  const router = useRouter();
  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { semester } = useSemester();

  const sessions = useMemo(
    () => rawSessions.filter((s) => isLoggableDuration(s.durationSeconds)),
    [rawSessions],
  );

  const [filter, setFilter] = useState<string>('all');
  const [prefs] = usePreferences();
  const [deletedSession, setDeletedSession] = useState<Session | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) {
      router.replace('/onboarding');
    }
  }, [onboarded, onboardingLoading, onboardingError, router]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  const loading =
    onboardingLoading || onboarded === false || coursesLoading || sessionsLoading;

  async function deleteSession(id: string) {
    const session = rawSessions.find((s) => s.id === id) ?? null;
    try {
      await deleteSessionOptimistic(id);
      if (session) {
        if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
        setDeletedSession(session);
        undoTimerRef.current = window.setTimeout(() => {
          setDeletedSession(null);
          undoTimerRef.current = null;
        }, 7000);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Could not delete that session.');
    }
  }

  async function undoDeleteSession() {
    if (!deletedSession) return;
    const session = deletedSession;
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setDeletedSession(null);
    try {
      await addSessionOptimistic({
        courseId: session.courseId,
        taskId: session.taskId,
        date: session.date,
        durationSeconds: session.durationSeconds,
        note: session.note,
      });
    } catch (error) {
      console.error('Failed to restore session:', error);
      alert('Could not restore that session.');
    }
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
        <div className="animate-pulse opacity-40">
          <div className="h-3 w-32 bg-line rounded mb-2.5" />
          <div className="h-8 w-24 bg-line rounded mb-8" />
          <div className="grid grid-cols-3 gap-2 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] bg-paper border border-line rounded-xl" />
            ))}
          </div>
          <div className="h-48 bg-paper border border-line rounded-[14px] mb-4" />
          <div className="h-32 bg-paper border border-line rounded-[14px]" />
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
            {sessions.slice(0, 12).map((session) => (
              <SessionItem 
                key={session.id} 
                session={session} 
                course={courses.find((c) => c.id === session.courseId)} 
                onDelete={deleteSession} 
              />
            ))}
          </div>
        )}
      </section>

      {deletedSession && (
        <div
          className="fixed inset-x-0 z-50 px-[22px] animate-fade-in"
          style={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center gap-3 rounded-[10px] border border-line bg-paper/95 px-3.5 py-3 backdrop-blur">
              <p className="m-0 flex-1 text-[13px] text-ink-soft">
                Session deleted.
              </p>
              <button
                type="button"
                onClick={undoDeleteSession}
                className="font-serif text-[13px] italic text-ink"
              >
                Undo
              </button>
            </div>
          </div>
        </div>
      )}
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

function EmptyState({ title }: { title: string; text: string }) {
  return (
    <div className="py-12 mb-4 text-center">
      <p className="m-0 font-serif text-[16px] italic text-muted-soft">
        Your history will map itself here...
      </p>
    </div>
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

function SessionItem({ session, course, onDelete }: { session: Session; course?: Course; onDelete: (id: string) => void }) {
  const controls = useAnimation();
  
  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 70;
    if (info.offset.x < -threshold) {
      onDelete(session.id);
    } else {
      controls.start({ x: 0 });
    }
  };

  return (
    <div className="relative overflow-hidden border-b border-line last:border-0 group">
      <div className="absolute inset-0 flex items-center justify-end px-4 z-0 pointer-events-none">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase text-warn opacity-80">
          Delete
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="relative z-10 flex items-start justify-between gap-3 bg-paper py-3.5"
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
            onClick={() => onDelete(session.id)}
            aria-label="Delete session"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-soft opacity-70 transition-opacity hover:text-warn"
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
      </motion.div>
    </div>
  );
}
