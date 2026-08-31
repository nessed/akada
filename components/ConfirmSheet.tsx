'use client';

import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  /** Serif headline. A question, not a warning. */
  title: string;
  /** One quiet line of consequence. Optional — most confirms don't need it. */
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * When set, the exact words that have to be typed before the confirm button
   * comes alive. Reserved for the two actions that delete a term's work.
   */
  requirePhrase?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The app's confirmation, in place of `confirm()` and `prompt()`.
 *
 * Same chrome as every other sheet in the app — dimmed ink, paper panel,
 * grab handle, slide-up — so a destructive question arrives the way the rest
 * of the app speaks rather than as an operating-system modal.
 */
export default function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  requirePhrase,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState('');

  // Every opening starts from an empty field, so a phrase typed once can't
  // arm the next confirmation.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const armed = !busy && (!requirePhrase || typed.trim().toLowerCase() === requirePhrase.toLowerCase());

  return (
    <div className="fixed inset-0 z-[95] flex items-end animate-fade-in">
      <button
        type="button"
        aria-label={cancelLabel}
        onClick={onCancel}
        className="absolute inset-0 bg-ink/35 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full md:mx-auto md:max-w-xl rounded-t-3xl bg-bg px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up"
      >
        <div className="mx-auto mb-[18px] h-1 w-9 rounded-full bg-line-strong" />
        <h3 className="mb-1.5 mt-0 font-serif text-[22px] font-medium tracking-[-0.01em]">
          {title}
        </h3>
        {body && (
          <p className="mb-0 mt-0 font-serif text-[13px] italic leading-[1.5] text-muted">
            {body}
          </p>
        )}

        {requirePhrase && (
          <input
            autoFocus
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && armed) onConfirm();
            }}
            placeholder={requirePhrase}
            aria-label={`Type ${requirePhrase} to confirm`}
            className="mt-4 w-full rounded-[10px] border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-line-strong"
          />
        )}

        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!armed}
            onClick={onConfirm}
            className="flex-1 rounded-[10px] bg-primary py-3.5 text-sm font-medium text-primary-contrast disabled:opacity-30"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
