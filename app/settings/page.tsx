'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import ConfirmSheet from '@/components/ConfirmSheet';
import { ReaderAvatar } from '@/components/SettingsGlyph';
import AppearanceEditor from '@/components/settings/AppearanceEditor';
import CoursesEditor from '@/components/settings/CoursesEditor';
import BreakLengthPicker from '@/components/settings/BreakLengthPicker';
import TimerDrawingPicker from '@/components/settings/TimerDrawingPicker';
import DayEndPicker from '@/components/settings/DayEndPicker';
import SoundSampler from '@/components/settings/SoundSampler';
import SemesterManager from '@/components/SemesterManager';
import {
  Chevron,
  PANEL_RADIUS,
  SettingGroup,
  SettingRow,
  SettingToggleRow,
} from '@/components/settings/SettingsPrimitives';
import { useNotice } from '@/components/Notice';
import { createClient } from '@/lib/supabase';
import { clearClientSessionState } from '@/lib/session-cleanup';
import { CONTACT_EMAIL } from '@/lib/contact';
import { isLoggableDuration } from '@/lib/session-safety';
import { downloadSessionsCsv } from '@/lib/sessions-csv';
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
 * Seven sections in one flat list, each named for the thing a reader comes
 * looking for, and each opening the same way: its name, one line on what is
 * in it, then the rows. It used to be eight sections under three group
 * labels (Study, You, More) that sorted nothing: the day's end and a lifetime
 * tally sat under Goals, the tap sounds under Timer, the privacy policy
 * under Data, and Profile was a whole section holding one field with its own
 * Cancel and Save. Every nested view also kept the "← Back" it had from the
 * phone sheet, so half the sections sat indented under a button that went
 * nowhere new.
 *
 * The chosen section is in the hash (`/settings#timer`), so anything that
 * means one section can link straight to it.
 */

type Section = 'goals' | 'timer' | 'courses' | 'term' | 'look' | 'claude' | 'account';

const SECTIONS: { id: Section; label: string; standfirst: string }[] = [
  {
    id: 'goals',
    label: 'Goals',
    standfirst: 'What a day and a week are measured against, when your day ends, and what happens when you get there.',
  },
  {
    id: 'timer',
    label: 'Timer',
    standfirst: 'How a sitting runs: the break after a block, the chime, and what grows while you work.',
  },
  {
    id: 'courses',
    label: 'Courses',
    standfirst: 'Names, colours, order and each course’s weekly goal.',
  },
  {
    id: 'term',
    label: 'Term',
    standfirst: 'The semester your courses, tasks and hours are filed under.',
  },
  {
    id: 'look',
    label: 'Look & feel',
    standfirst: 'The paper, the type, how tight the page sits, and the sounds under your finger.',
  },
  {
    id: 'claude',
    label: 'Claude',
    standfirst: 'Let Claude read your planner and write into it.',
  },
  {
    id: 'account',
    label: 'Account',
    standfirst: 'Your name, signing out, and what is kept.',
  },
];

function isSection(value: string): value is Section {
  return SECTIONS.some((s) => s.id === value);
}

