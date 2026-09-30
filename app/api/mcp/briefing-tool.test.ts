import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shiftDate } from '@/lib/student-day';
import { getBriefingTool } from './briefing-tool';

type Row = Record<string, unknown>;

// Enough of PostgREST for a read-only tool: equality filters, ordering and
// limits over in-memory tables. A table left out of `tables` is refused the
// way PostgREST refuses one missing from its schema cache, which is what a
// project that has not re-run schema.sql looks like.
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const known = table in tables;
      let rows = (tables[table] ?? []).slice();
      const builder = {
        select() { return builder; },
        eq(col: string, value: unknown) { rows = rows.filter((r) => r[col] === value); return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve(
            known
              ? { data: rows, error: null }
              : { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } },
          ).then(resolve);
        },
      };
      return builder;
    },
  };
}

const token = { userId: 'user-1', supabaseAccessToken: 'x' } as never;
const read = (reply: unknown) => (reply as { structuredContent: Record<string, any> }).structuredContent;
const utcToday = () => new Date().toISOString().slice(0, 10);

const TERM = 'term-1';
const MATH = 'course-math';
const POL = 'course-pol';
const EMPTY = 'course-econ';

function term(today: string): Record<string, Row[]> {
  return {
    user_settings: [{ user_id: 'user-1', active_semester_id: TERM, daily_goal_hours: 4 }],
    courses: [
      { id: MATH, user_id: 'user-1', semester_id: TERM, code: 'MATH 101', name: 'Calculus', weekly_goal_hours: 8, assessments: [], grading: {} },
      {
        id: POL, user_id: 'user-1', semester_id: TERM, code: 'POL 100', name: 'Politics', weekly_goal_hours: 6,
        assessments: [{ id: 'a1', label: 'Final', weight: 100, score: null, outOf: 100 }],
        grading: { pending: { assessments: [{ id: 'p1', label: 'Midterm', weight: 40 }], basis: 'absolute', dropRules: [], note: '', source: 'outline.pdf', createdAt: '2026-09-01T00:00:00Z' } },
      },
      { id: EMPTY, user_id: 'user-1', semester_id: TERM, code: 'ECON 110', name: 'Economics', weekly_goal_hours: 6, assessments: [], grading: {} },
      // Another term's course, which nothing here should see.
      { id: 'course-old', user_id: 'user-1', semester_id: 'term-0', code: 'OLD 1', name: 'Old', weekly_goal_hours: 4 },
    ],
    tasks: [
      { id: 'task-midterm', user_id: 'user-1', semester_id: TERM, course_id: MATH, title: 'Midterm I', due_date: shiftDate(today, 4), priority: 'high', completed: false, completed_at: null, created_at: '2026-09-01T00:00:00Z', kind: 'exam', weight: 25 },
      { id: 'task-set', user_id: 'user-1', semester_id: TERM, course_id: MATH, title: 'Problem set 3', due_date: shiftDate(today, -2), priority: 'normal', completed: false, completed_at: null, created_at: '2026-09-02T00:00:00Z', kind: 'task' },
      { id: 'task-read', user_id: 'user-1', semester_id: TERM, course_id: POL, title: 'Read Machiavelli ch 15', due_date: shiftDate(today, 2), priority: 'normal', completed: false, completed_at: null, created_at: '2026-09-03T00:00:00Z', kind: 'reading', pages: 30 },
      { id: 'task-done', user_id: 'user-1', semester_id: TERM, course_id: POL, title: 'Read Hobbes (1651)', due_date: shiftDate(today, -5), priority: 'normal', completed: true, completed_at: `${shiftDate(today, -4)}T10:00:00Z`, created_at: '2026-09-01T00:00:00Z', kind: 'reading', pages: 40 },
    ],
    sessions: [
      { id: 's1', user_id: 'user-1', semester_id: TERM, course_id: MATH, task_id: 'task-set', date: shiftDate(today, -1), duration_seconds: 3000, created_at: `${shiftDate(today, -1)}T18:00:00Z`, score: 6, score_out_of: 10 },
      { id: 's2', user_id: 'user-1', semester_id: TERM, course_id: POL, task_id: 'task-done', date: shiftDate(today, -4), duration_seconds: 7200, created_at: `${shiftDate(today, -4)}T18:00:00Z` },
    ],
    recall_items: [],
    weak_points: [
      { id: 'w1', user_id: 'user-1', course_id: MATH, summary: 'Mixes up continuity and differentiability', error_type: 'concept', times_missed: 2, status: 'open', first_seen_at: '2026-09-10T00:00:00Z', last_seen_at: '2026-09-20T00:00:00Z' },
      { id: 'w2', user_id: 'user-1', course_id: MATH, summary: 'Fixed already', error_type: 'algebra', times_missed: 1, status: 'fixed', first_seen_at: '2026-09-10T00:00:00Z', last_seen_at: '2026-09-20T00:00:00Z' },
    ],
    quizzes: [
      {
        id: 'quiz-1', user_id: 'user-1', course_id: MATH, title: 'Limits check', created_at: '2026-09-20T00:00:00Z',
        questions: [{ kind: 'open', prompt: 'Define a limit.', modelAnswer: 'epsilon-delta', marks: 2 }],
        attempts: [{ at: '2026-09-21T00:00:00Z', picks: [-1], score: 0, total: 0, written: { 0: 'it gets close' } }],
      },
    ],
  };
}

