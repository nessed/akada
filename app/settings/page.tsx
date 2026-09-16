'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import ConfirmSheet from '@/components/ConfirmSheet';
import AddCourseSheet from '@/components/AddCourseSheet';
import SemesterManager from '@/components/SemesterManager';
import PaperEditor from '@/components/settings/PaperEditor';
import CoursesEditor from '@/components/settings/CoursesEditor';
import ProfilePanel from '@/components/settings/ProfilePanel';
import DataPanel from '@/components/settings/DataPanel';
import ReviewPanel from '@/components/settings/ReviewPanel';
import AccountPanel from '@/components/settings/AccountPanel';
import { Eyebrow } from '@/components/notebook/Marks';
import { useNotice } from '@/components/Notice';
import { createClient } from '@/lib/supabase';
import { clearClientSessionState } from '@/lib/session-cleanup';
import { usePreferences } from '@/lib/preferences';
import { useTimer } from '@/lib/timer-context';
import {
  useCourses,
  useSessions,
  useActiveSemester,
  useUserSettings,
  resetAllData,
  deleteAccountAndData,
} from '@/lib/data-hooks';

/**
 * Settings, as a page.
 *
 * It used to be a stack of sheets opened from the dashboard avatar: every
 * view slid over the last one, nothing had an address, and going "back" from
 * three levels deep meant three taps through screens you had already read.
 * Now it is one page with an index down its left, each section a place you
 * can link to and return to.
 *
 * The index is the same order as the design's: what the page looks like
 * first, because that is what people actually come here to change, then who
 * you are, then the term's own machinery, then the two sections nobody wants
 * to meet in a hurry.
 */

