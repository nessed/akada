import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { readBriefing, type Briefing, type BriefingQuiz, type BriefingUpNextOffer } from '@/lib/briefing';
import type { Course, RecallRecord, Session, Task, WeakPoint } from '@/lib/data/types';
import {
  cleanKind,
  cleanPages,
  cleanRecallKey,
  cleanRecallPrompt,
  cleanRecallSource,
  cleanWeight,
  sanitizeAssessments,
  sanitizeGrading,
  sanitizeRecallHistory,
} from '@/lib/planner-safety';
import { cleanAttempts, cleanQuestions, writtenTally } from '@/lib/quiz/format';
import { readRecall } from '@/lib/recall';
import { cleanScore } from '@/lib/session-safety';
import { studentDay, type StudentDay } from '@/lib/student-day';
import { mcpSupabase, readStudentSettings } from './_shared';
import {
  isMissingTable,
  queryFailed as reportFailure,
  quizUrl,
  result,
  toolCrashed,
  type AuthenticatedToken,
  type McpSupabaseClient,
  type QueryFailure,
} from './_tool-kit';

/**
 * get_briefing: the one read an assistant makes at the start of a
 * conversation, instead of six.
 *
 * Answering "what should I do tonight" used to mean get_overview, get_tasks,
 * get_recall, get_reading_backlog, get_weekly_stats and a get_weak_points per
 * course, and then re-deriving in the chat what the app had already worked
 * out: what Today puts up next and why, which exam is closest and how ready
 * the course is for it. That re-derivation is where a model invents priorities.
 * This reads everything once, on the student's own day, runs it through
 * lib/briefing.ts (which is the app's own logic), and adds `suggestions`: the
 * loose ends in the order they are worth raising, each naming the tool that
 * deals with it.
 */

function queryFailed(step: string, error: QueryFailure, message: string) {
  return reportFailure('get_briefing', step, error, message);
}

/**
 * A part of the briefing that lives in a table a project may not have yet
 * (recall, weak points, quizzes). Missing is expected and silent; anything
 * else is logged and that part reads as unavailable, because one broken
 * panel is not a reason to refuse the whole briefing.
 */
function optionalRows(step: string, read: { data: unknown; error: QueryFailure }): Record<string, unknown>[] | null {
  if (!read.error) return (read.data ?? []) as Record<string, unknown>[];
  if (!isMissingTable(read.error)) {
    console.error(`[mcp:get_briefing] ${step} failed`, { code: read.error.code, message: read.error.message, hint: read.error.hint });
  }
  return null;
}


/* ── Rows into the app's model, through the app's own cleaners ─────────── */

function toCourse(row: Record<string, unknown>): Course {
  return {
    id: String(row.id),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    color: '',
    weeklyGoalHours: Number(row.weekly_goal_hours ?? 0),
    createdAt: String(row.created_at ?? ''),
    position: typeof row.sort_order === 'number' ? row.sort_order : undefined,
    assessments: sanitizeAssessments(row.assessments),
    grading: sanitizeGrading(row.grading),
  };
}

function toTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    courseId: String(row.course_id ?? ''),
    title: String(row.title ?? ''),
    description: typeof row.description === 'string' ? row.description : '',
    // Recall reads a kept step's live wording off its task.
    subtasks: Array.isArray(row.subtasks)
      ? (row.subtasks as Record<string, unknown>[]).flatMap((step) =>
          step && typeof step.id === 'string' && typeof step.title === 'string'
            ? [{ id: step.id, title: step.title, completed: Boolean(step.completed) }]
            : [],
        )
      : [],
    dueDate: (row.due_date as string | null) ?? null,
    priority: row.priority === 'high' ? 'high' : 'normal',
    completed: Boolean(row.completed),
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    kind: cleanKind(row.kind),
    weight: cleanWeight(row.weight),
    pages: cleanPages(row.pages),
  };
}

function toSession(row: Record<string, unknown>): Session {
  const practice = cleanScore(row.score, row.score_out_of);
  return {
    id: String(row.id),
    courseId: String(row.course_id ?? ''),
    taskId: (row.task_id as string | null) ?? null,
    date: String(row.date ?? ''),
    durationSeconds: Number(row.duration_seconds ?? 0),
    note: '',
    createdAt: String(row.created_at ?? ''),
    ...(practice ? { score: practice.score, scoreOutOf: practice.outOf } : {}),
  };
}

