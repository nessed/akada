'use client';

import { useEffect } from 'react';
import { isSoundName, queueSound, unlockSounds } from '@/lib/sounds';

/** Everything a finger can press. Text fields and plain page are not on it. */
const PRESSABLE =
  'button, a[href], summary, input[type="checkbox"], input[type="radio"], [role="button"], [role="switch"], [role="radio"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="option"]';

/**
 * One listener for the whole app, so a new button makes a sound without
 * anyone remembering to give it one. A control says what it wants with
 * `data-sound` ("bubble", "paper", "none"), on itself or on anything around
 * it; otherwise it gets the plain wooden tap. A handler that plays a sound of
 * its own (a task ticked, the timer started) wins over both, see
 * `queueSound`.
 *
 * Listening on the capture phase of the window means this runs before
 * React's handlers do, so `data-sound` is read off the control as it was
 * when it was pressed: a toggle that is off still says "bubble", not the
 * "drop" it will say once it has turned on.
 */
export default function TapSounds() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest(PRESSABLE);
      if (!control) return;
      if (control.matches(':disabled, [aria-disabled="true"]')) return;
      const asked = control.closest('[data-sound]')?.getAttribute('data-sound');
      if (asked === 'none') return;
      unlockSounds();
      queueSound(isSoundName(asked) ? asked : 'tap');
    }
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
