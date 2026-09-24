import type { RecallSource } from '../data';
import { dayEndingHour } from '../utils';

/**
 * The prompts recall hands to a model.
 *
 * A card can only ask; it cannot check. For a reading that is nearly enough,
 * since the reader knows whether they could give the argument. For a step on
 * a concept list it is thin: "could you do one fresh?" is best answered by
 * doing one, and the app has no problems to set. A model with the connector
 * does, so a card copies one of these and the reader pastes it into a chat.
 *
 * Three instructions carry the weight, as in lib/grading-prompt.ts.
 *
 * Nothing is shown before the attempt: no answer, no worked example, no hint
 * unless asked for. A recall with the answer in view is a re-read, and help
 * that does the thinking for a student is measured to leave them worse off
 * once it is gone, where help that only nudges does not.
 *
 * Everything is shown after it. Retrieval practice roughly doubles its effect
 * when the attempt is followed by the right answer to compare against, and a
 * reader grading their own recall with nothing to compare it to reliably
 * marks half-right answers as right.
 *
 * And the verdict goes back through record_recall, so a quiz taken in a chat
 * lands in the same schedule as a card answered on Today.
 */

const PROTOCOL = `Wait for my answer before you say anything about whether it is right. Do not show me the answer, a solution, a worked example or a hint first; if I ask for a hint, give the smallest one that gets me moving.

Once I have answered, show me the correct answer or the key points I should have hit, so I can compare mine against it. Then tell me plainly how it went: clear if I got it right without help, hazy if I only got part of it or needed a hint, gone if I could not. Do not round up; a hazy recorded as clear pushes it weeks out of sight.`;

/**
 * This device's offset from UTC, in minutes east, for the connector's recall
 * tools. Its server keeps UTC, and an answer given in a chat at half past one
 * in the morning in Lahore would otherwise be dated the day before. The
 * offset rather than today's date, because a copied prompt can be pasted
 * after midnight and an offset does not go stale.
 *
 * Less the reader's late-night cutoff, so the connector's day turns over when
 * the app's does: someone whose day ends at 4am and answers in a chat at half
 * past one is still answering on the day the app says it is.
 */
function utcOffset(): number {
  // Within the tool's range; only the far west of the Pacific with a late
  // cutoff reaches past it, and there the day turns a few hours early.
  return Math.max(-840, -new Date().getTimezoneOffset() - dayEndingHour() * 60);
}

function askFor(source: RecallSource): string {
  if (source === 'reading') {
    return 'Ask me to give the main argument of this reading in my own words, then ask one or two follow-up questions about it, one at a time.';
  }
  if (source === 'step' || source === 'task') {
    return 'Give me one fresh problem of this exact type, one I have not seen before.';
  }
  return 'Ask me to explain this in my own words, then ask one follow-up question about it.';
}

/** One kept thing, from its card. */
export function recallPrompt({
  key,
  prompt,
  source,
  courseCode,
  courseName,
  detail,
}: {
  key: string;
  prompt: string;
  source: RecallSource;
  courseCode: string;
  courseName: string;
  /** The task's notes, when it has any, as context for the questions. */
  detail?: string;
}): string {
  return `Quiz me on something I am keeping in Akada.

Course: ${courseCode} (${courseName})
What to recall: ${prompt}${detail ? `\nNotes from the task: ${detail}` : ''}

${askFor(source)}

${PROTOCOL}

Then record that verdict with the record_recall tool, using the key "${key}" exactly as written and utc_offset_minutes ${utcOffset()}, so Akada schedules the next time it asks me.`;
}

/**
 * Everything due on one course, from its page.
 *
 * Mixed rather than in order, because practice that makes the reader decide
 * which method a problem needs, as an exam does, holds up far better than
 * doing all the problems of one type in a row, and in mathematics that is
 * where most of the difference is.
 */
export function coursePrompt({
  courseId,
  courseCode,
  courseName,
}: {
  courseId: string;
  courseCode: string;
  courseName: string;
}): string {
  return `Quiz me on what is due for recall in ${courseCode} (${courseName}) in Akada.

Call get_recall with course_id ${courseId} and utc_offset_minutes ${utcOffset()}, and use the items it returns, most urgent first. Mix them up rather than taking them in order, so I have to work out what each one needs before I start. One at a time: for a reading, ask me for its main argument in my own words; for a concept or a step, give me one fresh problem of that type that I have not seen.

${PROTOCOL}

Record each verdict with record_recall as we go, using each item's key exactly as get_recall gave it and utc_offset_minutes ${utcOffset()}. When we are done, tell me which ones went, so I know what to go back over.`;
}

/**
 * Questions before a reading, from its task sheet.
 *
 * Being asked about something before reading it makes the answers stick
 * when they turn up in the text, even when the guess beforehand was wrong,
 * provided the reading is actually done afterwards. The gain is on the
 * points asked about rather than the whole text, which is why the questions
 * are aimed at what an in-class paper or an exam would ask, and why they go
 * into recall afterwards: the questions are the thing worth being able to
 * answer with the book shut.
 */
export function beforeReadingPrompt({
  courseId,
  courseCode,
  courseName,
  title,
  detail,
}: {
  courseId: string;
  courseCode: string;
  courseName: string;
  title: string;
  detail?: string;
}): string {
  return `I am about to read something for ${courseCode} (${courseName}) and I want to go in with questions.

The reading: ${title}${detail ? `\nNotes from the task: ${detail}` : ''}

Before I start, give me three short questions this reading answers, the kind an exam or an in-class response paper would ask about it. Do not answer them and do not summarise the reading. If you do not know the text well enough to ask good questions, say so and ask me for the syllabus line or the first page rather than guessing.

Ask me to write a one-line guess at each before I read. Wrong guesses are fine; they are part of how this works.

Then save the three questions to Akada with keep_for_recall, course_id ${courseId}, one item per question, worded as the question itself, so they come back to me from memory after I have read it.`;
}
