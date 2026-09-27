/**
 * The prompts behind the Claude buttons that did not have one of their own.
 *
 * "Get them in with Claude" on Today, "have Claude write one" on the Study
 * shelf and "quiz me" on the quiz shelf used to send the reader to a docs
 * page and leave the asking to them. Each is now the exact words the shared
 * Claude sheet copies (components/claude/ClaudeSheet.tsx). The grading,
 * recall and note-format prompts keep living where they were
 * (lib/grading-prompt.ts, lib/recall/prompt.ts, lib/notes/prompt.ts).
 */

/** Every deadline in the outlines, into Akada. */
export function outlinePrompt(courseCodes: string[]): string {
  const courses = courseCodes.length ? courseCodes.join(', ') : 'my courses';
  return `I'm going to attach my course outlines for ${courses}. Wait until I have actually attached them before you do anything.

Then read each one and put every assignment, reading, quiz and exam into Akada under its course, with the due date and what it is worth as a percentage of the course where the outline says. Mark readings as readings with their page count when the outline gives one, and exams as exams.

Don't guess a date or a weight the outline doesn't give. Tell me what was missing or unclear instead, and list what you added when you're done.`;
}

/** A study note on something, written onto the Study shelf. */
export function notePrompt(courseCode: string | null): string {
  const where = courseCode ? ` under ${courseCode}` : '';
  return `Write me a study note and save it to Akada${where}.

I'll tell you the topic and attach or paste what it should come from: lecture slides, a chapter, my own rough notes. Wait for that before you write anything, and don't add facts that aren't in what I give you.

Keep every number, name and page reference. Put a few "check yourself" questions at the end.`;
}

/** A quiz on something, sent to the quiz shelf. */
export function quizPrompt(courseCode: string | null): string {
  const where = courseCode ? ` for ${courseCode}` : '';
  return `Quiz me${where} in Akada.

Ask me what it should cover first, or use what is due for recall and my notes in Akada if I say so. Then make ten questions and send them to Akada as a quiz, so I can take it there. Don't show me the answers here.`;
}
