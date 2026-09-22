import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Session } from './types';
import { attachSegments, dropCutChain, segmentWindowStart } from './segment-rows';

function session(id: string, date: string, patch: Partial<Session> = {}): Session {
  return {
    id,
    courseId: 'course-1',
    taskId: null,
    date,
    durationSeconds: 3000,
    note: '',
    createdAt: `${date}T20:00:00.000Z`,
    ...patch,
  };
}

test('the window opens two days before the earliest sitting, for any timezone', () => {
  assert.equal(segmentWindowStart([]), null);
  assert.equal(
    segmentWindowStart([session('a', '2026-09-20'), session('b', '2026-09-03')]),
    '2026-09-01T00:00:00.000Z',
  );
});

test('rows are sorted onto their sittings, in the order they happened', () => {
  const rows = [
    { session_id: 'a', kind: 'focus', ordinal: 3, started_at: '2026-09-20T15:50:00Z', seconds: 1500, target_seconds: 1500, note: 'second block' },
    { session_id: 'a', kind: 'focus', ordinal: 1, started_at: '2026-09-20T15:00:00Z', seconds: 2700, target_seconds: 2700, note: 'limits at infinity' },
    { session_id: 'a', kind: 'break', ordinal: 2, started_at: '2026-09-20T15:45:00Z', seconds: 300, target_seconds: 300, note: '' },
    { session_id: 'elsewhere', kind: 'focus', ordinal: 1, started_at: '2026-09-02T10:00:00Z', seconds: 600, target_seconds: null },
  ];
  const [a, b] = attachSegments([session('a', '2026-09-20'), session('b', '2026-09-19')], rows);
  assert.deepEqual(
    a.segments?.map((s) => [s.kind, s.seconds, s.note]),
    [
      ['focus', 2700, 'limits at infinity'],
      ['break', 300, ''],
      ['focus', 1500, 'second block'],
    ],
  );
  assert.equal(b.segments, undefined, 'a sitting with no rows is left as the stretch it was');
});

test('a sitting that already carries its chain keeps it', () => {
  const held = session('a', '2026-09-20', {
    segments: [{ kind: 'focus', ordinal: 1, startedAt: '2026-09-20T15:00:00.000Z', seconds: 60, targetSeconds: null }],
  });
  const [a] = attachSegments([held], [
    { session_id: 'a', kind: 'focus', ordinal: 1, started_at: '2026-09-20T15:00:00Z', seconds: 2700, target_seconds: null },
  ]);
  assert.equal(a.segments?.[0].seconds, 60);
});

test('malformed rows are dropped rather than trusted', () => {
  const [a] = attachSegments([session('a', '2026-09-20')], [
    { session_id: 'a', kind: 'nap', ordinal: 1, started_at: 'x', seconds: 100 },
    { session_id: 'a', kind: 'focus', ordinal: 2, started_at: '2026-09-20T15:00:00Z', seconds: -5 },
    null,
    'nonsense',
  ]);
  assert.equal(a.segments, undefined);
});

test('a read that stopped short drops the one sitting it may have cut through', () => {
  // Newest first, as the adapter reads them: 'new' is whole, 'old' may be
  // missing its first block, which went past the end of the read.
  const rows = [
    { session_id: 'new', kind: 'focus', ordinal: 2, started_at: '2026-09-20T16:00:00Z', seconds: 1200 },
    { session_id: 'new', kind: 'focus', ordinal: 1, started_at: '2026-09-20T15:00:00Z', seconds: 3000 },
    { session_id: 'old', kind: 'break', ordinal: 2, started_at: '2026-09-18T11:00:00Z', seconds: 600 },
  ];
  assert.deepEqual(
    dropCutChain(rows).map((row) => (row as { session_id: string }).session_id),
    ['new', 'new'],
  );
  assert.deepEqual(dropCutChain([]), []);
});

/* ── The read itself, against a PostgREST double ─────────────────────── */

type Row = Record<string, unknown>;

// A PostgREST double for the two reads getSessionsForSemester makes, which
// caps every response at `cap` rows the way max-rows does, whatever the range.
function fake(sessions: Row[], segments: Row[], cap: number, fail = false) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      from(table: string) {
        let rows = (table === 'sessions' ? sessions : segments).slice();
        let wantCount = false;
        let from = 0;
        let to = Infinity;
        const b: Record<string, unknown> = {
          select(_c: string, opts?: { count?: string }) { wantCount = opts?.count === 'exact'; return b; },
          eq(col: string, v: unknown) { rows = rows.filter((r) => r[col] === v); return b; },
          gte(col: string, v: string) { rows = rows.filter((r) => String(r[col]) >= v); return b; },
          order(col: string, o: { ascending: boolean }) {
            if (table === 'session_segments' && col === 'started_at') rows.sort((a, c) => String(c.started_at).localeCompare(String(a.started_at)) * (o.ascending ? -1 : 1));
            return b;
          },
          range(a: number, z: number) { from = a; to = z; return b; },
          then(resolve: (v: unknown) => unknown) {
            if (table === 'session_segments') calls.push(`range ${from}-${to}${wantCount ? ' count' : ''}`);
            if (fail && table === 'session_segments') return Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'no table' }, count: null }).then(resolve);
            const total = rows.length;
            const page = table === "session_segments" ? rows.slice(from, Math.min(to + 1, from + cap)) : rows;
            return Promise.resolve({ data: page, error: null, count: wantCount ? total : null }).then(resolve);
          },
        };
        return b;
      },
    },
  };
}