test('get_briefing joins the term into one read, on the app’s own rules', async () => {
  const today = utcToday();
  const out = read(await getBriefingTool(token, {}, fakeSupabase(term(today)) as never));

  assert.equal(out.schema_version, 'akada.briefing.v1');
  assert.equal(out.today, today);
  assert.equal(out.day_known_from, 'utc');

  // Up next is Today's: the problem set a timer ran on yesterday. It is two
  // days late, which is still tonight's work (due-now), and fifty minutes on
  // it yesterday is past the ten-minute floor, so it says so. The midterm is
  // four days out, so a MATH session is owed every two days, and yesterday's
  // fifty minutes was one: the run-up is not owed and nothing is lifted. The
  // problem set still leads up to the midterm, and says what for.
  assert.equal(out.up_next.task.id, 'task-set');
  assert.equal(out.up_next.why, 'in progress');
  assert.equal(out.up_next.title, 'Problem set 3');
  assert.equal(out.up_next.reason, 'you were on this yesterday · 2 days overdue');
  assert.equal(out.up_next.course.code, 'MATH 101');
  assert.equal(out.up_next.prepares_for.id, 'task-midterm');
  assert.equal(out.up_next.prepares_for.title, 'Midterm I');
  assert.equal(out.up_next.prepares_for.days, 4);
  // Two sittings are too few for a usual block, and the server has no
  // device to remember a last length, so the session is the default 45.
  assert.equal(out.up_next.session_minutes, 45);
  // Under Or, the other course's reading, due in two days.
  assert.equal(out.up_next.others[0].task.id, 'task-read');
  assert.equal(out.up_next.others[0].why, 'due soon');
  assert.equal(out.up_next.others[0].course.code, 'POL 100');
  assert.equal(typeof out.up_next.others[0].session_minutes, 'number');
  // The exam row itself is never offered.
  assert.ok(!out.up_next.others.some((o: any) => o.task?.id === 'task-midterm'));
  assert.equal(out.overdue.count, 1);

  // The midterm, with how ready its course is beside it.
  const midterm = out.coming.find((c: any) => c.task.id === 'task-midterm');
  assert.equal(midterm.days, 4);
  assert.equal(midterm.open_weak_points, 1);
  assert.equal(midterm.course_has_grading_scheme, false);

  // A finished reading is in recall on its own, with no table rows at all.
  assert.ok(out.recall.due >= 1);

  assert.equal(out.reading_backlog.pages, 30);
  assert.deepEqual(out.quizzes_awaiting_marking.map((q: any) => q.id), ['quiz-1']);
  assert.deepEqual(out.loose_ends.grading_proposals_waiting.map((c: any) => c.code), ['POL 100']);
  assert.deepEqual(out.loose_ends.courses_with_nothing_on_the_list.map((c: any) => c.code), ['ECON 110']);
  assert.equal(out.loose_ends.no_exams_entered, false);
  assert.equal(out.week.daily_goal_hours, 4);
  assert.ok(!out.week.courses.some((c: any) => c.course.code === 'OLD 1'));

  const practice = out.about_the_student.practice_papers;
  assert.deepEqual(practice.map((p: any) => [p.course.code, p.last.score, p.last.out_of]), [['MATH 101', 6, 10]]);

  // Loose ends in order of what they cost: the unmarked paper, then the exam.
  assert.match(out.suggestions[0], /Limits check.*grade_quiz/);
  assert.match(out.suggestions[1], /MATH 101 Midterm I is in 4 days \(25%\)/);
  assert.match(out.day_note, /time zone/);
});

