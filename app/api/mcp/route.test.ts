import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isoDate, startOfWeek } from '@/lib/utils';
import { getWeeklyStats } from './route';

type Row = Record<string, unknown>;

// Mirrors the shape of a real, un-migrated `tasks` table: no `pages` column.
// This is exactly the shape that made get_weekly_stats fail with
// "column tasks.pages does not exist" (Postgres 42703) — a named select that
// asks for a column outside this list must fail here too, the same way it
// failed in production.
const SCHEMA: Record<string, string[]> = {
  user_settings: ['user_id', 'active_semester_id'],
  courses: ['id', 'user_id', 'semester_id', 'code', 'name', 'weekly_goal_hours'],
  sessions: ['id', 'user_id', 'semester_id', 'course_id', 'task_id', 'date', 'duration_seconds', 'note'],
  tasks: ['id', 'user_id', 'semester_id', 'course_id', 'title', 'due_date', 'priority', 'completed', 'completed_at', 'created_at'],
};

// A minimal PostgREST-alike double: `.from(table)` returns a chainable,
// awaitable (`.then`) builder over an in-memory row set, and `.select()`
// rejects with a 42703-shaped error for any column not in SCHEMA, the same
// way a live, un-migrated Postgres project would.
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const known = new Set(SCHEMA[table] ?? []);
      let rows = (tables[table] ?? []).slice();
      let failure: { code: string; message: string } | null = null;

      const checkColumns = (cols: string) => {
        if (failure || cols.trim() === '*') return;
        for (const raw of cols.split(',')) {
          const col = raw.trim();
          if (col && !known.has(col)) failure = { code: '42703', message: `column ${table}.${col} does not exist` };
        }
      };
      const settle = () => (failure ? { data: null, error: failure } : { data: rows, error: null });

      const builder = {
        select(cols: string) {
          checkColumns(cols);
          return builder;
        },
        eq(col: string, value: unknown) {
          if (!failure) rows = rows.filter((row) => row[col] === value);
          return builder;
        },
        gte(col: string, value: unknown) {
          if (!failure) rows = rows.filter((row) => (row[col] as string) >= (value as string));
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle() {
          const settled = settle();
          return Promise.resolve({ data: (settled.data as Row[] | null)?.[0] ?? null, error: settled.error });
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(settle()).then(resolve, reject);
        },
      };
      return builder;
    },
  } as never;
}

const TOKEN = {
  v: 1 as const,
  kind: 'access' as const,
  iat: 0,
  exp: 0,
  clientId: 'test-client',
  scope: 'akada.tasks.read akada.tasks.write',
  userId: 'user-1',
  supabaseAccessToken: 'token-1',
};

const WEEK_START = isoDate(startOfWeek(new Date()));

function fixtures(): Record<string, Row[]> {
  return {
    user_settings: [{ user_id: 'user-1', active_semester_id: 'sem-1' }],
    courses: [{ id: 'course-1', user_id: 'user-1', semester_id: 'sem-1', code: 'CS101', name: 'Intro to CS', weekly_goal_hours: 5 }],
    sessions: [
      { id: 'session-1', user_id: 'user-1', semester_id: 'sem-1', course_id: 'course-1', task_id: null, date: WEEK_START, duration_seconds: 3600, note: '' },
    ],
    // No `pages` key at all, matching SCHEMA above.
    tasks: [
      {
        id: 'task-1',
        user_id: 'user-1',
        semester_id: 'sem-1',
        course_id: 'course-1',
        title: 'Read chapter 1',
        due_date: null,
        priority: 'normal',
        completed: true,
        completed_at: `${WEEK_START}T10:00:00.000Z`,
        created_at: `${WEEK_START}T09:00:00.000Z`,
      },
    ],
  };
}

test('get_weekly_stats reads a week that has sessions in it', async () => {
  const output = (await getWeeklyStats(TOKEN, { week_offset: 0 }, fakeSupabase(fixtures()))) as {
    isError?: boolean;
    structuredContent?: {
      totals: { hours_logged: number; session_count: number; tasks_completed: number };
      courses: { hours_logged: number }[];
    };
  };

  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  const body = output.structuredContent!;
  assert.equal(body.totals.session_count, 1);
  assert.equal(body.totals.hours_logged, 1);
  assert.equal(body.totals.tasks_completed, 1);
  assert.equal(body.courses[0].hours_logged, 1);
});

test('get_weekly_stats reads a week with no sessions in it', async () => {
  const output = (await getWeeklyStats(TOKEN, { week_offset: -1 }, fakeSupabase(fixtures()))) as {
    isError?: boolean;
    structuredContent?: {
      totals: { hours_logged: number; session_count: number; tasks_completed: number };
      courses: { hours_logged: number }[];
    };
  };

  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  const body = output.structuredContent!;
  assert.equal(body.totals.session_count, 0);
  assert.equal(body.totals.hours_logged, 0);
  assert.equal(body.totals.tasks_completed, 0);
  assert.equal(body.courses[0].hours_logged, 0);
});
