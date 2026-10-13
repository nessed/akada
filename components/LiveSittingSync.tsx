'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { db } from '@/lib/data';
import {
  LIVE_SITTING_HEARTBEAT_MS,
  snapshotKey,
  snapshotRunning,
  snapshotStopped,
  type LiveSittingSnapshot,
} from '@/lib/live-sitting';
import { useTimerState } from '@/lib/timer-context';

/** What this device last got onto the server, so it never writes the same thing twice. */
const SENT_KEY = 'lums.liveSittingSent';

/** Long enough that typing the block's note is one write, not one per key. */
const SETTLE_MS = 2000;

function readSent(): string {
  try {
    return window.localStorage.getItem(SENT_KEY) ?? 'none';
  } catch {
    return 'none';
  }
}

function writeSent(key: string) {
  try {
    window.localStorage.setItem(SENT_KEY, key);
  } catch { /* private mode: the next change writes again, which is harmless */ }
}

/**
 * Keeps the sitting on the clock where the connector can read it (see
 * lib/live-sitting.ts). Writes when the sitting changes shape and every ten
 * minutes while it is open, and clears it once it is logged or discarded.
 *
 * Only ever clears what this device wrote: a phone opened with no sitting on
 * it must not wipe the one the laptop is running. Renders nothing and never
 * complains, since a failed write only means the connector is a little behind.
 */
export default function LiveSittingSync() {
  const { hydrated, active, pendingLog } = useTimerState();
  // `active` itself moves on every input the timer notices; the heartbeat
  // only cares whether there is a sitting, or it would never get to beat.
  const open = active != null;

  const build = useCallback(
    (now: number): LiveSittingSnapshot | null =>
      active ? snapshotRunning(active, now) : pendingLog ? snapshotStopped(pendingLog, now) : null,
    [active, pendingLog],
  );
  // written_at is the only thing `now` moves, and the key leaves it out.
  const key = useMemo(() => snapshotKey(build(0)), [build]);
  const buildRef = useRef(build);
  const keyRef = useRef(key);
  useEffect(() => {
    buildRef.current = build;
    keyRef.current = key;
  }, [build, key]);

  const send = useCallback((force: boolean) => {
    const current = keyRef.current;
    const sent = readSent();
    if (!force && sent === current) return;
    // Nothing on the clock, and nothing of this device's up there to clear.
    if (current === 'none' && sent === 'none') return;
    db.recordLiveSitting(buildRef.current(Date.now()))
      .then(() => writeSent(current))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const settle = window.setTimeout(() => send(false), SETTLE_MS);
    return () => window.clearTimeout(settle);
  }, [hydrated, key, send]);

  // The heartbeat, so the connector can tell a sitting that is still open
  // from a page that was shut on it. Also retries a write that failed.
  useEffect(() => {
    if (!hydrated) return;
    const beat = window.setInterval(() => send(open), LIVE_SITTING_HEARTBEAT_MS);
    const online = () => send(false);
    window.addEventListener('online', online);
    return () => {
      window.clearInterval(beat);
      window.removeEventListener('online', online);
    };
  }, [hydrated, open, send]);

  return null;
}
