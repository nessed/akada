import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isoDate, startOfWeek } from '@/lib/utils';
import { createTasks, getWeeklyStats } from './route';

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
function fakeSupabase(tables: Record<string, Row[]>, schema: Record<string, string[]> = SCHEMA) {
  return {
    from(table: string) {
      const known = new Set(schema[table] ?? []);
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
        // An insert names its columns through the keys of the rows it sends,
        // and a live project rejects the whole statement for one it does not
        // have, which is the failure every optional column has to survive.
        insert(input: Row | Row[]) {
          const list = Array.isArray(input) ? input : [input];
          for (const row of list) {
            for (const col of Object.keys(row)) {
              if (!failure && !known.has(col)) failure = { code: '42703', message: `column ${table}.${col} does not exist` };
            }
          }
          if (!failure) {
            const stamped = list.map((row, i) => ({ id: `${table}-new-${i}`, created_at: '2026-09-22T00:00:00.000Z', ...row }));
            (tables[table] ??= []).push(...stamped);
            rows = stamped;
          }
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

// A project that has run the latest supabase/schema.sql, for the writes that
// genuinely need a newer column.
const MIGRATED: Record<string, string[]> = {
  ...SCHEMA,
  tasks: [...SCHEMA.tasks, 'description', 'subtasks', 'kind', 'weight', 'pages'],
};

type CreateOutput = {
  isError?: boolean;
  content?: { text: string }[];
  structuredContent?: {
    created: { title: string; kind: string; weight: number | null; pages: number | null }[];
  };
};

test('create_tasks still writes plain tasks against a table with none of the newer columns', async () => {
  const tables = fixtures();
  const output = (await createTasks(
    TOKEN,
    { course_id: 'course-1', tasks: [{ title: 'Problem set 3', priority: 'normal', kind: 'task' }] },
    fakeSupabase(tables),
  )) as CreateOutput;

  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  const written = tables.tasks.at(-1)!;
  for (const col of ['description', 'subtasks', 'kind', 'weight', 'pages']) {
    assert.ok(!(col in written), `a plain task should not name ${col}`);
  }
  assert.deepEqual(
    { kind: output.structuredContent!.created[0].kind, weight: output.structuredContent!.created[0].weight },
    { kind: 'task', weight: null },
  );
});

test('create_tasks says what a task is when asked to, uniformly across the batch', async () => {
  const tables = fixtures();
  const output = (await createTasks(
    TOKEN,
    {
      course_id: 'course-1',
      tasks: [
        { title: 'Midterm I', due_date: '2026-10-03', priority: 'high', kind: 'exam', weight: 25 },
        { title: 'Todaro ch. 3', priority: 'normal', kind: 'reading', pages: 38 },
        { title: 'Email the TA', priority: 'normal', kind: 'task' },
      ],
    },
    fakeSupabase(tables, MIGRATED),
  )) as CreateOutput;

  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  const written = tables.tasks.slice(-3);
  // kind is `not null`, so every row names it once any row needs it; a row
  // that left it out would be written as NULL rather than as the default.
  assert.deepEqual(written.map((row) => row.kind), ['exam', 'reading', 'task']);
  assert.deepEqual(written.map((row) => row.weight), [25, null, null]);
  assert.deepEqual(written.map((row) => row.pages), [null, 38, null]);
  assert.deepEqual(
    output.structuredContent!.created.map((task) => [task.kind, task.weight, task.pages]),
    [['exam', 25, null], ['reading', null, 38], ['task', null, null]],
  );
});

test('create_tasks says why an exam could not be saved on a project without the column', async () => {
  const output = (await createTasks(
    TOKEN,
    { course_id: 'course-1', tasks: [{ title: 'Final', priority: 'high', kind: 'exam', weight: 40 }] },
    fakeSupabase(fixtures()),
  )) as CreateOutput;

  assert.ok(output.isError, 'an exam needs the kind column and should fail rather than save as a plain task');
  assert.match(output.content![0].text, /42703/);
});
