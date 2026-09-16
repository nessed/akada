'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useNotice } from '@/components/Notice';
import { RULED_FIELD } from '@/components/Sheet';
import { TextButton } from '@/components/notebook/Marks';
import { initialsFrom, isUploadedImage, resizeAvatar } from '@/lib/avatar';
import { updateUserSettingsOptimistic } from '@/lib/data-hooks';
import type { UserSettings } from '@/lib/data';

/** How big an avatar may be before it is worth refusing. */
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/**
 * You: a name and a face, which are the only two things Akada knows about a
 * reader. The avatar is the one place in the app with a circle in it.
 */
export default function ProfilePanel({ settings }: { settings: UserSettings | null }) {
  const { notify } = useNotice();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(settings?.displayName ?? '');
    setAvatar(settings?.avatarUrl ?? '');
  }, [settings?.displayName, settings?.avatarUrl]);

  const dirty = name !== (settings?.displayName ?? '') || avatar !== (settings?.avatarUrl ?? '');

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      notify('That image is too large. Try one under 6MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result || ''));
    reader.onerror = () => notify('That image could not be read.');
    reader.readAsDataURL(file);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      // Shrunk here rather than on the way in, so the preview is instant and
      // only what is actually stored pays the resize.
      const stored = avatar && isUploadedImage(avatar) ? await resizeAvatar(avatar) : avatar;
      await updateUserSettingsOptimistic({ displayName: name.trim(), avatarUrl: stored });
      setAvatar(stored);
    } catch (error) {
      console.error('Failed to save profile:', error);
      notify('That did not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="m-0 font-serif text-[30px] font-normal leading-none tracking-[-0.03em] md:text-[38px]">
        You
      </h1>
      <p className="mt-3 max-w-[52ch] font-serif text-[15.5px] leading-[1.6] text-ink-soft">
        A name and a face. Akada does not ask for anything else, and nobody else sees either.
      </p>

      <div className="rule-ink mt-7 flex items-center gap-5 pt-5">
        <span
          className="flex h-[68px] w-[68px] flex-none items-center justify-center overflow-hidden rounded-full font-serif text-[22px] text-ink"
          style={{ background: 'var(--peach)', border: '1px solid var(--line-strong)' }}
        >
          {avatar ? (
            /* A data URL already in memory; next/image would only wrap a
               loader round a string that is already here. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsFrom(name) || 'A'
          )}
        </span>
        <span className="flex flex-col items-start gap-2">
          <TextButton onClick={() => fileRef.current?.click()}>change the picture</TextButton>
          {avatar && (
            <TextButton tone="quiet" onClick={() => setAvatar('')}>
              take it off
            </TextButton>
          )}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      <label className="mt-7 block">
        <span className="eyebrow mb-2 block">What to call you</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className={`${RULED_FIELD} font-serif`}
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={!dirty || saving}
        className="mt-7 min-h-[44px] bg-primary px-7 text-sm font-medium text-primary-contrast disabled:opacity-30"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
