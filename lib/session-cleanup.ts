'use client';

/**
 * Every localStorage key this app writes is namespaced with one of these
 * prefixes: 'lums.' (timer state and the local data adapter) and 'akada.'
 * (user preferences). Clearing by prefix rather than by an explicit list
 * means state added later is cleared on sign-out too, instead of quietly
 * surviving into the next person's session on a shared machine.
 */
const APP_STORAGE_PREFIXES = ['lums.', 'akada.'];

/**
 * Wipe the client-side state that outlives a Supabase session: the running
 * timer, any pending unlogged session, display preferences, and anything the
 * LocalAdapter cached. Supabase's own sb-* keys are removed by signOut().
 */
export function clearClientSessionState(): void {
  if (typeof window === 'undefined') return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && APP_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        doomed.push(key);
      }
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // Private mode or a full quota. Sign-out must still complete, and the
    // hard navigation that follows drops the in-memory copy either way.
  }
}

/**
 * Which account the device's own state belongs to. Inside the 'akada.' prefix
 * on purpose, so a sign-out clears it along with everything it vouches for.
 */
const OWNER_KEY = 'akada.owner.v1';

/**
 * Tie the device's stored state to the account that is signed in.
 *
 * The timer, the pending sitting, the Next Mark ledger and the rest are kept
 * in this browser, not on the account. A proper sign-out wipes them, but a
 * session can also end without one: revoked from another device, expired, or
 * cleared with the browser's cookies while localStorage stayed. The next
 * person to sign in then inherited a timer pointing at a course that is not
 * theirs, and a ledger seeded from someone else's rows.
 *
 * So the account that wrote the state is written next to it. When a
 * different one turns up, the old state is wiped and the page is reloaded,
 * which also drops every in-memory copy (SWR, the timer context) that was
 * already read from it. A device with no owner yet (every device the first
 * time this runs, or one that just signed out) simply adopts whoever is here,
 * so nobody's running timer is lost to the change.
 */
export function claimDeviceStorage(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  let owner: string | null = null;
  try {
    owner = window.localStorage.getItem(OWNER_KEY);
  } catch {
    return;
  }
  if (owner === userId) return;
  if (owner) clearClientSessionState();
  try {
    window.localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // Without storage there is nothing stored to protect either.
    return;
  }
  if (owner) window.location.reload();
}
