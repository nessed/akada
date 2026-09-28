'use client';

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';

/**
 * Closes a dropdown on a press outside it or on Escape, while it is open.
 * One copy for the pickers that had the same effect written out each.
 */
export function useDismiss(
  rootRef: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [rootRef, open, setOpen]);
}
