# Connect Akada to Claude

Akada exposes a remote MCP endpoint that lets Claude find courses in the active semester and add tasks to them.

## Before connecting

Deploy the current `main` branch to Vercel and set these Production environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | The deployed Akada origin, with no trailing slash. |
| `AKADA_MCP_TOKEN_SECRET` | A random value of at least 32 characters. Keep it stable; changing it invalidates existing connector credentials. |

Redeploy after adding or changing an environment variable.

## Add the connector in Claude

1. In Claude, open **Customize -> Connectors -> Add custom connector**.
2. Enter the MCP server URL:

   ```text
   https://your-akada-domain/api/mcp
   ```

3. Select **Always required** authentication.
4. Select **No client ID -- register one automatically**.
5. Leave Additional request headers empty.
6. Add the connector, click **Connect**, sign in to Akada, and select **Allow connection**.
7. Enable Akada for a chat through the chat's Connectors menu.

Connecting asks you to confirm your Akada password. That gives the connector a
session of its own instead of sharing this browser's, which is what keeps it
signed in. You should only ever have to do this once. Signing out of Akada
normally does not disconnect Claude, but revoking all sessions does.

The connector provides tools for interacting with courses and tasks in your active semester:
- `find_course`: Look up courses by code or title.
- `get_tasks`: Read the active semester's tasks, optionally narrowed to one course, a due-date range, a priority or a kind.
- `delete_tasks`: Permanently delete tasks, for duplicates and mistakes.
- `get_overview`: Read a snapshot of courses, open-task counts, and recent study sessions (with their ids).
- `create_tasks`: Bulk-insert tasks into an active course, with notes, subtasks, and what each one is (task, reading or exam) and is worth.
- `update_tasks`: Change tasks that already exist, including their notes, subtasks, kind, weight and pages.
- `complete_tasks`: Tick tasks off, or put them back on the list.
- `log_study_session`: Record study time against a course, with an optional task, note, and practice-paper score.
- `update_study_session`: Fix or rewrite the note on a session that is already logged. Only the note changes.
- `delete_study_session`: Permanently delete a sitting that should not be there.
- `get_reading_backlog`: Read the unfinished reading and how many hours it comes to at the student's pace, optionally by a date.
- `get_weekly_stats`: Read one week's hours against goal, break time, tasks closed, and the weekly run.
- `get_focus_pattern`: Read how the sittings themselves were shaped: block lengths, breaks against the lengths they were set to, and when in the day the work happens.
- `get_grading_scheme`: Read how a course is marked, accepted and proposed.
- `set_grading_scheme`: Propose how a course is marked, read off its outline.
- `record_grade`: Write marks that came back into a course's accepted scheme.
- `get_grade_projection`: Work out the floor, the ceiling, and what the rest needs to reach a target.
- `delete_course`: Permanently delete a course and its associated tasks and sessions.
- `get_recall`: Read what the student is keeping for recall, what is due, and how each thing has gone.
- `record_recall`: Record how a recall went (clear, hazy or gone) after quizzing the student.
- `keep_for_recall`: Keep concepts, lines or a task's ticked steps to be recalled at widening gaps.
- `save_note`: Write a study note straight onto the Notes shelf, in Markd format, optionally linked to a course.
- `list_notes`: List study notes with their course, length and how the self-checks have gone.
- `get_note`: Read one note, with its self-check questions, answers and results.
- `update_note`: Replace a note, append a section to it, retitle it, or link it to a course.
- `record_note_checks`: Record how the student did on a note's self-checks after a quiz in chat.
- `delete_note`: Permanently delete a note.

In Claude's connector permissions, you can set `create_tasks`, `update_tasks`, `complete_tasks`, `log_study_session`, `update_study_session`, `set_grading_scheme`, `record_grade`, `delete_course`, `delete_tasks`, `delete_study_session`, `record_recall`, `keep_for_recall`, `save_note`, `update_note`, `record_note_checks` and `delete_note` to **Needs approval** if you want to review each change before it is executed.

---

## Available MCP Tools

### 1. `find_course`
- **Title**: Find an Akada course
- **Description**: Search for courses in the student’s active semester by code or name before performing operations.
- **Annotations**: `readOnlyHint: true`
- **Parameters**:
  - `query` (`string`, 1-120 chars): Search query (e.g. `"CS 101"`, `"Intro"`).
