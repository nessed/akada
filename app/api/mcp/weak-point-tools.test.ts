import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getWeakPointsTool, recordWeakPointsTool, reopenWeakPointTool, resolveWeakPointTool } from './weak-point-tools';

type Row = Record<string, unknown>;

// Just enough of PostgREST for the notes tools: filters by equality, `in`,
// ordering, and single-row reads, over in-memory tables.
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const all = (tables[table] ??= []);
      let rows = all.slice();
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let payload: Row | null = null;
      const builder = {
        select() { return builder; },
        insert(row: Row) {
          op = 'insert';
          payload = { id: `00000000-0000-4000-8000-${String(all.length + 1).padStart(12, '0')}`, checks: {}, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...row };
          return builder;
        },
        update(patch: Row) { op = 'update'; payload = patch; return builder; },
        delete() { op = 'delete'; return builder; },
        eq(col: string, value: unknown) { rows = rows.filter((r) => r[col] === value); return builder; },
        in(col: string, values: unknown[]) { rows = rows.filter((r) => values.includes(r[col])); return builder; },
        order() { return builder; },
        limit() { return builder; },
        run() {
          if (op === 'insert' && payload) { all.push(payload); return [payload]; }
          if (op === 'update' && payload) { for (const r of rows) Object.assign(r, payload); return rows; }
          if (op === 'delete') { for (const r of rows) all.splice(all.indexOf(r), 1); return rows; }
          return rows;
        },
        single() { const out = builder.run(); return Promise.resolve({ data: out[0] ?? null, error: out[0] ? null : { code: 'PGRST116' } }); },
        maybeSingle() { const out = builder.run(); return Promise.resolve({ data: out[0] ?? null, error: null }); },
        then(resolve: (v: unknown) => unknown) { return Promise.resolve({ data: builder.run(), error: null }).then(resolve); },
      };
      return builder;
    },
  };
}

const token = { userId: 'user-1', supabaseAccessToken: 'x' } as never;
const COURSE = '11111111-1111-4111-8111-111111111111';
const read = (reply: unknown) => (reply as { structuredContent: Record<string, unknown> }).structuredContent;

const QUIZ = '22222222-2222-4222-8222-222222222222';
const base = () => ({
  courses: [{ id: COURSE, user_id: 'user-1', code: 'MGMT 101', name: 'Management' }],
  quizzes: [{ id: QUIZ, user_id: 'user-1', course_id: COURSE, title: 'Ch 1 quiz' }],
  weak_points: [] as Row[],
});
const item = (summary: string, confusion?: string) => ({ section: '1.3', page_ref: 'p.22-24', summary, confusion, error_type: 'concept' as const });

test('record_weak_points inserts, then counts a repeat on the same row', async () => {
  const db = base();
  const supabase = fakeSupabase(db) as never;
  const first = read(await recordWeakPointsTool(token, { course_id: COURSE, quiz_id: QUIZ, items: [item('Swaps the 3 core values with the 3 objectives', 'core values vs objectives')] }, supabase));
  assert.equal(db.weak_points.length, 1);
  assert.equal((first.recorded as { outcome: string }[])[0].outcome, 'new');
  const again = read(await recordWeakPointsTool(token, { course_id: COURSE, items: [item('Mixes the values up with the aims', 'Objectives vs core values'), item('Totally new slip', 'x vs y')] }, supabase));
  assert.equal(db.weak_points.length, 2);
  assert.equal(db.weak_points[0].times_missed, 2);
  assert.equal(db.weak_points[0].quiz_id, QUIZ);
  assert.deepEqual((again.recorded as { outcome: string }[]).map((r) => r.outcome), ['repeat', 'new']);
});

test('the same confusion twice in one call counts once', async () => {
  const db = base();
  const reply = read(await recordWeakPointsTool(token, { course_id: COURSE, items: [item('A', 'p vs q'), item('B', 'q vs p')] }, fakeSupabase(db) as never));
  assert.equal(db.weak_points.length, 1);
  assert.equal(db.weak_points[0].times_missed, 1);
  assert.deepEqual((reply.recorded as { outcome: string }[]).map((r) => r.outcome), ['new', 'same_as_above']);
});

test('a fixed weak point found again reopens', async () => {
  const db = base();
  const supabase = fakeSupabase(db) as never;
  await recordWeakPointsTool(token, { course_id: COURSE, items: [item('A', 'p vs q')] }, supabase);
  const id = db.weak_points[0].id as string;
  await resolveWeakPointTool(token, { id }, supabase);
  assert.equal(db.weak_points[0].status, 'fixed');
  assert.ok(db.weak_points[0].fixed_at);
  const reply = read(await recordWeakPointsTool(token, { course_id: COURSE, items: [item('A again', 'p vs q')] }, supabase));
  assert.equal((reply.recorded as { outcome: string }[])[0].outcome, 'reopened');
  assert.equal(db.weak_points[0].status, 'open');
  assert.equal(db.weak_points[0].fixed_at, null);
});

test('get_weak_points ranks, filters by status and section, and names the quiz', async () => {
  const db = base();
  db.weak_points.push(
    { id: 'w1', user_id: 'user-1', course_id: COURSE, quiz_id: null, task_id: null, section: '2.1', page_ref: '', summary: 'once', confusion: null, error_type: 'algebra', times_missed: 1, first_seen_at: 'x', last_seen_at: '2026-09-25', status: 'open', fixed_at: null },
    { id: 'w2', user_id: 'user-1', course_id: COURSE, quiz_id: QUIZ, task_id: null, section: '1.3', page_ref: 'p.22', summary: 'thrice', confusion: 'a vs b', error_type: 'concept', times_missed: 3, first_seen_at: 'x', last_seen_at: '2026-09-01', status: 'open', fixed_at: null },
    { id: 'w3', user_id: 'user-1', course_id: COURSE, quiz_id: null, task_id: null, section: '1.4', page_ref: '', summary: 'fixed', confusion: null, error_type: 'careless', times_missed: 5, first_seen_at: 'x', last_seen_at: '2026-09-02', status: 'fixed', fixed_at: 'y' },
  );
  const supabase = fakeSupabase(db) as never;
  const open = read(await getWeakPointsTool(token, { course_id: COURSE, status: 'open', limit: 50 }, supabase)).weak_points as { id: string; quiz: { title: string } | null }[];
  assert.deepEqual(open.map((w) => w.id), ['w2', 'w1']);
  assert.equal(open[0].quiz?.title, 'Ch 1 quiz');
  const inOne = read(await getWeakPointsTool(token, { course_id: COURSE, status: 'all', section: '1', limit: 50 }, supabase)).weak_points as { id: string }[];
  assert.deepEqual(inOne.map((w) => w.id), ['w3', 'w2']);
});

test('record_weak_points refuses a course that is not the student’s', async () => {
  const db = base();
  db.courses[0].user_id = 'someone-else';
  const reply = await recordWeakPointsTool(token, { course_id: COURSE, items: [item('A')] }, fakeSupabase(db) as never);
  assert.equal((reply as { isError?: boolean }).isError, true);
  assert.equal(db.weak_points.length, 0);
});

test('reopen_weak_point on an unknown id says so', async () => {
  const reply = await reopenWeakPointTool(token, { id: '33333333-3333-4333-8333-333333333333' }, fakeSupabase(base()) as never);
  assert.equal((reply as { isError?: boolean }).isError, true);
});
