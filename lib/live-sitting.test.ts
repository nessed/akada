import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIVE_SITTING_QUIET_MS,
  handoffVerdict,
  liveSittingSession,
  sittingFromSnapshot,
  readLiveSitting,
  snapshotKey,
  snapshotRunning,
  snapshotStopped,
  type RunningSittingState,
} from './live-sitting';

const T0 = Date.parse('2026-10-13T14:00:00.000Z');
const MIN = 60 * 1000;

// Two 50-minute blocks with a 10-minute break between them, then a break
// that started at T0 + 110m and is running.
function onBreak(): RunningSittingState {
  return {
    sessionId: 's1',
    courseId: 'course-pol',
    taskId: 'task-read',
    startedDate: '2026-10-13',
    phase: 'break',
    isPaused: false,
    startedAt: T0 + 110 * MIN,
    accumulatedMs: 0,
    sittingStartedAt: T0,
    stretchStartedAt: T0 + 110 * MIN,
    targetSeconds: 50 * 60,
    breakSeconds: 10 * 60,
    segments: [
      { kind: 'focus', ordinal: 1, startedAt: new Date(T0).toISOString(), seconds: 3000, targetSeconds: 3000, note: 'hobbes ch 13' },
      { kind: 'break', ordinal: 2, startedAt: new Date(T0 + 50 * MIN).toISOString(), seconds: 600, targetSeconds: 600 },
      { kind: 'focus', ordinal: 3, startedAt: new Date(T0 + 60 * MIN).toISOString(), seconds: 3000, targetSeconds: 3000 },
    ],
  };
}

test('a running break is worked out to now from when it started, not from the last write', () => {
  const written = snapshotRunning(onBreak(), T0 + 111 * MIN);
  const reading = readLiveSitting(JSON.parse(JSON.stringify(written)), T0 + 114 * MIN);
  assert.ok(reading);
  assert.equal(reading.state, 'break');
  assert.equal(reading.focus_seconds, 6000);
  assert.equal(reading.break_seconds, 600 + 4 * 60);
  assert.equal(reading.current_stretch_seconds, 4 * 60);
  assert.equal(reading.current_stretch_target_seconds, 600);
  assert.equal(reading.blocks_done, 2);
  assert.equal(reading.breaks_taken, 1);
  assert.deepEqual(reading.block_notes, ['hobbes ch 13']);
  assert.equal(reading.quiet, false);
});

test('a held block counts what it had and nothing since', () => {
  const held: RunningSittingState = {
    ...onBreak(),
    phase: 'focus',
    isPaused: true,
    accumulatedMs: 20 * MIN,
    segments: onBreak().segments,
  };
  const reading = readLiveSitting(snapshotRunning(held, T0 + 140 * MIN), T0 + 170 * MIN);
  assert.ok(reading);
  assert.equal(reading.state, 'paused');
  assert.equal(reading.focus_seconds, 6000 + 20 * 60);
  assert.equal(reading.current_stretch_seconds, 20 * 60);
});

test('a page not heard from is read as of its last write, not run on through the night', () => {
  const focus: RunningSittingState = { ...onBreak(), phase: 'focus', startedAt: T0 + 120 * MIN, stretchStartedAt: T0 + 120 * MIN };
  const writtenAt = T0 + 130 * MIN;
  const reading = readLiveSitting(snapshotRunning(focus, writtenAt), writtenAt + LIVE_SITTING_QUIET_MS + 3 * 60 * MIN);
  assert.ok(reading);
  assert.equal(reading.quiet, true);
  assert.equal(reading.current_stretch_seconds, 10 * 60);
  assert.equal(reading.focus_seconds, 6000 + 10 * 60);
});

test('a stopped sitting reads what the log sheet holds, and drops off after two days', () => {
  const stopped = snapshotStopped(
    { courseId: 'course-pol', taskId: null, date: '2026-10-13', durationSeconds: 6000, breakSeconds: 600, segments: onBreak().segments },
    T0 + 120 * MIN,
  );
  const reading = readLiveSitting(stopped, T0 + 125 * MIN);
  assert.ok(reading);
  assert.equal(reading.state, 'stopped');
  assert.equal(reading.focus_seconds, 6000);
  assert.equal(reading.current_stretch_seconds, undefined);
  assert.equal(readLiveSitting(stopped, T0 + 51 * 60 * MIN), null);
});

test('anything that is not a snapshot reads as nothing on the clock', () => {
  assert.equal(readLiveSitting(null, T0), null);
  assert.equal(readLiveSitting('running', T0), null);
  assert.equal(readLiveSitting({ id: 's1', phase: 'focus' }, T0), null);
});

test('the key ignores when it was written, so only a real change writes again', () => {
  const a = snapshotRunning(onBreak(), T0 + 111 * MIN);
  const b = snapshotRunning(onBreak(), T0 + 121 * MIN);
  assert.equal(snapshotKey(a), snapshotKey(b));
  assert.notEqual(snapshotKey(a), snapshotKey(snapshotRunning({ ...onBreak(), isPaused: true }, T0)));
  assert.equal(snapshotKey(null), 'none');
});

