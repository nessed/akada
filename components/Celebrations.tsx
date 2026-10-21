'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import HandCheck from '@/components/notebook/HandCheck';
import HandNote from '@/components/notebook/HandNote';
import { useLeaving } from './Leaving';
import {
  useActiveSemester,
  useCourses,
  useSessions,
  useTasks,
  useUserSettings,
} from '@/lib/data-hooks';
import {
  readAchievements,
  recordFingerprint,
  takeNewCelebrations,
  type Celebration,
  type CelebrationKind,
} from '@/lib/celebrations';
import { ringChime } from '@/lib/chime';
import { usePreferences } from '@/lib/preferences';
import { useProgression } from '@/lib/progression/use-progression';
import { useTimerState } from '@/lib/timer-context';
import { isoDate } from '@/lib/utils';

/**
 * A goal met or a line crossed, marked on the page.
 *
 * A rubber stamp comes down with what was reached, scraps of paper in the
 * pastels fall past it, the serif says what it was and the hand writes a
 * line in the margin. It is the one moment in the app that is allowed to be
 * glad out loud, and it is still made of the notebook: paper, ink and a
 * stamp, never a trophy or a burst of glitter.
 *
 * It waits for the clock. Nothing is celebrated while a sitting runs or
 * while its log sheet is open, so the moment lands just after Save, which is
 * when the hours actually join the record.
 */

/** Screens a reader works in. Never the sign-in, onboarding or the documents. */
const APP_ROUTES = ['/dashboard', '/tasks', '/courses', '/notes', '/stats', '/stamps', '/timer', '/settings'];

export default function Celebrations() {
  const pathname = usePathname() ?? '';
  const inApp = APP_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  // The data hooks are only mounted inside the app, so a signed-out page
  // never writes an empty ledger that a first sign-in would then read as a
  // term's worth of new crossings.
  return inApp ? <Watcher /> : null;
}

function Watcher() {
  const [prefs] = usePreferences();
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { settings, isLoading: settingsLoading } = useUserSettings();
  const { semester, isLoading: semesterLoading } = useActiveSemester();
  const { logged } = useProgression();
  const { active, pendingLog } = useTimerState();
  const [showing, setShowing] = useState<Celebration[] | null>(null);

  const loading = sessionsLoading || coursesLoading || tasksLoading || settingsLoading || semesterLoading;
  const busy = Boolean(active || pendingLog);
  const wanted = prefs.celebrations;

  useEffect(() => {
    if (loading || busy || showing || !logged || !semester) return;
    const achieved = readAchievements({
      sessions,
      courses,
      // The same fallback Today draws its day against, for a reader who has
      // never saved a setting.
      dailyGoalHours: settings?.dailyGoalHours ?? 4,
      today: isoDate(),
      termKey: semester.id,
      ladders: logged.ladders,
    });
    const fresh = takeNewCelebrations(achieved, recordFingerprint(sessions, tasks));
    // Switched off, the crossing is still taken, so turning it back on does
    // not bring up everything that happened in between.
    if (fresh.length > 0 && wanted) setShowing(fresh);
  }, [loading, busy, showing, logged, settings, semester, sessions, courses, tasks, wanted]);

  const [shown, leaving] = useLeaving(showing);
  if (!shown) return null;
  return <CelebrationCard items={shown} leaving={leaving} chime={prefs.sessionSound} onClose={() => setShowing(null)} />;
}

/* ── The card ──────────────────────────────────────────────────────────── */

/** The margin line, a few to each kind so the same one does not come every day. */
const NOTES: Record<CelebrationKind, string[]> = {
  day: ['that’s the day', 'go get some air', 'done for today, properly', 'the rest of the day is yours'],
  week: ['the whole week, done', 'take the evening off', 'every hour you said you would'],
  'course-week': ['that one’s covered', 'one less thing this week', 'on top of it'],
  hours: ['a lot of sitting down', 'it adds up', 'one hour at a time'],
  stamp: ['pressed into the record', 'that one stays', 'on the sheet for good'],
};

function pick<T>(list: T[], key: string): T {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
}

const SCRAP_COLORS = ['var(--sage)', 'var(--rose)', 'var(--lav)', 'var(--peach)', 'var(--sky)', 'var(--clay)'];

