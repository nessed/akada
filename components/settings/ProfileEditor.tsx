'use client';

import BackButton from '@/components/BackButton';
import { ButtonSpinner } from '@/components/LoadingIndicator';
import {
  SectionHeading,
  SHEET_ACTION_PRIMARY,
  SHEET_ACTION_QUIET,
  VIEW_PADDING,
} from './SettingsPrimitives';

export default function ProfileEditor({
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
    <div className={`${VIEW_PADDING} animate-fade-in`}>
      <BackButton onClick={onBack} />
      <SectionHeading>Profile</SectionHeading>

      <div className="mt-[var(--density-section)]">
        <label className="eyebrow mb-2 block" htmlFor="settings-display-name">
          Display name
        </label>
        <input
          id="settings-display-name"
          type="text"
          value={settingsName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={displayName || 'Your name'}
          className="w-full rounded-none border-0 border-b border-line-strong bg-transparent px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary"
        />
      </div>

      <div className="mt-[var(--density-section)] flex gap-2.5">
        <button
          type="button"
          onClick={onBack}
          disabled={updating}
          className={SHEET_ACTION_QUIET}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={updating || !settingsName.trim()}
          onClick={onSave}
          className={SHEET_ACTION_PRIMARY}
        >
          {updating ? (
            <span className="flex items-center justify-center gap-2">
              <ButtonSpinner />
              Saving
            </span>
          ) : (
            'Save'
          )}
        </button>
      </div>
    </div>
  );
}