- **Output**: Returns up to 8 matching courses with `id`, `code`, `name`, `credits`, and `weekly_study_goal_hours`.

### 2. `create_tasks`
- **Title**: Add study tasks to Akada
- **Description**: Add extracted readings, assignments, or preparation tasks to exactly one active-semester Akada course. Existing unfinished tasks with matching title and due date are automatically deduplicated.
- **Annotations**: `destructiveHint: false`, `idempotentHint: true`
- **Parameters**:
  - `course_id` (`string`, UUID): Target course ID in the active semester.
  - `tasks` (`array` of 1-20 objects):
    - `title` (`string`, 1-160 chars): Task name.
    - `due_date` (`string`, optional, format `YYYY-MM-DD`): Explicit due date.
    - `priority` (`"high" | "normal"`, default: `"normal"`).
    - `description` (`string`, optional, up to 5000 chars): Notes that belong with the task, shown in the task reading view.
    - `subtasks` (`array` of up to 50 strings, optional): The pieces of the task, each one a title the student ticks off inside the task. Ids are generated here, and every piece starts unticked.
    - `kind` (`"task" | "reading" | "exam"`, default: `"task"`): What the task is. An exam is what the Coming panel counts down to and what recall paces itself against; a reading feeds the reading backlog and, once finished, recall.
    - `weight` (`number`, optional, 0-100): What the piece is worth as a percentage of the course, only when the source states it.
    - `pages` (`integer`, optional, 1-10000): How long a reading runs, only when the source gives it.
- **Output**: Structured list of created tasks (`id`, `title`, `due_date`, `priority`, `description`, `subtasks`, `kind`, `weight`, `pages`) and count of skipped duplicates.

`description`, `subtasks`, `kind`, `weight` and `pages` are columns added by a
later `supabase/schema.sql`, so they are only named in the insert when a
request actually uses them, and then on every row of the batch at once (a key
some rows omit is written as NULL, and three of them are `not null`). A
project that has not re-run the schema keeps creating plain tasks; a request
that asks for notes, pieces or a kind against such a project fails with the
reason rather than quietly saving an exam as a plain task.

The description tells the model two things it kept getting wrong. A midterm
has to be created as an `exam`, or every part of Akada that counts down to one
cannot see it. And finished work is ticked with `complete_tasks` on the task
already on the list, never recorded by creating a second copy marked done,
which leaves the original sitting there as overdue.

### 3. `update_tasks`
- **Title**: Change study tasks in Akada
- **Description**: Patch tasks that already exist in the active semester. Only the named fields change. Both `description` and `subtasks` replace what is there rather than merging, so send the whole value the task should end up with.
- **Annotations**: `destructiveHint: false`, `idempotentHint: true`
- **Parameters**:
  - `tasks` (`array` of 1-20 objects):
    - `task_id` (`string`, UUID): The task to change, as returned by `get_tasks`.
    - `title` (`string`, optional, 1-160 chars).
    - `due_date` (`string | null`, optional, format `YYYY-MM-DD`): `null` clears the date.
    - `priority` (`"high" | "normal"`, optional).
    - `description` (`string`, optional, up to 5000 chars): Replaces the task's notes.
    - `subtasks` (`array` of up to 50 `{ title, completed }` objects, optional): Replaces the whole list of pieces.
    - `completed` (`boolean`, optional): Also stamps or clears `completed_at`.
    - `kind` (`"task" | "reading" | "exam"`, optional).
    - `weight` (`number | null`, optional, 0-100): `null` clears it.
    - `pages` (`integer | null`, optional, 1-10000): `null` clears it.
- **Output**: Each changed task with its `id`, `title`, `due_date`, `priority`, `description`, `subtasks`, `completed`, `kind`, `weight`, `pages`, and `course`.

### 4. `complete_tasks`
- **Title**: Tick Akada tasks off
- **Description**: Mark tasks in the active semester as done, or put them back on the list. One statement for the whole set.
- **Annotations**: `destructiveHint: false`, `idempotentHint: true`
- **Parameters**:
  - `task_ids` (`array` of 1-20 UUIDs): Tasks to change, as returned by `get_tasks`.
  - `completed` (`boolean`, default: `true`): `false` reopens them.
- **Output**: `completed`, plus each task's `id`, `title`, `due_date`, `completed`, `completed_at`, and `course`.

