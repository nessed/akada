'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import ConfirmSheet from '@/components/ConfirmSheet';
import AppearanceEditor from '@/components/settings/AppearanceEditor';
import CoursesEditor from '@/components/settings/CoursesEditor';
import BreakLengthPicker from '@/components/settings/BreakLengthPicker';
import DayEndPicker from '@/components/settings/DayEndPicker';
import ProfileEditor from '@/components/settings/ProfileEditor';
import SemesterManager from '@/components/SemesterManager';
import {
  SettingGroup,
  SettingRow,
  SettingToggleRow,
  StatMark,
} from '@/components/settings/SettingsPrimitives';
import { useNotice } from '@/components/Notice';
import { createClient } from '@/lib/supabase';
import { clearClientSessionState } from '@/lib/session-cleanup';
import { CONTACT_EMAIL } from '@/lib/contact';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import { cleanSessionNote } from '@/lib/planner-safety';
import { usePreferences } from '@/lib/preferences';
import { totalSeconds } from '@/lib/utils';
import {
  deleteAccountAndData,
  resetAllData,
  updateUserSettingsOptimistic,
  useCourses,
  useSessions,
  useUserSettings,
} from '@/lib/data-hooks';

/**
 * Settings as a page.
 *
 * On phone the bottom sheet is still the right shape: it comes up over what
 * you were doing and goes away again. A desktop screen has a rail with
 * Settings in it, and a modal reached from a permanent nav item is a screen
 * pretending to be an interruption, so the same panels get a page instead.
 */

