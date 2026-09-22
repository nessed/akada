import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isoDate, startOfWeek } from '@/lib/utils';
import { createTasks, getRecallTool, getWeeklyStats, keepForRecallTool, recordRecallTool } from './route';

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
      // A table the project does not have is refused outright, the way
      // PostgREST refuses one it cannot find in its schema cache.
      let failure: { code: string; message: string } | null = schema[table]
        ? null
        : { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` };
      let pendingUpdate: Row | null = null;

      const checkColumns = (cols: string) => {
        if (failure || cols.trim() === '*') return;
        for (const raw of cols.split(',')) {
          const col = raw.trim();
          if (col && !known.has(col)) failure = { code: '42703', message: `column ${table}.${col} does not exist` };
        }
      };
      const settle = () => {
        if (failure) return { data: null, error: failure };
        if (pendingUpdate) {
          for (const row of rows) Object.assign(row, pendingUpdate);
          pendingUpdate = null;
        }
        return { data: rows, error: null };
      };
      const checkKeys = (list: Row[]) => {
        for (const row of list) {
          for (const col of Object.keys(row)) {
            if (!failure && !known.has(col)) failure = { code: '42703', message: `column ${table}.${col} does not exist` };
          }
        }
      };
      // schema.sql's akada_set_semester_from_course trigger: a row that names
      // a course and no term takes the course's.
      const withTerm = (row: Row): Row =>
        known.has('semester_id') && row.course_id && !row.semester_id
          ? { ...row, semester_id: (tables.courses ?? []).find((c) => c.id === row.course_id)?.semester_id ?? null }
          : row;

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
          checkKeys(list);
          if (!failure) {
            const stamped = list.map((row, i) => ({ id: `${table}-new-${i}`, created_at: '2026-09-22T00:00:00.000Z', ...withTerm(row) }));
            (tables[table] ??= []).push(...stamped);
            rows = stamped;
          }
          return builder;
        },
        // On conflict of the named columns: update the row in place, or
        // leave it alone entirely when duplicates are to be ignored.
        upsert(input: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
          const list = Array.isArray(input) ? input : [input];
          checkKeys(list);
          if (failure) return builder;
          const cols = (options.onConflict ?? 'id').split(',').map((c) => c.trim());
          const store = (tables[table] ??= []);
          const touched: Row[] = [];
          list.forEach((row, i) => {
            const held = store.find((existing) => cols.every((c) => existing[c] === row[c]));
            if (held) {
              if (!options.ignoreDuplicates) {
                Object.assign(held, row);
                touched.push(held);
              }
            } else {
              const fresh = { id: `${table}-up-${store.length}-${i}`, created_at: '2026-09-20T10:00:00.000Z', ...withTerm(row) };
              store.push(fresh);
              touched.push(fresh);
            }
          });
          rows = touched;
          return builder;
        },
        update(patch: Row) {
          checkKeys([patch]);
          pendingUpdate = patch;
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
        in(col: string, values: unknown[]) {
          if (!failure) rows = rows.filter((row) => values.includes(row[col]));
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

/* ── Recall ─────────────────────────────────────────────────────────── */

const RECALL_TABLE = ['id', 'user_id', 'course_id', 'semester_id', 'item_key', 'prompt', 'source', 'ref', 'history', 'let_go', 'created_at', 'updated_at'];

const WITH_RECALL: Record<string, string[]> = { ...MIGRATED, recall_items: RECALL_TABLE };

function recallFixtures(): Record<string, Row[]> {
  const base = fixtures();
  base.tasks = [
    {
      id: 'reading-1',
      user_id: 'user-1',
      semester_id: 'sem-1',
      course_id: 'course-1',
      title: 'Read Angell (1912), The Influence of Credit',
      due_date: null,
      priority: 'normal',
      completed: true,
      completed_at: '2026-09-10T10:00:00.000Z',
      created_at: '2026-09-01T09:00:00.000Z',
      subtasks: [],
    },
    {
      id: 'concepts',
      user_id: 'user-1',
      semester_id: 'sem-1',
      course_id: 'course-1',
      title: 'Limits concepts',
      due_date: null,
      priority: 'high',
      completed: false,
      completed_at: null,
      created_at: '2026-09-01T09:00:00.000Z',
      subtasks: [
        { id: 's-1', title: '0/0 factor and cancel', completed: true },
        { id: 's-2', title: '0/0 with a root: conjugate', completed: true },
        { id: 's-3', title: 'Sign analysis at an asymptote', completed: false },
      ],
    },
  ];
  base.recall_items = [];
  return base;
}

type RecallOutput = {
  isError?: boolean;
  content?: { text: string }[];
  structuredContent?: Record<string, unknown>;
};

// The recall tools refuse a date more than a day from the server's own, so
// these tests answer on the real day, in UTC, rather than a fixed one.
const RECALL_TODAY = new Date().toISOString().slice(0, 10);
function recallDay(offset: number): string {
  const d = new Date(`${RECALL_TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

test('get_recall reads finished readings even on a project without the recall table', async () => {
  const output = (await getRecallTool(
    TOKEN,
    { include_not_due: false, limit: 20, date: RECALL_TODAY },
    fakeSupabase(recallFixtures(), MIGRATED),
  )) as RecallOutput;
  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  const body = output.structuredContent as { items: { key: string; prompt: string; due: boolean }[]; message?: string };
  assert.deepEqual(body.items.map((item) => item.key), ['task:reading-1']);
  assert.equal(body.items[0].prompt, 'Angell (1912), The Influence of Credit');
  assert.match(body.message ?? '', /schema\.sql/);
});

test('keep_for_recall keeps lines and ticked steps once each', async () => {
  const tables = recallFixtures();
  const supabase = fakeSupabase(tables, WITH_RECALL);
  const first = (await keepForRecallTool(
    TOKEN,
    { course_id: 'course-1', items: ['the three conditions for continuity at a point'], task_id: 'concepts', ticked_steps: true },
    supabase,
  )) as RecallOutput;
  assert.ok(!first.isError, `expected success, got: ${JSON.stringify(first)}`);
  assert.deepEqual(
    tables.recall_items.map((row) => [row.source, row.prompt]).sort(),
    [
      ['own', 'the three conditions for continuity at a point'],
      ['step', '0/0 factor and cancel'],
      ['step', '0/0 with a root: conjugate'],
    ],
  );

  const again = (await keepForRecallTool(
    TOKEN,
    { course_id: 'course-1', items: ['The three conditions for continuity at a point'], task_id: 'concepts', ticked_steps: true },
    fakeSupabase(tables, WITH_RECALL),
  )) as RecallOutput;
  assert.ok(!again.isError);
  assert.equal(tables.recall_items.length, 3, 'nothing is kept twice');
});

test('record_recall writes the answers, and a step that is gone comes off its list', async () => {
  const tables = recallFixtures();
  await keepForRecallTool(TOKEN, { course_id: 'course-1', task_id: 'concepts', ticked_steps: true }, fakeSupabase(tables, WITH_RECALL));

  const output = (await recordRecallTool(
    TOKEN,
    {
      date: RECALL_TODAY,
      results: [
        { key: 'task:reading-1', verdict: 'hazy' },
        { key: 'step:concepts:s-2', verdict: 'gone' },
      ],
    },
    fakeSupabase(tables, WITH_RECALL),
  )) as RecallOutput;
  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);

  const reading = tables.recall_items.find((row) => row.item_key === 'task:reading-1')!;
  assert.deepEqual(reading.history, [{ on: RECALL_TODAY, verdict: 'hazy' }]);
  assert.equal(reading.source, 'reading');

  const concepts = tables.tasks.find((row) => row.id === 'concepts')!;
  assert.deepEqual(
    (concepts.subtasks as { id: string; completed: boolean }[]).map((step) => [step.id, step.completed]),
    [['s-1', true], ['s-2', false], ['s-3', false]],
  );
  const recorded = (output.structuredContent as { recorded: { key: string; next_due_on: string }[] }).recorded;
  assert.equal(recorded.find((r) => r.key === 'step:concepts:s-2')?.next_due_on, recallDay(1));
});

test('record_recall refuses a key it is not keeping rather than inventing one', async () => {
  const output = (await recordRecallTool(
    TOKEN,
    { results: [{ key: 'own:made-up', verdict: 'clear' }] },
    fakeSupabase(recallFixtures(), WITH_RECALL),
  )) as RecallOutput;
  assert.ok(output.isError);
  assert.match(output.content![0].text, /get_recall/);
});

test('record_recall refuses a date that is not today anywhere', async () => {
  const output = (await recordRecallTool(
    TOKEN,
    { date: recallDay(3), results: [{ key: 'task:reading-1', verdict: 'clear' }] },
    fakeSupabase(recallFixtures(), WITH_RECALL),
  )) as RecallOutput;
  assert.ok(output.isError);
  assert.match(output.content![0].text, /not today anywhere/);
});

test('the device\'s offset decides the day over a date the model carried past midnight', async () => {
  const tables = recallFixtures();
  const output = (await recordRecallTool(
    TOKEN,
    { date: recallDay(-1), utc_offset_minutes: 0, results: [{ key: 'task:reading-1', verdict: 'clear' }] },
    fakeSupabase(tables, WITH_RECALL),
  )) as RecallOutput;
  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  const reading = tables.recall_items.find((row) => row.item_key === 'task:reading-1')!;
  assert.deepEqual(reading.history, [{ on: RECALL_TODAY, verdict: 'clear' }]);
});

test('recall reads a finished reading on the student\'s own day, given their offset', async () => {
  const tables = recallFixtures();
  // Finished at 20:30 UTC: half past one the next morning in Lahore.
  tables.tasks[0].completed_at = `${recallDay(-5)}T20:30:00.000Z`;
  const read = async (utc_offset_minutes?: number) => {
    const output = (await getRecallTool(
      TOKEN,
      { include_not_due: true, limit: 20, utc_offset_minutes },
      fakeSupabase(tables, WITH_RECALL),
    )) as RecallOutput;
    const body = output.structuredContent as { today: string; items: { key: string; due_on: string }[] };
    return body.items.find((item) => item.key === 'task:reading-1')!.due_on;
  };
  assert.equal(await read(), recallDay(-4), 'the day after, in UTC');
  assert.equal(await read(300), recallDay(-3), 'the day after, in Lahore');
});

test('keep_for_recall brings back a step that was let go, with the answers it had', async () => {
  const tables = recallFixtures();
  tables.recall_items.push({
    id: 'row-1',
    user_id: 'user-1',
    semester_id: 'sem-1',
    course_id: 'course-1',
    item_key: 'step:concepts:s-1',
    prompt: '0/0 factor and cancel',
    source: 'step',
    ref: 'concepts:s-1',
    history: [{ on: recallDay(-9), verdict: 'clear' }, { on: recallDay(-6), verdict: 'hazy' }],
    let_go: true,
    created_at: `${recallDay(-10)}T10:00:00.000Z`,
  });
  const output = (await keepForRecallTool(
    TOKEN,
    { course_id: 'course-1', task_id: 'concepts', ticked_steps: true },
    fakeSupabase(tables, WITH_RECALL),
  )) as RecallOutput;
  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  const body = output.structuredContent as { kept: { key: string }[]; brought_back: { key: string }[] };
  assert.deepEqual(body.kept.map((row) => row.key), ['step:concepts:s-2']);
  assert.deepEqual(body.brought_back.map((row) => row.key), ['step:concepts:s-1']);
  const revived = tables.recall_items.find((row) => row.item_key === 'step:concepts:s-1')!;
  assert.equal(revived.let_go, false);
  assert.equal((revived.history as unknown[]).length, 2, 'its answers are still there');
});

test('keep_for_recall treats the second copy of a reading as the reading already kept', async () => {
  const tables = recallFixtures();
  tables.tasks.push({
    ...tables.tasks[0],
    id: 'reading-2',
    title: 'Angell (1912) — done with Claude',
    completed_at: '2026-09-12T10:00:00.000Z',
  });
  const output = (await keepForRecallTool(
    TOKEN,
    { course_id: 'course-1', task_id: 'reading-2', ticked_steps: false },
    fakeSupabase(tables, WITH_RECALL),
  )) as RecallOutput;
  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  assert.match((output.structuredContent as { message: string }).message, /already being kept/);
  assert.equal(tables.recall_items.length, 0, 'no second row for the same reading');
});
