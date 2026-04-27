'use client';

import type { Course, Session } from '@/lib/data';
import type { ChangeEvent } from 'react';

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
}: Props) {
  if (!open) return null;

  const totalHours = sessions.reduce((sum, session) => sum + session.durationSeconds, 0) / 3600;
  const dayCount = new Set(sessions.map((session) => session.date)).size;
  const shownAvatar = settingsAvatar || avatarUrl;
  const shownName = settingsName || displayName || 'Akada';
  const initials = shownName
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'A';

  function handleAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onAvatarChange(reader.result as string);
    reader.readAsDataURL(file);
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
              The notebook
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

        <div className="px-[22px] pt-[22px] pb-10">
          <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-paper px-[18px] py-4">
            <label className="relative shrink-0 cursor-pointer">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-ink/10 bg-[#E2B594] font-serif text-[20px] font-medium text-ink shadow-sm">
                {shownAvatar ? (
                  <img src={shownAvatar} alt="Profile" className="h-full w-full object-cover" />
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
                A quiet place to study.
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatChip label="Hours kept" value={`${totalHours.toFixed(1)}h`} />
            <StatChip label="Days written" value={dayCount.toString()} />
            <StatChip label="Courses" value={courses.length.toString()} />
          </div>

          <section className="mt-6">
            <p className="ml-1 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Profile
            </p>
            <div className="rounded-xl border border-line bg-paper px-4 py-4">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Display name
              </label>
              <input
                type="text"
                value={settingsName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Your name"
                className="mt-2 w-full rounded-none border-0 border-b border-line-strong bg-transparent px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink"
              />
            </div>
          </section>

          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              disabled={updating}
              onClick={onClose}
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
              {updating ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
