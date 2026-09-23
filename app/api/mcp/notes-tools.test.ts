import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getNoteTool, listNotesTool, recordNoteChecksTool, saveNoteTool, updateNoteTool } from './notes-tools';

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

const NOTE = '# Growth\n\nECON 240\n\n## Quick check\n\n> [!CHECK] What is g?\n>\n> **Answer:** s/c\n\n> [!CHECK] Why did it fail?\n>\n> **Answer:** c stayed high';

test('save_note writes an mcp note under the course and hands back its tally', async () => {
  const db = { courses: [{ id: COURSE, user_id: 'user-1', code: 'ECON 240', name: 'Development' }], notes: [] as Row[] };
  const reply = read(await saveNoteTool(token, { markdown: NOTE, course_id: COURSE }, fakeSupabase(db) as never));
  const note = reply.note as Record<string, unknown>;
  assert.equal(note.title, 'Growth');
  assert.deepEqual(note.checks, { total: 2, got: 0, not_yet: 0, untried: 2 });
  assert.equal((note.course as Record<string, unknown>).code, 'ECON 240');
  assert.equal(db.notes[0].source, 'mcp');
  assert.equal(db.notes[0].user_id, 'user-1');
});

test('save_note refuses a course that is not the student’s', async () => {
  const db = { courses: [{ id: COURSE, user_id: 'someone-else', code: 'X', name: 'X' }], notes: [] as Row[] };
  const reply = await saveNoteTool(token, { markdown: NOTE, course_id: COURSE }, fakeSupabase(db) as never);
  assert.equal((reply as { isError?: boolean }).isError, true);
  assert.equal(db.notes.length, 0);
});

test('record_note_checks fills the strokes and get_note reads them back', async () => {
  const db = { courses: [], notes: [] as Row[] };
  const supabase = fakeSupabase(db) as never;
  const saved = read(await saveNoteTool(token, { markdown: NOTE }, supabase)).note as { id: string };
  const recorded = read(await recordNoteChecksTool(token, { note_id: saved.id, results: [{ index: 0, result: 'got' }, { index: 1, result: 'not_yet' }] }, supabase));
  assert.deepEqual(recorded.checks, { total: 2, got: 1, not_yet: 1, untried: 0 });
  assert.deepEqual(db.notes[0].checks, { 0: 'got', 1: 'miss' });
  const got = read(await getNoteTool(token, { note_id: saved.id, include_markdown: false }, supabase)).note as Record<string, unknown>;
  const questions = got.check_questions as { question: string; answer: string; result: string | null }[];
  assert.equal(questions[0].question, 'What is g?');
  assert.equal(questions[0].answer, 's/c');
  assert.equal(questions[1].result, 'not_yet');
  assert.equal('markdown' in got, false);
});

test('record_note_checks names a check that does not exist', async () => {
  const db = { courses: [], notes: [] as Row[] };
  const supabase = fakeSupabase(db) as never;
  const saved = read(await saveNoteTool(token, { markdown: NOTE }, supabase)).note as { id: string };
  const reply = await recordNoteChecksTool(token, { note_id: saved.id, results: [{ index: 5, result: 'got' }] }, supabase);
  assert.equal((reply as { isError?: boolean }).isError, true);
});

test('update_note appends, and a rewrite drops results past the new count', async () => {
  const db = { courses: [], notes: [] as Row[] };
  const supabase = fakeSupabase(db) as never;
  const saved = read(await saveNoteTool(token, { markdown: NOTE }, supabase)).note as { id: string };
  await recordNoteChecksTool(token, { note_id: saved.id, results: [{ index: 1, result: 'got' }] }, supabase);
  await updateNoteTool(token, { note_id: saved.id, append: '> [!CHECK] Third?\n>\n> **Answer:** yes' }, supabase);
  assert.match(String(db.notes[0].markdown), /Third\?/);
  assert.deepEqual(db.notes[0].checks, { 1: 'got' });
  await updateNoteTool(token, { note_id: saved.id, markdown: '# Short\n\n> [!CHECK] Only one?' }, supabase);
  assert.deepEqual(db.notes[0].checks, {});
  assert.equal(db.notes[0].title, 'Short');
});

test('list_notes only shows the student’s own notes and searches text', async () => {
  const db = {
    courses: [],
    notes: [
      { id: 'a', user_id: 'user-1', course_id: null, title: 'Growth', markdown: 'Harrod Domar', checks: {}, source: 'app', updated_at: '1' },
      { id: 'b', user_id: 'user-1', course_id: null, title: 'Other', markdown: 'nothing', checks: {}, source: 'app', updated_at: '1' },
      { id: 'c', user_id: 'user-2', course_id: null, title: 'Growth too', markdown: 'Harrod', checks: {}, source: 'app', updated_at: '1' },
    ] as Row[],
  };
  const reply = read(await listNotesTool(token, { query: 'harrod', limit: 20 }, fakeSupabase(db) as never));
  assert.deepEqual((reply.notes as { id: string }[]).map((n) => n.id), ['a']);
});
