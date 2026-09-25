import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isoDate, startOfWeek } from '@/lib/utils';
import {
  createTasks,
  deleteStudySession,
  deleteTasks,
  getGradeProjection,
  getReadingBacklog,
  getRecallTool,
  getWeeklyStats,
  keepForRecallTool,
  listStudySessions,
  logStudySession,
  recordGrade,
  recordRecallTool,
  updateStudySession,
} from './route';

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
      let pendingDelete = false;

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
        if (pendingDelete) {
          tables[table] = (tables[table] ?? []).filter((row) => !rows.includes(row));
          pendingDelete = false;
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
        delete() {
          pendingDelete = true;
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
        lte(col: string, value: unknown) {
          if (!failure) rows = rows.filter((row) => (row[col] as string) <= (value as string));
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

/* ── A sitting with a practice score ─────────────────────────────────── */

const WITH_SCORES: Record<string, string[]> = {
  ...MIGRATED,
  sessions: [...SCHEMA.sessions, 'score', 'score_out_of'],
};

type LogOutput = {
  isError?: boolean;
  content?: { text: string }[];
  structuredContent?: { session: { score?: number; score_out_of?: number; duration_minutes: number }; message?: string };
};

const sitting = {
  course_id: 'course-1',
  duration_minutes: 50,
  date: '2026-09-22',
  note: 'Machiavelli closed book',
};

test('log_study_session keeps a practice score with the sitting', async () => {
  const tables = fixtures();
  const output = (await logStudySession(TOKEN, { ...sitting, score: 4.5, score_out_of: 8 }, fakeSupabase(tables, WITH_SCORES))) as LogOutput;
  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  const row = tables.sessions.at(-1)!;
  assert.deepEqual([row.score, row.score_out_of, row.duration_seconds], [4.5, 8, 3000]);
  assert.equal(output.structuredContent?.session.score, 4.5);
  assert.equal(output.structuredContent?.message, undefined);
});

test('log_study_session logs the hours without a score the project has no columns for', async () => {
  const tables = fixtures();
  const before = tables.sessions.length;
  const output = (await logStudySession(TOKEN, { ...sitting, score: 4.5, score_out_of: 8 }, fakeSupabase(tables, MIGRATED))) as LogOutput;
  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  assert.equal(tables.sessions.length, before + 1, 'one sitting, written once');
  assert.equal('score' in tables.sessions.at(-1)!, false);
  assert.equal(output.structuredContent?.session.score, undefined);
  assert.match(output.structuredContent?.message ?? '', /schema\.sql/);
});

test('log_study_session never refuses the hours over a score that does not add up', async () => {
  const bad: { score?: number | string; score_out_of?: number | string }[] = [
    { score: 45 },
    { score: 105, score_out_of: 100 },
    { score: '4,5,6', score_out_of: '8' },
    { score: 0, score_out_of: 0.004 },
  ];
  for (const score of bad) {
    const tables = fixtures();
    const before = tables.sessions.length;
    const output = (await logStudySession(TOKEN, { ...sitting, ...score }, fakeSupabase(tables, WITH_SCORES))) as LogOutput;
    assert.ok(!output.isError, `${JSON.stringify(score)}: ${JSON.stringify(output)}`);
    assert.equal(tables.sessions.length, before + 1, JSON.stringify(score));
    assert.equal('score' in tables.sessions.at(-1)!, false, JSON.stringify(score));
    assert.match(output.structuredContent?.message ?? '', /both halves/, JSON.stringify(score));
  }
});

test('log_study_session takes a score written the way people write one', async () => {
  const tables = fixtures();
  const output = (await logStudySession(TOKEN, { ...sitting, score: '1,350', score_out_of: '1600' }, fakeSupabase(tables, WITH_SCORES))) as LogOutput;
  assert.ok(!output.isError);
  assert.deepEqual([tables.sessions.at(-1)!.score, tables.sessions.at(-1)!.score_out_of], [1350, 1600]);
});

/* ── Fixing a logged sitting's note ──────────────────────────────────── */

type UpdateOutput = {
  isError?: boolean;
  content?: { text: string }[];
  structuredContent?: { session: { id: string; note: string; duration_seconds: number; course: { id: string } }; message: string };
};

test('update_study_session rewrites the note and nothing else', async () => {
  const tables = fixtures();
  const before = { ...tables.sessions[0] };
  const output = (await updateStudySession(TOKEN, { session_id: 'session-1', note: 'Ch. 3 problems, redid 3.4' }, fakeSupabase(tables))) as UpdateOutput;
  assert.ok(!output.isError, `expected success, got: ${JSON.stringify(output)}`);
  assert.deepEqual(tables.sessions[0], { ...before, note: 'Ch. 3 problems, redid 3.4' });
  assert.equal(output.structuredContent?.session.id, 'session-1');
  assert.equal(output.structuredContent?.session.note, 'Ch. 3 problems, redid 3.4');
  assert.equal(output.structuredContent?.session.duration_seconds, 3600);
  assert.equal(output.structuredContent?.session.course.id, 'course-1');
});

test('update_study_session refuses a session that is not the student\'s own', async () => {
  const tables = fixtures();
  tables.sessions.push({ id: 'session-2', user_id: 'user-2', semester_id: 'sem-1', course_id: 'course-1', task_id: null, date: WEEK_START, duration_seconds: 600, note: 'theirs' });
  for (const session_id of ['session-2', 'session-missing']) {
    const output = (await updateStudySession(TOKEN, { session_id, note: 'mine now' }, fakeSupabase(tables))) as UpdateOutput;
    assert.equal(output.isError, true, session_id);
    assert.match(output.content?.[0].text ?? '', /not in your active Akada semester/, session_id);
  }
  assert.equal(tables.sessions[1].note, 'theirs');
});

test('update_study_session refuses a session from a course outside the active semester', async () => {
  const tables = fixtures();
  tables.courses.push({ id: 'course-old', user_id: 'user-1', semester_id: 'sem-0', code: 'HIST100', name: 'Old', weekly_goal_hours: 3 });
  tables.sessions.push({ id: 'session-old', user_id: 'user-1', semester_id: 'sem-0', course_id: 'course-old', task_id: null, date: '2026-01-10', duration_seconds: 600, note: 'old' });
  const output = (await updateStudySession(TOKEN, { session_id: 'session-old', note: 'new' }, fakeSupabase(tables))) as UpdateOutput;
  assert.equal(output.isError, true);
  assert.equal(tables.sessions.at(-1)!.note, 'old');
});

// ---- Grades ----

const GRADED_SCHEMA: Record<string, string[]> = {
  ...SCHEMA,
  courses: [...SCHEMA.courses, 'assessments', 'grading'],
  tasks: [...SCHEMA.tasks, 'kind', 'pages', 'weight'],
};

const COURSE_ID = '11111111-1111-4111-8111-111111111111';

function gradedFixtures(): Record<string, Row[]> {
  return {
    user_settings: [{ user_id: 'user-1', active_semester_id: 'sem-1' }],
    courses: [
      {
        id: COURSE_ID,
        user_id: 'user-1',
        semester_id: 'sem-1',
        code: 'ECON 240',
        name: 'Development',
        weekly_goal_hours: 5,
        assessments: [
          { id: 'q1', label: 'Quiz 1', weight: 10, score: 8, outOf: 10, group: 'quizzes' },
          { id: 'q2', label: 'Quiz 2', weight: 10, score: null, outOf: 10, group: 'quizzes' },
          { id: 'q3', label: 'Quiz 3', weight: 10, score: null, outOf: 10, group: 'quizzes' },
          { id: 'mid', label: 'Midterm', weight: 30, score: null, outOf: 50 },
          { id: 'fin', label: 'Final exam', weight: 50, score: null, outOf: 100 },
        ],
        // Best 2 of 3 quizzes: the course counts to 100.
        grading: { basis: 'absolute', dropRules: [{ group: 'quizzes', keep: 2 }] },
      },
    ],
    sessions: [],
    tasks: [],
  };
}

type Reply = { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> };

test('record_grade writes a mark by label and says where the course stands', async () => {
  const db = gradedFixtures();
  const output = (await recordGrade(
    TOKEN,
    { course_id: COURSE_ID, grades: [{ component: 'midterm', score: 40, out_of: 50 }] },
    fakeSupabase(db, GRADED_SCHEMA),
  )) as Reply;
  assert.equal(output.isError, undefined, output.content[0].text);
  const mid = (db.courses[0].assessments as Row[]).find((row) => row.id === 'mid')!;
  assert.deepEqual([mid.score, mid.outOf], [40, 50]);
  const standing = output.structuredContent!.standing as Record<string, unknown>;
  // 8/10 on a 10% quiz and 40/50 on a 30% midterm: 32 of 40 marked.
  assert.equal(standing.percent_so_far, 80);
  assert.equal(standing.marked_weight, 40);
});

test('record_grade writes nothing when one mark in the request does not add up', async () => {
  const db = gradedFixtures();
  const output = (await recordGrade(
    TOKEN,
    {
      course_id: COURSE_ID,
      grades: [
        { component: 'Quiz 2', score: 9, out_of: 10 },
        { component: 'Quiz 3', score: 14, out_of: 10 },
      ],
    },
    fakeSupabase(db, GRADED_SCHEMA),
  )) as Reply;
  assert.equal(output.isError, true);
  assert.equal((db.courses[0].assessments as Row[]).find((row) => row.id === 'q2')!.score, null);
});

test('record_grade refuses a label that matches more than one component', async () => {
  const output = (await recordGrade(
    TOKEN,
    { course_id: COURSE_ID, grades: [{ component: 'quiz', score: 9 }] },
    fakeSupabase(gradedFixtures(), GRADED_SCHEMA),
  )) as Reply;
  assert.equal(output.isError, true);
  assert.match(output.content[0].text, /more than one/);
});

test('get_grade_projection solves for the final with the rest at the average so far', async () => {
  const db = gradedFixtures();
  (db.courses[0].assessments as Row[]).find((row) => row.id === 'mid')!.score = 35; // 70%
  const output = (await getGradeProjection(
    TOKEN,
    { course_id: COURSE_ID, target_percent: 80, solve_for: 'final' },
    fakeSupabase(db, GRADED_SCHEMA),
  )) as Reply;
  assert.equal(output.isError, undefined, output.content[0].text);
  const body = output.structuredContent!;
  // Counted: Quiz 1 (8/10), one open quiz slot, midterm 35/50, final.
  // Earned 8 + 21 = 29 of 40 marked, 72.5%. The open quiz at 72.5% is 7.25.
  // 80 - 29 - 7.25 = 43.75 needed from a 50% final: 87.5%.
  const solved = body.solve_for as Record<string, unknown>;
  assert.equal(solved.needed_percent, 87.5);
  assert.equal(solved.needed_score, 87.5);
  assert.equal(solved.status, 'reachable');
  assert.equal(body.floor_percent, 29);
  assert.equal(body.ceiling_percent, 89);
});

test('get_grade_projection says when a target is out of reach', async () => {
  const db = gradedFixtures();
  (db.courses[0].assessments as Row[]).find((row) => row.id === 'mid')!.score = 10;
  const output = (await getGradeProjection(TOKEN, { course_id: COURSE_ID, target_percent: 95 }, fakeSupabase(db, GRADED_SCHEMA))) as Reply;
  const target = output.structuredContent!.target as Record<string, unknown>;
  assert.equal(target.status, 'out_of_reach');
});

test('get_grade_projection will not solve for a component already marked', async () => {
  const output = (await getGradeProjection(
    TOKEN,
    { course_id: COURSE_ID, target_percent: 80, solve_for: 'Quiz 1' },
    fakeSupabase(gradedFixtures(), GRADED_SCHEMA),
  )) as Reply;
  assert.equal(output.isError, true);
});

// ---- Deleting ----

const TASK_A = '22222222-2222-4222-8222-222222222222';
const TASK_B = '33333333-3333-4333-8333-333333333333';
const SESSION_A = '44444444-4444-4444-8444-444444444444';

function deletable(): Record<string, Row[]> {
  const db = gradedFixtures();
  db.courses.push({ id: 'course-old', user_id: 'user-1', semester_id: 'sem-0', code: 'HIST100', name: 'Old', weekly_goal_hours: 3 });
  db.tasks = [
    { id: TASK_A, user_id: 'user-1', semester_id: 'sem-1', course_id: COURSE_ID, title: 'Read Sen ch. 1', due_date: null, priority: 'normal', completed: false, completed_at: null, created_at: '2026-09-01T00:00:00.000Z' },
    { id: TASK_B, user_id: 'user-1', semester_id: 'sem-0', course_id: 'course-old', title: 'Old essay', due_date: null, priority: 'normal', completed: false, completed_at: null, created_at: '2026-01-01T00:00:00.000Z' },
  ];
  db.sessions = [
    { id: SESSION_A, user_id: 'user-1', semester_id: 'sem-1', course_id: COURSE_ID, task_id: null, date: '2026-09-20', duration_seconds: 2700, note: 'twice' },
  ];
  return db;
}

test('delete_tasks deletes a task in the active semester', async () => {
  const db = deletable();
  const output = (await deleteTasks(TOKEN, { task_ids: [TASK_A] }, fakeSupabase(db, GRADED_SCHEMA))) as Reply;
  assert.equal(output.isError, undefined, output.content[0].text);
  assert.deepEqual(db.tasks.map((row) => row.id), [TASK_B]);
});

test('delete_tasks deletes nothing when any id is outside the active semester', async () => {
  const db = deletable();
  const output = (await deleteTasks(TOKEN, { task_ids: [TASK_A, TASK_B] }, fakeSupabase(db, GRADED_SCHEMA))) as Reply;
  assert.equal(output.isError, true);
  assert.equal(db.tasks.length, 2);
});

test('delete_study_session removes the sitting and says which one it was', async () => {
  const db = deletable();
  const output = (await deleteStudySession(TOKEN, { session_id: SESSION_A }, fakeSupabase(db, GRADED_SCHEMA))) as Reply;
  assert.equal(output.isError, undefined, output.content[0].text);
  assert.equal(db.sessions.length, 0);
  assert.equal((output.structuredContent!.deleted as Row).duration_minutes, 45);
});

test('delete_study_session refuses a session it cannot find', async () => {
  const db = deletable();
  const output = (await deleteStudySession(TOKEN, { session_id: TASK_A }, fakeSupabase(db, GRADED_SCHEMA))) as Reply;
  assert.equal(output.isError, true);
  assert.equal(db.sessions.length, 1);
});

// ---- Study session history ----

const OTHER_COURSE = '55555555-5555-4555-8555-555555555555';

// Two courses in the active semester, one from an older one, and a second
// student whose rows sit in the same semester and course ids, so only the
// user_id filter keeps them out.
function history(): Record<string, Row[]> {
  const db = deletable();
  db.courses.push({ id: OTHER_COURSE, user_id: 'user-1', semester_id: 'sem-1', code: 'MATH200', name: 'Linear Algebra', weekly_goal_hours: 4 });
  const sitting = (id: string, course_id: string, date: string, extra: Row = {}): Row => ({
    id, user_id: 'user-1', semester_id: 'sem-1', course_id, task_id: null, date, duration_seconds: 1800, note: id, ...extra,
  });
  db.sessions = [
    sitting('econ-1', COURSE_ID, '2026-09-01'),
    sitting('econ-2', COURSE_ID, '2026-09-05'),
    sitting('econ-3', COURSE_ID, '2026-09-10'),
    sitting('econ-4', COURSE_ID, '2026-09-10'),
    sitting('econ-5', COURSE_ID, '2026-09-18'),
    sitting('math-1', OTHER_COURSE, '2026-09-19'),
    sitting('math-2', OTHER_COURSE, '2026-09-20'),
    sitting('old-1', 'course-old', '2026-02-01', { semester_id: 'sem-0' }),
    sitting('theirs-1', COURSE_ID, '2026-09-11', { user_id: 'user-2' }),
    sitting('theirs-2', OTHER_COURSE, '2026-09-21', { user_id: 'user-2' }),
  ];
  db.user_settings.push({ user_id: 'user-2', active_semester_id: 'sem-1' });
  return db;
}

const ids = (output: Reply) => (output.structuredContent!.sessions as Row[]).map((row) => row.id);

test('list_study_sessions narrows to one course, newest first', async () => {
  const output = (await listStudySessions(TOKEN, { course_id: COURSE_ID, limit: 50 }, fakeSupabase(history(), GRADED_SCHEMA))) as Reply;
  assert.equal(output.isError, undefined, output.content[0].text);
  assert.deepEqual(ids(output), ['econ-5', 'econ-4', 'econ-3', 'econ-2', 'econ-1']);
  const first = (output.structuredContent!.sessions as Row[])[0];
  assert.deepEqual(first, {
    id: 'econ-5', date: '2026-09-18', duration_seconds: 1800, note: 'econ-5',
    course: { id: COURSE_ID, code: 'ECON 240', name: 'Development' },
  });
  assert.equal((output.structuredContent!.meta as Row).total, 5);
  assert.equal(output.structuredContent!.next_cursor, undefined);
});

test('list_study_sessions reads an inclusive date range', async () => {
  const output = (await listStudySessions(TOKEN, { from: '2026-09-05', to: '2026-09-19', limit: 50 }, fakeSupabase(history(), GRADED_SCHEMA))) as Reply;
  assert.equal(output.isError, undefined, output.content[0].text);
  assert.deepEqual(ids(output), ['math-1', 'econ-5', 'econ-4', 'econ-3', 'econ-2']);

  const backwards = (await listStudySessions(TOKEN, { from: '2026-09-19', to: '2026-09-05', limit: 50 }, fakeSupabase(history(), GRADED_SCHEMA))) as Reply;
  assert.equal(backwards.isError, true);
});

test('list_study_sessions pages with a cursor and never repeats or skips a sitting', async () => {
  const db = history();
  const seen: unknown[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const output = (await listStudySessions(TOKEN, { limit: 3, cursor }, fakeSupabase(db, GRADED_SCHEMA))) as Reply;
    assert.equal(output.isError, undefined, output.content[0].text);
    assert.equal((output.structuredContent!.meta as Row).total, 7);
    seen.push(...ids(output));
    cursor = output.structuredContent!.next_cursor as string | undefined;
    pages += 1;
  } while (cursor && pages < 10);
  assert.equal(pages, 3);
  assert.deepEqual(seen, ['math-2', 'math-1', 'econ-5', 'econ-4', 'econ-3', 'econ-2', 'econ-1']);

  const junk = (await listStudySessions(TOKEN, { limit: 3, cursor: 'not-a-cursor' }, fakeSupabase(db, GRADED_SCHEMA))) as Reply;
  assert.equal(junk.isError, true);
});

test('list_study_sessions never shows another student\'s sessions, or another semester\'s', async () => {
  const output = (await listStudySessions(TOKEN, { limit: 200 }, fakeSupabase(history(), GRADED_SCHEMA))) as Reply;
  assert.equal(output.isError, undefined, output.content[0].text);
  const seen = ids(output);
  assert.ok(!seen.some((id) => String(id).startsWith('theirs-')), `leaked: ${seen.join(', ')}`);
  assert.ok(!seen.includes('old-1'));
  assert.equal((output.structuredContent!.meta as Row).total, 7);

  const theirs = (await listStudySessions({ ...TOKEN, userId: 'user-2' }, { limit: 200 }, fakeSupabase(history(), GRADED_SCHEMA))) as Reply;
  assert.deepEqual(ids(theirs), []);
});

// ---- Reading backlog ----

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function reading(id: string, patch: Row): Row {
  return { id, user_id: 'user-1', semester_id: 'sem-1', course_id: COURSE_ID, title: id, due_date: null, priority: 'normal', completed: false, completed_at: null, created_at: '2026-09-01T00:00:00.000Z', kind: 'reading', pages: null, weight: null, ...patch };
}

test('get_reading_backlog times the backlog at the pace the student has shown', async () => {
  const db = gradedFixtures();
  db.tasks = [
    // 60 pages finished over two logged hours: 30 an hour.
    reading('done', { completed: true, pages: 60 }),
    reading('soon', { pages: 45, due_date: inDays(2) }),
    reading('later', { pages: 90, due_date: inDays(30) }),
    reading('loose', { pages: 30 }),
    reading('nopages', { due_date: inDays(1) }),
  ];
  db.sessions = [{ id: 's', user_id: 'user-1', semester_id: 'sem-1', course_id: COURSE_ID, task_id: 'done', date: inDays(-3), duration_seconds: 7200, note: '' }];
  const output = (await getReadingBacklog(TOKEN, { by_date: inDays(4) }, fakeSupabase(db, GRADED_SCHEMA))) as Reply;
  assert.equal(output.isError, undefined, output.content[0].text);
  const body = output.structuredContent!;
  assert.deepEqual(body.pace, { pages_per_hour: 30, measured: true, based_on: { pages_read: 60, hours_logged: 2 } });
  assert.deepEqual(body.totals, { readings: 2, pages: 45, hours: 1.5, without_pages: 1 });
  assert.equal(body.days_left, 5);
  assert.deepEqual(body.undated, { readings: 1, pages: 30, hours: 1, without_pages: 0 });
});

test('get_reading_backlog does not call the default rate the student’s pace', async () => {
  const db = gradedFixtures();
  db.tasks = [reading('one', { pages: 40 })];
  const output = (await getReadingBacklog(TOKEN, {}, fakeSupabase(db, GRADED_SCHEMA))) as Reply;
  const body = output.structuredContent!;
  assert.equal((body.pace as Row).measured, false);
  assert.match(String(body.message), /default 20 pages an hour/);
});
