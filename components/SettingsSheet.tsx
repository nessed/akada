'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Course, Session } from '@/lib/data';
import { useActiveSemester } from '@/lib/data-hooks';
import SemesterManager from './SemesterManager';
import { totalSeconds } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import { cleanSessionNote } from '@/lib/planner-safety';
import {
  usePreferences,
  type PaperTone,
  type HeadingFont,
  type PrimaryAccent,
} from '@/lib/preferences';
import ConfirmSheet from './ConfirmSheet';
import { CONTACT_EMAIL } from '@/lib/contact';
import { useNotice } from './Notice';
import AppearanceEditor from './settings/AppearanceEditor';
import CoursesEditor from './settings/CoursesEditor';
import DayEndPicker from './settings/DayEndPicker';
import ProfileEditor from './settings/ProfileEditor';
import {
  PANEL_RADIUS,
  SettingGroup,
  SettingRow,
  SettingToggleRow,
  StatMark,
} from './settings/SettingsPrimitives';

type Section = 'overview' | 'profile' | 'courses' | 'semester' | 'appearance';

interface Props {
  open: boolean;
  updating: boolean;
  displayName: string;
  avatarUrl: string;
  settingsName: string;
  settingsAvatar: string;
  courses: Course[];
  sessions: Session[];
  onNameChange: (value: string) => void;
  onAvatarChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onCoursesChanged?: () => void;
  onSignOut?: () => void;
  onResetData?: () => void;
  onDeleteAccount?: () => void;
}