type Section = 'paper' | 'you' | 'courses' | 'term' | 'review' | 'data' | 'account';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'paper', label: 'Paper' },
  { id: 'you', label: 'You' },
  { id: 'courses', label: 'Courses' },
  { id: 'term', label: 'Term' },
  { id: 'review', label: 'The review' },
  { id: 'data', label: 'Your data' },
  { id: 'account', label: 'Account' },
];

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsFallback() {
  return (
    <PageShell width="read">
      <LoadingIndicator compact label="Loading settings" className="mb-6" />
    </PageShell>
  );
}

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify } = useNotice();
  const { clearTimerState } = useTimer();
  const [prefs, setPrefs] = usePreferences();

  const { courses } = useCourses();
  const { sessions } = useSessions();
  const { semester } = useActiveSemester();
  const { settings } = useUserSettings();

  const [section, setSection] = useState<Section>('paper');
  const [addingCourse, setAddingCourse] = useState(false);
  const [confirming, setConfirming] = useState<'reset' | 'delete' | 'signOut' | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  // `?s=courses` so the grade panels and the course rows can link straight to
  // the section that sets them rather than dropping the reader at the top.
  useEffect(() => {
    const wanted = searchParams.get('s');
    if (wanted && SECTIONS.some((s) => s.id === wanted)) setSection(wanted as Section);
  }, [searchParams]);

  const counts = useMemo(
    () => ({ courses: courses.length, term: semester?.label ?? '' }),
    [courses.length, semester?.label],
  );

  async function handleSignOut() {
    setLeaving('Signing out');
    clearTimerState();
    try {
      await createClient().auth.signOut();
    } catch {
      // Fall through to the redirect either way.
    }
    // The timer, the preferences and anything the local adapter cached all
    // outlive the Supabase session, so wipe them before leaving. Otherwise
    // the next person on a shared laptop inherits them.
    clearClientSessionState();
    // A hard navigation rather than router.replace, so the SWR cache, the
    // timer context and every other in-memory copy goes with the page.
    window.location.replace('/auth');
  }

  async function handleReset() {
    setLeaving('Clearing your planner');
    clearTimerState();
    try {
      await resetAllData();
    } catch (error) {
      console.error('Failed to reset data:', error);
      // Moving on to onboarding after a failed reset would tell the reader
      // their data is gone when all of it is still there.
      notify('Nothing was deleted. The reset did not go through.');
      setLeaving(null);
      return;
    }
    router.replace('/onboarding');
  }

  async function handleDeleteAccount() {
    setLeaving('Deleting your account');
    clearTimerState();
    try {
      await deleteAccountAndData();
    } catch (error) {
      console.error('Failed to delete account:', error);
      notify(error instanceof Error ? error.message : 'The account was not deleted.');
      setLeaving(null);
      return;
    }
    clearClientSessionState();
    window.location.replace('/');
  }

  if (leaving) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-8">
        <LoadingIndicator label={leaving} detail="One moment." />
      </div>
    );
  }

  return (
    <PageShell width="read">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        {/* The index. A list of places on ruled lines, with the one you are
            reading marked by a swipe rather than a filled row. */}
        <nav className="w-full flex-none lg:w-[210px]">
          <Eyebrow style={{ letterSpacing: '0.18em' }}>Settings</Eyebrow>
          <div className="mt-4 flex flex-wrap gap-x-5 lg:flex-col lg:gap-x-0">
            {SECTIONS.map((item) => {
              const on = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => setSection(item.id)}
                  className={`bg-transparent py-2 text-left font-serif text-[15.5px] lg:row-rule ${
                    on ? 'text-ink' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {on ? <span className="hl-swipe">{item.label}</span> : item.label}
                  {item.id === 'courses' && counts.courses > 0 && (
                    <span className="ml-1.5 font-mono text-[11px] text-muted-soft">
                      {counts.courses}
                    </span>
                  )}
                  {item.id === 'term' && counts.term && (
                    <span className="ml-1.5 font-mono text-[11px] text-muted-soft">
                      {counts.term}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-9 hidden font-serif text-[12.5px] italic leading-[1.5] text-muted-soft lg:block">
            Akada keeps everything on your own row of the table. Nothing is shared.
          </p>
        </nav>

        <div className="min-w-0 flex-1 pb-6">
          {section === 'paper' && <PaperEditor prefs={prefs} setPrefs={setPrefs} />}
          {section === 'you' && <ProfilePanel settings={settings} />}
          {section === 'courses' && (
            <CoursesEditor courses={courses} onAddCourse={() => setAddingCourse(true)} />
          )}
          {section === 'term' && <SemesterManager />}
          {section === 'review' && <ReviewPanel prefs={prefs} setPrefs={setPrefs} />}
          {section === 'data' && (
            <DataPanel
              sessions={sessions}
              courses={courses}
              onReset={() => setConfirming('reset')}
            />
          )}
          {section === 'account' && (
            <AccountPanel
              onSignOut={() => setConfirming('signOut')}
              onDelete={() => setConfirming('delete')}
            />
          )}
        </div>
      </div>

      <AddCourseSheet
        open={addingCourse}
        onClose={() => setAddingCourse(false)}
        courses={courses}
      />

      <ConfirmSheet
        open={confirming === 'signOut'}
        title="Sign out?"
        body="Your work stays where it is. This device forgets it."
        confirmLabel="Sign out"
        onCancel={() => setConfirming(null)}
        onConfirm={handleSignOut}
      />
      <ConfirmSheet
        open={confirming === 'reset'}
        title="Clear the planner?"
        body="Every course, task and logged session goes. The account stays."
        confirmLabel="Clear it"
        requirePhrase="clear"
        onCancel={() => setConfirming(null)}
        onConfirm={handleReset}
      />
      <ConfirmSheet
        open={confirming === 'delete'}
        title="Delete your account?"
        body="The account and everything in it goes. This cannot be undone."
        confirmLabel="Delete it"
        requirePhrase="delete"
        onCancel={() => setConfirming(null)}
        onConfirm={handleDeleteAccount}
      />
    </PageShell>
  );
}