export default function SettingsPage() {
  const router = useRouter();
  const { notify } = useNotice();
  const [prefs, setPrefs] = usePreferences();

  const { courses, isLoading: coursesLoading, revalidate: revalidateCourses } = useCourses();
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { settings, isLoading: settingsLoading } = useUserSettings();

  const [section, setSection] = useState<Section>('goals');
  const [name, setName] = useState('');
  const [dailyGoal, setDailyGoal] = useState(4);
  const [confirming, setConfirming] = useState<'reset' | 'signOut' | 'delete' | null>(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (settings) {
      setName(settings.displayName ?? '');
      setDailyGoal(settings.dailyGoalHours || 4);
    }
  }, [settings]);

  /* The section follows the hash, so a link from Today can open the right
     one. Read after mount rather than in the initial state, since the server
     render has no hash to read. */
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (isSection(hash)) setSection(hash);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  function open(next: Section) {
    setSection(next);
    // replaceState rather than a push: moving between sections is not
    // somewhere Back should step through one at a time.
    window.history.replaceState(window.history.state, '', `#${next}`);
  }

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
  const weeklyGoal = courses.reduce((a, c) => a + (c.weeklyGoalHours || 0), 0);
  const savedName = settings?.displayName ?? '';
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  /* The name saves when the field is left or Enter is pressed, the way the
     rest of the page saves the moment something is chosen. An emptied field
     goes back to the name it had rather than wiping it. */
  async function saveName() {
    const next = name.trim();
    if (!next) {
      setName(savedName);
      return;
    }
    if (next === savedName) return;
    try {
      await updateUserSettingsOptimistic({ displayName: next });
      notify('Saved.');
    } catch (error) {
      console.error('Failed to save settings:', error);
      notify('That did not save.');
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
      // This device only. The SDK's default is every device at once, so
      // signing out of a library computer used to sign the laptop at home
      // out mid-session too, and its open pages started failing.
      await createClient().auth.signOut({ scope: 'local' });
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
    downloadSessionsCsv(safeSessions, courses);
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
        body={email ? `${email}, on this device only.` : 'On this device only.'}
        confirmLabel="Sign out"
        cancelLabel="Stay"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          void signOut();
        }}
      />

      <header className="mb-8">
        <h1 className="m-0 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
          Settings
        </h1>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        {/* The section list. A row of marks on a page rather than a tab bar:
            the chosen one carries a swipe of highlighter. */}
        <nav
          aria-label="Settings sections"
          className="flex flex-wrap gap-1 lg:sticky lg:top-10 lg:flex-col lg:gap-0.5"
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => open(s.id)}
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
        </nav>

        <div className="min-w-0 max-w-[680px]">
          <div key={current.id} className="animate-fade-in">
            <h2 className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
              {current.label}
            </h2>
            <p className="m-0 mt-1 mb-6 font-serif text-[13.5px] italic leading-snug text-muted">
              {current.standfirst}
            </p>

            {section === 'goals' && (
              <>
                <SettingGroup label="Each day" first>
                  <div className="px-[18px] py-4 [&+*]:border-t [&+*]:border-line-soft">
                    <div className="flex items-baseline justify-between">
                      <span className="block text-sm font-medium text-ink">Daily goal</span>
                      <span className="font-mono text-[13px] tabular-nums text-ink">
                        {dailyGoal}h
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 text-[11px] text-muted">
                      What today&apos;s hours are drawn against on Today
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
                  <DayEndPicker
                    value={prefs.dayEndingHour}
                    onChange={(v) => setPrefs({ dayEndingHour: v })}
                  />
                </SettingGroup>

                {/* Read-only here, because a week's goal is nothing but the
                    courses' goals added up. The row goes to where they are set
                    rather than leaving the reader to find it. */}
                <SettingGroup label="Each week">
                  <button
                    type="button"
                    onClick={() => open('courses')}
                    className="flex w-full items-center gap-3 bg-transparent px-[18px] py-3.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">Weekly goal</span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        Your course goals added up. Set them in Courses.
                      </span>
                    </span>
                    {weeklyGoal > 0 ? (
                      <span className="font-mono text-[13px] tabular-nums text-ink">
                        {weeklyGoal}h
                      </span>
                    ) : (
                      <span className="font-serif text-[13px] italic text-muted">none set</span>
                    )}
                    <Chevron />
                  </button>
                </SettingGroup>

                <SettingGroup label="Reaching one">
                  <SettingToggleRow
                    label="Celebrate goals and milestones"
                    sub="A stamp and a note when a day, a week or a course's goal is met, a round number of hours passed or a new stamp struck"
                    value={prefs.celebrations}
                    onChange={(v) => setPrefs({ celebrations: v })}
                  />
                </SettingGroup>
              </>
            )}

            {section === 'timer' && (
              <SettingGroup label="A sitting" first>
                <BreakLengthPicker
                  value={prefs.breakMinutes}
                  onChange={(breakMinutes) => setPrefs({ breakMinutes })}
                />
                <TimerDrawingPicker
                  value={prefs.timerDrawing}
                  onChange={(timerDrawing) => setPrefs({ timerDrawing })}
                />
                <SettingToggleRow
                  label="Chime on a block and a break"
                  sub="A soft note when a block ends and when the rest is up"
                  value={prefs.sessionSound}
                  onChange={(v) => setPrefs({ sessionSound: v })}
                />
              </SettingGroup>
            )}

            {section === 'courses' && (
              <CoursesEditor
                courses={courses}
                onSaved={() => void revalidateCourses()}
                onAddCourse={() => router.push('/dashboard?add=course')}
              />
            )}

            {section === 'term' && <SemesterManager />}

            {section === 'look' && (
              <>
                <AppearanceEditor prefs={prefs} setPrefs={setPrefs} />

                {/* Apart from the timer's chime: that one announces
                    something, these only answer a press, and a reader can
                    want either without the other. */}
                <SettingGroup label="Sound">
                  <SettingToggleRow
                    label="Sounds under your finger"
                    sub="Wood for a tap or a tick, paper for something put away"
                    value={prefs.uiSounds}
                    onChange={(v) => setPrefs({ uiSounds: v })}
                  />
                  <SoundSampler />
                </SettingGroup>

                {/* `hideWeekends` is read in exactly one place, the Stats
                    heatmap. It once sat under Goals claiming the streak and
                    the weekly pace skipped weekends, which neither has ever
                    done. */}
                <SettingGroup label="Stats">
                  <SettingToggleRow
                    label="Hide weekends from the heatmap"
                    sub="The grid on Stats drops Sat and Sun"
                    value={prefs.hideWeekends}
                    onChange={(v) => setPrefs({ hideWeekends: v })}
                  />
                </SettingGroup>
              </>
            )}

            {section === 'claude' && (
              <SettingGroup label="Akada in Claude" first>
                <p className="m-0 px-[18px] py-4 font-serif text-[14px] leading-[1.6] text-ink-soft">
                  Connect Akada to Claude once and it can read your planner and write into
                  it. Hand it a course outline and every deadline goes in, ask it what to
                  start first, or have it quiz you on your recall.
                </p>
                <SettingRow label="How to connect it, and what to ask" href="/claude" />
                <SettingRow label="Everything the connector can do" href="/docs" />
                <SettingRow label="What happens to your data" href="/privacy#assistants" />
              </SettingGroup>
            )}

            {section === 'account' && (
              <>
                <section className={`flex items-center gap-4 border border-line bg-paper px-[18px] py-4 ${PANEL_RADIUS}`}>
                  <ReaderAvatar
                    avatarUrl={settings?.avatarUrl ?? ''}
                    displayName={name || savedName}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <label className="eyebrow mb-1 block" htmlFor="settings-display-name">
                      Your name
                    </label>
                    <input
                      id="settings-display-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => void saveName()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') {
                          setName(savedName);
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder="What Today calls you"
                      className="w-full rounded-none border-0 border-b border-line-strong bg-transparent px-0.5 py-1.5 font-serif text-[16px] text-ink outline-none focus:border-primary"
                    />
                    {email && (
                      <p className="m-0 mt-1.5 truncate text-[11px] text-muted">{email}</p>
                    )}
                  </div>
                </section>

                <SettingGroup label="Your record">
                  <SettingRow
                    label="Export sessions as CSV"
                    sub={`${safeSessions.length} ${
                      safeSessions.length === 1 ? 'session' : 'sessions'
                    }, ${totalHours.toFixed(1)}h in all`}
                    onClick={exportSessions}
                  />
                </SettingGroup>

                <SettingGroup label="This device">
                  <SettingRow
                    label="Sign out"
                    sub="Only here. Your other devices stay signed in."
                    onClick={() => setConfirming('signOut')}
                  />
                </SettingGroup>

                <SettingGroup label="Careful">
                  <SettingRow
                    label="Reset the planner"
                    sub="Every semester, course, task and session. The account stays."
                    tone="warn"
                    onClick={() => setConfirming('reset')}
                  />
                  <SettingRow
                    label="Delete your account"
                    sub="Everything, sign-in included. This cannot be undone."
                    tone="warn"
                    onClick={() => setConfirming('delete')}
                  />
                </SettingGroup>
              </>
            )}
          </div>

          {/* Not settings, so not a section: the way to the guide and the
              small print, on every section's foot. */}
          <p className="m-0 mt-12 flex flex-wrap gap-x-2 gap-y-1 font-serif text-[12.5px] italic text-muted">
            <Link href="/guide" className="hover:text-ink">How Akada works</Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <span aria-hidden>·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink">Contact</a>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
