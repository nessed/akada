# What the revert took out, and what is back

On 2026-09-19 `main` was reverted to `37d7304`, the last commit before the
editorial redesign landed. The revert was a whole-tree revert, so it did not
only undo the look: sixteen commits of function went with it.

This file was the inventory. It is now the record of working through it. Every
numbered section below says what happened, so nothing here needs re-diagnosing.

```
9e121b2  Revert the app to the pre-overhaul design
7814ad4  Put the paper stack and the centred sheet back   <- the full pre-revert tree
  ...    the sixteen commits
8f99c03  Rebuild the foundation and Today on the redesign
37d7304  Let a finger keep drawing past the first mark    <- what the revert left
```

Everything reverted is still in the repository. Nothing was force-pushed and no
history was rewritten.

- `before-full-revert` — branch pinned at `7814ad4`, the full pre-revert state.
- `git show 7814ad4:<path>` — read any single file as it was.
- `git checkout 7814ad4 -- <path>` — take a single file back.

## The database

**The revert changed repository code only. The live Supabase database kept
every column the reverted work added.**

| Table | Column | Type |
| --- | --- | --- |
| `courses` | `assessments` | `jsonb not null default '[]'` |
| `tasks` | `kind` | `text not null default 'task'`, check in (`task`,`reading`,`exam`) |
| `tasks` | `weight` | `numeric`, check 0–100 or null |
| `tasks` | `pages` | `integer`, check 0–10000 or null |

All four are additive with defaults, so no migration was needed to start
reading them again and none is needed now. They are described in
`supabase/schema.sql` again, and the adapters read and write all four.

## The inventory

### 1. The MCP connector dropped from 9 tools to 5 — **restored** (`27d9946`)

`update_tasks`, `complete_tasks`, `log_study_session` and `get_weekly_stats`
are back, along with `subtasks` and `description` on `create_tasks`, from
`7814ad4` unchanged. `SESSION_NOTE_MAX` is exported from
`lib/planner-safety.ts` because the route imports it.

**Still to do after deploying:** disconnect and reconnect the connector in
Settings, then start a new chat. A connector's tool list is fetched once at
connect time, so the four new tools will not appear otherwise. This is not a
bug in the route; do not re-diagnose it.

**Not done:** the connector still cannot set `kind`, `weight` or `pages` on a
task. Neither could the pre-revert route, so nothing was lost — but it is the
obvious next thing, since a syllabus import is exactly where a reading with a
page count and an exam with a weight would come from.

### 2. CI typecheck and lint gate — **was never lost**

`.github/workflows/ci.yml` is on `main` and `git log` has it last touched by
`060c8fb`. The revert did not take it. The earlier claim here was wrong.

### 3. Timer correctness fixes — **done during the redesign**

The dead-end guards and the mounted `PendingSessionLogSheet` were ported onto
the rebuilt timer rather than copied from `7814ad4`, since that file's
`SitDown` / `LockedIn` split is a design the redesign replaced. See
`app/timer/page.tsx`.

### 4. Semesters and the term archive — **nothing was lost**

The data layer survived the revert, and so did the UI: `SemesterManager` has
the archive list and reads a past term back through `getCoursesForSemester` /
`getSessionsForSemester`, mounted in both the settings page and the settings
sheet. There is no `setActiveSemester` on the provider — and there was none at
`7814ad4` either, so re-activating a finished term is a feature that has never
existed, not one the revert took.

### 5. Course grading and weights — **restored, reshaped** (`926ecd0`)

`lib/derive.ts` is back, trimmed to what is actually consumed. Reading and
editing are one panel on the course page (`components/course/GradeStanding.tsx`)
rather than a read on the course and an editor three screens away in settings.
The term-wide view is `components/term/GradeWeighting.tsx`, on Stats.

### 6. Task kinds: readings and exams — **restored, reshaped** (`926ecd0`)

Kind, weight and pages are edited in the task sheet on `/tasks`, marked in the
margin of a task row, and read on Today by `ComingPanel` in
`components/today/TodayPanels.tsx` — weighted work counted down, and the
reading backlog in pages and in hours at the measured rate.

`ReadingBacklog.tsx` and `WatchList.tsx` from `7814ad4` were not taken back;
the panel covers both in one place.

### 7. Task subtasks and the reading view — **present**

The redesign's `/tasks` already carries the reading view, the notes and
subtask editing. `components/EditTaskSheet.tsx` was not restored because the
page it would be hosted in no longer exists.

### 8. Screens that no longer exist

| Screen | Status |
| --- | --- |
| Courses index | Replaced — `app/courses/page.tsx` |
| Settings as a page | Replaced — `app/settings/*` |
| Timer split into setup and desk | Replaced — the block/open timer, with `lib/use-ambient-noise.ts` |
| Term / month calendar | **Not replaced.** `app/term/*`, `components/term/MonthGrid.tsx` at `7814ad4` |
| Week review | **Not restored, deliberately.** `lib/review-prose.ts` generates the narrated weekly summary and is the source of the editorial voice the redesign was rejected for. Do not restore it as-is. |

The month grid is the one genuine gap. Exams now count down on Today, which is
most of what it was for, but nothing draws the term as a month.

### The read path — **fixed** (`926ecd0`)

Every read used to call `auth.getSession()` and then `activeSemesterId(uid)`,
its own `user_settings` round trip. A dashboard opens six reads at once, so
that was six identical semester queries plus six trips through Supabase's auth
lock, which serializes them: about 6.9 seconds to first paint, measured.

Both are memoized on the adapter, as promises rather than values, so callers in
the same tick share one request instead of racing. A rejection is never cached,
a token refresh keeps the cache, and any other auth event throws it away —
a user id that outlived its session would read one account's rows under
another's.
