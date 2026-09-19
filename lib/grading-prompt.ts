/**
 * The prompt the course page hands to an LLM session.
 *
 * "Say how it is marked" does not open a form any more. It copies this, and
 * the student pastes it into a chat that has the Akada connector attached.
 * The course id and code are the only things that vary, so this is one
 * template rather than a string built per course: the wording is a single
 * thing to fix when the parse comes back wrong.
 *
 * Two instructions in here are load-bearing rather than decorative. The model
 * is told to ask for the outline and to call nothing before a file is
 * actually attached, because a model that starts guessing from the course
 * code alone will produce a scheme that looks plausible and is invented. And
 * it is told that the write lands as a proposal, so it does not promise the
 * student their grading is live when it is still sitting behind an accept.
 */
export function gradingPrompt({ courseId, courseCode }: { courseId: string; courseCode: string }) {
  return `I want to record how ${courseCode} is graded in Akada.

The Akada course id is ${courseId}. Use that id exactly as written when you call the tool.

Ask me to upload the course outline or syllabus, then stop and wait. Do not parse anything, do not call any tool, and do not guess a grading scheme from the course code or from what this kind of course usually looks like. Wait until I have actually attached a file. If I send a message without one, ask again.

Once you have the outline, read it and call set_grading_scheme with:

- every graded component and what it is worth as a percentage of the course. Include the ones worth nothing on their own if the outline lists them, and make the weights add to 100 unless the outline genuinely does not.
- whether the course is graded absolutely (fixed scale) or relatively (curved, ranked against the class). Say which the outline states. If it does not say, use absolute and tell me you had to assume it.
- any rule where not every item counts, such as "best 6 of 7 quizzes" or "lowest assignment dropped". Put those items in a shared group and give the rule for that group.

Tell me anything the outline was vague or silent about rather than filling it in quietly. Put that in the note.

This write does not take effect on its own. It lands in Akada as a proposal and I have to accept it on the course page before anything is projected from it, so tell me to go and look at it when you are done.`;
}
