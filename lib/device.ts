/**
 * Which browser this is, as far as the running sitting is concerned.
 *
 * A sitting on the clock belongs to one device at a time (see
 * lib/live-sitting.ts), so each needs a name for itself that survives a
 * reload. A random id under the `akada.` prefix, so sign-out clears it with
 * everything else the device keeps for an account; a fresh one after that is
 * harmless, since it only has to differ from the other devices'.
 */

const DEVICE_KEY = 'akada.deviceId';

let memo: string | null = null;

export function deviceId(): string {
  if (typeof window === 'undefined') return '';
  if (memo) return memo;
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored) return (memo = stored);
  } catch { /* private mode: an id for this page's life is still an id */ }
  const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try {
    window.localStorage.setItem(DEVICE_KEY, id);
  } catch { /* as above */ }
  return (memo = id);
}

/** What the other device calls this one: "running on your phone". */
export type DeviceLabel = 'phone' | 'tablet' | 'laptop';

export function deviceLabel(): DeviceLabel {
  if (typeof navigator === 'undefined') return 'laptop';
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'phone';
  return 'laptop';
}
