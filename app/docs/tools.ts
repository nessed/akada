export type Access = 'Reads' | 'Changes' | 'Deletes';
export type Tool = { name: string; access: Access; does: string };

// Mirrors the tools registered in app/api/mcp. `access` is the tool's
// annotation in words: readOnlyHint is Reads, destructiveHint is Deletes
// (update_note included, since it can replace a whole note), anything else
// Changes. scopes.test.ts fails if this and the server disagree.
export const GROUPS: { id: string; title: string; tools: Tool[] }[] = [
  {
    id: 'courses',
    title: 'Courses and tasks',
    tools: [
      { name: 'find_course', access: 'Reads', does: 'Finds one of your courses in the current term by its code or name.' },
      { name: 'get_overview', access: 'Reads', does: 'Your courses in dashboard order, how many tasks are open in each, and your recent study sessions.' },
      { name: 'get_tasks', access: 'Reads', does: 'The term’s tasks, narrowed to a course, a date range, a priority or a kind if asked, and sorted by due date, priority, newest or your own order.' },
      { name: 'get_reading_backlog', access: 'Reads', does: 'The reading you have not finished and how many hours it comes to at your pace.' },
      { name: 'create_tasks', access: 'Changes', does: 'Adds tasks to a course, with notes, steps, due dates, and whether each is a task, a reading or an exam.' },
      { name: 'update_tasks', access: 'Changes', does: 'Changes tasks that already exist: title, date, notes, steps, kind, weight or pages.' },
      { name: 'complete_tasks', access: 'Changes', does: 'Ticks tasks off, or puts them back on the list.' },
      { name: 'reorder_courses', access: 'Changes', does: 'Changes the order your courses sit in on the dashboard.' },
      { name: 'reorder_tasks', access: 'Changes', does: 'Changes the order one course’s open tasks sit in.' },
      { name: 'delete_tasks', access: 'Deletes', does: 'Permanently deletes tasks, for duplicates and mistakes.' },
      { name: 'delete_course', access: 'Deletes', does: 'Permanently deletes a course with its tasks and sessions.' },
    ],
  },
  {
    id: 'time',
    title: 'Study time',
    tools: [
      { name: 'list_study_sessions', access: 'Reads', does: 'Your logged sessions, newest first, for one course or between two dates.' },
      { name: 'get_weekly_stats', access: 'Reads', does: 'One week’s hours against your goal, break time, tasks closed and your weekly run.' },
      { name: 'get_focus_pattern', access: 'Reads', does: 'How your sittings are shaped: block lengths, breaks, and when in the day you work.' },
      { name: 'log_study_session', access: 'Changes', does: 'Records study time against a course, with an optional task, note and practice-paper score.' },
      { name: 'update_study_session', access: 'Changes', does: 'Rewrites the note on a session already logged. Nothing else about it changes.' },
      { name: 'delete_study_session', access: 'Deletes', does: 'Permanently deletes a session that should not be there.' },
    ],
  },
  {
    id: 'grades',
    title: 'Grades',
    tools: [
      { name: 'get_grading_scheme', access: 'Reads', does: 'How a course is marked, both the scheme you accepted and any proposal waiting.' },
      { name: 'get_grade_projection', access: 'Reads', does: 'The lowest and highest grade still possible, and what the rest needs to reach a target.' },
      { name: 'set_grading_scheme', access: 'Changes', does: 'Proposes how a course is marked, read off its outline. Nothing counts until you accept it in Akada.' },
      { name: 'record_grade', access: 'Changes', does: 'Writes marks that came back into a course’s accepted scheme.' },
    ],
  },
  {
    id: 'recall',
    title: 'Recall',
    tools: [
      { name: 'get_recall', access: 'Reads', does: 'What you are keeping for recall, what is due, and how each has gone.' },
      { name: 'keep_for_recall', access: 'Changes', does: 'Keeps concepts, lines or a task’s ticked steps, to come back at widening gaps.' },
      { name: 'record_recall', access: 'Changes', does: 'Records how a recall went, clear, hazy or gone, after Claude quizzed you.' },
    ],
  },
  {
    id: 'notes',
    title: 'Notes',
    tools: [
      { name: 'list_notes', access: 'Reads', does: 'Your study notes with their course, length and how the self-checks have gone.' },
      { name: 'get_note', access: 'Reads', does: 'One note with its self-check questions, answers and results.' },
      { name: 'save_note', access: 'Changes', does: 'Writes a new study note onto your Notes shelf, optionally filed under a course.' },
      { name: 'record_note_checks', access: 'Changes', does: 'Records how you did on a note’s self-checks after a quiz in chat.' },
      { name: 'update_note', access: 'Deletes', does: 'Retitles a note, adds a section, files it under a course, or replaces its text outright, which loses what was there.' },
      { name: 'delete_note', access: 'Deletes', does: 'Permanently deletes a note.' },
    ],
  },
  {
    id: 'quizzes',
    title: 'Quizzes',
    tools: [
      { name: 'get_quiz_format', access: 'Reads', does: 'The text format Akada reads multiple-choice quizzes from.' },
      { name: 'list_quizzes', access: 'Reads', does: 'Your quizzes with what they are filed under and your last and best marks.' },
      { name: 'get_quiz', access: 'Reads', does: 'One quiz with its answer key, what you answered last time, and every past mark.' },
      { name: 'send_quiz', access: 'Changes', does: 'Sends a quiz with its answer key to Akada, where you take it and it is marked.' },
      { name: 'grade_quiz', access: 'Changes', does: 'Marks the written answers on a quiz you handed in, with a score and feedback on each.' },
      { name: 'delete_quiz', access: 'Deletes', does: 'Permanently deletes a quiz and its marks.' },
    ],
  },
  {
    id: 'weak-points',
    title: 'Weak points',
    tools: [
      { name: 'get_weak_points', access: 'Reads', does: 'What you keep getting wrong in a course, most often missed first, with the section and pages to reread.' },
      { name: 'record_weak_points', access: 'Changes', does: 'Writes down each confusion found when marking a quiz; one already there counts again instead of doubling up.' },
      { name: 'resolve_weak_point', access: 'Changes', does: 'Marks a weak point fixed after you get it right on a retest.' },
      { name: 'reopen_weak_point', access: 'Changes', does: 'Puts a fixed weak point back on the list.' },
    ],
  },
];
