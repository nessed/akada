import { completable, type McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { readAccessToken } from '@/lib/mcp-auth';
import { RECALL_PROTOCOL } from '@/lib/recall/prompt';
import { mcpSupabase, readStudentSettings } from './_shared';

/**
 * The connector's prompts: the things a student most often starts a chat
 * with Akada to do, offered in Claude's own menu.
 *
 * The app already hands out prompts, by copying them to the clipboard from a
 * recall card, a course page or a reading. Those carry ids and a UTC offset
 * because they start from one thing on one screen. These start from nothing,
 * in any chat: the course is named by its code and looked up, and the day is
 * the one the app stored. Each is written the way lib/grading-prompt.ts and
 * lib/recall/prompt.ts are, with the instructions that stop a model guessing
 * spelled out rather than hoped for.
 */

type AuthenticatedToken = ReturnType<typeof readAccessToken>;

function say(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
}

/**
 * A course argument that completes from the student's own courses in their
 * active semester, by code or name. Best effort: a failed read offers nothing
 * rather than breaking the menu.
 */
function courseArg(token: AuthenticatedToken, description: string) {
  return completable(z.string().trim().max(120).describe(description), async (value) => {
    try {
      const supabase = mcpSupabase(token.supabaseAccessToken);
      const { semesterId } = await readStudentSettings(token, supabase);
      if (!semesterId) return [];
      const { data } = await supabase
        .from('courses')
        .select('code, name')
        .eq('user_id', token.userId)
        .eq('semester_id', semesterId);
      const needle = String(value ?? '').trim().toLowerCase();
      return ((data ?? []) as { code: string; name: string }[])
        .filter((c) => !needle || `${c.code} ${c.name}`.toLowerCase().includes(needle))
        .map((c) => c.code)
        .slice(0, 20);
    } catch {
      return [];
    }
  });
}

const findCourse = (course: string) =>
  `Find "${course}" with find_course and use the id it returns; if more than one course matches, ask me which I mean.`;

export function planWeekPrompt() {
  return say(`Plan my week in Akada with me.

Start with get_briefing. Then tell me, in a few short lines: what has to happen this week (exams and deadlines first, then anything overdue I still need to do), which courses are behind their weekly goal, and what is due for recall.

Before planning anything, ask me which overdue tasks are actually done, and tick those with complete_tasks.

Then give me a plan by day, not by hour. Size it off about_the_student in the briefing (how long my sittings actually run, how many days I usually study, my reading pace), not off an ideal week: a plan I will not follow is worse than a small one I will. Put exam courses first and spread them over several days rather than the night before.

Do not add, re-date or change anything in Akada unless I say yes to it.`);
}

export function studyNowPrompt(minutes?: string) {
  const time = minutes && /^\d{1,3}$/.test(minutes.trim()) ? `${minutes.trim()} minutes` : 'some time';
  return say(`I have ${time} to study right now. What should I do?

Call get_briefing and give me one thing, in a line or two. Take up_next: it already weighs what is due, an exam's run-up and what I was just working on, and up_next.reason says why it is first; say that reason plainly. session_minutes is sized to how I work; fit it to the time I have. Offer something else instead only if a quiz is waiting to be marked, or up_next will not fit the time I have, in which case take one of up_next.others, and say which. If up_next.why is exam prep, open with a recall round on that course.

If it is a recall round or a quiz, offer to start it here. Do not change anything in Akada.`);
}

export function importOutlinePrompt(course: string) {
  return say(`I want to put the ${course} course outline into Akada.

Ask me to attach the outline or syllabus, then stop and wait. Do not call any tool, and do not guess anything from the course code or from what this kind of course usually looks like, until a file is actually attached. If I send a message without one, ask again.

Once it is attached: ${findCourse(course)} Then:

1. set_grading_scheme with every graded component and its weight as a percentage of the course, whether it is graded absolutely or relatively (say if you had to assume), and any rule where not every item counts, such as best 6 of 7 quizzes, with each item in that group carrying what one counted item is worth. This lands as a proposal; tell me to accept it on the course page.
2. Read my tasks for the course with get_tasks, then create_tasks for every deadline the outline actually dates and I do not already have: each midterm, final, quiz or test as kind exam with its weight; each reading as kind reading with pages when the outline gives them; everything else as kind task. No date the outline does not state.

Then tell me in a few lines what went in, and anything the outline was vague or silent about.`);
}

export function recallRoundPrompt(course?: string) {
  const scope = course ? ` in ${course}` : '';
  const how = course
    ? `${findCourse(course)} Then call get_recall with that course_id`
    : 'Call get_recall';
  return say(`Quiz me on what is due for recall in Akada${scope}.

${how}, and use the items it returns, most urgent first. Mix them up rather than taking them in order, so I have to work out what each one needs before I start. One at a time: for a reading, ask me for its main argument in my own words; for a concept or a step, give me one fresh problem of that type that I have not seen.

${RECALL_PROTOCOL}

Record each verdict with record_recall as we go, using each item's key exactly as get_recall gave it. When we are done, tell me which ones went, so I know what to go back over.`);
}

export function examPrepPrompt(course: string) {
  return say(`Help me get ready for my next exam in ${course}.

${findCourse(course)} Then read get_briefing, get_weak_points and get_recall (with include_not_due) for that course, and get_grade_projection if the course has a grading scheme.

Tell me in a few lines: when the exam is and what it is worth, what is still shaky (open weak points first, then recall that is hazy or gone), and how many days I have. If the exam is not in Akada as kind exam, say so and offer to fix it with update_tasks or create_tasks.

Then propose sittings between now and the exam, spread out rather than crammed into the last night, each opening with a short recall round. Do not add them to Akada unless I ask.

Then start: retest my weakest point first, one question at a time, nothing shown before I answer, the right answer after. Only call resolve_weak_point when I get one right on a retest. Record any new confusion with record_weak_points, and record recall answers with record_recall.`);
}

export function logSittingPrompt() {
  return say(`I just finished studying and want it in Akada.

Ask me in one message: which course, what I worked on (and which task, if it was one), how many minutes I actually focused, any break, and whether it was a practice paper I marked and what it scored.

Then log it with log_study_session using only what I told you: never estimate minutes or a score, and keep breaks out of the focus time. Leave the date out unless I say it was another day. If I finished a task, find it with get_tasks and tick it with complete_tasks rather than adding a new one.

Last, ask if there is one thing from the sitting worth being able to recall with the book shut, and keep it with keep_for_recall if I give you one. One line, phrased as what I should be able to produce, not a bare topic.`);
}

/**
 * Registered after the tools. Every prompt that asks the model to write is
 * left out of a read-only connection, where the tools it names are switched
 * off and it could only fail halfway through.
 */
export function registerPrompts(server: McpServer, token: AuthenticatedToken, canWrite: boolean) {
  server.registerPrompt(
    'plan_week',
    { title: 'Plan my week', description: 'Where you stand this week in Akada, and a plan sized to how you actually study.' },
    () => planWeekPrompt(),
  );
  server.registerPrompt(
    'study_now',
    {
      title: 'What should I study now?',
      description: 'One thing to do with the time you have, and why it beats the rest.',
      argsSchema: z.object({ minutes: z.string().trim().max(20).optional().describe('How many minutes you have, if you know.') }),
    },
    ({ minutes }) => studyNowPrompt(minutes),
  );
  if (!canWrite) return;
  server.registerPrompt(
    'import_outline',
    {
      title: 'Put a course outline into Akada',
      description: 'Attach an outline: the grading scheme goes in as a proposal, and every dated exam, reading and deadline goes on the list.',
      argsSchema: z.object({ course: courseArg(token, 'The course, by its code.') }),
    },
    ({ course }) => importOutlinePrompt(course),
  );
  server.registerPrompt(
    'recall_round',
    {
      title: 'Quiz me on what is due',
      description: 'A recall round on what Akada says is due, one question at a time, with the answers recorded back.',
      argsSchema: z.object({ course: courseArg(token, 'One course, or leave it out for everything due.').optional() }),
    },
    ({ course }) => recallRoundPrompt(course || undefined),
  );
  server.registerPrompt(
    'exam_prep',
    {
      title: 'Get ready for an exam',
      description: 'What is still shaky before your next exam in a course, a spaced plan to it, and a retest of the weakest point first.',
      argsSchema: z.object({ course: courseArg(token, 'The course the exam is in.') }),
    },
    ({ course }) => examPrepPrompt(course),
  );
  server.registerPrompt(
    'log_sitting',
    { title: 'Log a study sitting', description: 'Tell Claude what you just did; it goes into Akada as you said it, with anything worth keeping for recall.' },
    () => logSittingPrompt(),
  );
}