type Section = 'profile' | 'term' | 'goals' | 'courses' | 'appearance' | 'data';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'goals', label: 'Goals' },
  { id: 'profile', label: 'Profile' },
  { id: 'term', label: 'Term' },
  { id: 'courses', label: 'Courses' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'data', label: 'Data' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { notify } = useNotice();
  const [prefs, setPrefs] = usePreferences();

  const { courses, isLoading: coursesLoading, revalidate: revalidateCourses } = useCourses();
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { settings, isLoading: settingsLoading } = useUserSettings();

  const [section, setSection] = useState<Section>('goals');
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(4);
  const [confirming, setConfirming] = useState<'reset' | 'signOut' | 'delete' | null>(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (settings) {
      setName(settings.displayName ?? '');
      setDailyGoal(settings.dailyGoalHours || 4);
    }
  }, [settings]);

  /* The address is only ever shown, never edited here, so it is read once
     rather than held in a hook that would re-run on every preference change.
     createClient() throws outright when the app is running on the local
     adapter with no Supabase configured, and it is called here on mount
     rather than from a click, so it has to be inside the try: an unhandled
     throw in an effect takes the whole page down. */
  useEffect(() => {
    let cancelled = false;
    try {
      createClient()
        .auth.getUser()
        .then(({ data }) => {
          if (!cancelled) setEmail(data.user?.email ?? '');
        })
        .catch(() => {
          // Signed out. The header just carries the name in that case.
        });
    } catch {
      // No backend configured. Same outcome: no address to show.
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = coursesLoading || sessionsLoading || settingsLoading;

  if (loading) {
    return (
      <PageShell wide>
        <LoadingIndicator label="Opening settings" />
      </PageShell>
    );
  }

  const safeSessions = sessions.filter((s) => isLoggableDuration(s.durationSeconds));
  const totalHours = totalSeconds(safeSessions) / 3600;
  const dayCount = new Set(safeSessions.map((s) => s.date)).size;
  const weeklyGoal = courses.reduce((a, c) => a + (c.weeklyGoalHours || 0), 0);

  async function saveName() {
    if (savingName) return;
    setSavingName(true);
    try {
      await updateUserSettingsOptimistic({ displayName: name.trim() });
      notify('Saved.');
    } catch (error) {
      console.error('Failed to save settings:', error);
      notify('That did not save.');
    } finally {
      setSavingName(false);
    }
  }

  async function saveDailyGoal(hours: number) {
    setDailyGoal(hours);
    try {
      await updateUserSettingsOptimistic({ dailyGoalHours: hours });
    } catch (error) {
      console.error('Failed to save the daily goal:', error);
      notify('That goal did not save.');
    }
  }

  async function signOut() {
    try {
      await createClient().auth.signOut();
    } catch {
      // Includes the local adapter, where there is no Supabase to sign out of.
      // Falls through either way: a failed server sign-out must not leave
      // someone stuck signed in on this device.
    }
    // The timer, preferences and anything the local adapter cached all
    // outlive the Supabase session, so wipe them before leaving. Otherwise
    // the next person on a shared laptop inherits them.
    clearClientSessionState();
    // A hard navigation rather than router.replace, so the SWR cache, the
    // timer context and every other in-memory copy of the previous user's
    // data goes with the page.
    window.location.replace('/auth');
  }

  function exportSessions() {
    const lines = [
      ['date', 'course', 'duration_minutes', 'note'].join(','),
      ...safeSessions.map((s) => {
        const c = courses.find((x) => x.id === s.courseId);
        const note = cleanSessionNote(s.note).replace(/"/g, '""');
        return [
          s.date,
          c ? `"${c.code}"` : '',
          Math.round(clampSessionSeconds(s.durationSeconds) / 60).toString(),
          `"${note}"`,
        ].join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akada-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell wide>
      <ConfirmSheet
        open={confirming === 'reset'}
        title="Reset the planner?"
        body="Every semester, course, task and session goes with it."
        confirmLabel="Reset"
        requirePhrase="RESET"
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          setConfirming(null);
          await resetAllData();
          router.replace('/onboarding');
        }}
      />
      <ConfirmSheet
        open={confirming === 'delete'}
        title="Delete your account?"
        body="Your courses, tasks, sessions and sign-in all go. This cannot be undone."
        confirmLabel="Delete"
        requirePhrase="DELETE"
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          setConfirming(null);
          await deleteAccountAndData();
          clearClientSessionState();
          window.location.replace('/auth');
        }}
      />
      <ConfirmSheet
        open={confirming === 'signOut'}
        title="Sign out?"
        confirmLabel="Sign out"
        cancelLabel="Stay"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          void signOut();
        }}
      />

      <header className="mb-8">
        <p className="m-0 mb-1.5 font-serif italic text-[13.5px] text-muted">
          {name || 'Akada'}
          {email && ` · ${email}`}
        </p>
        <h1 className="m-0 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
          Settings
        </h1>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        {/* The section list. A row of marks on a page rather than a tab bar:
            the chosen one carries a swipe of highlighter. */}
        <nav className="flex flex-wrap gap-1 lg:sticky lg:top-10 lg:flex-col">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'true' : undefined}
              className={`flex h-10 items-center rounded-[10px] px-3 text-left text-[13px] transition-colors ${
                section === s.id
                  ? 'font-medium text-ink'
                  : 'text-ink-soft hover:bg-bg-tint hover:text-ink'
              }`}
            >
              <span className={section === s.id ? 'hl-swipe' : ''}>{s.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setConfirming('signOut')}
            className="mt-2 flex h-10 items-center rounded-[10px] px-3 text-left text-[13px] text-warn transition-colors hover:bg-warnTint"
          >
            Sign out
          </button>
        </nav>

        <div className="min-w-0 max-w-[680px]">
          {section === 'goals' && (
            <>
              <SettingGroup label="Goals" first>
                <div className="px-[18px] py-4">
                  <div className="flex items-baseline justify-between">
                    <span className="block text-sm font-medium text-ink">Daily goal</span>
                    <span className="font-mono text-[13px] tabular-nums text-ink">
                      {dailyGoal}h
                    </span>
                  </div>
                  <p className="m-0 mt-0.5 text-[11px] text-muted">
                    Counts toward the streak after 25 minutes
                  </p>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    step={1}
                    value={dailyGoal}
                    onChange={(e) => void saveDailyGoal(Number(e.target.value))}
                    aria-label="Daily study goal in hours"
                    className="pl-range mt-3 w-full"
                  />
                </div>

                <div className="border-t border-line-soft px-[18px] py-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className="block text-sm font-medium text-ink">Weekly goal</span>
                    <span className="font-mono text-[13px] tabular-nums text-ink">
                      {weeklyGoal || '—'}h
                    </span>
                  </div>
                  <p className="m-0 mt-0.5 text-[11px] text-muted">
                    The sum of the course goals. Change a course to change it.
                  </p>
                </div>

                <SettingToggleRow
                  label="Skip weekends in goals"
                  sub="Streak and weekly pace ignore Sat and Sun"
                  value={prefs.hideWeekends}
                  onChange={(v) => setPrefs({ hideWeekends: v })}
                />
              </SettingGroup>

              {/* The timer's own two preferences. They lived only on the
                  phone sheet, which left a desktop reader unable to turn the
                  chime off or change how long a break runs. */}
              <SettingGroup label="Timer">
                <SettingToggleRow
                  label="Chime on a block and a break"
                  sub="A soft note when a block ends and when the rest is up"
                  value={prefs.sessionSound}
                  onChange={(v) => setPrefs({ sessionSound: v })}
                />
                <BreakLengthPicker
                  value={prefs.breakMinutes}
                  onChange={(breakMinutes) => setPrefs({ breakMinutes })}
                />
              </SettingGroup>

              <SettingGroup label="Day ends at">
                <div className="px-[18px] py-4">
                  <p className="m-0 mb-3 text-[11px] text-muted">
                    Sessions before this hour count for the day before
                  </p>
                  <DayEndPicker
                    value={prefs.dayEndingHour}
                    onChange={(v) => setPrefs({ dayEndingHour: v })}
                  />
                </div>
              </SettingGroup>

              <SettingGroup label="So far">
                <div className="flex gap-8 px-[18px] py-4">
                  <StatMark label="Hours" value={totalHours.toFixed(1)} />
                  <StatMark label="Days" value={String(dayCount)} />
                  <StatMark label="Sessions" value={String(safeSessions.length)} />
                </div>
              </SettingGroup>
            </>
          )}

          {section === 'profile' && (
            <ProfileEditor
              settingsName={name}
              displayName={settings?.displayName ?? ''}
              updating={savingName}
              onNameChange={setName}
              onBack={() => setSection('goals')}
              onSave={() => void saveName()}
            />
          )}

          {section === 'term' && <SemesterManager onBack={() => setSection('goals')} />}

          {section === 'courses' && (
            <CoursesEditor
              courses={courses}
              onBack={() => setSection('goals')}
              onSaved={() => void revalidateCourses()}
              onAddCourse={() => router.push('/dashboard?add=course')}
            />
          )}

          {section === 'appearance' && (
            <AppearanceEditor
              prefs={prefs}
              setPrefs={setPrefs}
              onBack={() => setSection('goals')}
            />
          )}

          {section === 'data' && (
            <>
              <SettingGroup label="Data" first>
                <SettingRow label="Export sessions as CSV" onClick={exportSessions} />
                <SettingRow label="Privacy policy" href="/privacy" />
                <SettingRow label="Terms" href="/terms" />
                <SettingRow label="Contact" href={`mailto:${CONTACT_EMAIL}`} />
              </SettingGroup>

              <SettingGroup label="Careful">
                <SettingRow
                  label="Reset the planner"
                  sub="Every semester, course, task and session"
                  tone="warn"
                  onClick={() => setConfirming('reset')}
                />
                <SettingRow
                  label="Delete your account"
                  sub="This cannot be undone"
                  tone="warn"
                  onClick={() => setConfirming('delete')}
                />
              </SettingGroup>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
