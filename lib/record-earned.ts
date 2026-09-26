import { useSessions } from '@/lib/data-hooks';

/**
 * Whether the Record has anything to show yet. Before the first logged
 * session it is a page of empty pages, zero stamps and a vocabulary nobody
 * has been taught, so the tab waits for the first session and arrives then.
 * Read off the sessions like everything else, never a flag. While the read
 * is in flight it answers true, so a returning reader never sees the tab
 * blink out and back.
 */
export function useRecordEarned(): boolean {
  const { sessions, isLoading } = useSessions();
  return isLoading || sessions.length > 0;
}
