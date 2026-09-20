# MCP feature research

Research for ClickUp task [Discover possible other features for MCP](https://app.clickup.com/t/86eyv5qpz).
Written 2026-09-16. Research and proposal only, no app code was changed.

Sources read: `app/api/mcp/route.ts`, `app/api/mcp/_shared.ts`, `app/api/mcp/authorize/route.ts`,
`app/api/mcp/token/route.ts`, `app/api/mcp/register/route.ts`, `app/.well-known/**`,
`lib/mcp-auth.ts`, `lib/data/types.ts`, `lib/data/data-provider.ts`, `lib/data/supabase-adapter.ts`,
`lib/planner-safety.ts`, `lib/session-safety.ts`, `lib/utils.ts`, `lib/preferences.ts`,
`lib/timer-context.tsx`, `lib/catalog/*`, `supabase/schema.sql`, `MCP_SETUP.md`, `README.md`,
`LMS_INTEGRATION_ASSESSMENT.md`, `LAUNCH_CHECKLIST.md`.

---

## Summary

Akada's MCP server today is **five tools, two of which `MCP_SETUP.md` does not document at all**, and it
is lopsided: Claude can *read* the whole task model including `tasks.description` and `tasks.subtasks`,
but it can only *write* a bare `(title, due_date, priority)` triple, and the only other write it has is
a hard delete of a whole course. A student can ask Claude to build their week from a syllabus, and then
cannot ask Claude to tick anything off, move a deadline, log the two hours they just studied, or tell
them how they are tracking against `courses.weekly_goal_hours`.

The database already carries everything needed for a much richer surface without a single migration:
`sessions` (with `duration_seconds`, `task_id`, `note`), `tasks.completed` / `completed_at` /
`description` / `subtasks`, `courses.weekly_goal_hours` / `credits` / `instructor` / `meeting_time`,
`semesters`, and `user_settings.daily_goal_hours` / `active_semester_id`. Roughly **11 of the 16
proposals below need no schema change at all**. The ones that do are the LMS-facing ones that
`LMS_INTEGRATION_ASSESSMENT.md` already specced (`external_source` / `external_id` / `due_at`, an
`assessments` table) plus server-side timer state.

The three highest-leverage things to do, in order:

1. **Close the write gap on tasks and sessions.** `complete_task`, `update_task`, `log_study_session`.
   All small, all pure `lib/data/supabase-adapter.ts` logic already written and proven in the app.
2. **Make the reads safe and useful.** `get_tasks` currently silently truncates at 100 rows with no
   `has_more`, and returns full `description` bodies (up to 5,000 chars each) for every task. Add
   filters, projection, and a real pagination cursor before anyone with a full semester connects.
3. **Ship `get_study_stats`.** It is the one thing Claude can compute well and the app cannot ask
   about in prose: "am I on track this week", using `sessions` + `courses.weekly_goal_hours` +
   `studyStreakDays()` logic that already exists in `lib/utils.ts`.

There is also one thing to fix that is not a feature: **the consent screen in
`app/api/mcp/authorize/route.ts` tells the student "It cannot delete courses, tasks, or study history"
while `delete_course` exists and cascades exactly that.** See [Problems](#problems-with-the-current-mcp-surface).

---

## What exists today

### Tools registered in `app/api/mcp/route.ts`

| Tool | Reads | Writes | Notes |
| --- | --- | --- | --- |
| `find_course` | `user_settings.active_semester_id`, `courses` | — | Substring match over `code + name`, caps at 8 results. Defaults missing `credits` to `4`. |
| `get_tasks` | `courses`, `tasks` (`select('*')`) | — | Active semester only. Optional `course_id`, `include_completed`. Sorted by due date, hard-sliced to 100. |
| `get_overview` | `courses`, `tasks`, `sessions` | — | No inputs. Open-task counts per course + the 12 most recent sessions. |
| `create_tasks` | `courses`, `tasks` | `tasks` insert (≤20) | Dedupes against unfinished tasks by normalized `title` + `due_date`. |
| `delete_course` | `courses` | deletes `sessions`, `tasks`, `courses` | `destructiveHint: true`. Deletes children manually even though the FK already cascades. |

`MCP_SETUP.md` documents only `find_course`, `create_tasks`, `delete_course`, and still lists
`list_tasks` under "Roadmap" although `get_tasks` shipped. **The doc is stale.**

### Auth model

Custom OAuth 2.1 + PKCE(S256) with dynamic client registration locked to
`https://claude.ai/api/mcp/auth_callback`. Tokens are stateless AES-256-GCM envelopes
(`akm1.<iv>.<ct>.<tag>`) sealed with `AKADA_MCP_TOKEN_SECRET`; an access token (1h) carries the user's
**Supabase access token**, a refresh token (30d) carries the **Supabase refresh token**. The consent
step calls `signInWithPassword` to mint the connector a session of its own so it does not fight the
browser over Supabase's rotating refresh token. Every tool call then runs as the student through RLS,
with no service-role key anywhere — consistent with the README's stated security model.

Declared scopes are `akada.tasks.read` and `akada.tasks.write` (`app/api/mcp/_shared.ts`).

### Data model available to MCP (from `supabase/schema.sql`)

- `courses` — `id, user_id, semester_id, code, name, color, tint, weekly_goal_hours, sort_order, credits, section, instructor, meeting_time, created_at`
- `tasks` — `id, user_id, course_id, semester_id, title, description, subtasks (jsonb), due_date (date), priority ('high'|'normal'), completed, completed_at, created_at`
- `sessions` — `id, user_id, course_id, semester_id, task_id, date (date), duration_seconds (1..64800), note, created_at`
- `semesters` — `id, user_id, label, start_date, end_date, created_at, updated_at`
- `user_settings` — `user_id, onboarding_complete, display_name, daily_goal_hours, avatar_url, active_semester_id, updated_at`
- RPC `delete_own_account()` (SECURITY DEFINER, deletes `auth.uid()` only)

Not in Postgres, and therefore **not reachable by MCP**: the running timer (`lums.activeTimer` in
`localStorage`, `lib/timer-context.tsx`), all appearance/day-boundary preferences
(`akada.preferences.v1`, `lib/preferences.ts`), and the Fall 2026 course catalog (a static TS module,
`lib/catalog/fall-2026.ts`).

---

## Prioritized proposals

Effort: **S** ≈ under a day inside `route.ts`, **M** ≈ a day or two plus some shared helper,
**L** ≈ multi-day, usually with a migration and a UI surface alongside.

| # | Tool | Purpose | R/W | Migration | Effort |
| --- | --- | --- | --- | --- | --- |
| P0-1 | `complete_task` | Tick a task off (or reopen it) | W `tasks` | no | S |
| P0-2 | `log_study_session` | Record study time after the fact | W `sessions` | no | S |
| P0-3 | `update_task` | Move a due date, change priority, retitle | W `tasks` | no | S |
| P0-4 | `get_tasks` v2 | Filters, projection, real pagination | R `tasks` | no | S |
| P0-5 | `get_study_stats` | "Am I on track this week?" | R `sessions`,`courses` | no | M |
| P1-6 | `set_task_notes` | Write `description` + `subtasks` Claude can already read | W `tasks` | no | S |
| P1-7 | `create_course` | Add a course from a syllabus in one turn | W `courses` | no | M |
| P1-8 | `update_course` | Retune `weekly_goal_hours`, fill instructor/meeting time | W `courses` | no | S |
| P1-9 | `delete_task` | Remove a task Claude created by mistake | W `tasks` | no | S |
| P1-10 | `list_semesters` | Let Claude name the term it is operating in | R `semesters` | no | S |
| P1-11 | `search_course_catalog` | Resolve "calculus" → `MATH 101`, 3 credits | R (static) | no | S |
| P2-12 | `plan_study_week` | Propose a schedule from goals, deadlines and history | R only | no | M |
| P2-13 | `get_course_detail` | One course, its open work and its recent sessions | R ×3 | no | S |
| P2-14 | `export_academic_data` | One JSON of everything, for portability | R ×5 | no | M |
| P2-15 | `upsert_external_items` | Idempotent LMS/Zambeel deadline ingest | W `tasks` | **yes** | L |
| P2-16 | `create_assessment` / `get_exam_schedule` | Exact-time exams, which `tasks.due_date` cannot hold | W new table | **yes** | L |
| P3-17 | `start_timer` / `stop_timer` | Drive the real timer from chat | W new table | **yes** | L |

---

## Detail

### P0-1 · `complete_task`

**Purpose.** Mark a task complete or reopen it, so "I finished the econ problem set" actually changes Akada.

```ts
inputSchema: z.object({
  task_id: z.string().uuid(),
  completed: z.boolean().default(true),
})
annotations: { destructiveHint: false, idempotentHint: true }
```

**Reads / writes.** Verifies the task's `course_id` resolves to a course in
`user_settings.active_semester_id` (same guard `create_tasks` uses), then
`update tasks set completed = $1, completed_at = $1 ? now() : null`. That is exactly
`SupabaseAdapter.updateTask`'s `updates.completed` branch, which already pairs `completed` with
`completed_at` — MCP must do the same or the Stats journal (`app/stats/page.tsx` groups `task-done`
entries by `completedAt.slice(0,10)`) silently loses the event.

**Why a student uses it.** It is the single most obvious thing to ask a chat assistant that can already
list your tasks, and today the answer is "I can see it but I can't tick it." Also unlocks the natural
pairing: *"I studied 90 minutes on the CS pset and finished it"* → `log_study_session` + `complete_task`.

**Effort: S.** Consider a `task_ids: string[]` (max 20) variant so "mark everything from last week done"
is one call rather than twenty.

---

### P0-2 · `log_study_session`

**Purpose.** Write a `sessions` row for time already spent, the thing every other Akada screen is built
around and that MCP currently cannot touch.

```ts
inputSchema: z.object({
  course_id: z.string().uuid(),
  duration_minutes: z.number().int().min(1).max(1080),  // 18h == MAX_SESSION_SECONDS
  date: z.string().regex(DATE).optional(),               // defaults to today
  task_id: z.string().uuid().optional(),
  note: z.string().max(800).optional(),                  // SESSION_NOTE_MAX
})
annotations: { destructiveHint: false, idempotentHint: false }
```

**Reads / writes.** Insert into `sessions`; `semester_id` is filled by the `sessions_set_semester_id`
trigger, so do not pass it. Three constraints must be honoured on the way in, or Postgres rejects the
row with a bare check-constraint error:

- `sessions_duration_seconds_range` — `0 < duration_seconds <= 64800`. Cap with
  `clampSessionSeconds` / `MAX_SESSION_SECONDS` from `lib/session-safety.ts`.
- `note` — trim to 800 via `cleanSessionNote`.
- `task_id` must belong to the same `course_id`, which nothing in the schema enforces. Check it.

**Date subtlety.** The app's "today" is not the calendar day — `plannerDate()` in `lib/preferences.ts`
shifts by `dayEndingHour` (0–6), and that preference lives in `localStorage`, invisible to the server.
MCP should therefore **require an explicit `date` when the student is describing anything but "today"**,
default to UTC-derived today otherwise, and echo the date it used back in the response so Claude can say
"logged to Tue 15 Sep" and be corrected.

**Why a student uses it.** The timer only captures time spent *at the app*. Real study happens in a
library with a laptop shut. This is the retroactive path, and it feeds every number on Stats, the
heatmap, the streak, and weekly goal progress.

**Effort: S.**

---

### P0-3 · `update_task`

**Purpose.** Edit a task in place — the deadline moved, the professor bumped priority, the title was
wrong.

```ts
inputSchema: z.object({
  task_id: z.string().uuid(),
  title: z.string().trim().min(1).max(140).optional(),     // TASK_TITLE_MAX
  due_date: z.string().regex(DATE).nullable().optional(),  // null clears
  priority: z.enum(['high', 'normal']).optional(),
  course_id: z.string().uuid().optional(),                 // move between courses
}).refine(v => Object.keys(v).length > 1, 'Provide at least one field to change.')
```

**Reads / writes.** `update tasks` scoped by `user_id` and semester-checked `course_id`. Note the
ceiling mismatch worth fixing while here: `create_tasks` accepts `title` up to **160** chars, but
`cleanTaskTitle` in `lib/planner-safety.ts` truncates at **140** on every app read — so a 150-char
MCP-created title renders clipped. Align MCP on 140.

Moving a task across courses must also move `semester_id`; the `tasks_set_semester_id` trigger is
`before insert` only, so an `update` that changes `course_id` leaves a stale `semester_id` behind and the
task disappears from the semester-scoped reads. Either set both columns explicitly or restrict
`course_id` moves to courses in the same semester (simpler, and the only case a student means).

**Why a student uses it.** "The 240 midterm moved to the 24th" is one sentence and currently means
opening the app.

**Effort: S.**

---

### P0-4 · `get_tasks` v2

**Purpose.** Same tool, but filterable, projectable and honestly paginated. This is a fix as much as a
feature — see [Problems](#problems-with-the-current-mcp-surface).

```ts
inputSchema: z.object({
  course_id: z.string().uuid().optional(),
  include_completed: z.boolean().default(false),
  due_before: z.string().regex(DATE).optional(),
  due_after: z.string().regex(DATE).optional(),
  priority: z.enum(['high', 'normal']).optional(),
  overdue_only: z.boolean().default(false),
  include_details: z.boolean().default(false),  // description + subtasks, off by default
  limit: z.number().int().min(1).max(50).default(25),
  cursor: z.string().optional(),                 // opaque "<due_date>|<created_at>|<id>"
})
```

**Response.** Keep `schema_version: 'akada.tasks.v1'`, bump to `v2`, and put real numbers in `meta`:
`{ count, total_matching, has_more, next_cursor, truncated_fields }`. Today `meta.count` reports the
returned count only, so a student with 140 tasks gets 100 with no signal that 40 are missing, and Claude
will confidently say "that's everything".

**Why.** `select('*')` plus `description text not null default ''` (the app writes up to 5,000 chars) plus
`subtasks jsonb` (up to 50 entries × 300 chars) means the current worst case is roughly half a megabyte
of JSON for one call. `include_details: false` should return `title`, `due_date`, `priority`,
`completed`, `course.code` and a `has_description` boolean, and a separate `get_task` fetches one body.

**Effort: S.** Keep the `select('*')` trick and the in-memory sort — the comment in `route.ts` explains
exactly why a named column list breaks against an un-migrated project, and that reasoning still holds.
Filter and page in memory after the fetch, or gate the PostgREST filters behind columns known to exist
(`due_date`, `priority`, `completed` are all in the original `create table`).

---

### P0-5 · `get_study_stats`

**Purpose.** Answer "how am I doing", the question the Stats page answers visually and nothing answers
in prose.

```ts
inputSchema: z.object({
  period: z.enum(['week', 'month', 'semester']).default('week'),
  week_offset: z.number().int().min(-12).max(0).default(0),
  course_id: z.string().uuid().optional(),
})
annotations: { readOnlyHint: true }
```

**Reads.** `sessions` (date-ranged, semester-scoped), `courses.weekly_goal_hours`,
`user_settings.daily_goal_hours`, `semesters.label/start_date/end_date`, plus `tasks` for
open/overdue counts.

**Returns.** Aggregates only, never raw session rows:

```json
{
  "semester": { "label": "Fall 2026", "start_date": "2026-08-24", "end_date": null },
  "period": { "kind": "week", "start_date": "2026-09-14", "end_date": "2026-09-20" },
  "totals": { "study_hours": 12.5, "active_days": 4, "streak_days": 5, "daily_goal_hours": 4 },
  "courses": [
    { "course_id": "…", "code": "ECON 240", "studied_hours": 6.0,
      "weekly_goal_hours": 6.0, "goal_met": true, "last_studied": "2026-09-15",
      "open_tasks": 3, "overdue_tasks": 1 }
  ],
  "neglected_courses": ["POL 3302"]
}
```

**Implementation note.** `lib/utils.ts` already has `startOfWeek` (Monday), `endOfWeek`,
`sessionsThisWeek`, `totalSeconds`, `lastSeenByCourse` and `studyStreakDays`. Those are client modules
but pure functions over plain objects — lift the date/aggregation helpers into something importable from
`app/api/mcp/` rather than reimplementing the streak rule, which has a genuinely fiddly
"today-not-yet-studied doesn't break the streak" branch.

**Why a student uses it.** This is the tool that makes the connector feel like a coach rather than a
form: "You're 4.5 hours into a 6-hour ECON goal with two days left, and you haven't opened POL 3302 in
nine days." It is also the natural input to P2-12.

**Effort: M**, mostly because of the date-window and helper-extraction work.

---

### P1-6 · `set_task_notes`

**Purpose.** Let Claude write the `description` and `subtasks` it can already read. Today the richest
half of the task model is read-only to the connector.

```ts
inputSchema: z.object({
  task_id: z.string().uuid(),
  description: z.string().max(5000).optional(),
  subtasks: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    completed: z.boolean().default(false),
  })).max(50).optional(),
  mode: z.enum(['replace', 'append']).default('replace'),
})
```

**Reads / writes.** `update tasks set description, subtasks`. Mirror `sanitizeSubtasks` from
`lib/data/supabase-adapter.ts` exactly: 50 items, `id` ≤ 80 chars, `title` ≤ 300, and **generate the
`id` server-side** (`crypto.randomUUID()`) so Claude never has to invent one and the app's reading view
stays stable. `description` is capped at 5,000 by `cleanText(..., 5000)` on the way back out, so
enforce it on the way in too.

**Why a student uses it.** "Break the term paper into steps" is the archetypal LLM task, and Akada has a
subtask model sitting there unused by MCP. Pairs directly with `create_tasks`: create the assignment,
then give it a checklist.

**Effort: S.**

---

### P1-7 · `create_course`

**Purpose.** Finish the syllabus workflow. Claude can add tasks to a course, but if the course does not
exist the whole flow stops and the student has to go add it by hand.

```ts
inputSchema: z.object({
  code: z.string().trim().min(1).max(18),   // COURSE_CODE_MAX, uppercased
  name: z.string().trim().min(1).max(90),   // COURSE_NAME_MAX
  credits: z.number().min(0).max(12).optional(),
  section: z.string().max(24).optional(),
  instructor: z.string().max(80).optional(),
  meeting_time: z.string().max(60).optional(),
  weekly_goal_hours: z.number().min(0.5).max(40).optional(),
})
annotations: { destructiveHint: false, idempotentHint: true }
```

**Reads / writes.** Insert into `courses` with `semester_id = active_semester_id`. Three things the
implementation must do that are easy to miss:

- **Colour.** `courses.color` is `not null`. Pick the first unused entry of `PASTEL_PALETTE`
  (`lib/utils.ts`) among the semester's existing courses and set the paired `tint`, the way the app
  does. Do not let Claude choose a hex.
- **`sort_order`.** Replicate `nextCoursePosition`: `max(existing)+1`, falling back to `rows.length`, and
  omit the column entirely if the read fails, exactly as the adapter does for un-migrated projects.
- **Duplicate code.** The unique index `courses_user_id_semester_code_unique` is on
  `(user_id, semester_id, upper(code))`. Catch Postgres `23505` and return the friendly
  "You already have a course with the code X this semester" message from `courseWriteError`, plus the
  existing course's `id` so Claude can just use it.

**Default `weekly_goal_hours`.** The app derives a target from credit hours; default to
`clampWeeklyGoalHours(credits * 1.5)` when credits are known, else the schema default of 6.

**Why a student uses it.** "Here's my four syllabi, set up my semester" becomes one conversation instead
of onboarding plus four syllabus passes.

**Effort: M** — the writing is small, the palette/sort-order/duplicate handling is the work.
**Scope note:** this needs a scope beyond `akada.tasks.write` (see Problems).

---

### P1-8 · `update_course`

**Purpose.** Retune a course: `weekly_goal_hours` is the one the student actually revisits, and
`instructor` / `meeting_time` / `section` / `credits` are frequently blank for manually typed courses.

```ts
inputSchema: z.object({
  course_id: z.string().uuid(),
  name: z.string().max(90).optional(),
  weekly_goal_hours: z.number().min(0.5).max(40).optional(),
  credits: z.number().min(0).max(12).optional(),
  section: z.string().max(24).nullable().optional(),
  instructor: z.string().max(80).nullable().optional(),
  meeting_time: z.string().max(60).nullable().optional(),
})
```

Deliberately **no `code`** — changing it can collide with the unique index and is not a thing a student
asks a chatbot for. Values go through `clampWeeklyGoalHours`, `cleanCredits` (0–12 in half steps),
`cleanSection`, `cleanInstructor`, `cleanMeetingTime`.

**Why a student uses it.** Follows naturally from `get_study_stats`: "I keep missing the 8-hour target on
ECON, drop it to 6" should be one sentence.

**Effort: S.**

---

### P1-9 · `delete_task`

**Purpose.** Undo. `create_tasks` can insert 20 rows in one call; there is currently no way to remove one
through Claude, which makes the bulk-create tool scarier than it needs to be.

```ts
inputSchema: z.object({ task_ids: z.array(z.string().uuid()).min(1).max(20) })
annotations: { destructiveHint: true }
```

Semester-scope every id before deleting, return the deleted titles so Claude can confirm what went, and
prefer this over `delete_course` in the tool description — `delete_course` is a sledgehammer that also
takes `sessions` with it.

**Effort: S.**

---

### P1-10 · `list_semesters`

**Purpose.** Every existing tool silently operates on `user_settings.active_semester_id` and nothing ever
tells Claude what that is. When no semester is set, four of the five tools return
`"No active semester is set in Akada."` with no way for Claude to investigate or help.

```ts
inputSchema: z.object({ include_counts: z.boolean().default(false) })
```

Returns `semesters` rows (`id`, `label`, `start_date`, `end_date`, `is_active`) newest first, optionally
with course/task/session counts. **Read-only.** Deliberately do *not* expose `createSemester` or a
`set_active_semester` over MCP for now: `createSemester` also flips `active_semester_id`, which silently
re-points every other tool, and `deleteSemester` cascades a whole term. Those belong behind the app's
own confirmation UI.

**Why a student uses it.** Grounds Claude's language ("in Fall 2026 you have…") and lets it say
*"Akada has no active semester — open the app and finish onboarding"* instead of a dead-end error.

**Effort: S.**

---

### P1-11 · `search_course_catalog`

**Purpose.** Resolve a vague course name to a real catalog entry with credits and sections, before
`create_course`.

```ts
inputSchema: z.object({ query: z.string().trim().min(2).max(120), limit: z.number().int().max(10).default(5) })
annotations: { readOnlyHint: true }
```

**Reads.** `lib/catalog/search.ts` (`searchCatalog`) over `lib/catalog/fall-2026.ts`. No database access
at all, therefore no RLS concern — but it is institutional data, so keep it behind the same bearer auth
as everything else rather than exposing it unauthenticated.

Returns `CatalogCourse` shape: `code`, `title`, `credits`, `department`, and `sections[]` with
`id`, `component`, `instructor`, `meets`, `room`, `cadence`.

**Why a student uses it.** "Add my Tuesday calculus class" → Claude finds `MATH 101`, 4 credits,
section L1, Mon & Wed 9:30, and creates it fully populated instead of a bare code. Also fixes the
`credits ?? 4` fabrication in `find_course`.

**Effort: S** — the ranked search already exists and is pure. One caveat: `fall-2026.ts` is a large
static module the app deliberately lazy-loads; import it dynamically inside the tool handler so it does
not land in every MCP cold start.

---

### P2-12 · `plan_study_week`

**Purpose.** Read-only planning: given goals, deadlines and actual history, propose where the hours go.

```ts
inputSchema: z.object({
  start_date: z.string().regex(DATE).optional(),       // defaults to this Monday
  available_hours_per_day: z.record(z.string(), z.number()).optional(),
  focus_course_ids: z.array(z.string().uuid()).optional(),
})
annotations: { readOnlyHint: true }
```

**Reads.** `courses.weekly_goal_hours`, open `tasks` with `due_date` in the window (and overdue),
last 4 weeks of `sessions` for per-course actual-vs-goal drift, `user_settings.daily_goal_hours`,
`semesters.end_date`.

**Returns** a structured brief — hours owed per course, deadline pressure ranked by
`daysBetween(today, due_date)` and `priority`, courses not studied in N days from `lastSeenByCourse`,
and the remaining weeks in term — and lets **Claude** do the prose scheduling. Akada should not try to
be a solver; it should hand over a tight, well-shaped fact sheet.

**Why a student uses it.** It is the "Sunday night, what do I do this week" moment, and it is the one
thing an LLM is genuinely better at than a UI.

**Effort: M.** Depends on P0-5's aggregation helpers; build it second.

---

### P2-13 · `get_course_detail`

**Purpose.** Everything about one course in one round trip, so Claude stops doing
`find_course` → `get_tasks(course_id)` → `get_overview` and stitching.

```ts
inputSchema: z.object({
  course_id: z.string().uuid(),
  session_limit: z.number().int().max(20).default(10),
})
```

Returns the `courses` row (code, name, credits, section, instructor, meeting_time,
weekly_goal_hours), open/overdue/completed task counts, the next 5 deadlines, hours this week vs goal,
and the last N `sessions` with `date`, `duration_seconds`, `note`.

**Effort: S.** Also lets `get_overview` shrink: it can then stop shipping 12 full session rows to every
caller and return counts plus a pointer to this tool.

---

### P2-14 · `export_academic_data`

**Purpose.** One JSON of courses, tasks, sessions, semesters and settings.

**Why this is on the list at all:** `LAUNCH_CHECKLIST.md` §7.7 flags that Settings exports **study
sessions only** (`components/SettingsSheet.tsx` builds a sessions CSV) while `/privacy` points at export
as the way to take your data with you — "Export covers less than the privacy policy implies", with an
open checkbox. An MCP tool is a cheap way to close that gap for connected users, and the same shared
serializer can then back a proper in-app export.

```ts
inputSchema: z.object({
  semester_id: z.string().uuid().optional(),   // defaults to active; 'all' for everything
  include: z.array(z.enum(['courses','tasks','sessions','semesters','settings'])).optional(),
})
annotations: { readOnlyHint: true }
```

**Caution.** This is the one tool that can dump an entire academic history into a chat context. Cap it
(e.g. 2,000 sessions), require an explicit `semester_id`, and return counts plus a truncation flag
rather than silently cutting. **Effort: M.**

---

### P2-15 · `upsert_external_items` — needs a migration

**Purpose.** The ingest endpoint for the LMS work in `LMS_INTEGRATION_ASSESSMENT.md`. A Sakai calendar
feed, a Zambeel schedule, or a browser extension hands over normalized deadline records; MCP writes them
idempotently so re-syncing does not duplicate.

```ts
inputSchema: z.object({
  course_id: z.string().uuid(),
  source: z.enum(['sakai', 'zambeel', 'ics', 'manual']),
  items: z.array(z.object({
    external_id: z.string().max(200),
    title: z.string().max(140),
    due_at: z.string().datetime().nullable().optional(),  // exact time
    due_date: z.string().regex(DATE).nullable().optional(),
    source_type: z.enum(['assignment','quiz','calendar_event','syllabus_item']),
    source_url: z.string().url().optional(),
    instructions: z.string().max(5000).optional(),
    source_updated_at: z.string().datetime().optional(),
  })).min(1).max(50),
})
```

**Migration** (matches the assessment's Phase 1 word for word):

```sql
alter table tasks add column if not exists external_source     text;
alter table tasks add column if not exists external_id         text;
alter table tasks add column if not exists source_type         text;
alter table tasks add column if not exists source_url          text;
alter table tasks add column if not exists due_at              timestamptz;
alter table tasks add column if not exists source_updated_at   timestamptz;
alter table tasks add column if not exists last_synced_at      timestamptz;
create unique index if not exists tasks_external_identity_unique
  on tasks (user_id, external_source, external_id)
  where external_source is not null;
```

**Sync rules the assessment already settled** and that this tool must implement: never silently
overwrite a student-edited title or note; surface an instructor's deadline change rather than applying
it invisibly; keep completed Akada tasks even when the LMS record disappears; reconcile on `external_id`,
not on title.

**Why a student uses it.** It is the difference between "AI read my syllabus once" and "my deadlines stay
current". **Effort: L** — the tool is the small half; the sync semantics and the review UI are the rest.

---

### P2-16 · `create_assessment` / `get_exam_schedule` — needs a migration

**Purpose.** Exams. `tasks.due_date` is a `date`, so Akada physically cannot hold "MATH 101 final,
2026-12-14, 14:00–17:00, Room A-1" — and the assessment found Zambeel already publishing exactly that.

**Migration** — the assessment's `assessments` table:

```sql
create table if not exists assessments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid(),
  course_id         uuid not null references courses(id) on delete cascade,
  semester_id       uuid,
  event_type        text not null,            -- 'exam' | 'quiz' | 'presentation' | 'lab'
  title             text not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  location          text,
  maximum_points    numeric,
  external_source   text,
  external_id       text,
  source_url        text,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now()
);
alter table assessments enable row level security;
-- plus the "Users manage own assessments" policy, a user_id_fkey cascade to auth.users,
-- indexes on (user_id, starts_at) and (course_id), and an assessments_set_semester_id
-- trigger reusing akada_set_semester_from_course().
```

An assessment should be able to spawn a linked preparation `task` without losing the authoritative exam
time — that pairing is the point.

**Effort: L**, and it needs UI (a Dashboard "next exam" card at minimum) or the data is invisible outside
Claude. Sequence it after P2-15 since they share the `external_*` convention.

---

### P3-17 · `start_timer` / `stop_timer` — needs a migration, low priority

**Purpose.** "Start a 50-minute session on ECON 240" from chat.

**Why it is P3.** The timer is **not server state**. `lib/timer-context.tsx` keeps the active run in
`localStorage` under `lums.activeTimer`, with pause/resume accumulation, a 4-hour staleness recovery and
an 18-hour ceiling, and only writes a `sessions` row when the student confirms the pending log. MCP
cannot see or touch any of it. Making this work means adding an `active_timers` table (one row per user:
`course_id`, `task_id`, `started_at`, `accumulated_ms`, `is_paused`, `last_seen_at`), teaching the
timer context to sync against it, and resolving conflicts between a phone and a laptop — a substantial
change to the app's most delicate module, which `LAUNCH_CHECKLIST.md` §5 #10 explicitly notes has no
tests behind it.

**Do P0-2 (`log_study_session`) instead.** It covers most of the value at a fraction of the risk.

---

## Problems with the current MCP surface

### 1. The consent screen promises something that is no longer true — **fix first**

`app/api/mcp/authorize/route.ts` renders:

> "Claude will be able to find your current courses and add study tasks to them. **It cannot delete
> courses, tasks, or study history.**"

`delete_course` deletes the course, every one of its `tasks`, and every one of its `sessions`. The
student granted access on a promise the server no longer keeps. Either reword the consent copy or drop
`delete_course` — and if it stays, it should require a typed course code the way the app's `resetAll()`
requires typing `RESET`. `MCP_SETUP.md` is stale in the same direction: it documents 3 tools, omits
`get_tasks` and `get_overview`, and still lists `list_tasks` as roadmap.

### 2. Scopes are declared and never enforced

`MCP_SCOPES = ['akada.tasks.read', 'akada.tasks.write']` is validated at `/authorize`, advertised in
both `.well-known` documents, carried through the token, and parsed into
`authInfo.scopes` in `POST /api/mcp` — and then **no tool ever reads it**. A token issued with only
`akada.tasks.read` can call `create_tasks` and `delete_course`. Worse, `delete_course` touches courses
and sessions, neither of which any declared scope covers.

Recommended before adding any of the write tools above:

- Add `akada.courses.read`, `akada.courses.write`, `akada.sessions.read`, `akada.sessions.write`, and
  `akada.courses.delete` as a scope of its own.
- Gate registration: build the `McpServer` per request and only `registerTool` the tools the token's
  scopes permit, so an under-scoped tool is invisible rather than failing at call time.
- Keep the default grant read-heavy and make destructive scopes opt-in on the consent screen.

### 3. No pagination, and truncation is invisible

`get_tasks` sorts in memory and does `.slice(0, MAX_TASKS_PER_READ /* 100 */)`. `meta.count` is the
length of what was returned, so 140 tasks yields `count: 100` with no `has_more` and no `total`. Claude
has no way to know it is looking at a partial list and will summarise it as complete. `get_overview`
similarly hardcodes `.limit(12)` on sessions with no way to ask for more or fewer. See P0-4.

### 4. Reads are unbounded in width even where they are bounded in length

`get_tasks` uses `select('*')` (correct, for the migration-tolerance reason documented in the file) and
then returns `description` and `subtasks` for every task unconditionally. `description` is capped at
5,000 chars on write; `subtasks` at 50 × 300. 100 tasks is a plausible half-megabyte response into a
chat context. Projection should be opt-in (P0-4).

### 5. `find_course` fails on the most common way a student writes a course code

```ts
function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
```

It collapses whitespace but does not remove it. A course stored as `CS 200` normalizes to `"cs 200"`;
a student asking for `CS200` produces the needle `"cs200"`, and `"cs 200".includes("cs200")` is `false`
— **no match, on an exact course.** `lib/catalog/search.ts` already solved this with `normalizeCode`
(strips spaces and hyphens). `find_course` should try a code-normalized comparison first, then fall back
to the current substring match, and should rank exact-code matches ahead of title substrings the way
`searchCatalog` does.

### 6. `find_course` invents credit hours

`credits: course.credits ?? 4` turns "unknown" into a confident `4`. A manually typed course has
`credits = null` by design (`cleanCredits` returns `null` for anything unparseable), and Claude will
happily reason about a 4-credit course that is actually a 2-credit lab. Return `null` and let Claude
ask, or resolve it via P1-11.

### 7. Token model: no revocation, and a skew window

Tokens are stateless sealed envelopes. There is no token store, no `revocation_endpoint` in the
`.well-known/oauth-authorization-server` document, and no per-connector revocation — the only kill
switches are rotating `AKADA_MCP_TOKEN_SECRET` (which disconnects **every** user) or revoking all
Supabase sessions (which also signs the student out of their browser, as `MCP_SETUP.md` notes).

Separately, the Akada access token's 1-hour lifetime starts when the **code is redeemed**, while the
embedded Supabase JWT was minted up to 5 minutes earlier at consent (`issueAuthorizationCode` has a
5-minute TTL). The last few minutes of an Akada token's life can therefore carry an already-expired
Supabase JWT, and the student sees `toolCrashed`'s generic "not configured or your session has expired".
Either embed the Supabase JWT's own `exp` and set the Akada token's `exp` to `min(the two)`, or refresh
the Supabase session inside `authenticate()` when it is near expiry.

Also worth noting: `POST /api/mcp/authorize` with a wrong password returns a distinct
`access_denied: "That password does not match your Akada account."` It requires an existing signed-in
browser session so it is not an open oracle, but combined with no application-level rate limiting on
`/api/mcp/*` it leans entirely on Supabase's own auth rate limits. `LAUNCH_CHECKLIST.md` §2.4 covers
those — worth confirming they are set before the connector is publicised.

### 8. Error text leaks PostgREST metadata into the model's context

`describe()` concatenates `code | message | hint` into the tool reply. The file documents the tradeoff
and correctly withholds `details` (which carries row values), and being able to diagnose a broken query
in one round instead of three is genuinely worth something. Still, `hint` can name columns and
constraints, and it lands in a third party's chat log. Consider mapping known codes to fixed strings
(`23505` → "already exists", `42703` → "your database needs the latest schema") and logging the rest
server-side only.

### 9. Structured output without a declared `outputSchema`

Every tool returns `structuredContent` via `result()`, but no tool passes `outputSchema` to
`registerTool`. `get_tasks` validates its own shape with `TasksReadResponseSchema` internally and then
throws it away. Per the MCP spec, clients may ignore or reject `structuredContent` when the tool
declares no output schema. Declaring them is nearly free and makes the payloads self-documenting.

### 10. Redundant deletes and per-call round trips

`delete_course` issues three deletes (`sessions`, `tasks`, `courses`) although
`tasks.course_id` and `sessions.course_id` are both `on delete cascade`. It is three round trips where
one would do, and a failure after the sessions delete leaves the course half-gutted with no transaction
to roll back. Separately, **every** tool independently calls `activeSemesterId()`, one extra query per
call; resolve it once per request in `createServer` and memoize it.

### 11. Nothing but tools — no MCP resources, no prompts

The server registers five tools and nothing else. Two cheap additions:

- **Resources** — `akada://semester/active/overview` and `akada://course/{id}` as readable resources
  would let a client pull context without burning a tool call.
- **Prompts** — a `plan-my-week` and an `extract-syllabus` prompt would encode the intended workflow
  (find course → confirm → create tasks, never invent deadlines) that is currently spread across tool
  descriptions and re-derived by the model each time.

### 12. Active semester only, with no way to say so

Every tool hard-scopes to `user_settings.active_semester_id`. A student asking "what did I do in Spring?"
gets an empty list that reads like "nothing", not like "not in scope". P1-10 plus an explicit
`semester_id` parameter on the read tools (defaulting to active, refusing writes to archived terms)
would fix this.

---

## Migration summary

| Proposal | Schema change |
| --- | --- |
| P0-1 … P0-5, P1-6 … P1-11, P2-12 … P2-14 | **None.** Every column already exists in `supabase/schema.sql`. |
| P2-15 `upsert_external_items` | `tasks`: add `external_source`, `external_id`, `source_type`, `source_url`, `due_at`, `source_updated_at`, `last_synced_at` + partial unique index on `(user_id, external_source, external_id)`. |
| P2-16 assessments | New `assessments` table, RLS policy, `user_id` cascade to `auth.users`, semester trigger, indexes. Optionally `courses`: `external_site_id`, `zambeel_class_number`, `enrollment_status`, `last_synced_at`. |
| P3-17 timer | New `active_timers` table plus a rewrite of `lib/timer-context.tsx` to sync against it. |

All migrations should follow the existing file's conventions: `add column if not exists`, `do $$ ... end $$`
guards around constraints, idempotent from top to bottom, and no statement that drops data.

---

## Suggested sequencing

1. **Correctness pass** — fix the consent copy, refresh `MCP_SETUP.md`, fix `find_course`'s code
   normalization and the `credits ?? 4` default, memoize `activeSemesterId`. Half a day, no new surface.
2. **Write parity** — `complete_task`, `update_task`, `log_study_session`, `delete_task`,
   `set_task_notes`. This is the release that makes the connector genuinely useful.
3. **Scopes + pagination** — enforce scopes per tool, `get_tasks` v2. Do this *with* step 2, not after;
   retrofitting scopes onto a live connector means re-consent for every user.
4. **Insight** — `get_study_stats`, `get_course_detail`, `plan_study_week`.
5. **Setup** — `create_course`, `update_course`, `search_course_catalog`, `list_semesters`.
6. **LMS** — the Phase 1 migration from `LMS_INTEGRATION_ASSESSMENT.md`, then `upsert_external_items`
   and assessments.
