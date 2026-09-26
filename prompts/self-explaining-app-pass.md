# Akada: make the app explain itself, and make its claims true

You are working in the Akada repo (Next.js 16 App Router, React 18, TypeScript, Tailwind with
token colours, Supabase with a localStorage adapter for local dev). Read `CLAUDE.md` and
`readmedesign.md` before touching anything. Both are binding. The short version of each is
restated below, but read the originals.

This brief has two halves. **Part A** is a UX pass: the working screens speak a private dialect
and show too much, so a new student gets lost and retreats to the timer. **Part B** is an honesty
pass: the app derives facts about the reader (reading speed, study days, habits, recall) from
inputs that are one tap to fake, and states them as measured. Both were audited in a previous
session; the findings and the decisions are below. Your job is to execute them, not re-decide
them. Where a decision is marked *(judgement)*, you may adjust the mechanics but not the intent.

Work through the build order at the end. One PR per numbered item or per small group as listed.
Ship each one before starting the next.

---

## Hard rules

1. **Do not touch** MCP auth or server code: `app/api/mcp/**`, `lib/mcp-auth.ts`, the MCP consent
   screen, `MCP_SETUP.md`, `/privacy`, `/docs`. Another session owns them. If a change there is
   needed, write it up in the PR body under "Flag for the connector session" and move on. Changes
   to shared `lib/` files (e.g. `lib/derive.ts`) are allowed even if the connector imports them;
   note in the PR when a connector-facing output changes.
2. **Keep the design language.** Paper notebook: cream/night tones, Fraunces serif headings,
   `.eyebrow` (10px uppercase sans) for labels, mono for digits only, handwriting (`font-hand`)
   for marginalia. Tokens live in `lib/preferences.ts`. No mono kicker above a serif heading. No
   generic dashboard widgets, no alarm reds, no coachmarks, no product tour, no "?" tooltips.
   Follow "Explained once" in `readmedesign.md`: a thing explains itself the first time it is
   met, in place, decided from the reader's data (never a dismissed flag), and then goes quiet.
3. **Don't break anything that works.** `npm run typecheck` and `npm run lint` must pass before
   every push. `npm run build` fails locally on purpose (a config guard); do not "fix" it.
4. **Update `readmedesign.md` in the same commit** whenever a change alters anything it
   describes. It is the spec; a spec that lags the code is worse than none.
5. Do not say Claude plans are "free" anywhere. Do not claim anything about data handling that
   the code does not do.
6. Ship: commit, push, open the PR, wait for CI green, merge to `main`. Do not ask whether to
   push or merge. Ask only when a real fork in scope or taste would waste the work.

## Running it locally

```
echo 'NEXT_PUBLIC_USE_LOCAL_DATA=true' > .env.local
npm run dev
```
Delete `.env.local` when done. In local mode everything lives in localStorage under
`lums.semesters`, `lums.activeSemesterId`, `lums.courses`, `lums.tasks`, `lums.sessions`,
`lums.onboardingComplete`, `lums.userSettings`.

Verify visually with Playwright (Chromium is pre-installed; see the environment for the path).
Use `reducedMotion: 'reduce'` in the context or full-page screenshots come out blank below the
fold (the smooth-scroll wrapper transforms the page). Shoot at 390 wide (phone, `isMobile`) and
1280 wide. Seed two states before each screenshot run: **fresh** (courses, no tasks, no
sessions) and **week four** (the seed below). Run it on `/auth` after `localStorage.clear()`,
then navigate.

