'use client';

import { useMemo, type ReactNode } from 'react';
import type { Session } from '@/lib/data';
import { withLiveSession } from '@/lib/live-session';
import { useLiveSession } from '@/lib/use-live-session';

/**
 * The sessions with the sitting on the clock folded in, handed to what is
 * drawn inside. The sitting moves every second, so this is a leaf: only the
 * panels that draw it re-render with the clock, not the page around them.
 */
export default function WithLiveSessions({
  sessions,
  children,
}: {
  sessions: Session[];
  children: (shown: Session[]) => ReactNode;
}) {
  const live = useLiveSession();
  const shown = useMemo(() => withLiveSession(sessions, live), [sessions, live]);
  return <>{children(shown)}</>;
}
