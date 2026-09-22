import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Session } from './types';

type Row = Record<string, unknown>;

// A PostgREST double for one insert, which refuses a column the project
// does not have the way PostgREST's schema cache does (PGRST204).
function fake(columns: string[], refuseScores = false) {
  const inserts: Row[] = [];
  return {
    inserts,
    client: {
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      from() {
        let values: Row = {};
        const b = {
          insert(v: Row) {
            values = v;
            inserts.push(v);
            return b;
          },
          select() {
            return b;
          },
          single() {
            const unknown = Object.keys(values).find((key) => !columns.includes(key));
            if (unknown) {
              return Promise.resolve({ data: null, error: { code: 'PGRST204', message: `Could not find the '${unknown}' column of 'sessions'` } });
            }
            // A check constraint that disagrees with the app about a score,
            // say one written by an older schema.sql.
            if (refuseScores && 'score' in values) {
              return Promise.resolve({ data: null, error: { code: '23514', message: 'violates check constraint "sessions_score_range"' } });
            }
            return Promise.resolve({ data: { id: 's1', created_at: '2026-09-22T20:00:00Z', ...values }, error: null });
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
  return adapter as unknown as { addSession(input: Omit<Session, 'id' | 'createdAt'>): Promise<Session> };
}

const BASE = ['user_id', 'course_id', 'task_id', 'date', 'duration_seconds', 'note', 'break_seconds'];
const sitting = (patch: Partial<Session> = {}): Omit<Session, 'id' | 'createdAt'> => ({
  courseId: 'pol',
  taskId: null,
  date: '2026-09-22',
  durationSeconds: 2700,
  note: 'Machiavelli closed book',
  ...patch,
});

test('a practice score is written and read back with its sitting', async () => {
  const f = fake([...BASE, 'score', 'score_out_of']);
  const saved = await (await adapterWith(f.client)).addSession(sitting({ score: 4.5, scoreOutOf: 8 }));
  assert.equal(f.inserts.length, 1);
  assert.equal(f.inserts[0].score, 4.5);
  assert.deepEqual([saved.score, saved.scoreOutOf], [4.5, 8]);
});

test('a database without the columns still gets the sitting, without its score', async () => {
  const f = fake(BASE);
  const saved = await (await adapterWith(f.client)).addSession(sitting({ score: 4.5, scoreOutOf: 8 }));
  assert.equal(f.inserts.length, 2, 'tried with the score, then without');
  assert.equal('score' in f.inserts[1], false);
  assert.equal(saved.durationSeconds, 2700);
  assert.equal(saved.score, undefined);
});

test('a sitting without a score never names the columns', async () => {
  const f = fake(BASE);
  await (await adapterWith(f.client)).addSession(sitting({ score: 9, scoreOutOf: 8 }));
  assert.equal(f.inserts.length, 1, 'a score that does not add up is no score, so one plain insert');
  assert.equal('score' in f.inserts[0], false);
});

test('a score the database check refuses costs the score, not the sitting', async () => {
  const f = fake([...BASE, 'score', 'score_out_of'], true);
  const saved = await (await adapterWith(f.client)).addSession(sitting({ score: 4.5, scoreOutOf: 8 }));
  assert.equal(f.inserts.length, 2);
  assert.equal(saved.durationSeconds, 2700);
  assert.equal(saved.score, undefined);
});