test('as a session it counts its focus only, marked live', () => {
  const reading = readLiveSitting(snapshotRunning(onBreak(), T0 + 111 * MIN), T0 + 114 * MIN);
  const row = liveSittingSession(reading);
  assert.ok(row);
  assert.equal(row.durationSeconds, 6000);
  assert.equal(row.courseId, 'course-pol');
  assert.ok(row.id.startsWith('live:'));
});

const LAPTOP = { id: 'd-laptop', label: 'laptop' };

test('a sitting on another device is offered to take over, carrying on to the second', () => {
  const at = T0 + 112 * MIN;
  const raw = snapshotRunning({ ...onBreak(), epoch: 0 }, at, LAPTOP);
  const now = at + 30 * 1000;
  const taken = sittingFromSnapshot(raw, now, 'd-phone');
  assert.ok(taken);
  assert.equal(taken.label, 'laptop');
  assert.equal(taken.state.sessionId, 's1');
  assert.equal(taken.state.phase, 'break');
  assert.equal(taken.state.isPaused, false);
  // The break has run from when it started, not from when it was read.
  assert.equal(taken.state.startedAt, T0 + 110 * MIN);
  assert.equal(taken.state.segments.length, 3);
  assert.equal(taken.state.segments[0].note, 'hobbes ch 13');
  assert.equal(taken.reading.current_stretch_seconds, 2 * 60 + 30);
});

test('nothing is offered for a sitting this device wrote, or one waiting on its own log sheet', () => {
  const raw = snapshotRunning({ ...onBreak(), epoch: 0 }, T0 + 112 * MIN, LAPTOP);
  assert.equal(sittingFromSnapshot(raw, T0 + 113 * MIN, 'd-laptop'), null);
  const stopped = snapshotStopped(
    { courseId: 'c', taskId: null, date: '2026-10-13', durationSeconds: 3000, breakSeconds: 0, segments: [] },
    T0,
    LAPTOP,
  );
  assert.equal(sittingFromSnapshot(stopped, T0 + MIN, 'd-phone'), null);
  // Written before devices were named: there is no telling whose it is.
  const unnamed = snapshotRunning(onBreak(), T0 + 112 * MIN);
  assert.equal(sittingFromSnapshot(unnamed, T0 + 113 * MIN, 'd-phone'), null);
});

test('a page shut on a running block is taken over held at its last word', () => {
  const block: RunningSittingState = {
    ...onBreak(),
    phase: 'focus',
    startedAt: T0 + 120 * MIN,
    stretchStartedAt: T0 + 120 * MIN,
    accumulatedMs: 0,
    epoch: 0,
  };
  const writtenAt = T0 + 130 * MIN;
  const raw = snapshotRunning(block, writtenAt, LAPTOP);
  const now = writtenAt + LIVE_SITTING_QUIET_MS + 60 * MIN;
  const taken = sittingFromSnapshot(raw, now, 'd-phone');
  assert.ok(taken);
  assert.equal(taken.state.isPaused, true);
  assert.equal(taken.state.accumulatedMs, 10 * MIN);
  assert.equal(taken.state.pausedAt, writtenAt);
});

test('the device holding a sitting lets go only to a later epoch', () => {
  const mine = { sessionId: 's1', epoch: 0 };
  const taken = snapshotRunning({ ...onBreak(), epoch: 1 }, T0, { id: 'd-phone', label: 'phone' });
  assert.equal(handoffVerdict(mine, taken, 'd-laptop'), 'yield');
  // Our own write, or another sitting entirely, is nothing to act on.
  assert.equal(handoffVerdict(mine, snapshotRunning({ ...onBreak(), epoch: 0 }, T0, LAPTOP), 'd-laptop'), 'none');
  assert.equal(handoffVerdict({ sessionId: 's2', epoch: 0 }, taken, 'd-laptop'), 'none');
  assert.equal(handoffVerdict(null, taken, 'd-laptop'), 'none');
  // A stale write of the old holder's, landing after the takeover: the taker
  // keeps the sitting and writes it up again.
  const stale = snapshotRunning({ ...onBreak(), epoch: 0 }, T0, LAPTOP);
  assert.equal(handoffVerdict({ sessionId: 's1', epoch: 1 }, stale, 'd-phone'), 'reassert');
});

test('two devices that take the same sitting at once settle on one', () => {
  const byA = snapshotRunning({ ...onBreak(), epoch: 1 }, T0, { id: 'd-a', label: 'phone' });
  const byB = snapshotRunning({ ...onBreak(), epoch: 1 }, T0, { id: 'd-b', label: 'tablet' });
  // The lower id keeps it; the other lets go.
  assert.equal(handoffVerdict({ sessionId: 's1', epoch: 1 }, byB, 'd-a'), 'reassert');
  assert.equal(handoffVerdict({ sessionId: 's1', epoch: 1 }, byA, 'd-b'), 'yield');
});
