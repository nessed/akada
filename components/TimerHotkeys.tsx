'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTimerState } from '@/lib/timer-context';
import ConfirmSheet from './ConfirmSheet';
import { isLogSheetMounted } from './PendingSessionLogSheet';

/**
 * The keys the running clock answers to (P, K and R), from anywhere.
 *
 * A sitting is started from a row on Today or Tasks and then the reader goes
 * back to their book. Stopping it meant finding the dock with a mouse, and
 * the timer's own keys (Space, B, F) only exist on the timer screen, which is
 * the one screen a reader in the middle of a chapter is least likely to be
 * looking at. `P` and `K` reach the clock from whichever tab is open.
 *
 * `P` is the dock's left button and does exactly what it does: on a break it
 * ends it and sets out the next block held, otherwise it holds the clock or lets it go again. `K` is
 * the dock's right button: it ends the sitting and the log sheet opens on the
 * spot, because every tab already carries one. On the few screens that do not
 * (the legal pages, onboarding, auth) it opens the timer instead, so the key
 * never ends a sitting with nothing to show for it.
 *
 * Mounted in the root layout rather than in a screen, so "any tab" means any
 * tab. It binds nothing at all unless a sitting is actually running, which is
 * the same rule the rest of the app follows: a key that does nothing is worse
 * than no key.
 */
/**
 * The page blinks once when `P` lands. The key is pressed with the eyes on
 * the book, not on the dock, so without it there was no telling whether the
 * clock heard. Two lids of paper come in from the top and bottom edges, soft
 * where they meet, close fast and open a touch slower, the way an eye does.
 * It catches no clicks, and a second press mid-blink starts it over.
 */
function blinkPage() {
  document.querySelector('.page-blink')?.remove();
  const lids = document.createElement('div');
  lids.className = 'page-blink';
  lids.setAttribute('aria-hidden', 'true');
  lids.addEventListener('animationend', () => lids.remove(), { once: true });
  document.body.appendChild(lids);
}

export default function TimerHotkeys() {
  const router = useRouter();
  const { active, onBreak, endBreak, pause, resume, stop, cancel } = useTimerState();
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!active) return;

    function onKey(event: KeyboardEvent) {
      // ⌘P is print and ⌘K is the browser's own. A chord belongs to whoever
      // the reader thinks they are talking to, and it is not this.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // A held key is one instruction, not forty.
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=true]')) return;

      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        blinkPage();
        // The dock's left button, to the letter: resting means end the break.
        if (onBreak) endBreak();
        else if (active?.isPaused) resume();
        else pause();
      } else if (key === 'k') {
        event.preventDefault();
        stop();
        if (!isLogSheetMounted()) router.push('/timer');
      } else if (key === 'r') {
        // Throws the sitting away, so it asks first. The key only opens the
        // question; the sheet's own button is what does it.
        event.preventDefault();
        setConfirmingReset(true);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onBreak, endBreak, pause, resume, stop, router]);

  return (
    <ConfirmSheet
      open={confirmingReset && !!active}
      title="Reset this sitting?"
      body="The time so far won't be saved."
      confirmLabel="Reset"
      cancelLabel="Keep going"
      onCancel={() => setConfirmingReset(false)}
      onConfirm={() => {
        setConfirmingReset(false);
        cancel();
      }}
    />
  );
}
