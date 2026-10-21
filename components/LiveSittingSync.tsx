'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { db } from '@/lib/data';
import { deviceId, deviceLabel } from '@/lib/device';
import {
  LIVE_SITTING_HEARTBEAT_MS,
  handoffVerdict,
  sittingFromSnapshot,
  snapshotKey,
  snapshotRunning,
  snapshotStopped,
  type LiveSittingSnapshot,
} from '@/lib/live-sitting';
import { setSittingElsewhere } from '@/lib/sitting-elsewhere';
import { announceEnded } from '@/lib/timer-ended';
import { useTimerState } from '@/lib/timer-context';

/** What this device last got onto the server, so it never writes the same thing twice. */
const SENT_KEY = 'lums.liveSittingSent';

/** Long enough that typing the block's note is one write, not one per key. */
const SETTLE_MS = 2000;

/**
 * How often an open page reads the server back: to see a sitting running on
 * another device, and to notice that one running here was taken over. Only
 * while the page is in view, and on every return to it.
 */
const POLL_MS = 20 * 1000;

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

function heldBy(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const device = (raw as { device?: unknown }).device;
  return typeof device === 'string' && device ? device : null;
}

/** The same sitting, running on another device that took it over. */
function takenOver(raw: unknown, sittingId: string, me: string): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const row = raw as { id?: unknown; phase?: unknown; epoch?: unknown };
  const holder = heldBy(raw);
  return (
    row.id === sittingId &&
    row.phase !== 'stopped' &&
    holder != null &&
    holder !== me &&
    Number(row.epoch) > 0
  );
}

function labelOf(raw: unknown): string {
  const label = raw && typeof raw === 'object' ? (raw as { device_label?: unknown }).device_label : null;
  return typeof label === 'string' && label ? label : 'other device';
}

/**
 * Keeps the sitting on the clock on the server (see lib/live-sitting.ts),
 * for the connector and for the reader's other devices. Writes when the
 * sitting changes shape and every ten minutes while it is open, and clears it
 * once it is logged or discarded.
 *
 * Reads it back as well. A sitting another device is running is put where
 * ElsewhereDock can offer to take it over; a sitting running here that
 * another device has taken over is let go, so only one device ever logs it.
 *
 * Only ever clears what this device holds: a phone opened with no sitting on
 * it must not wipe the one the laptop is running, and a laptop that was just
 * handed off must not wipe the sitting the phone took. Renders nothing and
 * never complains, since a failed read or write only means a little lag.
 */
export default function LiveSittingSync() {
  const { hydrated, active, pendingLog, handOff, clearPendingLog } = useTimerState();
  // `active` itself moves on every input the timer notices; the heartbeat
  // only cares whether there is a sitting, or it would never get to beat.
  const open = active != null;

  const build = useCallback(
    (now: number): LiveSittingSnapshot | null => {
      const device = { id: deviceId(), label: deviceLabel() };
      return active
        ? snapshotRunning(active, now, device)
        : pendingLog
          ? snapshotStopped(pendingLog, now, device)
          : null;
    },
    [active, pendingLog],
  );
  // written_at is the only thing `now` moves, and the key leaves it out.
  const key = useMemo(() => snapshotKey(build(0)), [build]);
  const buildRef = useRef(build);
  const keyRef = useRef(key);
  const activeRef = useRef(active);
  const pendingRef = useRef(pendingLog);
  useEffect(() => {
    buildRef.current = build;
    keyRef.current = key;
    activeRef.current = active;
    pendingRef.current = pendingLog;
  }, [build, key, active, pendingLog]);

  const send = useCallback(async (force: boolean) => {
    const current = keyRef.current;
    const sent = readSent();
    if (!force && sent === current) return;
    // Nothing on the clock, and nothing of this device's up there to clear.
    if (current === 'none' && sent === 'none') return;
    if (current === 'none') {
      // About to clear: only if what is up there is still this device's.
      const raw = await db.readLiveSitting().catch(() => undefined);
      const holder = heldBy(raw);
      if (holder && holder !== deviceId()) {
        writeSent('none');
        return;
      }
    }
    db.recordLiveSitting(buildRef.current(Date.now()))
      .then(() => writeSent(current))
      .catch(() => {});
  }, []);

  const poll = useCallback(async () => {
    const raw = await db.readLiveSitting().catch(() => undefined);
    if (raw === undefined) return;
    const me = deviceId();
    const verdict = handoffVerdict(activeRef.current, raw, me);
    if (verdict === 'yield') {
      // Taken over. Nothing of ours is up there any more, so there is
      // nothing to clear, and the sitting is now one running elsewhere.
      writeSent('none');
      handOff(labelOf(raw));
      setSittingElsewhere(sittingFromSnapshot(raw, Date.now(), me) ? raw : null);
      return;
    }
    if (verdict === 'reassert') void send(true);
    // Stopped here without being logged (a laptop shut long enough to close
    // out on waking) while another device took the same sitting over and is
    // still running it. That copy has every minute this one has and more, so
    // this one goes rather than being logged beside it.
    const stopped = pendingRef.current;
    if (stopped?.sittingId && takenOver(raw, stopped.sittingId, me)) {
      writeSent('none');
      clearPendingLog();
      announceEnded(`Your ${labelOf(raw)} took this session over, so it was not logged here.`);
      setSittingElsewhere(sittingFromSnapshot(raw, Date.now(), me) ? raw : null);
      return;
    }
    const free = !activeRef.current && !pendingRef.current;
    setSittingElsewhere(free && sittingFromSnapshot(raw, Date.now(), me) ? raw : null);
  }, [clearPendingLog, handOff, send]);

  useEffect(() => {
    if (!hydrated) return;
    const settle = window.setTimeout(() => void send(false), SETTLE_MS);
    return () => window.clearTimeout(settle);
  }, [hydrated, key, send]);

  // A sitting started or taken over here hides the offer at once, rather
  // than on the next read.
  useEffect(() => {
    if (open || pendingLog) setSittingElsewhere(null);
  }, [open, pendingLog]);

  // The heartbeat, so the connector can tell a sitting that is still open
  // from a page that was shut on it. Also retries a write that failed.
  useEffect(() => {
    if (!hydrated) return;
    const beat = window.setInterval(() => void send(open), LIVE_SITTING_HEARTBEAT_MS);
    const online = () => {
      void send(false);
      void poll();
    };
    window.addEventListener('online', online);
    return () => {
      window.clearInterval(beat);
      window.removeEventListener('online', online);
    };
  }, [hydrated, open, poll, send]);

  // Reading back: on the way in, on every return to the page, and every
  // twenty seconds while it is in view.
  useEffect(() => {
    if (!hydrated) return;
    void poll();
    const tick = window.setInterval(() => {
      if (!document.hidden) void poll();
    }, POLL_MS);
    const visible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [hydrated, poll]);

  return null;
}