interface Scrap {
  left: number;
  width: number;
  height: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  clip: string;
}

/** Paper torn small: four corners, none of them quite square. */
function tornCorners(): string {
  const r = () => Math.round(Math.random() * 18);
  return `polygon(${r()}% 0%, 100% ${r()}%, ${100 - r()}% 100%, 0% ${100 - r()}%)`;
}

function useScraps(lead: string | undefined): Scrap[] {
  return useMemo(() => {
    const colors = lead ? [lead, lead, ...SCRAP_COLORS] : SCRAP_COLORS;
    return Array.from({ length: 44 }, () => ({
      left: Math.random() * 100,
      width: 6 + Math.random() * 6,
      height: 9 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.7,
      duration: 2.6 + Math.random() * 1.8,
      drift: (Math.random() - 0.5) * 160,
      spin: (Math.random() - 0.5) * 900,
      clip: tornCorners(),
    }));
  }, [lead]);
}

function CelebrationCard({
  items,
  leaving,
  chime,
  onClose,
}: {
  items: Celebration[];
  leaving: boolean;
  chime: boolean;
  onClose: () => void;
}) {
  const lead = items[0];
  const rest = items.slice(1);
  const scraps = useScraps(lead.color);
  const button = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Rung on arrival, under the same switch as the timer's chime: it is the
    // other sound in the app with something to announce.
    if (chime) ringChime('cheer');
    button.current?.focus();
    // Once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ink = lead.color ?? 'var(--warn)';

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center p-4 ${
        leaving ? 'sheet-leaving' : 'animate-fade-in'
      }`}
      onClick={onClose}
    >
      <div aria-hidden className="scrim absolute inset-0" />

      <div aria-hidden className="celebration-scraps pointer-events-none absolute inset-0 overflow-hidden">
        {scraps.map((s, i) => (
          <span
            key={i}
            className="scrap-fall absolute top-0 block"
            style={
              {
                left: `${s.left}%`,
                width: s.width,
                height: s.height,
                background: s.color,
                clipPath: s.clip,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.duration}s`,
                '--drift': `${s.drift}px`,
                '--spin': `${s.spin}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[380px] rounded-[14px] border border-line bg-paper px-7 pb-6 pt-8 text-center shadow-[0_18px_50px_-20px_rgba(0,0,0,0.45)]"
      >
        {/* The stamp, in the course's colour when the thing was one course's,
            otherwise the warm clay every new record on Stats is stamped in. */}
        <div className="flex justify-center">
          <span
            className="stamp-down inline-block rounded-[6px] px-4 py-2 font-mono text-[15px] font-semibold uppercase tracking-[0.2em]"
            style={{
              color: ink,
              border: `2.5px solid ${ink}`,
              boxShadow: `inset 0 0 0 2px var(--paper), inset 0 0 0 3.5px ${ink}`,
            }}
          >
            {lead.stamp}
          </span>
        </div>

        <h2
          id="celebration-title"
          className="m-0 mt-5 font-serif text-[26px] font-medium leading-[1.15] tracking-[-0.015em] text-ink"
        >
          {lead.title}
        </h2>
        <p className="m-0 mt-1.5 font-serif text-[14px] italic text-muted">{lead.detail}</p>

        <p className="m-0 mt-3">
          <HandNote size={21} rotate={-2.5} color="var(--ink-soft)">
            {pick(NOTES[lead.kind], lead.key)}
          </HandNote>
        </p>

        {rest.length > 0 && (
          <ul className="m-0 mx-auto mt-5 max-w-[300px] list-none space-y-1.5 border-t border-line-soft p-0 pt-4 text-left">
            {rest.map((c) => (
              <li key={c.key} className="flex items-baseline gap-2.5">
                <span className="shrink-0 translate-y-[2px]">
                  <HandCheck size={13} color={c.color ?? 'var(--ink-soft)'} strokeWidth={1.8} />
                </span>
                <span className="font-serif text-[13.5px] leading-[1.4] text-ink-soft">
                  {c.title} <span className="italic text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <button
          ref={button}
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-[10px] bg-primary py-3 text-sm font-medium text-primary-contrast"
        >
          Back to it
        </button>
      </div>
    </div>
  );
}