```js
function seed() {
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const now = new Date().toISOString(); const year = new Date().getFullYear();
  const semester = { id:'demo-term', label:`Fall ${year}`, startDate:`${year}-08-31`, endDate:`${year}-12-18`, createdAt:now, isActive:true };
  const course = (id, code, name, credits, color, tint, goal, position) =>
    ({ id, semesterId:semester.id, code, name, credits, color, tint, weeklyGoalHours:goal, createdAt:now, position });
  const courses = [
    course('econ','ECON 100','Principles of Economics',4,'#A8B89B','#E6EDE0',8,0),
    course('cs','CS 100','Computational Problem Solving',3,'#D4A5A5','#F3E4E4',6,1),
    course('ss','SS 100','Writing and Communication',4,'#B5A8C9','#EAE5F1',8,2),
  ];
  let n = 0;
  const task = (courseId, title, due, extra = {}) => ({ id:`t${++n}`, semesterId:semester.id, courseId, title, description:'',
    subtasks:[], dueDate: due===null?null:day(due), priority:'normal', completed:false, completedAt:null, createdAt:now,
    kind:'task', weight:null, pages:null, ...extra });
  const tasks = [
    task('econ','Read Mankiw Ch 4: Supply and Demand',0,{kind:'reading',pages:28}),
    task('cs','Lab 3: loops and lists',1,{weight:2}),
    task('econ','Problem Set 2',2,{weight:5}),
    task('ss','Essay 1 draft',4,{weight:15}),
    task('econ','Quiz 2',5,{kind:'exam',weight:2}),
    task('cs','Read Ch 5: Lists',3,{kind:'reading',pages:20}),
    task('econ','Midterm',18,{kind:'exam',weight:30}),
    task('econ','Read Mankiw Ch 2',-2,{kind:'reading',pages:25,completed:true,completedAt:new Date(Date.now()-2*864e5).toISOString()}),
  ];
  const sessions = [];
  [['econ',1,3600],['cs',1,2700],['ss',2,3000],['econ',3,4500],['cs',4,2700],['econ',5,3600],['ss',6,2400],['econ',8,3000],['cs',9,3600]]
    .forEach(([courseId, ago, seconds], i) => sessions.push({ id:`s${i}`, semesterId:semester.id, courseId, taskId:null, date:day(-ago),
      durationSeconds:seconds, note:'', createdAt:new Date(Date.now()-ago*864e5).toISOString() }));
  localStorage.clear();
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  put('lums.semesters',[semester]); put('lums.activeSemesterId',semester.id); put('lums.courses',courses);
  put('lums.tasks',tasks); put('lums.sessions',sessions); put('lums.onboardingComplete',true);
  put('lums.userSettings',{displayName:'Sara',dailyGoalHours:4,avatarUrl:''});
}
```
For the fresh state, run the seed then set `lums.tasks` and `lums.sessions` to `[]`.

## Where things live

- Today: `app/dashboard/page.tsx` (1650 lines), panels in `components/today/TodayPanels.tsx`,
  first-run copy near the `New here?` line (~line 826), the phone Settings button
  (`aria-label="Settings"`, ~line 808) which opens `components/SettingsSheet.tsx`.
- Tasks: `app/tasks/page.tsx` (1861 lines). Inline new-task form, the `KINDS` segmented control
  is currently only in the Edit sheet (~line 1315). Sort words: `SORT_WORDS` (~line 47).
  Keyboard shortcut line at the bottom of the list; `?` button opens the shortcuts sheet.
- Courses: `app/courses/page.tsx`, `components/CourseCard.tsx`. Course page:
  `app/courses/[courseId]/page.tsx` (774), `components/course/*` (`GradeStanding.tsx`,
  `WeakPointsPanel.tsx`, `CourseSessionLog.tsx`), `components/recall/CourseRecallPanel.tsx`.
- Recall: `lib/recall/*` (`index.ts` schedule and `looksLikeReading`, `actions.ts`,
  `constants.ts`), UI in `components/recall/RecallDeck.tsx` and `CourseRecallPanel.tsx`.
- Timer: `app/timer/page.tsx` (852), state in `lib/timer-context.tsx` (`STALE_RUNNING_MS`,
  `recoverStaleRunningTimer`, heartbeat that writes `lastSeenAt`), start popover
  `components/StartTimerPopover.tsx`, log sheets `components/SessionLogModal.tsx` and
  `components/PendingSessionLogSheet.tsx`, dock `components/ActiveTimerDock.tsx`.
- Notes: `app/notes/page.tsx` (883), `components/notes/*`, reading pace in
  `lib/notes/reads.ts` and `lib/notes/use-read-through.ts`, word count in `lib/notes/store.ts`.
- Stats: `app/stats/page.tsx` (869), readings in `lib/stats-reading.ts` (`readRecords`,
  `readPersona`, `readMilestone`).
