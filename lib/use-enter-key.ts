'use client';

import { useEffect, useRef } from 'react';

/**
 * Let Enter do what a sheet's main button does.
 *
 * Plain Enter from anywhere on the sheet, except where Enter already means
 * something: on a button or link it presses that control, and in a note it
 * starts a new line, so a note takes ⌘/Ctrl+Enter instead. Held keys and
 * IME compositions are ignored.
 */
export function useEnterKey(active: boolean, onEnter: () => void) {
  const handler = useRef(onEnter);
  useEffect(() => {
    handler.current = onEnter;
  });

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.repeat || event.isComposing || event.defaultPrevented) return;
      if (event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, select, summary')) return;
      const inNote = !!target?.closest('textarea, [contenteditable=true]');
      if (inNote && !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      handler.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
