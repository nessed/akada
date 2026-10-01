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

Quiet is for the thirtieth visit, though, and a screen written only for
that reader is a wall on the first. So a thing explains itself once, in
place, the first time someone meets it, and goes quiet after: the first
recall card says what recall is until one has been answered, the Record says
what a tally and a page are until one binds. When each note leaves is worked
out from the reader's own data, never a dismissed flag.

`readmedesign.md` has the full palette, typography and component reasoning if
you want the whole argument.

## What's in it

**Setup** is four steps and ends on the thing the rest of the app runs on.
What Akada is; the courses, searched in the LUMS catalog with the section,
instructor and time filled in and a weekly goal of two hours a credit; the
term, with the one under way already picked; and **what's due**, which offers
the two ways to get deadlines in: hand Claude the course outlines, or add
them by hand. A term with nothing in it yet doesn't greet anyone with
"nothing due", which reads as caught up. Up next says what it is for and
offers the same two ways, plus a timer on a course.

**Today** is the home screen. What is due, what is next, the hours on the day
and the week, your courses with their weekly goals, and a countdown panel for
anything weighted that is coming, with the reading backlog underneath it in
pages and in hours at your measured pages-per-hour rate. Up next says in one
line why its pick is the one (due tomorrow, or a session owed in an exam's
run-up), sizes the session to how long you usually work and what is left of
the evening, and offers two others from other courses in one tap.

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
wants to be told. In the deep there is a tank to listen to if you want it, and the session logs with
a note when you stop.

**Courses** hold the weekly goal, the colour, and how the course is marked. The
grading panel is read and edit in the same place, and the number it leads with
is out of what has come back rather than out of 100, because a student who has
had a quiz and a midterm returned has not scored 24%. A piece that hasn't been
marked yet shows a dash, not a zero, and says how many days out it is if
there's a dated task matching it.

Typing the weights in is one way to fill that panel. The other is letting a
model read them off the outline, which is the next section. Either way the
panel knows if the course is curved rather than marked on a fixed scale, and
it knows the rules where not everything counts: seven quizzes where the best
six are kept come to 30% rather than 35%, and the piece that gets dropped is
decided by score once enough of them have come back to say which is the worst.
Before that, nothing you already hold is thrown away.

A sitting spent on a practice paper can say what the paper scored, on a line
of the log sheet or through the connector, and the course page plots every
paper as a pen mark at the height of its score, with the last few written out
under it. It is the one figure in the app that measures what came out rather
than what went in, so it is only ever what you wrote down.

**Stats** is the heatmap, you against last week, the records to beat, a
journal of everything that happened in order, and a term-wide view of how much
of your grade is still undecided. It counts the run the same way the Record
does, in weeks; nothing in the app counts days in a row.

