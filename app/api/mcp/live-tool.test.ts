import assert from 'node:assert/strict';
import { test } from 'node:test';
import { snapshotRunning } from '@/lib/live-sitting';
import { getCurrentSessionTool } from './live-tool';

type Row = Record<string, unknown>;

// Equality filters and maybeSingle over in-memory tables, which is all the
// tool reads with.
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = (tables[table] ?? []).slice();
      const builder = {
        select() { return builder; },
        eq(col: string, value: unknown) { rows = rows.filter((r) => r[col] === value); return builder; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      };
      return builder;
    },
  };
}

const token = { userId: 'user-1', supabaseAccessToken: 'x' } as never;
const read = (reply: unknown) => (reply as { structuredContent: Record<string, any> }).structuredContent;
const T0 = Date.parse('2026-10-13T14:00:00.000Z');
const MIN = 60 * 1000;

const snapshot = snapshotRunning(
  {
    sessionId: 's1',
    courseId: 'course-pol',
    taskId: 'task-read',
    startedDate: '2026-10-13',
    phase: 'focus',
    isPaused: false,
    startedAt: T0 + 60 * MIN,
    accumulatedMs: 0,
    sittingStartedAt: T0,
    stretchStartedAt: T0 + 60 * MIN,
    targetSeconds: 3000,
    breakSeconds: 600,
    segments: [
      { kind: 'focus', ordinal: 1, startedAt: new Date(T0).toISOString(), seconds: 3000, targetSeconds: 3000, note: 'hobbes' },
      { kind: 'break', ordinal: 2, startedAt: new Date(T0 + 50 * MIN).toISOString(), seconds: 600, targetSeconds: 600 },
    ],
  },
  T0 + 60 * MIN,
);

const tables = (live: unknown): Record<string, Row[]> => ({
  user_settings: [{ user_id: 'user-1', active_semester_id: 'term-1', live_sitting: live }],
  courses: [{ id: 'course-pol', user_id: 'user-1', code: 'POL 3302', name: 'Political Theory' }],
  tasks: [{ id: 'task-read', user_id: 'user-1', title: 'Read Leviathan' }],
});

test('get_current_session names the sitting on the clock and works it out to now', async () => {
  const out = read(await getCurrentSessionTool(token, {}, fakeSupabase(tables(snapshot)) as never, T0 + 75 * MIN));
  const current = out.current_session;
  assert.equal(current.state, 'focus');
  assert.deepEqual(current.course, { id: 'course-pol', code: 'POL 3302', name: 'Political Theory' });
  assert.deepEqual(current.task, { id: 'task-read', title: 'Read Leviathan' });
  assert.equal(current.focus_seconds, 3000 + 15 * 60);
  assert.equal(current.focus_minutes, 65);
  assert.equal(current.break_minutes, 10);
  assert.deepEqual(current.block_notes, ['hobbes']);
  assert.match(out.message, /POL 3302 sitting is on the clock/);
  assert.match(out.message, /do not log it/);
});

test('get_current_session says nothing is on the clock when nothing is', async () => {
  const out = read(await getCurrentSessionTool(token, {}, fakeSupabase(tables(null)) as never, T0));
  assert.equal(out.current_session, null);
});