Both tools refuse the whole request unless every id names a task the signed-in
student owns in their active semester, checked through the owning course rather
than the denormalized `tasks.semester_id`.

### Recall: `get_recall`, `record_recall`, `keep_for_recall`

What the student is keeping to be asked about from memory. The reading is
`lib/recall`, the same code Today runs, so a quiz in a chat and a card in the
app cannot disagree about what is due. Finished readings come in on their own
and have no row until first answered; everything else is a row in
`recall_items`, keyed `task:<id>`, `step:<taskId>:<subtaskId>`, or `own:` /
`note:` plus a random tail.

- **`get_recall`** (`readOnlyHint: true`)
  - `course_id` (UUID, optional), `include_not_due` (boolean, default `false`),
    `limit` (1-50, default 20), `date` (`YYYY-MM-DD`, optional, the student's own
    day), `utc_offset_minutes` (-840 to 840, optional, e.g. `300` for UTC+5).
    The server keeps UTC, so without either the day is UTC's, which is a day out
    for part of every day away from Greenwich. When both are given the offset
    decides, since it comes from the student's device by way of the copied
    prompt (less their late-night cutoff, so the day turns when the app's does)
    while a `date` comes from the model. A `date` more than a day from the
    server's is refused.
  - **Output**: `items`, due first in asking order (what slipped, then what was
    never asked, then clear things coming round), each with its `key`, `course`,
    `prompt`, `kind`, `how_to_recall`, `standing`, `recent` answers, `due_on`
    and the task behind it; `due_count`; and `by_course` counts of settled,
    clear, hazy, gone and not asked yet. On a project without the table it still
    returns the finished readings, with a `message` saying answers cannot be
    stored until `supabase/schema.sql` has been re-run.
- **`record_recall`** (`destructiveHint: false`, `idempotentHint: true`)
  - `results` (1-30 `{ key, verdict }`, verdict `clear` / `hazy` / `gone`),
    `date` and `utc_offset_minutes` (optional, as for `get_recall`).
  - Refuses any key it is not keeping rather than inventing one. A step recorded
    `gone` is unticked on its task. **Output**: each key's verdict and
    `next_due_on`, and the tasks a step was unticked on.
- **`keep_for_recall`** (`destructiveHint: false`, `idempotentHint: true`)
  - `course_id` (UUID), `items` (up to 40 lines, each phrased as what the student
    should be able to produce), `task_id` (UUID, optional), `ticked_steps`
    (boolean). With `task_id` and `ticked_steps: true` it keeps that task's
    ticked steps; with `task_id` alone, the whole finished task.
  - Skips anything already kept on the course, by key and by wording (a
    reading written down twice counts as kept through either copy), and never
    overwrites the answers of a thing already kept. A thing the student had let
    go is brought back instead, with its answers. **Output**: `kept` (new rows)
    and `brought_back`.

The descriptions carry the protocol the prompts in `lib/recall/prompt.ts` do:
ask one thing at a time, show nothing before the attempt, show the right answer
after it, and record the verdict the attempt earned without rounding up.

### Notes: `save_note`, `list_notes`, `get_note`, `update_note`, `record_note_checks`, `delete_note`

Notes live in the `notes` table (see `supabase/schema.sql`), are not scoped to a semester, and are what the Notes screen reads. `save_note` carries Markd's format rules in its description (`lib/notes/format.ts`), so an assistant writes a note in the same shape the copy-paste AI prompt asks for, without the student pasting anything.

- **`save_note`** (`destructiveHint: false`): `markdown` (the whole note, up to 200,000 chars), optional `title` (read off the `#` heading when left out) and `course_id`. Stored with `source: "mcp"`. Returns the note's id, tally of checks and a `url` to open it.
- **`list_notes`** (`readOnlyHint: true`): optional `query` (title or text), `course_id`, `limit` (1-50, default 20). Newest first.
- **`get_note`** (`readOnlyHint: true`): `note_id`, `include_markdown` (default true). Returns the markdown and `check_questions`: each `[!CHECK]` block's `index`, `question`, `answer` and `result` (`got`, `not_yet` or null).
- **`update_note`** (`destructiveHint: false`): `note_id`, then `markdown` (replace) or `append` (add to the end), `title`, `course_id` (null unlinks). A rewrite drops results for checks that no longer exist.
- **`record_note_checks`** (`idempotentHint: true`): `note_id`, `results` of `{ index, result: "got" | "not_yet" | "clear" }`. The strokes on the note page fill in from this.
- **`delete_note`** (`destructiveHint: true`): `note_id`.

Things to ask Claude once it's connected:
- "Make me notes on chapter 3 of this PDF and put them in Akada under ECON 240."
- "Quiz me on my Harrod-Domar note." (reads the checks, asks one at a time, records got/not yet)
- "Add three harder check questions to that note."
- "Which of my notes have checks I keep missing?"

### 5. `log_study_session`
- **Title**: Log study time in Akada
- **Description**: Record time actually spent on one active-semester course, optionally against a task, with a note about what the sitting covered.
- **Annotations**: `destructiveHint: false`, `idempotentHint: false`
- **Parameters**:
  - `course_id` (`string`, UUID): Target course in the active semester.
  - `duration_minutes` (`integer`, 1-1080): Minutes studied. The ceiling is `MAX_SESSION_SECONDS` in `lib/session-safety.ts`, which the `sessions_duration_seconds_range` constraint also enforces.
  - `date` (`string`, optional, format `YYYY-MM-DD`): Defaults to today. The server clock is UTC, so a student writing up a late-night sitting should pass their own date.
  - `task_id` (`string`, optional, UUID): Must belong to the same course. `sessions.task_id` is only `on delete set null`, so a mismatched pair would otherwise read back as time spent on the wrong course.
  - `note` (`string`, optional, up to 800 chars): `SESSION_NOTE_MAX` in `lib/planner-safety.ts`.
  - `break_minutes` (`integer`, optional): Rest taken during the sitting. Reported separately and never added into `duration_minutes`, because the weekly goal and the run both read that column and would inflate together. Omitted from the insert when it is zero, so the write still runs against a project that has not re-run `supabase/schema.sql`.
  - `score` and `score_out_of` (`number`, or a numeric string like `"1,350"`, optional, both or neither): What a practice paper done in the sitting scored, e.g. `4.5` and `8`. `score_out_of` is above 0 and at most 10000 (`MAX_SCORE_OUT_OF` in `lib/session-safety.ts`), and the score is never more than it was out of, which the `sessions_score_range` constraint also enforces. Half a score, or one that does not add up, is never guessed at and never costs the sitting: the hours are logged without it and `message` says why. Only named in the insert when given, so a sitting without one still writes on a project that has not re-run `supabase/schema.sql`, and one with a score there is written again without it.
- **Output**: The session's `id`, `date`, `duration_minutes`, `duration_seconds`, `break_minutes`, `note`, `task_id`, and `course`, plus `score` and `score_out_of` when it had one. `get_overview`'s `recent_sessions` carry the same two fields where a sitting has them.

`semester_id` is filled by the `sessions_set_semester_id` trigger in
`supabase/schema.sql`, exactly as the app's own `addSession` relies on.

### 5a. `update_study_session`
- **Title**: Fix a study session's note in Akada
- **Description**: Fix or rewrite the note on a session that is already logged. For logging a new sitting, use `log_study_session`.
- **Annotations**: `destructiveHint: false`, `idempotentHint: true`
- **Parameters**:
  - `session_id` (`string`, UUID): The sitting to change. It comes back as `id` from `log_study_session`, and on each of `get_overview`'s `recent_sessions`.
  - `note` (`string`, up to 800 chars): Replaces the whole note, same ceiling as `log_study_session` (`SESSION_NOTE_MAX` in `lib/planner-safety.ts`). An empty string clears it.
- Only the note is ever written. Date, minutes, break, task and score stay as they were logged.
- Ownership is checked the way the task tools check it through `loadOwnTasks`: the row has to carry the student's `user_id`, and its course has to be in their active semester. A session that does not exist, belongs to someone else, or sits in another semester gets the same error rather than a silent no-op, and the update itself repeats the `user_id` filter.
- **Output**: The updated session in the same shape `log_study_session` returns (`id`, `date`, `duration_minutes`, `duration_seconds`, `break_minutes`, `note`, `task_id`, `course`, plus `score` and `score_out_of` when it has one), and a `message`.

### 6. `get_weekly_stats`
- **Title**: Read an Akada study week
- **Description**: How one week went: hours per course against each course's weekly goal, tasks closed inside the week, and the current run of consecutive counting weeks.
- **Annotations**: `readOnlyHint: true`
- **Parameters**:
  - `week_offset` (`integer`, -12 to 0, default: `0`): 0 for this week, -1 for last week.
  - `course_id` (`string`, optional, UUID): Narrow every figure to one course.
- **Output**: `week` (`from`, `to`, `offset`), per-course `hours_logged` / `break_hours` / `weekly_study_goal_hours` / `goal_met`, `totals`, the titles closed that week, and `weekly_run` / `weekly_run_best`.

`hours_logged` is focus only. `break_hours` sits beside it and never moves
`goal_met`: a goal is met on time worked.

Monday-first, matching `weekBounds` in `lib/derive.ts`, so a number read here
and a number on the Stats screen agree. The run is read through
`lib/progression/runs.ts`, the same engine the Record screen draws, rather
than reimplemented in the route: a week counts on four study days or on three
spread across three courses, and the week being lived extends the run without
ever breaking it.

### 6a. `get_focus_pattern`
- **Title**: Read the shape of Akada study sittings
- **Description**: How the student studies rather than how much. Block lengths, how often a block runs to the end of what it was set to, how long breaks run against how long they were meant to, how much focus comes before the first break, and when in the day the work happens.
- **Annotations**: `readOnlyHint: true`
- **Parameters**:
  - `days` (`integer`, 1-180, default: `28`): How far back to read.
  - `course_id` (`string`, optional, UUID): Narrow to one course.
  - `utc_offset_minutes` (`integer`, -840 to 840, default: `0`): The student's offset from UTC, `300` for UTC+5. Without it the hourly breakdown is in UTC, and `by_hour_offset_minutes` in the output says which was used.
- **Output**: `window`, `totals` (sittings, focus hours, break hours, break share), `blocks` (count, average, median, longest, how many had a set length, how many ran to the end, completion rate), `breaks` (the same plus `ran_over`, `overrun_rate` and `avg_overrun_minutes`), `rhythm` (focus before the first break, blocks per sitting, focus-to-break ratio), `by_hour`, `by_course`, and `recent_sittings`.

`recent_sittings` is what each block actually covered, written by the student
on the break straight after it: newest first, capped at 20, and only sittings
where at least one block was written about. It is what lets a question about
rhythm and a question about content be answered together. The last block of a
sitting has no break after it and so never appears; the session's own note
covers it.

Reads `session_segments`, which the timer writes for a sitting it ran through
continuous mode. Time logged after the fact contributes its totals but has no
chain, so `sittings_with_a_recorded_shape` is normally lower than
`totals.sittings`. On a project that has not re-run `supabase/schema.sql` the
table is absent; the tool returns the totals it can and says so rather than
failing the call.

`avg_overrun_minutes` is the figure a break total on its own can never give:
negative means breaks are habitually cut short, positive means a five-minute
break is really a nineteen-minute one.

### 7. `get_grading_scheme`
- **Title**: Read how an Akada course is graded
- **Description**: The grading scheme Akada holds for one course: every graded component and its weight, whether the course is graded absolutely or relatively, and any rule where not every item counts.
- **Annotations**: `readOnlyHint: true`
- **Parameters**:
  - `course_id` (`string`, UUID): The course to read.
- **Output**: `schema_version` (`akada.grading.v1`), `course`, an `accepted` block (`components`, `basis`, `drop_rules`), and a `pending` block or `null`.

`accepted` is what the app actually projects from. `pending` is a scheme
proposed by `set_grading_scheme` that the student has not accepted yet, and
nothing in Akada reads it.

### 8. `set_grading_scheme`
- **Title**: Propose how an Akada course is graded
- **Description**: Record how a course is graded, read off an outline or syllabus the student has attached. Writes a **proposal**, not a live scheme.
- **Annotations**: `destructiveHint: false`, `idempotentHint: true`
- **Parameters**:
  - `course_id` (`string`, UUID): The course this scheme belongs to.
  - `components` (array, 1-40): `label` (1-120 chars), `weight` (0-100, a percentage of the course), and optional `group` shared by items a drop rule covers.
  - `basis` (`"absolute" | "relative"`): A fixed scale, or curved against the class.
  - `drop_rules` (array, up to 20, default `[]`): `group` and `keep`, e.g. `{ "group": "quizzes", "keep": 6 }` for "best 6 of 7".
  - `note` (`string`, up to 600 chars): Anything the outline was vague or silent about. Shown to the student under the rows.
  - `source` (`string`, up to 200 chars): Where it came from, e.g. the outline's file name.
- **Output**: `proposed: true`, the `course`, the `components` / `basis` / `drop_rules` as stored, `total_weight`, and a `message` telling the model to send the student to the course page.

Example, for seven quizzes where the best six count:

```json
{
  "course_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "components": [
    { "label": "Quiz 1", "weight": 5, "group": "quizzes" },
    { "label": "Quiz 2", "weight": 5, "group": "quizzes" },
    { "label": "Midterm", "weight": 30 },
    { "label": "Final", "weight": 40 }
  ],
  "basis": "absolute",
  "drop_rules": [{ "group": "quizzes", "keep": 6 }],
  "note": "The outline does not say whether the final is cumulative.",
  "source": "MATH 101 outline.pdf"
}
```

#### Nothing is projected until the student accepts

`set_grading_scheme` writes to `courses.grading.pending`. It never touches
`courses.assessments`, and `gradeStanding` in `lib/derive.ts` reads only the
accepted scheme, so a proposal cannot move a number on any screen. The course
page shows it with **Accept** and **Discard**; accepting copies it across and
clears the proposal, discarding only clears it. Calling the tool again
replaces an unaccepted proposal and leaves an accepted scheme alone.

This is also why the tool description tells the model to send the student to
the course page rather than reporting the grading as saved.

#### Where the prompt comes from

The student does not write the prompt. **Say how it is marked** on the course
page copies one built from `lib/grading-prompt.ts` with that course's id and
code filled in, and it instructs the model to ask for the outline and to parse
nothing and call nothing until a file is actually attached. A model that
starts from the course code alone produces a scheme that looks plausible and
is invented, which is the failure this whole path is shaped to avoid.

#### Drop rules

A rule naming a group no component is in, or keeping more items than the group
holds, is rejected with a message rather than written, because either would
silently do nothing and the student would have no way to see why.

A group's total is the `keep` heaviest pieces in it, so seven 5% quizzes
keeping six come to 30%. Which piece is dropped is decided by score, worst
first, and only among pieces that have come back: until more than `keep` have
been marked, nothing the student already holds is thrown away.

### 9. `delete_course`
- **Title**: Delete an Akada course
- **Description**: Permanently delete a course from the student's active Akada semester by its `course_id`. Also removes all associated tasks and study sessions.
- **Annotations**: `destructiveHint: true`
- **Parameters**:
  - `course_id` (`string`, UUID): Target course ID to delete.
- **Output**: Structured confirmation of the deletion:
  ```json
  {
    "deleted": true,
    "course": {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "code": "CS 101",
      "name": "Intro to Computer Science"
    },
    "message": "Deleted course CS 101 (Intro to Computer Science) and all associated tasks and study sessions."
  }
  ```

#### Safety Considerations & Claude Interaction
- **Destructive Deletion**: Deleting a course cascades to permanently remove all tasks and logged study sessions attached to that course.
- **Permission & Destructive Hint**: The tool specifies `{ destructiveHint: true }`. In Claude's connector permissions UI, users can mark this tool as **Needs approval** so Claude will never delete without explicit approval.
- **Semester & Ownership Isolation**: Operations are strictly authenticated against the user token and locked to the user's `active_semester_id`.
- **Interaction Pattern**:
  1. Claude first executes `find_course` to verify the exact course and retrieve its UUID.
  2. If the user asks to remove a course, Claude must confirm with the user before calling `delete_course`, explicitly mentioning the course code, name, and that tasks and study sessions will also be erased.
  3. Upon confirmation, Claude calls `delete_course` with the course UUID.

### 10. `get_tasks` filters
`get_tasks` takes, beside `course_id` and `include_completed`:
- `due_after` / `due_before` (`YYYY-MM-DD`, both inclusive). Either one leaves out tasks with no due date.
- `priority` (`"high" | "normal"`) and `kind` (`"exam" | "reading" | "task"`).
- `limit` (1-100, default 100).

Filtering happens after the same `select('*')` read the app makes, so a
project without the `kind` column still answers. When a filter is set,
`meta.filters` echoes it; when `limit` cut the list, `meta.matching` says how
many matched before it.

### 11. `record_grade`
- **Title**: Record marks in Akada
- **Description**: Write marks the student got back into one course's **accepted** grading scheme, e.g. 17/20 on Quiz 3.
- **Annotations**: `destructiveHint: false`, `idempotentHint: true`
- **Parameters**:
  - `course_id` (`string`, UUID).
  - `grades` (array, 1-40): `component` (the label from `get_grading_scheme`), `score` (a number, or `null` to clear a mark), optional `out_of` (defaults to what the component holds).
- **Output**: `recorded`, the course's `components`, and a `standing` block: `percent_so_far` (out of what is marked, as the course card reads it), `secured_percent` (out of the whole course), `marked_weight`, `unmarked_weight`, `total_weight`, `basis`, and the labels a drop rule is currently leaving out.

A label is matched exactly first, then by containment ("final" finds "Final
exam"), and one that matches more than one component is refused rather than
guessed. Every mark is checked through `cleanScore` before anything is written,
so one bad mark writes none. A course with only a pending proposal is refused
until the student accepts it.

### 12. `get_grade_projection`
- **Title**: Work out what an Akada course still needs
- **Annotations**: `readOnlyHint: true`
- **Parameters**:
  - `course_id` (`string`, UUID).
  - `target_percent` (0-100, optional): the course mark being aimed for.
  - `solve_for` (optional): one unmarked component, e.g. `"Final"`. Needs `target_percent`.
  - `assume_percent` (0-100, optional): with `solve_for`, how the other unmarked pieces are assumed to go. Defaults to the exact average so far.
- **Output**: `schema_version` (`akada.grade_projection.v1`), `standing` (as above), `floor_percent` (nothing else scores), `ceiling_percent` (everything left comes back full), `outstanding` components, `target` (`needed_average_percent`, `status`), `solve_for` (`needed_percent`, `needed_score` out of the component's `out_of`, `status`), and a `message`.

`status` is `secured`, `reachable` or `out_of_reach`. Needed values are not
clamped: 112% is how "cannot be reached" is said. The maths is
`gradeProjection` in `lib/derive.ts`, built on the same `gradeStanding` the
course card uses, drop rules included. Akada never assigns letters, so the tool
description tells the model to take an A-'s cutoff from the course outline or
ask for it.

### 13. `delete_tasks`
- **Title**: Delete Akada tasks
- **Annotations**: `destructiveHint: true`
- **Parameters**: `task_ids` (array of 1-20 UUIDs from `get_tasks`).
- **Output**: `deleted` (each task's `id`, `title`, `due_date`, `completed`, `course`) and a `message`.

All or nothing, through the same ownership check `complete_tasks` uses. For
duplicates and mistakes; finished work is ticked, never deleted, because a
ticked task is what feeds the week in Stats. Sessions logged against a deleted
task stay logged (`sessions.task_id` is `on delete set null`).

### 14. `delete_study_session`
- **Title**: Delete an Akada study session
- **Annotations**: `destructiveHint: true`
- **Parameters**: `session_id` (UUID, from `get_overview`'s `recent_sessions` or from `log_study_session`).
- **Output**: `deleted` (`id`, `date`, `duration_minutes`, `note`, `course`) and a `message`.

Ownership is checked the way `update_study_session` checks it. The sitting's
focus and break segments go with it (`session_segments` cascades).

### 15. `get_reading_backlog`
- **Title**: Read the Akada reading backlog
- **Annotations**: `readOnlyHint: true`
- **Parameters**:
  - `course_id` (UUID, optional).
  - `by_date` (`YYYY-MM-DD`, optional): only readings due on or before it. Overdue readings always count; undated ones are reported separately under `undated`.
- **Output**: `schema_version` (`akada.reading_backlog.v1`), `pace` (`pages_per_hour`, `measured`, `based_on`), `totals` and per-`courses` tallies (`readings`, `pages`, `hours`, `without_pages`), `days_left` and `hours_per_day` with a `by_date`, up to 50 `readings`, and a `message`.

The pace is `readingRateDetail` in `lib/derive.ts`, the same pages-an-hour the
Today screen uses: finished reading pages over hours logged against readings,
and a plain 20 until there are at least 20 pages over an hour. `measured` is
false then, and the message says it is a default rather than the student's
pace. `days_left` counts today.

---

## Roadmap: High-Value MCP Tools

The following specifications define the next set of MCP tools planned for Akada:

### 1. `list_tasks` (shipped as filters on `get_tasks`)
- **Description**: Query tasks in the active semester, with flexible filters for course, completion status, and due dates. Shipped as the `due_after`, `due_before`, `priority`, `kind` and `limit` inputs on `get_tasks` (see above). Kept here for the original specification.
- **Annotations**: `readOnlyHint: true`
- **Input Schema**:
  ```typescript
  z.object({
    course_id: z.string().uuid().optional().describe('Filter tasks by specific course ID.'),
    completed: z.boolean().optional().describe('Filter by status: false for unfinished, true for completed. Omit for all.'),
    due_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional().describe('Filter tasks due on or before date.'),
    due_after: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional().describe('Filter tasks due on or after date.'),
    priority: z.enum(['high', 'normal']).optional().describe('Filter by priority level.'),
    limit: z.number().int().min(1).max(50).default(20).optional().describe('Maximum number of tasks to return.'),
  })
  ```
- **Result Schema**:
  ```json
  {
    "tasks": [
      {
        "id": "uuid",
        "course_id": "uuid",
        "course_code": "CS 101",
        "title": "Problem Set 1",
        "due_date": "2026-09-15",
        "priority": "high",
        "completed": false,
        "completed_at": null
      }
    ],
    "count": 1
  }
  ```

### 2. `mark_task_completed` (shipped as `complete_tasks`)
- **Description**: Update the completion status of a task in the active semester. Shipped, in a form that takes a set of ids rather than one, and with `update_tasks` alongside it for every other field. Kept here for the original specification.
- **Annotations**: `destructiveHint: false`, `idempotentHint: true`
- **Input Schema**:
  ```typescript
  z.object({
    task_id: z.string().uuid().describe('UUID of the task to mark.'),
    completed: z.boolean().default(true).describe('True to mark completed, false to reopen.'),
  })
  ```
- **Result Schema**:
  ```json
  {
    "task": {
      "id": "uuid",
      "title": "Problem Set 1",
      "completed": true,
      "completed_at": "2026-09-09T00:30:00.000Z",
      "course_id": "uuid"
    }
  }
  ```

### 3. `log_study_session` (shipped)
- **Description**: Log study time for a course and optional task, updating course goal progress. Shipped as specified, with the added rule that `task_id` must belong to `course_id`. Kept here for the original specification.
- **Annotations**: `destructiveHint: false`, `idempotentHint: false`
- **Input Schema**:
  ```typescript
  z.object({
    course_id: z.string().uuid().describe('Target course UUID.'),
    duration_minutes: z.number().int().min(1).max(1440).describe('Duration studied in minutes.'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional().describe('Session date. Defaults to today.'),
    task_id: z.string().uuid().optional().describe('Optional task UUID linked to this study session.'),
    note: z.string().max(500).optional().describe('Optional session notes.'),
  })
  ```
- **Result Schema**:
  ```json
  {
    "session": {
      "id": "uuid",
      "course_id": "uuid",
      "course_code": "CS 101",
      "task_id": "uuid",
      "date": "2026-09-09",
      "duration_minutes": 60,
      "note": "Reviewed Chapter 3 proofs"
    }
  }
  ```

### 4. `get_weekly_stats` (shipped)
- **Description**: Retrieve weekly study performance, goal attainment, and the current weekly run for the active semester. Shipped. Kept here for the original specification.
- **Annotations**: `readOnlyHint: true`
- **Input Schema**:
  ```typescript
  z.object({
    week_offset: z.number().int().min(-12).max(0).default(0).optional().describe('0 for current week, -1 for previous week, etc.'),
    course_id: z.string().uuid().optional().describe('Optional course UUID filter.'),
  })
  ```
- **Result Schema**:
  ```json
  {
    "semester": {
      "id": "uuid",
      "label": "Fall '26"
    },
    "period": {
      "start_date": "2026-09-07",
      "end_date": "2026-09-13"
    },
    "totals": {
      "total_study_hours": 12.5,
      "active_days_count": 4,
      "weekly_run": 5
    },
    "courses": [
      {
        "course_id": "uuid",
        "course_code": "CS 101",
        "studied_hours": 6.0,
        "weekly_goal_hours": 6.0,
        "goal_reached": true
      }
    ]
  }
  ```