- Record (`/stamps`): `app/stamps/page.tsx`, `lib/progression/*` (`credit.ts` ledger,
  `runs.ts` weeks, `habits.ts`, `observations.ts`, `next-mark.ts`, `log.ts` learning,
  `impressions.ts` ladders, `constants.ts`).
- Derived claims: `lib/derive.ts` (`readingRate`, `readingRateDetail`, `pickUpNext`,
  `countdowns`, `gradeStanding`), `lib/use-up-next.ts`.
- Nav: `components/BottomNav.tsx` (swaps Courses/Record tab on first session; `OWNED_BY`),
  `components/DesktopRail.tsx`, `components/PageShell.tsx`.
- Settings: `app/settings/page.tsx` (tabs Goals / Profile / Term / Courses / Appearance /
  Claude / Data) and the separate `components/SettingsSheet.tsx` reached only from Today on a
  phone.
- First-time explanations: `components/FirstNote.tsx`.
- Docs (link to, don't rewrite): `/guide`, `/claude` (how to connect, what to ask), `/docs`,
  `/privacy`.
- Tests: `lib/**/*.test.ts` run with the project's test runner (see `package.json`). Add tests
  beside any `lib/` logic you change.

---

# Part A: the app explains itself

## The diagnosis (so you make the same call in cases not listed)

The working screens use a private vocabulary the reader meets on day one: tally, page, bind,
impression, struck, run, margin day, Next Mark, recall, clear/hazy/gone, let go, keep, weak
points, block/open, sitting, "written down", "hours kept", "save to journal". Each is a rename of
a normal thing. The fix is not notes and tooltips. It is: the everyday screens (Today, Tasks,
course page, timer) use plain words and show fewer things, and the ledger dialect lives in the
one screen that is meant to be a game (Record, `/stamps`), which keeps its vocabulary untouched.

Vocabulary to enforce app-wide outside Record: **session** (not sitting, not journal), **task**,
**course**, **reading**, **exam**. One word per thing. Do this as a pass in the same PR as A9.

## A1. Today is seven sections deep; cut it to three

Week-four Today on a phone is ~2,650px: Up next → hours → Recall (with a five-sentence
paragraph) → Due today → three full course cards → Coming → This week. The first line under the
title is "2 minutes to the next tally on ECON 100".

- Today = **Up next, the hours, Coming**. Course cards leave Today. In their place one compact
  row: each course's rule and code with its hours this week, tapping goes to `/courses`.
- "Due today" is dropped when its only item is the Up next task (it is, in both seeded states).
  When there are more, it lists the rest only.
- The Next Mark line (`NextMarkLine surface="today"`) moves **below** the hours block, not above
  Up next. It is a reward line, not a to-do.
- Recall on Today becomes one card with no paragraph (see A4).
- Remove the **Untimed** button beside Start. Start opens a popover that already offers
  25/45/60/Untimed. The row is Start · Done · Tomorrow.
- Remove the "New here? How Akada works, in five minutes" link. Nobody leaves the app to read a
  doc on day one; the empty states do this job.
- The phone-only sliders icon (`aria-label="Settings"`) looks like a filter and opens a
  *second* Settings UI (`SettingsSheet.tsx`) that differs from `/settings`. Replace the button
  with an avatar/initial circle in Today's header that links to `/settings`. Delete
  `SettingsSheet.tsx` and everything that only exists to feed it once nothing renders it.
  `/settings` must have a way back on a phone (bottom nav is present there, confirm).

## A2. Bottom nav must not change on the reader

`BottomNav.tsx` shows Courses in the fifth slot until the first session, then swaps it for
Record. Fix the tabs: **Today · Tasks · Courses · Notes · Stats**. Record is reached from the
Stats page (a link already exists there, "The Record →") and from the Next Mark line on Today.
The "something new since you last opened Record" ink dot (`useRecordHasNews`) moves to the Stats
tab. Remove `COURSES_TAB` swapping logic and the `OWNED_BY` hack that lit Today for `/courses`.
Update the "On a phone" section of `readmedesign.md`.

## A3. The New task form hides the whole point

The inline New task form (Tasks page, and Today's "New task") takes title, course, due, high.
Kind (Task / Reading / Exam), pages and weight exist only in Edit. So the reader never learns
Akada knows what a reading is, which is what drives "32 pages, about 1h 36m", recall, and the
grade standing.

- Put the three-way **Task / Reading / Exam** segmented control in the New task form. Picking
  Reading reveals a pages field; Exam (or Task) reveals a weight field (% of grade, optional).
  Same components the Edit sheet already uses; extract them so the two forms cannot drift.
- Pre-select Reading when the title looks like one: use `looksLikeReading` from `lib/recall`
  (already exported, currently unused here). Selecting a kind by hand always wins.
- Same in the "add for Monday" inline adders in the day groups.

## A4. Recall's first contact

Today's recall currently shows a `FirstNote` paragraph, then a card ("Mankiw Ch 2 / the
argument, without looking") with five controls: let go, clear, hazy, gone, ask Claude.

- The card **is** the explanation. Question form, in the serif: "You finished *Mankiw Ch 2* two
  days ago. Without opening it, what was the argument?" (use the reading prompt and the origin
  day; "yesterday" / "N days ago"). Delete the paragraph.
- The three verdicts read as answers: **Got it** / **Roughly** / **Blank**. Keep `clear`,
  `hazy`, `gone` as the data model and as the summary words on the course page's standing line
  ("2 clear · 1 hazy"); only the buttons change. Put the new words in `lib/recall/words.ts`.
- "let go" becomes "Stop asking about this" behind an overflow (···) on the card.
- "ask Claude" goes through the shared Claude sheet (A8).
- The course page's recall panel (`CourseRecallPanel.tsx`) uses the same card and the same words.

## A5. Tasks screen

- The keyboard shortcut line (⇅ move · X select · Enter open · N new · S sort · ⌘Z undo)
  renders at the bottom on a phone. Hide it and the `?` button on touch/coarse-pointer devices.
- Four stacked filter systems: the 14-day strip, the chips (All / Overdue / Today / This week /
  Done), BY day/course, ORDER "what matters", and the course chips. Collapse **BY** and
  **ORDER** into one "Sort" control that opens a small sheet with plain names: *Group by* day /
  course; *Sort by* what's urgent / due date / newest / my order. Keep the strip and the course
  chips. On phone, the chips row goes; the strip already filters by day and the sheet carries
  Overdue / Done as filters. Desktop keeps the chips.
- Hide "Overdue 0"-style chips when their count is zero, except All.
- Empty Tasks on a fresh term says "Nothing due. A clear day." which reads as caught up. Use
  the same two-way fill Today's empty Up next uses ("Get them in with Claude" / "Add a
  deadline") when the term has **no tasks at all**; "A clear day" stays only when tasks exist
  and none are due.

## A6. Course page: tasks first, ledger last

Order becomes: header stats → **Tasks** → This week + weekly goal → Where the grade stands →
Recall → Page (the tally ledger) → Sessions. **Weak points** renders only when it has content.

"Where the grade stands" when no scheme is set: two equal buttons. **Type it in** opens the
existing scheme editor pre-filled with the usual rows (Quizzes, Assignments, Midterm, Final,
Participation) with blank weights, so it is thirty seconds. **Ask Claude to read the outline**
opens the shared Claude sheet (A8) with the grading prompt. Remove the pattern where the primary
button silently copies to the clipboard.

## A7. Timer and the log sheet

- Remove the **Block / Open** toggle from the timer header; that choice is already made in the
  start popover (25/45/60/Untimed). Keep Pause, +5 min, Break.
- "Finish and log" → **Finish**. "Save to journal" → **Save**.
- The log sheet asks seven things at once (mark done, what did you do, hashtags, worth keeping,
  scored _/_, discard, save). Default sheet = the time, the **Mark done** toggle (when a task is
  attached), **Save**. Everything else folds under **Add a note** (note + tags, worth keeping,
  practice score). Remember whether the reader opened the fold last time (a preference in
  `lib/preferences.ts`, not a dismissed flag: it's a layout choice, not an explanation).
- The unsaved-session sheet that follows the reader to every screen
  (`PendingSessionLogSheet.tsx`) is fine as behaviour but must say why it is there: "You stopped
  a 1h sitting on ECON 100 and haven't saved it" (with the real length and course), and for a
  recovered timer, why it was cut (see B4).

## A8. One shared Claude sheet

Claude appears today as six different behaviours: "Get them in with Claude" (Today), "have
Claude write one" + "Prompt for an AI" + "tell Claude quiz me" (Notes), "Say how it is marked" +
"Not connected yet?" (course page), "ask Claude" (recall, copies to clipboard with a toast),
Weak points copy, Settings › Claude. None knows whether the reader is connected.

Build one `components/claude/ClaudeSheet.tsx` and route every one of these through it. The
sheet shows: what this will do in one line (e.g. "Claude reads your outline and puts every
deadline into ECON 100"), the exact prompt it is about to copy (scrollable, serif), a **Copy**
button, and one fixed footer: "Akada is a connector in Claude. Connect it once (Claude ›
Settings › Connectors › Akada), then paste this." linking to `/claude`. After the first one the
reader knows what every Claude button in the app does. Keep the prompts themselves where they
are (`lib/recall/prompt.ts`, `lib/grading-prompt.ts`, `lib/notes/prompt.ts`). The app cannot
currently know if an account is connected; write that up as a flag for the connector session in
the PR body (a readable "last used by Claude" timestamp would let the sheet say "connected").

## A9. Smaller

- Stats' log (`app/stats/page.tsx`): tasks created on a day appear as "written down" rows;
  eight today in the seed, forty for an outline import. Collapse to one row ("14 tasks added")
  when more than three on a day.
- Stats "THE NEXT LINE / double digits": the milestone card reads as a riddle. Title it
  "Next milestone", keep the named line as the aside ("10 hours · double digits").
- Coming list: "5%" with no unit sense the first time. Render "worth 5%".
- The ⏵ circle on course cards (Today, Courses) has no label. On `/courses` use a text
  "Start" button; keep the circle on desktop rail rows where the label is beside it.
- Vocabulary pass (see the diagnosis): session / task / course / reading / exam everywhere
  outside Record. Update `readmedesign.md` glossary where it names these.

---

# Part B: the app's claims are true

## The diagnosis

The app treats a **tick** as evidence. Done = read, done = studied, done = learned, done early
= disciplined. A tick is one tap and says nothing. Every derived figure below currently reads
ticks (or pages typed on ticked tasks) as measured effort.

## B0. The rule: worked vs ticked, and Skip

Introduce one concept, read at derive time (no schema change needed for the first version):

- A finished task is **worked** if time was logged against it: any session with
  `taskId === task.id`, or a kept timed read (`note.reads`) on a note whose `taskId` is it.
  Otherwise it is **ticked**.
- Put `workedTaskIds(tasks, sessions, notes): Set<string>` in `lib/derive.ts` with tests, and use
  it everywhere below. Do not duplicate the logic.
- Add a third verb to the task sheet and the row menu: **Skip**. A skipped task is completed
  with a new field `completed_via: 'skip'` (add the column with a migration in
  `supabase/schema.sql` / migrations, default null; the local adapter stores it on the task).
  Skipped tasks: leave the list like done ones, never enter recall, never feed pages, never
  count for Finished early or a study day, and render with a distinct mark (a struck-through
  hand check, not a red anything). The log sheet's "Mark the task done" sets
  `completed_via: 'session'`; a plain tick sets nothing. Read `completed_via` where it helps
  (B6) but keep `workedTaskIds` as the source of truth for "worked".

## B1. Pages an hour (`lib/derive.ts` `readingRate` / `readingRateDetail`)

Today: pages from every finished reading over hours on any reading task; "measured" after one
session on one 20-page reading. Fix:

- Pairs only: finished readings that are worked, each contributing its own pages / its own
  logged seconds.
- The rate is the **median** of per-task rates, not a pooled ratio, capped at 120 pages/hour and
  floored at 2.
- `measured` only with ≥ 3 pairs.
- Today's "about 2h 24m at 20 pages an hour" copy says "at the usual 20 pages an hour" until
  measured, and "at your 34 pages an hour" after. Same for readings without a page count: say
  "and 1 without a page count" rather than silently excluding.
- Flag: the connector's `reading_backlog` reads `readingRateDetail.measured` for "at your pace";
  it will flip later after this change. Say so in the PR body.

## B2. The note read-through timer (`lib/notes/use-read-through.ts`, `reads.ts`)

Today the run clock is the sitting's focus time, not time on the note; `minutesForNote` uses the
note's *last* read; skips to the end after 61 s on a short note pass the 600 wpm ceiling. Fix:

- The run accumulates only while the note is actually being read: page visible
  (`visibilitychange`), the reader is on the note (route/focus mode), the sitting is in focus
  (not break). Keep a `seenSeconds` on the run and use it, not `focusSeconds − startFocus`.
- The run must have **passed through** the note: record the max progress seen at each of
  25/50/75%; a read that reaches 98% without having been observed at each of those (with at
  least ~10 s between checkpoints) is not kept.
- Add a floor of 40 wpm beside the 600 ceiling.
- `minutesForNote`: median of that note's reads, not the last.
- Never time a note whose task is already completed (a look-up, not a read).
- Units: `wordCount` should skip fenced code blocks and table pipes; check `lib/notes/store.ts`.
- Tests in `lib/notes/reads.test.ts` for the floor, the checkpoint rule and the median.

## B3. Study days, weeks running, Days that counted (`lib/progression/runs.ts` `qualifies`)

Today a day counts on 20 minutes **or any ticked task or 10 pages on ticked tasks**. Ticking
"buy the textbook" is a study day; four of those bank a grace day. Fix:

- Ticks never qualify a day.
- Pages qualify only when time-bounded: use the credited page seconds the ledger already
  computes (`min(claimed, covered)` in `credit.ts`); expose a `creditedPages` on `DayCredit`
  and test against it. A skipped task contributes nothing.
- Paper reading still counts through a manual session: add **Log time** to the course page
  (a small sheet: course, optional task, length, date defaulting to today) if no manual entry
  exists; if one exists, surface it there. It writes a normal session with no segments.
- Update the `FirstNote` on Record and "what makes a week count" to match, and the Record
  section of `readmedesign.md`.

## B4. The forgotten timer (`lib/timer-context.tsx`)

Recovery cuts a timer at `lastSeenAt` after `STALE_RUNNING_MS` (4h) unseen. A laptop left open
on the timer page keeps `lastSeenAt` fresh through the heartbeat, so dinner becomes an 8-hour
session (cap 18h), which then sets the longest-sitting record, strikes "One sitting 3h", makes
the reader "a night owl", pushes reach to its cap. Fix:

- Track **last input** separately from last heartbeat: pointer, key, scroll, touch,
  visibility-to-visible, and any timer action. Store `lastInputAt` on the active state.
- Idle rule: in block mode, if the block's target has passed and there has been no input for
  20 minutes; in open (untimed) mode, no input for 60 minutes. When either trips, the sitting is
  held (not discarded) and the pending log opens pre-trimmed to `lastInputAt` with the reason:
  "You went quiet at 9:42. Logging up to there." and a control to keep the full time instead.
  *(judgement: thresholds.)*
- Any sitting over 4 hours gets the same "is this right?" trim control in the log sheet
  regardless of how it ended.
- Sessions saved after a trim or a recovery carry `recovery: 'idle' | 'away' | 'break' | 'max'`
  (new nullable column + local field). `readRecords`, `readLadders` (One sitting) and
  `readHabits` ignore sessions with `recovery` set for records and habit medians; the hours
  still count on Stats and the ledger, since the reader chose to keep them.

## B5. The clock of day, "night owl", "this is usually your hour"
(`lib/progression/habits.ts` `placeSitting`, `peakOf`; `lib/stats-reading.ts` `readPersona`)

A session with no chain is placed at `createdAt − duration/2` when logged the same day; people
log at night, so every after-the-fact session leans evening. The persona needs only 100 minutes
total with 40% in a 3-hour window. Fix:

- Only sessions with a focus segment are placed on the clock. Drop the `createdAt` fallback.
- Peak requires ≥ `HABIT_MIN_SITTINGS` (5) placed sittings across ≥ 3 distinct days, and the
  existing 40% share.
- `readPersona` returns null until peak exists under the new rule; the "weekend warrior" aside
  needs ≥ `HABIT_MIN_WEEKS` (3) weeks.
- Stats' "Your day, as a clock" says "from N timed sessions" under the clock.

## B6. Recall asks about things never read (`lib/recall/index.ts`)

Every finished task that `looksLikeReading` becomes a recall item with origin = the tick day.
Bulk-ticking eight readings done last month floods recall for days; ticking a skipped reading
asks about it tomorrow; the CHAPTER regex catches "Ch 3 problem set". Fix:

- A finished reading enters recall when it is **worked** (B0) or `completed_via === 'session'`.
  A ticked-only reading appears on the course page's recall panel under "not asked yet" with a
  one-tap "Ask me about this" that creates the record (`keepTask` already exists). Skipped never
  enters.
- Extend `NOT_READING` with: problem set, pset, `ps \d`, homework, hw, assignment, quiz, lab,
  tutorial, exercise(s). Add tests.
- Connector-marked completions arrive as ticks today; flag in the PR that the `complete`
  tool should be able to pass `completed_via: 'session'` when the student says they did it.

## B7. Finished early (`lib/progression/impressions.ts`)

Counts any task ticked 3+ days before due. Count only worked tasks. Skipped never.

## B8. Next Mark learning (`lib/progression/log.ts`)

A line is "followed" if any session starts within the hour, any course. Fix: followed only when
the started session's course matches the line's course; week/day lines match any course. Record's
"what the next-tally line has learned" copy stays; it just becomes true.

## B9. Records to beat (`lib/stats-reading.ts` `readRecords`, Stats page)

`fresh` fires for every card in week one. No records before 2 distinct weeks *and* 10 sessions;
until then the cards show the current figures with the aside "your first weeks set the marks"
and no NEW BEST ribbon.

## B10. Coming shows recall standing under the wrong things (`components/today/TodayPanels.tsx`)

"0 of 1 clear" renders under Problem Set 2. Show the standing only under tasks that
`preparesFor` (exams / heavy pieces, the same rule recall uses; export it) and only once at
least one item in that course has been asked.

## B11. Up next resume (`lib/derive.ts` `pickResumed`)

Ignore sessions under 10 minutes when deciding what to resume.

## B12. Course "sittings run about 180 minutes" (`StartTimerPopover.tsx`, `habits.ts`)

Covered by B4's `recovery` exclusion; additionally drop any sitting over 4h from habit medians.

## B13. Course page pace (`habits.ts` `pagesPerHour`)

Pooled ratio; one 200-page tick with five minutes on it is 2,400 pages an hour. Median of
per-task rates, same cap/floor as B1, and share the helper.

---

# Build order and PR grouping

Each is its own PR unless grouped. Merge each before starting the next. Title PRs plainly.

1. **B0** worked/ticked + Skip (schema, local adapter, task sheet, row menu, tests).
2. **B1 + B7 + B13** (all fall out of B0).
3. **B3** study days + Log time.
4. **B6** recall entry rule + NOT_READING.
5. **A3** New task form kinds.
6. **A1** Today cut-down (includes removing SettingsSheet).
7. **A2** fixed bottom nav.
8. **A4** recall card.
9. **A7 + B4** timer header, log sheet fold, idle trim, `recovery` field.
10. **B5 + B9 + B10 + B11 + B12** clock, records, coming, resume.
11. **A6** course page order + grade panel.
12. **A8** shared Claude sheet.
13. **A5** Tasks screen.
14. **A9 + B2** small copy items, vocabulary pass, notes read-through.
15. **B8** next-mark learning.

Before every push: `npm run typecheck && npm run lint`, run the `lib` tests, and screenshot the
touched screens in both seeded states at 390 and 1280 on the night tone (the default) and once
on the cream `paper` tone. No horizontal scroll at 390. Attach nothing; describe what you
checked in the PR body.

In each PR body: what changed, what you verified, any "Flag for the connector session" items,
and which `readmedesign.md` sections you updated.
