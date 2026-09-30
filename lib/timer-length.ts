/**
 * The block lengths a session can be started at, and the one this device
 * used last.
 *
 * These lived inside the start popover while the popover was the only thing
 * that started a session at a length. Up next now sizes a session of its own
 * and needs the same facts: the lengths the popover offers, and the length
 * last chosen there, which is what Up next falls back on before the term has
 * taught it how long this reader's blocks run (lib/up-next-session.ts). So
 * they are here, where both can read them without one importing a component.
 *
 * Only the popover writes the last length. A session Up next shortened to fit
 * the evening, or to finish a reading, is not a choice the reader made about
 * how long they like to work, and teaching it to the default would make every
 * later start shorter for a reason that has passed.
 */

export const LENGTH_KEY = 'akada.timer.lastBlockMinutes';
export const LENGTHS = [25, 45, 60] as const;

/**
 * The length last started from the popover, in minutes, or null when it was
 * an open session. 45 on the server, before anything was chosen, and whenever
 * storage holds something that is not one of the lengths.
 */
export function readLastLength(): number | null {
  if (typeof window === 'undefined') return 45;
  try {
    const raw = window.localStorage.getItem(LENGTH_KEY);
    if (raw === 'open') return null;
    const n = Number(raw);
    return LENGTHS.includes(n as (typeof LENGTHS)[number]) ? n : 45;
  } catch {
    return 45;
  }
}

export function writeLastLength(minutes: number | null): void {
  try {
    window.localStorage.setItem(LENGTH_KEY, minutes == null ? 'open' : String(minutes));
  } catch {
    // Remembering the last length is a convenience, never a requirement.
  }
}

/** The fixed length closest to how long the reader's blocks actually run. */
export function nearestLength(minutes: number): number {
  return LENGTHS.reduce((best, n) => (Math.abs(n - minutes) < Math.abs(best - minutes) ? n : best), LENGTHS[0]);
}
