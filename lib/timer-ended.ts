/**
 * Why the clock stopped, said out loud.
 *
 * The timer ends itself in several ways the reader never asked for (a break
 * past its ceiling, a page left closed, no sign of anybody, the 18 hour
 * limit, a long pause) and drops a sitting with nothing in it without a
 * sheet to say so. The log sheet explains the first kind once it opens; this
 * is the slip of paper that says so at the moment it happens, and the only
 * word at all for the second kind.
 *
 * The timer provider lives above the notice provider, and a sitting can be
 * closed during hydration before anything is listening, so a message waits
 * here until a listener takes it.
 */

type Listener = (message: string) => void;

const listeners = new Set<Listener>();
let waiting: string[] = [];

export function announceEnded(message: string): void {
  if (listeners.size === 0) {
    waiting = [...waiting.slice(-2), message];
    return;
  }
  for (const listener of listeners) listener(message);
}

export function onEnded(listener: Listener): () => void {
  listeners.add(listener);
  const backlog = waiting;
  waiting = [];
  for (const message of backlog) listener(message);
  return () => {
    listeners.delete(listener);
  };
}

/** The reasons the timer closes a sitting by itself, as one plain sentence. */
export function endedMessage(
  reason: 'idle' | 'away' | 'max' | 'break' | 'pause' | undefined,
  logged: boolean,
): string {
  const why =
    reason === 'break'
      ? 'The break hit its 45 minute limit, so the sitting ended.'
      : reason === 'away'
        ? 'The page was closed for too long, so the timer stopped where it was last open.'
        : reason === 'idle'
          ? 'There was no sign of you for a while, so the timer stopped.'
          : reason === 'max'
            ? 'The sitting hit the 18 hour limit, so the timer stopped.'
            : reason === 'pause'
              ? 'The clock sat paused for over two hours, so the sitting ended.'
              : 'The sitting ended.';
  return logged ? why : `${why} There was no study time in it to log.`;
}