function toRecord(row: Record<string, unknown>): RecallRecord {
  return {
    id: String(row.id),
    key: cleanRecallKey(row.item_key),
    courseId: String(row.course_id ?? ''),
    prompt: cleanRecallPrompt(row.prompt),
    source: cleanRecallSource(row.source),
    ref: typeof row.ref === 'string' ? row.ref : null,
    history: sanitizeRecallHistory(row.history),
    letGo: Boolean(row.let_go),
    createdAt: String(row.created_at ?? ''),
  };
}

function toWeakPoint(row: Record<string, unknown>): WeakPoint {
  return {
    id: String(row.id),
    courseId: String(row.course_id ?? ''),
    taskId: (row.task_id as string | null) ?? null,
    quizId: (row.quiz_id as string | null) ?? null,
    section: String(row.section ?? ''),
    pageRef: String(row.page_ref ?? ''),
    summary: String(row.summary ?? ''),
    confusion: String(row.confusion ?? ''),
    errorType: row.error_type as WeakPoint['errorType'],
    timesMissed: Number(row.times_missed ?? 1),
    firstSeenAt: String(row.first_seen_at ?? ''),
    lastSeenAt: String(row.last_seen_at ?? ''),
    status: row.status === 'fixed' ? 'fixed' : 'open',
    fixedAt: (row.fixed_at as string | null) ?? null,
  };
}

function toQuiz(row: Record<string, unknown>): BriefingQuiz {
  const questions = cleanQuestions(row.questions);
  const attempts = cleanAttempts(row.attempts);
  const last = attempts[attempts.length - 1];
  const tally = last ? writtenTally(questions, last) : null;
  const id = String(row.id);
  return {
    id,
    title: String(row.title ?? ''),
    courseId: (row.course_id as string | null) ?? null,
    awaitingMarking: !!tally && tally.pending > 0,
    url: quizUrl(id),
  };
}

/* ── What the assistant gets back ─────────────────────────────────────── */

const courseRef = (course: Course | undefined) => (course ? { id: course.id, code: course.code, name: course.name } : null);

function taskOut(task: Task, courses: Map<string, Course>) {
  const course = courses.get(task.courseId);
  return {
    id: task.id,
    title: task.title,
    due_date: task.dueDate,
    kind: task.kind ?? 'task',
    priority: task.priority,
    ...(task.weight != null ? { weight: task.weight } : {}),
    ...(task.pages != null ? { pages: task.pages } : {}),
    course: course ? { id: course.id, code: course.code } : null,
  };
}

/**
 * One thing Up next offers, in the shape the pick and each of its `others`
 * share. `task` is null only for a course offered before its exam, and
 * `title` is then what Today shows for it ("Before Midterm I"), so an
 * assistant always has something to call it by. `reason` is the line Today
 * prints: the pick's why and when, an Or row's one clause.
 */
