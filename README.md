# Akada

Akada is a study planner for university. It holds your courses, the work due in
them, and the hours you actually sit down and put in, on a small set of screens
that are meant to be read rather than operated.

It was built for one student's term and then made general. The planning app it
replaced was a to-do list with a calendar bolted on, which is fine until the
week you are three readings behind and the only thing the app can tell you is
that you have eleven open items. Akada tries to answer the question underneath
that, which is usually some version of how far behind am I, and on what.

## The stance

Most of the design decisions come out of one rule: if an element wouldn't look
right drawn with a pen and a highlighter on good paper, it doesn't belong.
That is literal. The background is cream rather than white, text is a warm
charcoal rather than black, borders are faint the way ruled lines are, and
there is no red anywhere. Overdue work is a muted terracotta. A finished task
fades instead of being struck through.

The other rule is that the app talks as little as possible. No "0.0h logged of
your 9h goal", no badge counts, no congratulatory toast when you finish
something. Hours are drawn as strokes, one per hour, because an hour is a
countable thing. A grade is one of the few genuine percentages in the app, so
it is the one place a bar gets drawn.

`readmedesign.md` has the full palette, typography and component reasoning if
you want the whole argument.

## What's in it

**Today** is the home screen. What is due, what is next, the hours on the day
and the week, your courses with their weekly goals, and a countdown panel for
anything weighted that is coming, with the reading backlog underneath it in
pages and in hours at your measured pages-per-hour rate.

**Tasks** is the full list, filterable by overdue / today / this week / done,
sortable, groupable by due date or by course. A task carries a due date, a
priority, an optional description and subtasks, and a kind. Kind is the part
that matters: a reading has a page count, an exam has a weight and gets counted
down to, and a plain task is neither. Everything written before kinds existed
is a plain task, so nothing changed meaning when they arrived.

**The timer** runs in two modes over one clock. A block has a target of 25, 45
or 60 minutes and counts down inside a frame. Open has no target and just runs.
Either way the screen draws a study fan, a single stem that branches as the
session goes on, seeded off the session id so a saved session redraws the same
shape it grew. It replaced a countdown ring, which told you what fraction of
your session was gone, which is the one thing nobody in the middle of a chapter
wants to be told. There is pink noise if you want it, and the session logs with
a note when you stop.

**Courses** hold the weekly goal, the colour, and how the course is marked. The
grading panel is read and edit in the same place, and the number it leads with
is out of what has come back rather than out of 100, because a student who has
had a quiz and a midterm returned has not scored 24%. A piece that hasn't been
marked yet shows a dash, not a zero, and says how many days out it is if
there's a dated task matching it.

**Stats** is the heatmap, the weekly chart, a journal of everything that
happened in order, and a term-wide view of how much of your grade is still
undecided.

**Stamps** is the gamified reading of the same sessions: a streak, a weekly
challenge, and twelve stamps drawn as postmarks. All of it is derived from
your sessions on read. There is no stored record of achievement, which means
nothing to backfill for an account that has been logging for a term already and
no way for the page to disagree with Stats about what happened.

**Settings** covers the daily goal, when your day ends (anywhere up to 6am, so
a 2am session counts toward the right day), whether weekends count, CSV export,
and appearance. Appearance is five paper tones including a night one, four
heading serifs, three densities and two accents.

Semesters sit under all of it. One is active and everything writes into it;
past terms are archived and readable, with their courses and sessions intact.

## Courses come from the catalog

Adding a course searches the Fall 2026 LUMS catalog, generated from the
registrar's course memo and the public [LUMS Pro
Planner](https://lumsproplanner.com) dataset for when and where each section
meets. Pick a section and the credits, instructor and meeting time come with
it, and the weekly goal is suggested off the credit hours. You can also just
type a course name, so the picker is never a required step. Pointing the app at
a different term is a one-line change in `lib/catalog/index.ts`.

The source workbook is deliberately not committed, since registrar memos can
carry free-text notes from instructors. The generated catalog excludes them.
Regenerating it is `python scripts/build-catalog.py "Fall Semester 2026 -
Course Memo.xlsx"`, with `--refresh-planner` to re-pull the meeting times.

## Claude can write into it

Akada exposes a remote MCP endpoint at `/api/mcp` with its own OAuth flow, so
you can connect it to Claude as a custom connector and hand it a syllabus.
Nine tools: `find_course`, `get_tasks`, `get_overview`, `create_tasks`,
`update_tasks`, `complete_tasks`, `log_study_session`, `get_weekly_stats` and
`delete_course`. The connector authenticates as you and gets a session of its
own, so signing out of the app in a browser doesn't disconnect it.

`MCP_SETUP.md` walks through connecting it.

## How it's built

Next.js 16 on the App Router, React 18, TypeScript, Tailwind, SWR for reads
with optimistic mutations on every write, Framer Motion for the swipe rows.

Data goes through a single `DataProvider` interface with two implementations.
`SupabaseAdapter` is the real one. `LocalAdapter` runs the entire app against
localStorage with no backend, which is what the browser tests drive, and it has
to be opted into by hand in development — an implicit fallback once meant a
production deploy with missing env vars looked completely healthy while writing
everyone's data into their own browser.

The security posture is the reason there's no server between the app and the
database: **the app authenticates as the student**. There is no Supabase
service-role key anywhere in it, and Row Level Security is what keeps one
account out of another's rows. Every write path assumes the caller is the
owner because Postgres has already checked that they are.

Reads memoize the user id and the active semester as promises on the adapter,
so six hooks opening at once on a dashboard share one auth check and one
semester lookup instead of racing through Supabase's auth lock six times.

## Running it

Node 20+ and a Supabase project. Copy `.env.example` to `.env.local`, fill in
the Supabase values, run [`supabase/schema.sql`](supabase/schema.sql) in the
SQL editor (it's idempotent), then `npm install && npm run dev`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public publishable key. RLS still applies. |
| `NEXT_PUBLIC_SITE_URL` | Canonical deployed origin, no trailing slash. |
| `AKADA_MCP_TOKEN_SECRET` | 32+ random characters, only needed for the Claude connector. |

Never add a `service_role` key.

Before shipping: `npm run typecheck`, `npm run lint`, `npm run build`.
Deployment details are in `LAUNCH_CHECKLIST.md`.

## License

For personal or academic use.
