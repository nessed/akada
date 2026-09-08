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
- `create_tasks`: Bulk-insert tasks into an active course.
- `delete_course`: Permanently delete a course and its associated tasks and sessions.

In Claude's connector permissions, you can set `create_tasks` and `delete_course` to **Needs approval** if you want to review each change before it is executed.

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
- **Output**: Structured list of created tasks (`id`, `title`, `due_date`, `priority`) and count of skipped duplicates.

### 3. `delete_course`
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

### 1. `list_tasks`
- **Description**: Query tasks in the active semester, with flexible filters for course, completion status, and due dates.
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

### 2. `mark_task_completed`
- **Description**: Update the completion status of a task in the active semester.
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

### 3. `log_study_session`
- **Description**: Log study time for a course and optional task, updating course goal progress.
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

### 4. `get_weekly_stats`
- **Description**: Retrieve weekly study performance, goal attainment, and current streak for the active semester.
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
      "current_streak_days": 5
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