test('get_briefing still answers on a project without recall, weak points or quizzes', async () => {
  const today = utcToday();
  const tables = term(today);
  delete tables.recall_items;
  delete tables.weak_points;
  delete tables.quizzes;
  const out = read(await getBriefingTool(token, {}, fakeSupabase(tables) as never));

  assert.equal(out.recall.stored, false);
  assert.equal(out.weak_points, null);
  assert.deepEqual(out.quizzes_awaiting_marking, []);
  assert.equal(out.coming.find((c: any) => c.task.id === 'task-midterm').open_weak_points, null);
});

test('get_briefing reads the day off the clock the app stored', async () => {
  const zone = 'Pacific/Kiritimati';
  const theirs = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
  const tables = term(theirs);
  tables.user_settings[0].time_zone = zone;
  const out = read(await getBriefingTool(token, {}, fakeSupabase(tables) as never));

  assert.equal(out.today, theirs);
  assert.equal(out.day_known_from, 'device');
  assert.equal(out.time_zone, zone);
  assert.equal(out.day_note, undefined);
});

test('get_briefing says there are no exams when none has been entered', async () => {
  const today = utcToday();
  const tables = term(today);
  tables.tasks = tables.tasks.filter((t) => t.kind !== 'exam');
  const out = read(await getBriefingTool(token, {}, fakeSupabase(tables) as never));
  assert.equal(out.loose_ends.no_exams_entered, true);
  assert.ok(out.suggestions.some((s: string) => /No exams are in Akada yet/.test(s)));
});

test('get_briefing turns a near exam into its run-up, never the exam itself', async () => {
  const today = utcToday();
  const tables = term(today);
  // No MATH work left and no MATH sitting: the midterm is four days out, no
  // session on the course has ever counted, so one is owed, and with nothing
  // on the list to lift the course itself is offered before its exam.
  tables.tasks = tables.tasks.filter((t) => t.id !== 'task-set');
  tables.sessions = tables.sessions.filter((s) => s.id !== 's1');
  const out = read(await getBriefingTool(token, {}, fakeSupabase(tables) as never));

  assert.equal(out.up_next.why, 'exam prep');
  assert.equal(out.up_next.task, null);
  assert.equal(out.up_next.title, 'Before Midterm I');
  assert.equal(out.up_next.course.id, MATH);
  assert.equal(out.up_next.reason, 'nothing on the MATH list leads up to it');
  assert.equal(out.up_next.prepares_for.id, 'task-midterm');
  assert.equal(out.up_next.prepares_for.title, 'Midterm I');
  assert.equal(out.up_next.prepares_for.days, 4);
  // The only sitting left is four days old and nothing is logged today, which
  // is a return: the first session back is capped at 25.
  assert.equal(out.up_next.session_minutes, 25);
  // The reading due in two days sits under it, below the owed run-up.
  assert.deepEqual(out.up_next.others.map((o: any) => o.task?.id), ['task-read']);
  // The exam is still counted down to, where it always was.
  assert.equal(out.coming.find((c: any) => c.task.id === 'task-midterm').days, 4);
});