function offerOut(offer: BriefingUpNextOffer, courses: Map<string, Course>) {
  return {
    why: offer.why,
    reason: offer.reason,
    title: offer.title,
    session_minutes: offer.minutes,
    task: offer.task ? taskOut(offer.task, courses) : null,
    course: courseRef(offer.course),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The loose ends, most worth raising first, each naming what deals with it.
 * Ordered by what costs the student most if left: a paper sitting unmarked
 * and an exam days out come before a course that has been quiet.
 */
export function briefingSuggestions(b: Briefing): string[] {
  const out: string[] = [];

  for (const quiz of b.quizzesAwaitingMarking.slice(0, 2)) {
    out.push(`The student handed in “${quiz.title}” and its written answers are waiting to be marked: get_quiz, then grade_quiz, then record_weak_points for each distinct confusion.`);
  }

  for (const exam of b.coming.filter((c) => c.days <= 7 && c.task.kind === 'exam')) {
    const code = exam.course?.code ?? 'a course';
    const when = exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${exam.days} days`;
    const parts = [
      exam.recall ? `${exam.recall.settled} of ${exam.recall.kept} kept things settled in recall, ${exam.recall.due} due` : 'nothing kept for recall in the course',
      exam.openWeakPoints === null ? null : plural(exam.openWeakPoints, 'open weak point'),
    ].filter(Boolean);
    out.push(`${code} ${exam.task.title} is ${when}${exam.task.weight ? ` (${exam.task.weight}%)` : ''}: ${parts.join(', ')}. Offer exam prep: get_weak_points and get_recall for the course, then retest the weakest first.`);
  }

  if (b.overdue.length > 0) {
    out.push(`${plural(b.overdue.length, 'task')} overdue. Before planning anything, ask which are actually done and tick those with complete_tasks; re-date the rest with update_tasks rather than leaving them to pile up.`);
  }

  if (b.recall.due > 0) {
    out.push(`${plural(b.recall.due, 'thing')} due for recall. Offer a round: get_recall, one question at a time with nothing shown first, record_recall after each answer.`);
  }

  for (const course of b.gradingWaiting) {
    out.push(`A grading scheme for ${course.code} is waiting on its course page. Nothing is projected from it until the student opens ${course.code} in Akada and accepts it.`);
  }

  const behind = b.week.courses
    .filter((c) => c.shortBy > 0 && c.goalHours > 0 && b.week.daysLeft <= 3)
    .sort((a, c) => c.shortBy - a.shortBy)[0];
  if (behind) {
    out.push(`${behind.course.code} is ${behind.shortBy}h short of its ${behind.goalHours}h week with ${plural(b.week.daysLeft, 'day')} left.`);
  }

  const quiet = b.week.courses
    .filter((c) => c.openTasks > 0 && (c.daysSinceStudied === null || c.daysSinceStudied >= 7))
    .sort((a, c) => (c.daysSinceStudied ?? Infinity) - (a.daysSinceStudied ?? Infinity))[0];
  if (quiet) {
    out.push(`${quiet.course.code} has ${plural(quiet.openTasks, 'open task')} and ${quiet.daysSinceStudied === null ? 'no sitting logged this term' : `no sitting in ${quiet.daysSinceStudied} days`}.`);
  }

  if (b.noExams) {
    out.push('No exams are in Akada yet, so nothing is counted down to and recall is not pulled forward before a test. If the student has an outline, add each midterm and final with create_tasks, kind exam, with its weight.');
  }

  const unschemed = b.withoutScheme.filter((c) => b.coming.some((e) => e.task.courseId === c.id));
  for (const course of unschemed.slice(0, 1)) {
    out.push(`${course.code} has work coming but no grading scheme, so Akada cannot say what it is worth. Ask for the outline, then set_grading_scheme.`);
  }

  if (b.emptyCourses.length > 0) {
    out.push(`${b.emptyCourses.map((c) => c.code).join(', ')} ${b.emptyCourses.length === 1 ? 'has' : 'have'} nothing on the list. Offer to read the outline into tasks.`);
  }

  if (b.reading.withoutPages > 0) {
    out.push(`${plural(b.reading.withoutPages, 'reading')} on the list ${b.reading.withoutPages === 1 ? 'has' : 'have'} no page count, so the backlog undercounts. update_tasks with pages when the student knows them.`);
  }

  return out.slice(0, 8);
}

export function formatBriefing(b: Briefing, day: StudentDay, dailyGoalHours: number | null) {
  const courses = new Map(b.week.courses.map((c) => [c.course.id, c.course]));
  return {
    schema_version: 'akada.briefing.v1',
    today: b.today,
    // `device` is the student's own clock, written by the app. `utc` means
    // Akada has not learnt it yet and every date here is the server's.
    day_known_from: day.source,
    time_zone: day.timeZone,
    ...(day.source === 'utc'
      ? { day_note: 'Akada does not know the student’s time zone yet (it learns it the next time they open the app), so `today` is UTC and may be a day out. Pass the student’s own date to anything that writes one.' }
      : {}),
    // Today's Up next. `why` keeps every value it had (and gains `exam prep`,
    // `next on the list` and `due later`); `prepares_for` is the exam or major
    // piece the work leads up to, with its id and its title as the task has
    // it, so it can be matched against `coming` (the `reason` line is where
    // it is said the way Today says it, "for Midterm I", without a course
    // code in front); `others` are the two Today offers under Or.
    up_next: b.upNext
      ? {
          ...offerOut(b.upNext, courses),
          prepares_for: b.upNext.prepFor
            ? {
                id: b.upNext.prepFor.task.id,
                title: b.upNext.prepFor.task.title,
                due_date: b.upNext.prepFor.task.dueDate,
                days: b.upNext.prepFor.days,
              }
            : null,
          others: b.upNext.others.map((o) => offerOut(o, courses)),
        }
      : null,
    overdue: { count: b.overdue.length, tasks: b.overdue.slice(0, 8).map((t) => taskOut(t, courses)) },
    due_this_week: b.dueSoon.slice(0, 12).map((t) => taskOut(t, courses)),
    coming: b.coming.map((c) => ({
      task: taskOut(c.task, courses),
      days: c.days,
      recall: c.recall,
      open_weak_points: c.openWeakPoints,
      course_has_grading_scheme: c.hasScheme,
    })),
    week: {
      from: b.week.from,
      to: b.week.to,
      days_left: b.week.daysLeft,
      hours_logged: b.week.hours,
      goal_hours: b.week.goalHours,
      today_hours: b.week.todayHours,
      daily_goal_hours: dailyGoalHours,
      courses: b.week.courses.map((c) => ({
        course: courseRef(c.course),
        hours_logged: c.hours,
        goal_hours: c.goalHours,
        short_by_hours: c.shortBy,
        last_studied: c.lastStudied,
        days_since_studied: c.daysSinceStudied,
        open_tasks: c.openTasks,
      })),
    },
    recall: {
      stored: b.recall.stored,
      due: b.recall.due,
      // What Today would put in front of the student: the day's few.
      today_queue: b.recall.queue,
      by_course: b.recall.byCourse.map((c) => ({
        course: courseRef(courses.get(c.courseId)),
        kept: c.kept,
        settled: c.settled,
        clear: c.clear,
        hazy: c.hazy,
        gone: c.gone,
        not_asked_yet: c.fresh,
        due: c.due,
      })),
    },
    reading_backlog: {
      readings: b.reading.readings,
      pages: b.reading.pages,
      without_page_count: b.reading.withoutPages,
      hours: b.reading.hours,
    },
    weak_points: b.weakPoints.available
      ? {
          open: b.weakPoints.open,
          by_course: [...b.weakPoints.byCourse.entries()].map(([id, open]) => ({ course: courseRef(courses.get(id)), open })),
        }
      : null,
    quizzes_awaiting_marking: b.quizzesAwaitingMarking.map((q) => ({ id: q.id, title: q.title, course: courseRef(q.courseId ? courses.get(q.courseId) : undefined), url: q.url })),
    loose_ends: {
      grading_proposals_waiting: b.gradingWaiting.map(courseRef),
      courses_without_grading_scheme: b.withoutScheme.map(courseRef),
      courses_with_nothing_on_the_list: b.emptyCourses.map(courseRef),
      no_exams_entered: b.noExams,
    },
    // What Akada has learnt about how this student works, off their own
    // record. Use it to size advice: a plan of 90-minute sittings for someone
    // whose sittings run 35 minutes is a plan that does not happen.
    about_the_student: {
      reading_pace: { pages_per_hour: b.reading.pagesPerHour, measured: b.reading.measured },
      last_28_days: {
        sittings: b.habits.sittingsLast28,
        study_days: b.habits.studyDaysLast28,
        median_sitting_minutes: b.habits.medianSittingMinutes,
      },
      weekly_hours_last_4_weeks: b.habits.weeklyHours,
      practice_papers: b.habits.practice.map((p) => ({
        course: courseRef(p.course),
        papers: p.papers,
        last: { score: p.last.score, out_of: p.last.outOf, date: p.last.date },
        best: { score: p.best.score, out_of: p.best.outOf, date: p.best.date },
      })),
    },
    suggestions: briefingSuggestions(b),
  };
}

export const GetBriefingInput = z.object({});

export const GET_BRIEFING_DESCRIPTION =
  'Start here. One read of where the signed-in student stands today, on their own day: what Akada’s Today screen puts up next (a task, or a course before its exam), the one line saying why, how long a session it sizes, and the two it offers instead, what is overdue and due this week, the exams and weighted work coming with how ready each course is (recall settled and due, open weak points, whether it has a grading scheme), this week’s hours against each course’s goal and how long since each was studied, recall due, the reading backlog in hours at their pace, quizzes waiting to be marked, grading proposals waiting to be accepted, and what Akada has learnt about how they work (reading pace, typical sitting, recent weeks, practice paper scores). `suggestions` lists the loose ends worth raising, most important first, each naming the tool that deals with it. Call this at the start of any conversation about what to do, how things are going, or planning, before reaching for the narrower reads. This tool never changes Akada data.';

export async function getBriefingTool(
  token: AuthenticatedToken,
  _input: z.infer<typeof GetBriefingInput>,
  supabase: McpSupabaseClient = mcpSupabase(token.supabaseAccessToken),
) {
  try {
    const settings = await readStudentSettings(token, supabase);
    if (!settings.semesterId) {
      return result({ schema_version: 'akada.briefing.v1', message: 'No active semester is set in Akada. The student sets one up in the app first.' });
    }
    const semesterId = settings.semesterId;
    const day = studentDay({ timeZone: settings.timeZone, dayEndingHour: settings.dayEndingHour });
    const [coursesRead, tasksRead, sessionsRead, recallRead, weakRead, quizzesRead] = await Promise.all([
      supabase.from('courses').select('*').eq('user_id', token.userId).eq('semester_id', semesterId),
      supabase.from('tasks').select('*').eq('user_id', token.userId).eq('semester_id', semesterId),
      supabase.from('sessions').select('*').eq('user_id', token.userId).eq('semester_id', semesterId),
      supabase.from('recall_items').select('*').eq('user_id', token.userId).eq('semester_id', semesterId),
      supabase.from('weak_points').select('*').eq('user_id', token.userId).eq('status', 'open'),
      // Not semester-scoped, like the Notes shelf; recent ones are the ones
      // that can be waiting on a mark.
      supabase.from('quizzes').select('*').eq('user_id', token.userId).order('created_at', { ascending: false }).limit(50),
    ]);
    if (coursesRead.error) return queryFailed('courses read', coursesRead.error, 'Akada could not load courses.');
    if (tasksRead.error) return queryFailed('tasks read', tasksRead.error, 'Akada could not load tasks.');
    if (sessionsRead.error) return queryFailed('sessions read', sessionsRead.error, 'Akada could not load study sessions.');

    const courses = ((coursesRead.data ?? []) as Record<string, unknown>[]).map(toCourse);
    const inTerm = new Set(courses.map((c) => c.id));
    const tasks = ((tasksRead.data ?? []) as Record<string, unknown>[]).map(toTask).filter((t) => inTerm.has(t.courseId));
    const sessions = ((sessionsRead.data ?? []) as Record<string, unknown>[]).map(toSession).filter((s) => inTerm.has(s.courseId));
    const recallRows = optionalRows('recall read', recallRead);
    const weakRows = optionalRows('weak points read', weakRead);
    const quizRows = optionalRows('quizzes read', quizzesRead);

    const recall = readRecall({
      courses,
      tasks,
      records: (recallRows ?? []).map(toRecord),
      today: day.today,
      dayOf: day.dayOf,
    });
    const briefing = readBriefing({
      today: day.today,
      courses,
      tasks,
      sessions,
      recall,
      recallStored: recallRows !== null,
      weakPoints: weakRows ? weakRows.map(toWeakPoint).filter((w) => inTerm.has(w.courseId)) : null,
      quizzes: quizRows ? quizRows.map(toQuiz).filter((q) => !q.courseId || inTerm.has(q.courseId)) : null,
    });
    return result(formatBriefing(briefing, day, settings.dailyGoalHours));
  } catch (cause) {
    return toolCrashed('get_briefing', cause);
  }
}

export function registerBriefingTool(server: McpServer, token: AuthenticatedToken) {
  server.registerTool(
    'get_briefing',
    {
      title: 'Brief me on the student’s day in Akada',
      description: GET_BRIEFING_DESCRIPTION,
      inputSchema: GetBriefingInput,
      annotations: { readOnlyHint: true },
    },
    async (input) => getBriefingTool(token, input),
  );
}
