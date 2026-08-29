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
