'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useNotice } from '@/components/Notice';
import SwipeRow from '@/components/SwipeRow';
import LoadingIndicator from '@/components/LoadingIndicator';
import Heatmap from '@/components/Heatmap';
import WeeklyChart from '@/components/WeeklyChart';
import type { Course, Session } from '@/lib/data';
import { formatHM, formatRelativeDate, studyStreakDays, totalSeconds } from '@/lib/utils';
import { usePreferences } from '@/lib/preferences';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import Stamp from '@/components/notebook/Stamp';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useActiveSemester,
  addSessionOptimistic,
  deleteSessionOptimistic,
} from '@/lib/data-hooks';

export default function StatsPage() {
  const { notify } = useNotice();
  const router = useRouter();
  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { semester } = useActiveSemester();

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
      notify('That session is still here. It did not delete.');
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
      notify('That session did not come back.');
    }
  }

  const filteredSessions = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((s) => s.courseId === filter)),
    [sessions, filter]
  );

  const accent =
    filter === 'all'
      ? 'var(--primary)'
      : courses.find((c) => c.id === filter)?.color || 'var(--ink)';

  const totals = useMemo(() => {
    return courses.map((c) => {
      const cs = sessions.filter((s) => s.courseId === c.id);
      const sec = totalSeconds(cs);
      const weeksObserved = semester?.startDate
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

  // Editorial computed bits, the Vol./Issue mark, totals, and "best day"
  // headline that the redesigned stats page leans on.
  const semesterLabel = useMemo(() => {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const year = String(now.getFullYear()).slice(-2);
    const seasonName = month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall';
    return `${seasonName} '${year}`;
  }, []);

  const semesterWeekMark = useMemo(() => {
    if (!semester?.startDate || !semester?.endDate) return null;
    const start = new Date(semester.startDate + 'T00:00:00').getTime();
    const end = new Date(semester.endDate + 'T00:00:00').getTime();
    const now = Date.now();
    const totalWeeks = Math.max(1, Math.ceil((end - start) / 86400000 / 7));
    const elapsedDays = Math.max(0, (now - start) / 86400000);
    const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil(elapsedDays / 7)));
    return { current: currentWeek, total: totalWeeks };
  }, [semester]);

  const totalHrs = totalSec / 3600;
  const totalWhole = Math.floor(totalHrs);
  const totalDecimal = `.${Math.round((totalHrs - totalWhole) * 10)}`;

  // Best day of week, name + duration. Read out in the ledger line.
  const bestDay = useMemo(() => {
    const byDow: Record<number, number> = {};
    for (const s of sessions) {
      const d = new Date(s.date + 'T00:00:00').getDay();
      byDow[d] = (byDow[d] || 0) + clampSessionSeconds(s.durationSeconds);
    }
    let bestDow = -1;
    let bestSec = 0;
    for (const [dow, sec] of Object.entries(byDow)) {
      if (sec > bestSec) {
        bestSec = sec;
        bestDow = Number(dow);
      }
    }
    if (bestDow === -1) return null;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { day: dayNames[bestDow], duration: formatHM(bestSec) };
  }, [sessions]);

  if (loading) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Compiling your semester" className="mb-6" />
        <div className="animate-pulse opacity-40" aria-hidden>
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
      {/* Vol. III editorial header */}
      <header className="mb-[18px]">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow m-0 text-muted">
            Vol. III · {semesterLabel}
          </p>
          {semesterWeekMark && (
            <Stamp>
              Wk {semesterWeekMark.current} / {semesterWeekMark.total}
            </Stamp>
          )}
        </div>
        <h1 className="mt-3 mb-0 font-serif font-medium text-[52px] tracking-[-0.035em] leading-[0.95]">
          The <span className="italic">Semester</span>
          <br />
          so far<span className="text-peach">.</span>
        </h1>
        <div className="mt-3.5 flex items-center gap-2.5">
          <span className="flex-1 h-px bg-ink" />
          <span className="font-serif italic text-[12px] text-muted">compiled by Akada</span>
          <span className="flex-1 h-px bg-ink" />
        </div>
      </header>

      {/* Hero number, total hours logged, big mono with a hand-note nudge */}
      <section className="relative mb-5 mt-2">
        <HandNote
          color="var(--peach)"
          size={18}
          rotate={-6}
          style={{ position: 'absolute', top: -2, right: 6 }}
        >
          {streak >= 7 ? '↑ on a roll' : streak >= 3 ? `${streak}-day streak` : '→ keep going'}
        </HandNote>
        <div className="flex items-baseline gap-3">
          <span className="font-mono font-semibold tabular-nums text-[80px] leading-[0.9] tracking-[-0.04em] text-ink">
            {totalWhole}
            <span className="text-muted-soft">{totalDecimal}</span>
          </span>
          <div className="pb-2.5">
            <span className="font-serif italic text-[22px] text-ink-soft">hours</span>
            <p className="m-0 mt-0.5 text-[12px] text-muted">logged this semester</p>
          </div>
        </div>
      </section>

      {/* The term so far, as a line in a ledger under a newspaper rule. */}
      <div
        className="mb-4 py-3.5"
        style={{
          borderTop: '1.5px solid var(--ink)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <p className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 font-serif text-[13px] italic text-muted">
          <span>
            <Figure>{streak}</Figure> day{streak === 1 ? '' : 's'} running
          </span>
          {avgPerDay > 0 && (
            <span>
              <Figure>{formatHM(avgPerDay)}</Figure> a day
            </span>
          )}
          {bestDay && (
            <span>
              best on <Figure>{bestDay.day}</Figure>, {bestDay.duration}
            </span>
          )}
        </p>
      </div>

      {sessions.length === 0 && (
        <EmptyState text="Your history will map itself here..." />
      )}

      {/* Heatmap */}
      <section className="deckle bg-paper border border-line py-5 px-[22px] mb-4">
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

      {/* Weekly bars, deckle card */}
      <section className="deckle bg-paper border border-line py-5 px-[22px] mb-4">
        <h2 className="m-0 mb-[18px] font-serif font-medium text-[20px]">This week</h2>
        <WeeklyChart sessions={sessions} courses={courses} />
      </section>

      {/* Totals, deckle card with hand-drawn trend arrows */}
      <section className="deckle bg-paper border border-line px-[22px]">
        <h2 className="my-4 font-serif font-medium text-[20px]">Hours by course</h2>
        <div>
          {totals.length === 0 && (
            <p className="mt-0 mb-5 text-[13px] text-muted font-serif italic">
              Nothing to weigh up yet...
            </p>
          )}
          {totals.map(({ course, totalHours, avg }) => {
            // Quick trend: compare last 7 days vs the 7 before that
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const eightDaysAgo = new Date(today);
            eightDaysAgo.setDate(today.getDate() - 7);
            const fifteenDaysAgo = new Date(today);
            fifteenDaysAgo.setDate(today.getDate() - 14);
            let recentSec = 0;
            let priorSec = 0;
            for (const s of sessions) {
              if (s.courseId !== course.id) continue;
              const d = new Date(s.date + 'T00:00:00');
              if (d >= eightDaysAgo) recentSec += clampSessionSeconds(s.durationSeconds);
              else if (d >= fifteenDaysAgo) priorSec += clampSessionSeconds(s.durationSeconds);
            }
            const trend: 'up' | 'flat' | 'down' =
              recentSec > priorSec * 1.1
                ? 'up'
                : recentSec < priorSec * 0.9
                  ? 'down'
                  : 'flat';
            const trendChar = trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→';
            const trendColor =
              trend === 'up'
                ? 'var(--sage)'
                : trend === 'down'
                  ? 'var(--rose)'
                  : 'var(--muted-soft)';
            return (
              <div
                key={course.id}
                className="flex items-center justify-between py-3.5 border-b border-dashed border-line last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: course.color }}
                  />
                  <div className="min-w-0">
                    <p
                      className="eyebrow m-0"
                      style={{ color: course.color }}
                    >
                      {course.code}
                    </p>
                    <p className="mt-0.5 mb-0 font-serif font-medium text-[15px]">
                      {course.name}
                    </p>
                    {totalHours > 0 && (
                      <div className="mt-2 h-[3px] rounded-full bg-bg-tint overflow-hidden max-w-[140px]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (totalHours / 30) * 100)}%`,
                            background: course.color,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 pl-3">
                  {totalHours > 0 ? (
                    <>
                      <p className="m-0 font-mono font-semibold text-[18px] tabular-nums leading-none tracking-[-0.02em]">
                        {totalHours.toFixed(1)}
                        <span className="text-muted font-sans font-normal text-[11px] ml-[3px]">
                          h
                        </span>
                      </p>
                      <p className="mt-1 mb-0 text-[10.5px] text-muted italic font-serif">
                        {avg.toFixed(1)} h/wk
                        <span className="ml-1.5" style={{ color: trendColor }}>
                          {trendChar}
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="m-0 text-[12px] text-muted-soft italic font-serif">
                      No sessions yet
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Marks & milestones, semester-shaped achievements */}
      {sessions.length > 0 && (
        <section className="mt-4">
          <h2 className="m-0 mb-3 font-serif font-medium text-[20px]">
            Marks &amp; milestones
          </h2>
          <div className="deckle bg-paper border border-line px-[22px] py-2">
            {(() => {
              const totalHours = totalSec / 3600;
              const dayCountAll = new Set(sessions.map((s) => s.date)).size;
              const items = [
                {
                  label: 'First 10-hour week',
                  achieved: streak >= 5 || totalHours >= 10,
                  color: 'var(--sage)',
                },
                {
                  label: '7-day streak',
                  achieved: streak >= 7,
                  detail: streak > 0 ? `currently ${streak}d` : undefined,
                  color: 'var(--peach)',
                },
                {
                  label: 'Reach 100 hours this semester',
                  achieved: totalHours >= 100,
                  detail:
                    totalHours < 100
                      ? `${(100 - totalHours).toFixed(1)} to go`
                      : undefined,
                  color: 'var(--lav)',
                },
                {
                  label: '20 study days logged',
                  achieved: dayCountAll >= 20,
                  detail:
                    dayCountAll < 20 ? `${20 - dayCountAll} to go` : undefined,
                  color: 'var(--rose)',
                },
              ];
              return items.map((m, i, arr) => (
                <div
                  key={m.label}
                  className="flex items-start gap-3 py-3"
                  style={{
                    borderBottom: i < arr.length - 1 ? '1px dashed var(--line)' : 'none',
                  }}
                >
                  <div
                    className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center"
                    style={{
                      background: m.achieved ? m.color : 'transparent',
                      border: m.achieved ? 'none' : `1.5px dashed ${m.color}`,
                      color: m.achieved ? 'var(--ink)' : m.color,
                    }}
                  >
                    {m.achieved ? (
                      <HandCheck size={14} color="var(--ink)" />
                    ) : (
                      <svg width="9" height="9" viewBox="0 0 12 12">
                        <circle cx="6" cy="6" r="2.5" fill="currentColor" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p
                      className="m-0 text-[13.5px] leading-[1.4]"
                      style={{ color: m.achieved ? 'var(--ink)' : 'var(--muted)' }}
                    >
                      {m.label}
                      {m.detail && (
                        <span className="ml-2 font-serif italic text-[11.5px] text-muted-soft">
                          ({m.detail})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>
      )}

      <section className="mt-4 deckle bg-paper border border-line px-[22px]">
        <h2 className="my-4 font-serif font-medium text-[20px]">Session history</h2>
        {sessions.length === 0 ? (
          <p className="mt-0 mb-5 text-[13px] text-muted font-serif italic">
            Nothing logged yet. The ledger starts with the first session.
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

      {/* Editorial footer, closes the issue */}
      {semester?.endDate && (
        <p
          className="mt-8 text-center text-[12px] text-muted-soft font-serif italic pt-4"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          End of issue ·{' '}
          {(() => {
            const end = new Date(semester.endDate + 'T00:00:00').getTime();
            const days = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
            return `${days} day${days === 1 ? '' : 's'} remain${days === 1 ? 's' : ''} in the term`;
          })()}
          .
        </p>
      )}

      {deletedSession && (
        <div
          className="fixed inset-x-0 z-50 px-[var(--density-gutter)] md:px-8 animate-fade-in"
          style={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-2xl md:max-w-3xl">
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

/** A number inside a sentence: mono, upright, the app's ink. */
function Figure({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[15px] font-semibold not-italic text-ink tabular-nums">
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-12 mb-4 text-center">
      <p className="m-0 font-serif text-[16px] italic text-muted-soft">{text}</p>
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
      className={`shrink-0 bg-transparent px-0.5 py-1 font-serif text-[14px] transition-colors ${
        active ? 'hl-swipe text-ink' : 'text-muted-soft hover:text-ink-soft'
      }`}
      style={
        active
          ? ({ '--hl': tint || 'var(--highlight-yellow)' } as React.CSSProperties)
          : undefined
      }
    >
      {label}
    </button>
  );
}

function SessionItem({ session, course, onDelete }: { session: Session; course?: Course; onDelete: (id: string) => void }) {
  return (
    <SwipeRow
      className="border-b border-line last:border-0"
      onDelete={() => onDelete(session.id)}
      surfaceClassName="flex items-start justify-between gap-3 bg-paper py-3.5"
    >
      <>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: course?.color || 'var(--muted)' }}
            />
            <p className="eyebrow m-0 text-muted">
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
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-soft opacity-70 transition-opacity hover:text-priority"
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
      </>
    </SwipeRow>
  );
}
