'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import type { Course, Session } from '@/lib/data';
import {
  addCourseOptimistic,
  deleteCourseOptimistic,
  updateCourseOptimistic,
} from '@/lib/data-hooks';
import { PASTEL_PALETTE, totalSeconds } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import {
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
  cleanSessionNote,
  hasDuplicateCourseCodes,
} from '@/lib/planner-safety';
import {
  usePreferences,
  type PaperTone,
  type HeadingFont,
  type Density,
} from '@/lib/preferences';
import { useTimer } from '@/lib/timer-context';

type Section = 'overview' | 'profile' | 'courses' | 'appearance';

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
}: Props) {
  const [section, setSection] = useState<Section>('overview');
  const [prefs, setPrefs] = usePreferences();

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
      alert('Please choose an image file.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      alert('Please choose an image under 6 MB.');
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
      <button
        type="button"
        aria-label="Close settings"
        disabled={updating}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm disabled:cursor-wait"
      />
      <div
        className="app-scroll absolute inset-x-0 bottom-0 top-10 overflow-y-auto rounded-t-[26px] bg-bg shadow-2xl animate-slide-up"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 0%, rgba(180,170,140,0.10), transparent 50%)',
        }}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong" />

        <header className="flex items-center justify-between px-[22px] pt-[18px]">
          <div>
            <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Study planner
            </p>
            <h2 className="mt-1 mb-0 font-serif text-[26px] font-medium tracking-[-0.02em]">
              Settings
            </h2>
          </div>
          <button
            type="button"
            disabled={updating}
            onClick={onClose}
            aria-label="Close"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-paper text-ink-soft disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {/* Profile card — always visible */}
        <div className="px-[22px] pt-[22px]">
          <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-paper px-[18px] py-4">
            <label className="relative shrink-0 cursor-pointer">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-ink/10 bg-[#E2B594] font-serif text-[20px] font-medium text-ink shadow-sm">
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
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-bg shadow-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
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
              <p className="mt-0.5 mb-0 truncate text-xs text-muted">
                Courses, tasks, sessions, and progress.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSection('profile')}
              className="rounded-full border border-line-strong bg-transparent px-3 py-1.5 text-[11px] font-medium text-ink-soft"
            >
              Edit
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatChip label="Hours kept" value={`${totalHours.toFixed(1)}h`} />
            <StatChip label="Active days" value={dayCount.toString()} />
            <StatChip label="Courses" value={courses.length.toString()} />
          </div>
        </div>

        {section === 'overview' && (
          <div className="px-[22px] pt-6 pb-10 animate-fade-in">
            <SettingGroup label="Planner">
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
                label="Appearance"
                sub={`${labelTone(prefs.paperTone)} · ${labelFont(prefs.headingFont)}`}
                onClick={() => setSection('appearance')}
              />
            </SettingGroup>

            <SettingGroup label="Quiet hours">
              <SettingRowToggle
                label="Daily reminder"
                sub="Nudge at 7:00 PM"
                value={prefs.dailyReminder}
                onChange={(v) => setPrefs({ dailyReminder: v })}
              />
              <SettingRowToggle
                label="Sound on session end"
                value={prefs.sessionSound}
                onChange={(v) => setPrefs({ sessionSound: v })}
              />
              <SettingRowToggle
                label="Hide weekends from heatmap"
                value={prefs.hideWeekends}
                onChange={(v) => setPrefs({ hideWeekends: v })}
                last
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
                last
                onClick={() => {
                  if (
                    confirm(
                      'Reset everything — courses, sessions, tasks? This cannot be undone.',
                    )
                  ) {
                    onResetData?.();
                  }
                }}
              />
            </SettingGroup>

            <SettingGroup label="Account">
              <SettingRow label="Help & contact" sub="hello@akada.app" />
              <SettingRow label="Privacy" sub="Read the policy" />
              <SettingRow
                label="Sign out"
                tone="warn"
                last
                onClick={() => {
                  if (confirm('Sign out?')) onSignOut?.();
                }}
              />
            </SettingGroup>

            <p className="mt-5 text-center text-[11px] text-muted-soft font-serif italic">
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
          />
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
  return { warm: 'Warm', paper: 'Paper', stone: 'Stone', white: 'White' }[t];
}
function labelFont(f: HeadingFont) {
  return { fraunces: 'Fraunces', lora: 'Lora', merriweather: 'Merri.' }[f];
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-paper px-3 py-2.5">
      <p className="m-0 font-mono text-[15px] font-semibold tracking-[-0.01em] tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 mb-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
    </div>
  );
}

function SettingGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <p className="ml-1 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <div className="overflow-hidden rounded-xl border border-line bg-paper">
        {children}
      </div>
    </div>
  );
}

function SettingRow({
  label,
  sub,
  onClick,
  tone,
  last,
}: {
  label: string;
  sub?: string;
  onClick?: () => void;
  tone?: 'warn';
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 bg-transparent text-left ${
        last ? '' : 'border-b border-line'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="min-w-0 flex-1">
        <p
          className="m-0 text-sm font-medium"
          style={{ color: tone === 'warn' ? '#B5694C' : 'var(--ink)' }}
        >
          {label}
        </p>
        {sub && <p className="mt-0.5 mb-0 text-[11px] text-muted">{sub}</p>}
      </div>
      {onClick && (
        <span className="text-muted-soft" aria-hidden>
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
      )}
    </button>
  );
}

function SettingRowToggle({
  label,
  sub,
  value,
  onChange,
  last,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${
        last ? '' : 'border-b border-line'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-medium text-ink">{label}</p>
        {sub && <p className="mt-0.5 mb-0 text-[11px] text-muted">{sub}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="relative shrink-0 rounded-full transition-colors"
      style={{
        width: 38,
        height: 22,
        background: value ? 'var(--ink)' : 'var(--line-strong)',
      }}
    >
      <span
        className="absolute top-0.5 rounded-full bg-paper shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-[left] duration-200"
        style={{
          width: 18,
          height: 18,
          left: value ? 18 : 2,
        }}
      />
    </button>
  );
}

/* ───────── Profile editor ───────── */

function ProfileEditor({
  settingsName,
  displayName,
  updating,
  onNameChange,
  onBack,
  onSave,
}: {
  settingsName: string;
  displayName: string;
  updating: boolean;
  onNameChange: (v: string) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div className="px-[22px] pt-5 pb-10 animate-fade-in">
      <BackButton onClick={onBack} />
      <h3 className="mt-1 mb-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
        Profile
      </h3>

      <div className="mt-5">
        <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted mb-2">
          Display name
        </label>
        <input
          type="text"
          value={settingsName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={displayName || 'Your name'}
          className="w-full bg-transparent border-0 border-b border-line-strong rounded-none px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink"
        />
      </div>

      <div className="mt-7 flex gap-2.5">
        <button
          type="button"
          onClick={onBack}
          disabled={updating}
          className="flex-1 rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={updating || !settingsName.trim()}
          onClick={onSave}
          className="flex-1 rounded-[10px] bg-ink py-3.5 text-sm font-medium text-bg disabled:opacity-40"
        >
          {updating ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

/* ───────── Courses editor ───────── */

interface DraftCourse {
  id: string | null;
  code: string;
  name: string;
  color: string;
  tint: string;
  weeklyGoalHours: number;
}

function CoursesEditor({
  courses,
  onBack,
  onSaved,
}: {
  courses: Course[];
  onBack: () => void;
  onSaved: () => void;
}) {
  const { active, pendingLog } = useTimer();
  const original = useMemo(
    () =>
      courses.map<DraftCourse>((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        color: c.color,
        tint: c.tint || PASTEL_PALETTE[0].tint,
        weeklyGoalHours: clampWeeklyGoalHours(c.weeklyGoalHours),
      })),
    [courses],
  );

  const [drafts, setDrafts] = useState<DraftCourse[]>(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Keep the most recent originals in a ref so save() sees freshly-removed
  // courses (drafts removed via UI need their server-side delete) without
  // recomputing on every keystroke.
  const originalRef = useRef(original);
  useEffect(() => {
    originalRef.current = original;
  }, [original]);

  function update(i: number, patch: Partial<DraftCourse>) {
    setDrafts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    setDrafts((cs) => (cs.length === 1 ? cs : cs.filter((_, idx) => idx !== i)));
  }
  function add() {
    const used = new Set(drafts.map((c) => c.color));
    const next =
      PASTEL_PALETTE.find((p) => !used.has(p.value)) ||
      PASTEL_PALETTE[drafts.length % PASTEL_PALETTE.length];
    setDrafts((cs) => [
      ...cs,
      {
        id: null,
        code: '',
        name: '',
        color: next.value,
        tint: next.tint,
        weeklyGoalHours: 5,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const validDrafts = drafts.filter(
        (d) => d.code.trim() && d.name.trim(),
      );
      const incompleteDraft = drafts.some(
        (d) =>
          (Boolean(d.id) || Boolean(d.code.trim()) || Boolean(d.name.trim())) &&
          (!d.code.trim() || !d.name.trim()),
      );
      if (incompleteDraft) {
        setError('Every course needs both a code and a name.');
        return;
      }
      if (hasDuplicateCourseCodes(validDrafts)) {
        setError('Course codes must be unique.');
        return;
      }
      const draftIds = new Set(validDrafts.map((d) => d.id).filter(Boolean));
      const removed = originalRef.current.filter((o) => !draftIds.has(o.id));
      const timerCourseId = active?.courseId ?? pendingLog?.courseId ?? null;
      if (timerCourseId && removed.some((course) => course.id === timerCourseId)) {
        setError(
          active
            ? 'Stop or discard the active timer before deleting that course.'
            : 'Save or discard the pending timer log before deleting that course.',
        );
        return;
      }

      // Delete removed
      for (const o of removed) {
        await deleteCourseOptimistic(o.id!);
      }
      // Add new + update existing
      for (const d of validDrafts) {
        const payload = {
          code: cleanCourseCode(d.code),
          name: cleanCourseName(d.name),
          color: d.color,
          tint: d.tint,
          weeklyGoalHours: clampWeeklyGoalHours(d.weeklyGoalHours),
        };
        if (d.id) {
          await updateCourseOptimistic(d.id, payload);
        } else {
          await addCourseOptimistic(payload);
        }
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save courses';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-[22px] pt-5 pb-10 app-scroll animate-fade-in">
      <BackButton onClick={onBack} />
      <div className="flex items-baseline justify-between">
        <h3 className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
          Courses
        </h3>
        <span className="text-xs text-muted font-serif italic">
          {drafts.length} {drafts.length === 1 ? 'course' : 'courses'}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {drafts.map((c, i) => (
          <div
            key={c.id || `new-${i}`}
            className="relative overflow-hidden rounded-xl border border-line bg-paper px-4 py-3.5 pl-[18px]"
          >
            <span
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ background: c.color }}
            />
            <div className="flex gap-2">
              <input
                value={c.code}
                onChange={(e) => update(i, { code: e.target.value.toUpperCase() })}
                placeholder="CODE"
                className="w-[84px] bg-transparent border-0 border-b border-line py-1 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] outline-none"
                style={{ color: c.color }}
              />
              <input
                value={c.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Course name"
                className="flex-1 bg-transparent border-0 border-b border-line py-1 px-0.5 font-serif text-[15px] font-medium text-ink outline-none"
              />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex flex-1 flex-wrap gap-1.5">
                {PASTEL_PALETTE.map((p) => {
                  const sel = c.color === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => update(i, { color: p.value, tint: p.tint })}
                      aria-label={p.name}
                      className="h-[18px] w-[18px] rounded-full"
                      style={{
                        background: p.value,
                        boxShadow: sel
                          ? `0 0 0 1.5px var(--paper), 0 0 0 3px ${p.value}`
                          : 'none',
                      }}
                    />
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={drafts.length === 1}
                className="text-[11px] text-muted-soft font-serif italic disabled:opacity-50 disabled:cursor-not-allowed"
              >
                remove
              </button>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Goal
              </span>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={c.weeklyGoalHours}
                onChange={(e) =>
                  update(i, { weeklyGoalHours: clampWeeklyGoalHours(e.target.value) })
                }
                className="pl-range flex-1"
                style={{ color: c.color }}
              />
              <span className="w-[38px] text-right font-mono text-[13px] font-semibold tabular-nums">
                {c.weeklyGoalHours}
                <span className="text-muted ml-0.5">h</span>
              </span>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={add}
          className="rounded-[10px] border border-dashed border-line-strong bg-transparent py-3 text-[13px] font-medium text-ink-soft"
        >
          + Add another course
        </button>
      </div>

      {error && (
        <p className="mt-3 text-center text-[12px] text-priority font-serif italic">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="flex-1 rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={
            saving || drafts.filter((d) => d.code.trim() && d.name.trim()).length === 0
          }
          className="flex-1 rounded-[10px] bg-ink py-3.5 text-sm font-medium text-bg disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save courses'}
        </button>
      </div>
    </div>
  );
}

/* ───────── Appearance editor ───────── */

const PAPER_OPTIONS: { v: PaperTone; l: string; bg: string }[] = [
  { v: 'warm', l: 'Warm', bg: '#FAFAF6' },
  { v: 'paper', l: 'Paper', bg: '#F5F1E8' },
  { v: 'stone', l: 'Stone', bg: '#F4F4F1' },
  { v: 'white', l: 'White', bg: '#FFFFFF' },
];

const FONT_OPTIONS: { v: HeadingFont; l: string; family: string }[] = [
  { v: 'fraunces', l: 'Fraunces', family: 'var(--font-serif), serif' },
  { v: 'lora', l: 'Lora', family: 'var(--font-lora), serif' },
  { v: 'merriweather', l: 'Merri.', family: 'var(--font-merriweather), serif' },
];

const DENSITY_OPTIONS: { v: Density; l: string }[] = [
  { v: 'cozy', l: 'Cozy' },
  { v: 'comfy', l: 'Comfy' },
  { v: 'compact', l: 'Compact' },
];

function AppearanceEditor({
  prefs,
  setPrefs,
  onBack,
}: {
  prefs: ReturnType<typeof usePreferences>[0];
  setPrefs: ReturnType<typeof usePreferences>[1];
  onBack: () => void;
}) {
  return (
    <div className="px-[22px] pt-5 pb-10 animate-fade-in">
      <BackButton onClick={onBack} />
      <h3 className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em]">
        Appearance
      </h3>

      <div className="mt-5">
        <p className="ml-1 mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Paper tone
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {PAPER_OPTIONS.map((o) => {
            const sel = prefs.paperTone === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setPrefs({ paperTone: o.v })}
                className="flex flex-col gap-2 rounded-xl px-3.5 py-3.5 text-left"
                style={{
                  background: o.bg,
                  border: sel ? '1.5px solid var(--ink)' : '1px solid var(--line)',
                }}
              >
                <span
                  className="h-[26px] rounded-md border-l-[3px]"
                  style={{
                    background: 'rgba(0,0,0,0.04)',
                    borderLeftColor: '#A8B89B',
                  }}
                />
                <span
                  className="font-serif text-[12px] font-medium"
                  style={{ color: '#1A1915' }}
                >
                  {o.l}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="ml-1 mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Heading font
        </p>
        <div className="flex gap-2">
          {FONT_OPTIONS.map((o) => {
            const sel = prefs.headingFont === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setPrefs({ headingFont: o.v })}
                className="flex-1 rounded-[10px] py-3.5 px-2 text-center"
                style={{
                  background: sel ? 'var(--paper)' : 'transparent',
                  border: sel ? '1.5px solid var(--ink)' : '1px solid var(--line)',
                }}
              >
                <span
                  className="block text-[17px] italic text-ink"
                  style={{ fontFamily: o.family }}
                >
                  Aa
                </span>
                <span className="mt-1 block text-[10px] text-muted tracking-[0.06em]">
                  {o.l}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="ml-1 mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Density
        </p>
        <div className="flex gap-2">
          {DENSITY_OPTIONS.map((o) => {
            const sel = prefs.density === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setPrefs({ density: o.v })}
                className="flex-1 rounded-[10px] py-3 text-[13px] font-medium"
                style={{
                  background: sel ? 'var(--ink)' : 'transparent',
                  color: sel ? 'var(--bg)' : 'var(--ink-soft)',
                  border: sel ? '1px solid var(--ink)' : '1px solid var(--line)',
                }}
              >
                {o.l}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
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
