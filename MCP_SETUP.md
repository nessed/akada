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
- `get_tasks`: Read the active semester's tasks, optionally narrowed to one course.
- `get_overview`: Read a snapshot of courses, open-task counts, and recent study sessions.
- `create_tasks`: Bulk-insert tasks into an active course, with notes and subtasks.
- `update_tasks`: Change tasks that already exist, including their notes and subtasks.
- `complete_tasks`: Tick tasks off, or put them back on the list.
- `log_study_session`: Record study time against a course, with an optional task and note.
- `get_weekly_stats`: Read one week's hours against goal, break time, tasks closed, and the weekly run.
- `get_focus_pattern`: Read how the sittings themselves were shaped: block lengths, breaks against the lengths they were set to, and when in the day the work happens.
- `get_grading_scheme`: Read how a course is marked, accepted and proposed.
- `set_grading_scheme`: Propose how a course is marked, read off its outline.
- `delete_course`: Permanently delete a course and its associated tasks and sessions.

In Claude's connector permissions, you can set `create_tasks`, `update_tasks`, `complete_tasks`, `log_study_session`, `set_grading_scheme` and `delete_course` to **Needs approval** if you want to review each change before it is executed.

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
- **Output**: Structured list of created tasks (`id`, `title`, `due_date`, `priority`, `description`, `subtasks`) and count of skipped duplicates.

`description` and `subtasks` are columns added by a later `supabase/schema.sql`,
so they are only named in the insert when a request actually uses them. A
project that has not re-run the schema keeps creating plain tasks; a request
that asks for notes or pieces against such a project fails with the reason.

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
- **Output**: Each changed task with its `id`, `title`, `due_date`, `priority`, `description`, `subtasks`, `completed`, and `course`.

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
- **Output**: The session's `id`, `date`, `duration_minutes`, `duration_seconds`, `break_minutes`, `note`, `task_id`, and `course`.

`semester_id` is filled by the `sessions_set_semester_id` trigger in
`supabase/schema.sql`, exactly as the app's own `addSession` relies on.

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
- **Output**: `window`, `totals` (sittings, focus hours, break hours, break share), `blocks` (count, average, median, longest, how many had a set length, how many ran to the end, completion rate), `breaks` (the same plus `ran_over`, `overrun_rate` and `avg_overrun_minutes`), `rhythm` (focus before the first break, blocks per sitting, focus-to-break ratio), `by_hour`, and `by_course`.

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

---

## Roadmap: High-Value MCP Tools

The following specifications define the next set of MCP tools planned for Akada:

### 1. `list_tasks` (partly covered by `get_tasks`)
- **Description**: Query tasks in the active semester, with flexible filters for course, completion status, and due dates. `get_tasks` covers the course and completion filters; the date, priority and limit filters are still unbuilt.
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

