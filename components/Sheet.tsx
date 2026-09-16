'use client';

import { useEffect } from 'react';

/**
 * A sheet that comes up from the foot of the page.
 *
 * Square, with a hairline along its top edge rather than a rounded corner and
 * a shadow: the redesign's chrome is drawn, not lifted. The grab handle stays,
 * because it is the one affordance that says this can be pushed back down.
 */
export default function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  actions,
  labelledBy = 'sheet-title',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  /** The action pair along the foot. See `SheetActions`. */
  actions?: React.ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex animate-fade-in items-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="scrim absolute inset-0 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelledBy : undefined}
        className="app-scroll relative max-h-[92dvh] w-full animate-slide-up overflow-y-auto border-t border-line-strong bg-bg px-6 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-3.5 md:mx-auto md:max-w-xl"
      >
        <span aria-hidden className="mx-auto mb-5 block h-1 w-9 rounded-sm bg-line-strong" />
        {eyebrow}
        {title && (
          <h3
            id={labelledBy}
            className="mb-4 mt-0 font-serif text-[24px] font-normal tracking-[-0.02em]"
          >
            {title}
          </h3>
        )}
        {children}
        {actions && <div className="mt-6 flex gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * The sheet action pair. Both square, both the same height, the confirming
 * one filled — the only solid fill a sheet is allowed.
 */
export function SheetActions({
  onCancel,
  cancelLabel = 'Cancel',
  onConfirm,
  confirmLabel,
  confirmDisabled,
  busy,
}: {
  onCancel: () => void;
  cancelLabel?: string;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  busy?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        className="flex-none border border-line-strong bg-transparent px-[18px] py-3.5 text-sm text-ink-soft"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled || busy}
        className="flex-1 bg-primary py-3.5 text-sm font-medium text-primary-contrast disabled:opacity-30"
      >
        {busy ? 'Saving…' : confirmLabel}
      </button>
    </>
  );
}

/** The quiet uppercase caption every form in the app labels a field with. */
export function SheetField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="eyebrow mb-2.5 block">{label}</label>
      {children}
    </div>
  );
}

/**
 * A field drawn as a ruled line rather than a boxed input. This is what the
 * redesign's forms look like: the rule under the text is the field, and it
 * goes to full ink when it has focus.
 */
export const RULED_FIELD =
  'w-full border-0 border-b-[1.4px] border-line-strong bg-transparent px-0.5 pb-2.5 text-[16px] text-ink transition-colors focus:border-ink';