**Record** is the progression reading of the same sessions. A run measured in
weeks rather than days, because university work moves a week at a time and a
daily streak punishes a wedding. A page per course, inked a **tally** at a
time (forty minutes of study, fifteen for a course's first) and bound when
fifteen fill it. Impressions, which are ladders rather than badges, so there
is always a next rung and never a wall of grey. The unit used to be called a
mark, which is also what a LUMS student calls a grade, so on every screen
"marks" now means grades and nothing else. The tab itself waits for the first
logged session; until then a phone has Courses in its place.

All of it is derived from your sessions on read. There is no stored record of
achievement, which means nothing to backfill for an account that has been
logging for a term already and no way for the page to disagree with Stats
about what happened. Every input Akada has is unverifiable self-report, so the
game layer deliberately saturates well before a real study day does: a long
day earns less per hour, never nothing per hour, and Stats, the heatmap and
every export always show the true unmodified figure.

**Recall** is the part that asks what came out of the hours rather than how
many there were. Finished readings come into it on their own, the day after
they are ticked, and anything else can be kept by hand: the ticked steps of a
concept list, a finished task, a line written at the end of a sitting or on a
course page. Today asks for a few a day, one at a time, to be given back with
the book shut and answered clear, hazy or gone. The gaps widen with every
clear (a day, 3, 7, 16, 35) and close again on a slip, an exam in the course
pulls in to the day before anything that would otherwise go past it unasked,
and a concept step that has gone is unticked on its list, since its tick
claimed it could be done fresh.
A course page shows what it is keeping and how much of it is settled, and the
Coming panel draws that under an exam's countdown. Like the record, the
schedule is worked out from the answers on every read and never stored.

**Settings** covers the daily goal, when your day ends (anywhere up to 9am, so
a 2am session counts toward the right day), whether weekends count, CSV export,
and appearance. Akada opens on the night paper; Appearance swaps it for one of
four daylight tones, and also has four heading serifs, three densities and two
accents.

`/guide` walks through all of the above in plain words for someone who has
never used a planner, opening on what to do in the first week, and is the
link to send a friend before they sign up. `/claude` is the same for the
Claude side, and the one to send a friend who already uses Claude.

The landing page is written for a LUMS student arriving from a group chat on
a phone, and drawn in the app's own hand: ruled paper, loose taped sheets,
notes in the margin. Its Today is drawn in markup
(`components/public/TodaySketch.tsx`) so it sits on whichever paper the
reader has; when Today changes, change the sketch with it.

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

Akada is a connector for Claude: a remote MCP endpoint at `/api/mcp` with its
own OAuth flow. A student finds it in Claude's connector directory, presses
Connect, signs in, and from then on can attach a course outline and say "put
everything into Akada". It covers the whole planner, forty-one tools across
tasks, sessions, grading, recall, notes, quizzes and weak points, and every
one of them is listed with what it reads, changes or deletes on `/docs`.

It is built so Claude does not have to work the planner out from scratch
each chat. The server hands over a short playbook on connecting (where to
start, which tool closes which loop, the rules that are never optional), and
the first tool is `get_briefing`: one read of everything Today knows, joined
the way the app never joins it in one place, with the loose ends ranked and
what Akada has learnt about how the student actually works. Six prompts sit in
Claude's **+** menu for the usual starts (plan the week, what now, an outline,
a recall round, exam prep, logging a sitting). And the app writes the
student's time zone and day end onto their settings, so everything the
connector dates lands on the student's day rather than the server's UTC one.

The connector signs in as the student with a session of its own, so the
database's row security is what keeps it inside their planner. Akada only
receives what Claude asks it for; it never sees the conversation. `/claude`
says this to students in plain words, and `/privacy` has the policy.

Inside the app, everything that hands work to Claude (**Say how it is
marked**, **ask Claude** on a recall card, the Notes prompt, the quiz shelf)
says "a Claude chat with Akada switched on" in the same words and leads to
`/claude` for anyone not connected yet.

The grading pair is the one place the app asks a model to read a document and
believes the answer, so it is built not to. **Say how it is marked** on a
course no longer opens the form: it copies a prompt with that course's id and
code filled in, and the prompt tells the model to ask for the outline and to
parse nothing and call nothing until a file has actually been attached. A
model that starts from the course code alone writes a scheme that looks
plausible and is invented.

What comes back is a proposal, not a scheme. It sits in `courses.grading`
beside the accepted one, the card shows you what was parsed with Accept and
Discard, and nothing projects a grade until you accept it. That last part is
not a rule the panel remembers to follow: `gradeStanding` only ever reads the
accepted scheme, so a proposal has no way to move a number.

`MCP_SETUP.md` covers running and debugging the connector; `/docs` is the
public reference.

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

Before shipping: `npm run typecheck`, `npm run lint` and `npm test`, which is
what CI runs (the first two) plus the unit tests. `npm run build` fails locally
without Supabase configured, on purpose; the Vercel preview on each PR is the
build that counts.
Deployment details are in `LAUNCH_CHECKLIST.md`.

## License

For personal or academic use.
