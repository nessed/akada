# What the revert took out, and how to put it back

On 2026-09-19 `main` was reverted to `37d7304`, the last commit before the
editorial redesign landed. The redesign was unwanted and the app went back to
the notebook-paper design that preceded it.

The revert was a whole-tree revert, so it did not only undo the look. Sixteen
commits of function went with it. This file is the inventory and the recipe.

```
9e121b2  Revert the app to the pre-overhaul design   <- main is here
7814ad4  Put the paper stack and the centred sheet back
  ...    the sixteen commits below
8f99c03  Rebuild the foundation and Today on the redesign
37d7304  Let a finger keep drawing past the first mark   <- the tree main now has
```

Everything reverted is still in the repository. Nothing was force-pushed and no
history was rewritten.

- `before-full-revert` — branch pinned at `7814ad4`, the full pre-revert state.
- `git revert 9e121b2` — puts the entire pre-revert tree back in one commit,
  design included. Use this only if the design is wanted back too.
- `git show 7814ad4:<path>` — read any single file as it was.
- `git checkout 7814ad4 -- <path>` — take a single file back.

## The important thing about the database

**The revert changed repository code only. The live Supabase database still has
every column the reverted work added.** `supabase/schema.sql` in the repo no
longer describes them, but the project itself is unchanged:

| Table | Column | Type |
| --- | --- | --- |
| `courses` | `assessments` | `jsonb not null default '[]'` |
| `tasks` | `kind` | `text not null default 'task'`, check in (`task`,`reading`,`exam`) |
| `tasks` | `weight` | `numeric`, check 0–100 or null |
| `tasks` | `pages` | `integer`, check 0–10000 or null |

All four are additive with defaults, which is why the reverted code reads every
row without noticing them. It also means **no migration is needed to restore any
of this**. Bringing a feature back is a code-only change. If the schema file is
ever re-run from the reverted version it will simply not re-add these columns;
copy the block back from `git show 7814ad4:supabase/schema.sql` first.

Data written into those columns before the revert is still there and is not
being read by anything right now.

## What was lost

Ordered by how expensive it is to live without.

### 1. The MCP connector dropped from 9 tools to 5

`app/api/mcp/route.ts`. Introduced by `36ae744` and `85d8ece`.

Still working: `find_course`, `create_tasks`, `delete_course`, `get_tasks`,
`get_overview`.

Gone:

- `update_tasks` — edit a task's title, due date, priority, description
- `complete_tasks` — mark tasks done
- `log_study_session` — write a sitting from a chat
- `get_weekly_stats` — read the week back

Also gone: `create_tasks` no longer accepts `subtasks` (plain strings, ids
generated server-side) or `description`.

**To restore:** `git checkout 7814ad4 -- app/api/mcp/route.ts MCP_SETUP.md`.
The route is self-contained and does not depend on any reverted UI. This is the
single highest value restore in the list and should be first.

After deploying it, the connector must be disconnected and reconnected in
Settings, then a new chat started. A connector's tool list is fetched once at
connect time, so the new tools will not appear otherwise. This is not a bug in
the route; do not re-diagnose it.

### 2. CI typecheck and lint gate

`.github/workflows/ci.yml`. Introduced by `060c8fb`.

`main` currently has no gate. A push that fails `tsc` or `eslint` will deploy.

**To restore:** `git checkout 7814ad4 -- .github/workflows/ci.yml` and, if the
`contrast` script is wanted with it,
`git checkout 7814ad4 -- scripts/check-contrast.mjs` plus the `contrast` entry
in `package.json` scripts.

Independent of everything else. Restore it second, so whatever comes after is
gated.

### 3. Timer correctness fixes

`lib/timer-context.tsx`, `lib/session-safety.ts`, `app/timer/page.tsx`.
Introduced by `060c8fb` and `1f28ed9`.

Gone with the revert:

- The dead-end guards on `/timer`. A failed courses read, a deleted course id,
  or an account with no courses now leaves the screen spinning on
  "Loading your timer" with no way out but the browser's back button.
- `PendingSessionLogSheet` mounted on the timer route itself. `/timer` does not
  use `PageShell`, so pressing Stop waits on a sheet that is never mounted.

These are behaviour fixes, not design, and they are worth taking back even if
nothing else is.

**To restore:** the timer split (`SitDown` / `LockedIn`) came in the same era
and is a design change, so do not take `app/timer/page.tsx` wholesale. Read
`git show 1f28ed9` and `git show 060c8fb` and port the guards onto the current
single-screen timer.