async function adapterWith(client: unknown) {
  // The adapter makes its own client on construction, which only needs the
  // two settings to exist; every call it makes here goes to the double.
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test';
  const { SupabaseAdapter } = await import('./supabase-adapter');
  const adapter = new SupabaseAdapter() as unknown as Record<string, unknown>;
  adapter.supabase = client;
  adapter.userId = async () => 'u';
  return adapter as unknown as { getSessionsForSemester(id: string): Promise<Session[]> };
}

const sessions: Row[] = [];
const segments: Row[] = [];
for (let i = 0; i < 12; i += 1) {
  const id = `s${i}`;
  const date = `2026-09-${String(10 + i).padStart(2, '0')}`;
  sessions.push({ id, user_id: 'u', semester_id: 'sem', course_id: 'c', task_id: null, date, duration_seconds: 5400, note: '', created_at: `${date}T20:00:00Z` });
  // focus 45m, break 5m, focus 40m
  segments.push({ id: `${id}-1`, user_id: 'u', session_id: id, kind: 'focus', ordinal: 1, started_at: `${date}T15:00:00Z`, seconds: 2700, target_seconds: 2700, note: 'a' });
  segments.push({ id: `${id}-2`, user_id: 'u', session_id: id, kind: 'break', ordinal: 2, started_at: `${date}T15:45:00Z`, seconds: 300, target_seconds: 300, note: '' });
  segments.push({ id: `${id}-3`, user_id: 'u', session_id: id, kind: 'focus', ordinal: 3, started_at: `${date}T15:50:00Z`, seconds: 2400, target_seconds: null, note: 'b' });
}

test('a server cap below the page size is paged through to the total', async () => {
  const f = fake(sessions, segments, 5);
  const got = await (await adapterWith(f.client)).getSessionsForSemester('sem');
  assert.equal(got.length, 12);
  assert.ok(got.every((s) => s.segments?.length === 3), 'every sitting has its whole chain');
  assert.deepEqual(got[0].segments?.map((s) => s.kind), ['focus', 'break', 'focus']);
  assert.equal(f.calls[0], 'range 0-999 count', 'the first page asks for the total');
});

test('one page when the server hands back everything', async () => {
  const f = fake(sessions, segments, 1000);
  await (await adapterWith(f.client)).getSessionsForSemester('sem');
  assert.deepEqual(f.calls, ['range 0-999 count']);
});

test('a missing table leaves the hours alone', async () => {
  const f = fake(sessions, segments, 1000, true);
  const got = await (await adapterWith(f.client)).getSessionsForSemester('sem');
  assert.equal(got.length, 12);
  assert.ok(got.every((s) => s.segments === undefined));
});

test('a read that hits the ceiling drops the chain it cut through, not half of it', async () => {
  const many: Row[] = [];
  const segs: Row[] = [];
  for (let i = 0; i < 20; i += 1) {
    const id = `m${i}`;
    const date = `2026-08-${String(1 + i).padStart(2, '0')}`;
    many.push({ id, user_id: 'u', semester_id: 'sem', course_id: 'c', task_id: null, date, duration_seconds: 5400, note: '', created_at: `${date}T20:00:00Z` });
    for (let k = 1; k <= 3; k += 1) {
      segs.push({ id: `${id}-${k}`, user_id: 'u', session_id: id, kind: k === 2 ? 'break' : 'focus', ordinal: k, started_at: `${date}T15:${String(k * 10).padStart(2, '0')}:00Z`, seconds: 600, target_seconds: null, note: '' });
    }
  }
  // Ten pages of five is fifty rows of sixty: sixteen whole chains, then two
  // rows of the seventeenth, newest first.
  const f = fake(many, segs, 5);
  const got = await (await adapterWith(f.client)).getSessionsForSemester('sem');
  const withChain = got.filter((s) => s.segments);
  assert.equal(withChain.length, 16);
  assert.ok(withChain.every((s) => s.segments?.length === 3), 'no half chains');
  assert.equal(got.find((s) => s.id === 'm3')?.segments, undefined, 'the cut one reads as a plain stretch');
});
