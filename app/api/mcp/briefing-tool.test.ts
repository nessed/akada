import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Session, Task } from '@/lib/data/types';
import { readingRateDetail } from '@/lib/derive';
import { readHabits } from '@/lib/progression/habits';
import { isLoggableDuration } from '@/lib/session-safety';
import { shiftDate } from '@/lib/student-day';
import { readUpNext, type UpNextCandidate } from '@/lib/up-next';
import { sizeSession } from '@/lib/up-next-session';
import { getBriefingTool } from './briefing-tool';

type Row = Record<string, unknown>;

// Enough of PostgREST for a read-only tool: equality and lower-bound filters,
// ordering, limits, ranges and an exact count over in-memory tables. A table
// left out of `tables` is refused the way PostgREST refuses one missing from
// its schema cache, which is what a project that has not re-run schema.sql
// looks like.
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    // The app's adapter wants this much of auth when it is built.
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from(table: string) {
      const known = table in tables;
      let rows = (tables[table] ?? []).slice();
      let count = false;
      let window: [number, number] | null = null;
      const builder = {
        select(_columns?: string, options?: { count?: string }) { count = options?.count === 'exact'; return builder; },
        eq(col: string, value: unknown) { rows = rows.filter((r) => r[col] === value); return builder; },
        gte(col: string, value: string) { rows = rows.filter((r) => String(r[col]) >= value); return builder; },
        order() { return builder; },
        limit() { return builder; },
        range(from: number, to: number) { window = [from, to]; return builder; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(resolve: (v: unknown) => unknown) {
          const page = window ? rows.slice(window[0], window[1] + 1) : rows;
          return Promise.resolve(
            known
              ? { data: page, error: null, count: count ? rows.length : null }
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

/* ── The same pick as Today ───────────────────────────────────────────── */

/**
 * What Today would put up on the same tables: read through the app's own
 * adapter (the loader behind useTasks, useCourses and useSessions) off the
 * same double, then ranked and sized the way useUpNext does, on a device
 * with nothing set aside, no length last started and no clock. That is
 * everything the briefing claims to share with Today, so the two have to
 * agree on it exactly.
 */
async function todayReads(tables: Record<string, Row[]>, today: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test';
  const { SupabaseAdapter } = await import('@/lib/data/supabase-adapter');
  const adapter = new SupabaseAdapter() as unknown as Record<string, unknown>;
  adapter.supabase = fakeSupabase(tables);
  adapter.userId = async () => 'user-1';
  adapter.activeSemesterId = async () => TERM;
  const db = adapter as unknown as { getCourses(): Promise<Course[]>; getTasks(): Promise<Task[]>; getSessions(): Promise<Session[]> };
  const [courses, tasks, sessions] = await Promise.all([db.getCourses(), db.getTasks(), db.getSessions()]);

  const logged = sessions.filter((s) => isLoggableDuration(s.durationSeconds));
  const reading = readUpNext({ today, courses, tasks, sessions: logged });
  const habits = readHabits(courses, logged, tasks);
  const detail = readingRateDetail(tasks, logged);
  const minutes = (c: Pick<UpNextCandidate, 'task' | 'course' | 'spentSeconds'>) =>
    sizeSession(c, {
      habits,
      pace: { pagesPerHour: detail.pagesPerHour, measured: detail.measured },
      tonight: null,
      lastUsedMinutes: null,
      returning: reading.returning,
    }).minutes;
  const quiet = reading.quiet;
  return {
    pick: reading.pick ? { task: reading.pick.task?.id ?? null, course: reading.pick.course.id, minutes: minutes(reading.pick) } : null,
    others: reading.others.map((c) => c.task?.id ?? null),
    quiet: quiet ? { course: quiet.course.id, why: quiet.why, minutes: minutes({ task: null, course: quiet.course, spentSeconds: 0 }) } : null,
  };
}

/** The same three things, off the briefing. */
function briefingReads(out: Record<string, any>) {
  const up = out.up_next;
  const quiet = out.up_next_quiet;
  return {
    pick: up ? { task: up.task?.id ?? null, course: up.course.id, minutes: up.session_minutes } : null,
    others: up ? up.others.map((o: any) => o.task?.id ?? null) : [],
    quiet: quiet ? { course: quiet.course.id, why: quiet.why, minutes: quiet.session_minutes } : null,
  };
}

/** A term of just these rows, owned by the signed-in student. */
function scene(parts: { courses: Row[]; tasks: Row[]; sessions?: Row[]; segments?: Row[] }): Record<string, Row[]> {
  const own = (rows: Row[]) => rows.map((r) => ({ user_id: 'user-1', semester_id: TERM, ...r }));
  const tables: Record<string, Row[]> = {
    user_settings: [{ user_id: 'user-1', active_semester_id: TERM }],
    courses: own(parts.courses.map((c) => ({ assessments: [], grading: {}, created_at: '2026-09-01T00:00:00Z', ...c }))),
    tasks: own(parts.tasks.map((t) => ({ priority: 'normal', completed: false, completed_at: null, kind: 'task', due_date: null, ...t }))),
    sessions: own(parts.sessions ?? []),
  };
  tables.session_segments = (parts.segments ?? []).map((r) => ({ user_id: 'user-1', ...r }));
  return tables;
}

test('get_briefing keeps the order the student dragged the list into', async () => {
  const today = utcToday();
  // Hume was added last and dragged to the top. Read without its place,
  // Locke is older and would come first, which is what the briefing used to
  // name while Today named Hume.
  const tables = scene({
    courses: [{ id: POL, code: 'POL 100', name: 'Politics', weekly_goal_hours: 6 }],
    tasks: [
      { id: 'locke', course_id: POL, title: 'Locke, Second Treatise', kind: 'reading', created_at: '2026-09-01T00:00:00Z', sort_order: 2 },
      { id: 'hume', course_id: POL, title: 'Hume, Of the Original Contract', kind: 'reading', created_at: '2026-09-05T00:00:00Z', sort_order: 1 },
    ],
  });
  const out = read(await getBriefingTool(token, {}, fakeSupabase(tables) as never));

  assert.equal(out.up_next.task.id, 'hume');
  assert.equal(out.up_next.reason, 'next on the POL list');
  assert.deepEqual(briefingReads(out), await todayReads(tables, today));
});

test('get_briefing sizes the session off the blocks each sitting was made of', async () => {
  const today = utcToday();
  // Six evenings of four 25-minute blocks with five minutes between. Read
  // as six unbroken 100-minute stretches the usual length would be 90; read
  // as rest with no chain, nothing would be a block and it would be 45. The
  // chains say 25, and that is what Today's Start offers.
  const sessions: Row[] = [];
  const segments: Row[] = [];
  for (let i = 1; i <= 6; i += 1) {
    const date = shiftDate(today, -i);
    const id = `sit-${i}`;
    sessions.push({ id, course_id: MATH, task_id: 'task-set', date, duration_seconds: 6000, break_seconds: 900, note: '', created_at: `${date}T20:00:00Z` });
    let at = Date.parse(`${date}T18:00:00Z`);
    for (let block = 0, ordinal = 0; block < 4; block += 1) {
      segments.push({ id: `${id}-${ordinal}`, session_id: id, kind: 'focus', ordinal: ordinal++, started_at: new Date(at).toISOString(), seconds: 1500, target_seconds: 1500 });
      at += 1500_000;
      if (block === 3) break;
      segments.push({ id: `${id}-${ordinal}`, session_id: id, kind: 'break', ordinal: ordinal++, started_at: new Date(at).toISOString(), seconds: 300, target_seconds: 300 });
      at += 300_000;
    }
  }
  const tables = scene({
    courses: [{ id: MATH, code: 'MATH 101', name: 'Calculus', weekly_goal_hours: 8 }],
    tasks: [{ id: 'task-set', course_id: MATH, title: 'Problem set 3', due_date: shiftDate(today, 3), created_at: '2026-09-02T00:00:00Z' }],
    sessions,
    segments,
  });
  const out = read(await getBriefingTool(token, {}, fakeSupabase(tables) as never));

  assert.equal(out.up_next.task.id, 'task-set');
  assert.equal(out.up_next.session_minutes, 25);
  assert.deepEqual(briefingReads(out), await todayReads(tables, today));

  // A project without the table keeps the sittings as they were: rest and
  // no chain is no block, so the length falls back to 45 rather than 90.
  delete tables.session_segments;
  assert.equal(read(await getBriefingTool(token, {}, fakeSupabase(tables) as never)).up_next.session_minutes, 45);
});

test('get_briefing leaves a recovered sitting out of the usual, the way Today does', async () => {
  const today = utcToday();
  // Five half-hour ECON sittings are the reader's usual, and six three-hour
  // ones the timer closed for them are not. Forty minutes on the MATH set
  // today is a full session by that usual, so the set steps aside and the
  // ECON essay is up. Counted in, the recovered ones would make the usual
  // 90 minutes and the set would still be the pick.
  const sessions: Row[] = [];
  for (let i = 1; i <= 5; i += 1) {
    sessions.push({ id: `econ-${i}`, course_id: EMPTY, task_id: null, date: shiftDate(today, -i), duration_seconds: 1800, note: '', created_at: `${shiftDate(today, -i)}T18:00:00Z` });
  }
  for (let i = 6; i <= 11; i += 1) {
    sessions.push({ id: `held-${i}`, course_id: EMPTY, task_id: null, date: shiftDate(today, -i), duration_seconds: 3 * 3600, recovery: 'idle', note: '', created_at: `${shiftDate(today, -i)}T18:00:00Z` });
  }
  sessions.push({ id: 'tonight', course_id: MATH, task_id: 'task-set', date: today, duration_seconds: 2400, note: '', created_at: `${today}T15:00:00Z` });
  const tables = scene({
    courses: [
      { id: MATH, code: 'MATH 101', name: 'Calculus', weekly_goal_hours: 8 },
      { id: EMPTY, code: 'ECON 110', name: 'Economics', weekly_goal_hours: 6 },
    ],
    tasks: [
      { id: 'task-set', course_id: MATH, title: 'Problem set 3', due_date: shiftDate(today, 3), created_at: '2026-09-02T00:00:00Z' },
      { id: 'task-essay', course_id: EMPTY, title: 'Essay outline', due_date: shiftDate(today, 5), created_at: '2026-09-02T00:00:00Z' },
    ],
    sessions,
  });
  const out = read(await getBriefingTool(token, {}, fakeSupabase(tables) as never));

  assert.equal(out.up_next.task.id, 'task-essay');
  assert.deepEqual(out.up_next.others.map((o: any) => o.task?.id), ['task-set']);
  assert.deepEqual(briefingReads(out), await todayReads(tables, today));
});

test('get_briefing offers the course Today offers when nothing is up', async () => {
  const today = utcToday();
  // Early in term: the midterm is eighteen days out and every piece of work
  // is further off than three weeks. Today has no task to put up, and says
  // so, and still names MATH for a session before the midterm. The briefing
  // used to hand back a bare null here.
  const tables = scene({
    courses: [
      { id: MATH, code: 'MATH 101', name: 'Calculus', weekly_goal_hours: 0 },
      { id: POL, code: 'POL 100', name: 'Politics', weekly_goal_hours: 0 },
    ],
    tasks: [
      { id: 'task-midterm', course_id: MATH, title: 'MATH 101 Midterm I', kind: 'exam', weight: 25, due_date: shiftDate(today, 18), created_at: '2026-09-01T00:00:00Z' },
      { id: 'task-set', course_id: MATH, title: 'Problem set 5', due_date: shiftDate(today, 30), created_at: '2026-09-02T00:00:00Z' },
      { id: 'task-essay', course_id: POL, title: 'Essay', due_date: shiftDate(today, 40), created_at: '2026-09-03T00:00:00Z' },
    ],
  });
  const out = read(await getBriefingTool(token, {}, fakeSupabase(tables) as never));

  assert.equal(out.up_next, null);
  assert.equal(out.up_next_quiet.why, 'far');
  assert.equal(out.up_next_quiet.course.code, 'MATH 101');
  assert.match(out.up_next_quiet.heading, /^No work is due before /);
  assert.equal(out.up_next_quiet.reason, 'MATH 101 is next, for Midterm I');
  assert.equal(out.up_next_quiet.prepares_for.id, 'task-midterm');
  assert.equal(out.up_next_quiet.prepares_for.days, 18);
  assert.equal(out.up_next_quiet.session_minutes, 45);
  assert.deepEqual(briefingReads(out), await todayReads(tables, today));

  // With a pick there is no quiet state to carry.
  const busy = read(await getBriefingTool(token, {}, fakeSupabase(term(today)) as never));
  assert.equal(busy.up_next_quiet, null);
});