### 4. Semesters as a first-class thing, and the term archive

`lib/data/*`, settings panels. The data layer at `37d7304` already has
semesters, `activeSemesterId` and the self-healing "create one if none exists"
path, so the model survived the revert. What was lost is the UI around it: the
archive list, switching the active semester, and reading a past term back.

**To restore:** `components/settings/*` from `7814ad4`, which is where the
semester panels live. They were built for the settings *page* that the revert
removed, so they need re-hosting in the current `SettingsSheet`.

### 5. Course grading and weights

`components/course/GradeStanding.tsx`, `components/term/GradeWeighting.tsx`,
`lib/derive.ts`. Introduced by `27eb522` and `02e8a5b`.

Enter how a course is marked, and the app says how much of the grade is still
unmarked. Reads `courses.assessments` and `tasks.weight`, both of which are
still in the database.

**To restore:** `git checkout 7814ad4 -- components/course/GradeStanding.tsx components/term/GradeWeighting.tsx lib/derive.ts`, then re-add the `assessments`
and `weight` fields to the types in `lib/data/types.ts` and the read/write paths
in `lib/data/supabase-adapter.ts` and `lib/data/local-adapter.ts`. Take those
adapter hunks from `7814ad4` rather than rewriting them.

### 6. Task kinds: readings and exams

`tasks.kind`, `tasks.pages`. Introduced by `02e8a5b`.

A reading carries a page count and feeds a backlog view; an exam is circled on
the month grid and counted down to. Same restore shape as grading: columns are
live, types and adapters need the fields back.

Related components, all at `7814ad4`: `components/list/ReadingBacklog.tsx`,
`components/list/WatchList.tsx`.

### 7. Task subtasks and the reading view

`components/EditTaskSheet.tsx` and the task detail view. `tasks.subtasks` has
existed since before the revert, so the column and any data in it are intact;
only the UI for editing pieces and notes is gone.

**To restore:** `git checkout 7814ad4 -- components/EditTaskSheet.tsx` and
re-host it. Pairs with restoring `update_tasks` and `create_tasks` subtask
support in the MCP route, since those write the same field.

### 8. Screens that no longer exist

These were built after the revert point and have no equivalent in the current
tree. They are design work as much as function, so they are listed last: if the
new design replaces them with something better, they do not need porting.

| Screen | Path at `7814ad4` | Introduced |
| --- | --- | --- |
| Term / month calendar | `app/term/*`, `components/term/MonthGrid.tsx` | `02e8a5b`, `13b8773` |
| Courses index | `app/courses/page.tsx`, `components/course/CourseRow.tsx` | `90702ab` |
| Settings as a page | `app/settings/*`, `components/settings/*` | `423bac1` |
| Week review | `lib/review.ts`, `lib/review-prose.ts`, `components/review/TermSoFar.tsx` | `02e8a5b`, `279f2ab` |
| Timer split into setup and desk | `components/timer/SitDown.tsx`, `LockedIn.tsx`, `lib/use-ambient-noise.ts` | `27eb522` |

`lib/review-prose.ts` generates the narrated weekly summary and is the source of
the editorial voice the redesign was rejected for. Do not restore it as-is.

## Suggested order

1. `app/api/mcp/route.ts` and `MCP_SETUP.md`. No UI coupling, biggest daily loss.
2. `.github/workflows/ci.yml`. Gate everything after it.
3. Timer guards, ported rather than copied.
4. Types and adapter fields for `assessments`, `weight`, `kind`, `pages`. No UI
   yet, just stop dropping the columns on read and write.
5. Grading, readings and exams UI, in whatever form the new design gives them.
6. The screens in section 8, only if the redesign does not replace them.

Steps 1 to 4 are mechanical and safe to do while a redesign is in flight,
because none of them touch how anything looks.

## Known issue the revert did not cause

The reverted build reads data the same way the newer one did: every read calls
`activeSemesterId(uid)`, which is its own `user_settings` round trip, and every
read also calls `auth.getSession()`, which serializes them behind Supabase's
auth lock. Measured on the newer build: six identical `user_settings` queries
firing at once, then `courses`, `tasks`, `sessions` and `semesters` queueing one
behind the other, about 6.9 seconds to first paint.

Memoizing the user id and the active semester id on the adapter fixes it. It is
a backend change with no UI surface and can be done at any time.