export default function SettingsSheet({
  open,
  updating,
  displayName,
  avatarUrl,
  settingsName,
  settingsAvatar,
  courses,
  sessions,
  onNameChange,
  onAvatarChange,
  onClose,
  onSave,
  onCoursesChanged,
  onSignOut,
  onResetData,
  onDeleteAccount,
}: Props) {
  const [section, setSection] = useState<Section>('overview');
  const router = useRouter();
  const { semester: activeSemester } = useActiveSemester();
  const [prefs, setPrefs] = usePreferences();
  const { notify } = useNotice();
  // Which of the two irreversible actions is waiting to be confirmed.
  const [confirming, setConfirming] = useState<'reset' | 'signOut' | 'delete' | null>(
    null,
  );

  // Reset to overview each time the sheet opens.
  useEffect(() => {
    if (open) setSection('overview');
  }, [open]);

  if (!open) return null;

  const safeSessions = sessions.filter((session) => isLoggableDuration(session.durationSeconds));
  const totalHours = totalSeconds(safeSessions) / 3600;
  const dayCount = new Set(safeSessions.map((session) => session.date)).size;
  const shownAvatar = settingsAvatar || avatarUrl;
  const shownName = settingsName || displayName || 'Akada';
  const initials =
    shownName
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'A';

  function handleAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('That file is not an image.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      notify('That image is over 6 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onAvatarChange(reader.result as string);
    reader.readAsDataURL(file);
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
    <div className="fixed inset-0 z-[90] animate-fade-in">
      <ConfirmSheet
        open={confirming === 'reset'}
        title="Reset the planner?"
        body="Every semester, course, task and session goes with it."
        confirmLabel="Reset"
        requirePhrase="RESET"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          onResetData?.();
        }}
      />
      <ConfirmSheet
        open={confirming === 'delete'}
        title="Delete your account?"
        body="Your courses, tasks, sessions and sign-in all go. This cannot be undone."
        confirmLabel="Delete"
        requirePhrase="DELETE"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          onDeleteAccount?.();
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
          onSignOut?.();
        }}
      />
      <button
        type="button"
        aria-label="Close settings"
        disabled={updating}
        onClick={onClose}
        className="scrim absolute inset-0 backdrop-blur-sm disabled:cursor-wait"
      />
      <div
        className="app-scroll absolute inset-x-0 bottom-0 top-10 overflow-y-auto rounded-t-[26px] bg-bg animate-slide-up md:mx-auto md:max-w-2xl"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 0%, var(--paper-glow-a), transparent 50%)',
        }}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong" />

        <header className="flex items-start justify-between gap-4 px-[var(--density-gutter)] pt-[18px]">
          <div className="min-w-0">
            <p className="eyebrow m-0">Study planner</p>
            <h2 className="mt-1.5 mb-0 font-serif text-[36px] font-medium leading-none tracking-[-0.025em]">
              Settings
            </h2>
          </div>
          <button
            type="button"
            disabled={updating}
            onClick={onClose}
            aria-label="Close"
            className="mt-1 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-line bg-paper text-ink-soft disabled:opacity-50"
          >
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {/* Profile card, always visible */}
        <div className="px-[var(--density-gutter)] pt-[var(--density-section)]">
          <div
            className={`flex items-center gap-3.5 border border-line bg-paper px-[18px] py-4 ${PANEL_RADIUS}`}
          >
            <label className="relative shrink-0 cursor-pointer">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-line bg-peach font-serif text-[20px] font-medium text-ink">
                {shownAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shownAvatar}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </span>
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-contrast">
                <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
                </svg>
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatar}
              />
            </label>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate font-serif text-[18px] font-medium tracking-[-0.01em]">
                {shownName}
              </p>
              {activeSemester?.label && (
                <p className="mt-0.5 mb-0 truncate text-xs text-muted">
                  {activeSemester.label}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSection('profile')}
              className="hand-underline bg-transparent px-0.5 font-serif text-[13px] text-ink-soft"
            >
              Edit
            </button>
          </div>

          <div className="mt-[var(--density-gap)] grid grid-cols-3 gap-[var(--density-gap)]">
            <StatMark label="Hours kept" value={`${totalHours.toFixed(1)}h`} />
            <StatMark label="Active days" value={dayCount.toString()} />
            <StatMark label="Courses" value={courses.length.toString()} />
          </div>
        </div>

        {section === 'overview' && (
          <div className="px-[var(--density-gutter)] pt-[var(--density-section)] pb-12 animate-fade-in">
            <SettingGroup label="Planner" first>
              <SettingRow
                label="Profile"
                sub="Name, avatar"
                onClick={() => setSection('profile')}
              />
              <SettingRow
                label="Courses"
                sub={`${courses.length} active`}
                onClick={() => setSection('courses')}
              />
              <SettingRow
                label="Semester"
                sub={activeSemester?.label ?? 'Not set'}
                onClick={() => setSection('semester')}
              />
              <SettingRow
                label="Appearance"
                sub={`${labelTone(prefs.paperTone)} · ${labelPrimary(prefs.primaryAccent)} · ${labelFont(prefs.headingFont)}`}
                onClick={() => setSection('appearance')}
              />
            </SettingGroup>

            <SettingGroup label="Quiet hours">
              <SettingToggleRow
                label="Daily reminder"
                sub="7:00 PM"
                value={prefs.dailyReminder}
                onChange={(v) => setPrefs({ dailyReminder: v })}
              />
              <SettingToggleRow
                label="Sound on session end"
                value={prefs.sessionSound}
                onChange={(v) => setPrefs({ sessionSound: v })}
              />
              <SettingToggleRow
                label="Hide weekends from heatmap"
                value={prefs.hideWeekends}
                onChange={(v) => setPrefs({ hideWeekends: v })}
              />
              <DayEndPicker
                value={prefs.dayEndingHour}
                onChange={(dayEndingHour) => setPrefs({ dayEndingHour })}
              />
            </SettingGroup>

            <SettingGroup label="Data">
              <SettingRow
                label="Export sessions"
                sub="Download as CSV"
                onClick={exportSessions}
              />
              <SettingRow
                label="Reset data"
                sub="Start with a clean planner"
                tone="warn"
                // One mistaken tap away from deleting everything, so the
                // sheet asks for the word to be typed out.
                onClick={() => setConfirming('reset')}
              />
            </SettingGroup>

            <SettingGroup label="Account">
              <SettingRow
                label="Help & contact"
                sub={CONTACT_EMAIL}
                href={`mailto:${CONTACT_EMAIL}`}
              />
              <SettingRow label="Privacy" sub="How your data is handled" href="/privacy" />
              <SettingRow label="Terms" sub="What you agree to" href="/terms" />
              <SettingRow label="Sign out" onClick={() => setConfirming('signOut')} />
              <SettingRow
                label="Delete account"
                sub="Everything, permanently"
                tone="warn"
                onClick={() => setConfirming('delete')}
              />
            </SettingGroup>

            <p className="mt-[var(--density-section)] text-center font-serif text-[11px] italic text-muted-soft">
              Akada · made with quiet hands
            </p>
          </div>
        )}

        {section === 'profile' && (
          <ProfileEditor
            settingsName={settingsName}
            displayName={displayName}
            updating={updating}
            onNameChange={onNameChange}
            onBack={() => setSection('overview')}
            onSave={onSave}
          />
        )}

        {section === 'courses' && (
          <CoursesEditor
            courses={courses}
            onBack={() => setSection('overview')}
            onSaved={() => {
              onCoursesChanged?.();
              setSection('overview');
            }}
            // There is one add-course flow, the catalog-backed sheet on the
            // dashboard. Settings closes and hands the reader to it.
            onAddCourse={() => {
              onCoursesChanged?.();
              onClose();
              router.push('/dashboard?add=course');
            }}
          />
        )}

        {section === 'semester' && (
          <SemesterManager onBack={() => setSection('overview')} />
        )}

        {section === 'appearance' && (
          <AppearanceEditor
            prefs={prefs}
            setPrefs={setPrefs}
            onBack={() => setSection('overview')}
          />
        )}
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

function labelTone(t: PaperTone) {
  return { warm: 'Warm', paper: 'Paper', stone: 'Stone', white: 'White', night: 'Night' }[t];
}
function labelFont(f: HeadingFont) {
  return {
    cormorant: 'Cormorant',
    fraunces: 'Fraunces',
    lora: 'Lora',
    merriweather: 'Merri.',
  }[f];
}
function labelPrimary(a: PrimaryAccent) {
  return { classic: 'Ink', green: 'Sage' }[a];
}
