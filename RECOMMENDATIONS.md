# What would actually make you study more

Written overnight on 22–23 September 2026, after reading the whole codebase,
your actual term through the connector, and about forty studies. The research
brief behind the numbers is summarised at the bottom.

## The short answer

Everything Akada had for motivation measured minutes and then decorated them.
Marks, pages, the weekly run, Next Mark and the notes in the margin are all
readings of logged time. Three rounds of making that nicer didn't make you
study more, and the research says why. Points and streaks laid on top of an
activity do little for how much people do it, and some of them make it worse.
A counter going up can't answer the thing you actually want to know at 9pm,
which is what to do now and whether the last ten hours did anything.

The two study techniques with the best evidence behind them are pulling
material back out of memory and spacing that out over days. In real university
courses, doing that on a schedule raised exam scores by about a letter grade.
Akada had neither, and it had no idea what you were studying, only for how
long. So the biggest thing I built tonight is **Recall**. The app now knows
what you've read and what you've marked as learned, asks you to give it back
with the book shut a day later, then 3 days, a week, 16 days, 35, and believes
your answer. When you say something's gone, it brings it back tomorrow and
points you at the material. That's the part that feels alive. It remembers
what you did and comes back for it, and what it shows you changes every day
based on you.

## Do this first (two minutes)

1. **Run `supabase/schema.sql` once** in the Supabase SQL editor. Idempotent
   as always. It adds one table, `recall_items`, and two columns on sessions
   for practice scores. Until you run it the recall cards still appear (your
   finished readings are read straight off the task list, no table needed),
   but answering one says it can't save yet, and a score on the log sheet
   isn't kept (the sitting still is).
2. **Put the midterm in as an exam.** Tell Claude "add MATH 101 Midterm I on
   3 October as an exam worth 25%". Until tonight it couldn't, because the
   connector had no way to set a task's kind, so every task Claude ever made
   for you was a plain task, and the exam countdown, the reading backlog and
   Next Mark's deadline steering all had nothing to read. With the midterm
   in, the Coming panel shows how much of MATH you actually have under the
   countdown, and MATH recall gets pulled forward to finish the day before.
3. **Keep your concept lists.** Open Limits concepts and Continuity concepts
   on Tasks and tap "keep N ticked for recall" in the Subtasks header. Your
   rule on those lists is "tick only when you can do it fresh". Now the app
   checks the tick a day later, and again at widening gaps, and if one's gone
   it unticks it, because the tick was claiming something that stopped being
   true.

## What I found

**Your term, from the connector.** 17 hours logged last week across 26
sittings and 14 tasks finished, so this was never a "doesn't open the app"
problem. The session notes say what you did in each sitting ("practice set 1
a1 plus 10 claude generated questions", "machiavelli done and taken notes",
"timed practice RP: Machiavelli closed book 4.5/8"). And you'd already built
the thing the app was missing, by hand, as two MATH tasks called Limits
concepts and Continuity concepts whose notes say "tick one only when you can
do 3 fresh problems of that type with no worked example in front of you".
That's a mastery tracker written into subtasks because Akada had no place for
one.

POL's response papers are unannounced and closed book, so every reading has
to be recallable on any Tuesday. That's retrieval practice by definition, and
nothing in the app did it. MATH's first midterm is around 3 October and wasn't
in Akada as an exam. ECON has two catch-up chapters marked high priority with
no dates, and Up next only ever looked at overdue and due-today work, so the
day the overdue pile was cleared it would have said "A clean page" with those
two sitting right there. Six POL readings were on the list twice, once off the
syllabus and once as "— done with Claude", so the originals sat there as
overdue even though the work was done.

**What the evidence says.** I had a research pass run over the main
literature, and a handful of findings decided what got built.

Retrieval practice beats rereading once there's a delay (Roediger & Karpicke
2006: 61% vs 40% recalled a week later), and students consistently predict the
opposite, which is why they reread. Across 272 effect sizes, testing yourself
beats restudying at g≈0.5, and it jumps to 0.73 when you see the right answer
after the attempt instead of 0.39 without (Rowland 2014). Doing it across a
few spaced sittings until you get it right each time ("successive relearning")
raised real course exam scores by about 10%, a full letter grade, and by 40% a
month later (Rawson et al. 2013). Judging whether you know something right
after studying it is a weak guide (it correlates .38 with what you later
recall), while judging a day later is close to accurate (.90, Nelson &
Dunlosky 1991), so the first recall is the next day.

The motivation research cuts against everything Akada tried before. Tangible
rewards for doing a thing lower how much people want to do it (Deci, Koestner &
Ryan 1999, 128 studies), and over a 16-week course, badges and a leaderboard
lowered both motivation and exam scores (Hanus & Fox 2015). A broken streak
does its own damage by lowering what people do next (Silverman & Barasch 2023).
The single biggest behaviour change in a 61,000-person megastudy of 54
interventions was a small reward for coming back after a miss (Milkman et al.
2021), which is roughly what the weekly run's grace days already are.

And the one that killed my third idea. Across about 25,000 students on three
campuses, no online or text-message nudge moved grades, and a weekly schedule
plus reminders before planned study sessions had a precisely measured zero
effect on grades (Oreopoulos & Petronijevic 2019; Oreopoulos et al. 2022).
What happens inside the sitting is where the difference gets made, and the
prompt that starts it barely registers.

One more that's specific to you. High-school students who used GPT-4 freely
for maths practice did 48% better while they had it and 17% worse than a
control group once it was taken away, and a version that only gave hints
avoided the drop (Bastani et al. 2025). A lot of your POL readings are marked
"done with Claude". Recall checks what stayed, however the reading got done,
and every prompt it hands to Claude now says to show nothing before your
attempt and the full answer after.

## What's live now

**#37, the connector can say what a task is.** `create_tasks`, `update_tasks`
and `get_tasks` take and return `kind`, `weight` and `pages`. The tool
descriptions now tell the model to make a midterm an exam, and to tick finished
work with `complete_tasks` instead of creating a second copy marked done. A
project without the columns keeps making plain tasks, same as before.

**#38, Up next reaches past today.** When nothing is overdue or due today it
picks the soonest thing due this week, and then your high-priority open-ended
work from whichever course has gone longest without a sitting. ECON's catch-up
would have come up. A normal-priority task with no date still never does.

**Recall** (the big one) shows up in five places.

- **Today**, under Up next. A few things a day, one card at a time: the
  course, when you read it or how it last went ("hazy 3 days ago"), the thing
  itself, and one line on how to recall it ("the argument, without looking",
  "do one fresh, nothing in front of you"). You answer clear, hazy or gone.
  The next card is already there, and a line under it says what your answer
  did ("hazy · back tomorrow") with undo, and "reread it" / "work on it" when
  something slipped, which starts a timer on the task it came from. Five a day
  at most and no more than three from one course, slipped ones first, so a
  term of readings doesn't land as a thirty-card backlog on the first morning.
- **The course page**: everything the course is keeping, in the order it comes
  up, each with its last three answers as hand marks in the margin and when
  it's next asked, a line to keep something new, and "Recall N now" for the
  rest of that course's due ones with no daily limit. There's also a count
  that splits settled from clear, "1 settled · 1 clear · 1 hazy · 1 gone · 1
  not asked yet". Settled means clear three times running on separate days,
  because one good morning after reading something isn't the same as keeping
  it, and the research is specific that the criterion should be hit across
  several sittings.
- **The Coming panel**, under an exam: one upright per thing kept, pressed hard
  for settled, faint for not yet, and "2 of 5 clear". The countdown already
  said how close the exam is, and now the row under it says how close you are.
- **The task sheet**: a finished task says where it stands in recall, or
  offers to keep it. A concept list offers "keep N ticked for recall", and kept
  steps carry a small loop in the margin. A reading you haven't done yet
  offers "Questions before you read", which copies a prompt for Claude to ask
  you three questions the reading answers. You write a one-line guess at each,
  then read, and the questions go into recall. Being asked first makes those
  points stick even when the guesses are wrong (g=0.54 over 97 effects, St.
  Hilaire et al. 2023; Pan & Carpenter 2023), as long as the reading actually
  gets done after.
- **The log sheet**: "Worth keeping?", a line to write one thing from the
  sitting on. Most sittings leave it empty, which is fine.

Your finished readings come in on their own. Anything that starts with "Read",
cites an author and a year, or names a chapter counts, and a reading written
down twice is one thing to remember. Nothing is stored for a reading until you
answer it, so the whole term arrives already in recall. The schedule is worked
out from your answers every time, never stored, the same way the rest of the
record works. An exam within three weeks in the same course, or anything worth
a fifth of it, pulls in to the day before whatever would otherwise go past it
unasked. Weekly stuff doesn't, a problem set worth a tenth or a quiz worth 2%
even if it's marked as an exam, or every reading would come up every week and
the gaps would never widen.

**"ask Claude"** is on every card and on each course's Recall header. It
copies a prompt for a chat with the connector that asks one question at a time
and shows nothing before you try. After you answer it shows the right answer,
so you grade against that instead of your gut, and it records the verdict back
through the new `record_recall` tool. The course version asks for everything
due mixed together rather than in order, since mixed practice beat blocked
practice 61% to 38% a month later in a 787-student maths study (Rohrer et al.
2020). This is where your "10 other claude generated questions" habit plugs
straight into the schedule.

There are three new connector tools, `get_recall`, `record_recall` and
`keep_for_recall`, so Claude can quiz you on what's actually due, record how
it went, and turn a problem set's concepts into things to keep. All of it is
in `MCP_SETUP.md`.

**Practice papers with a score** (its own PR, after recall). You already wrote
"Machiavelli closed book 4.5/8" in a note. Now the log sheet has a line for
it, "Scored __ / __ on a practice paper, if this was one", and `log_study_session`
takes `score` and `score_out_of` so Claude can log a marked paper too. The
course page plots every paper as a pen mark at the height of its score, oldest
on the left, with the last four written out under it, and the score shows next
to the hours on each session row. It's the one number in the app that measures
what came out instead of what went in, so a run of timed closed-book attempts
becomes the most honest progress line you've got. In the diary research,
making progress on work that matters was the most common thing on people's
best days (Amabile & Kramer, correlational). It needs `supabase/schema.sql`
run once more for the two new columns; until then the line is there but a
score just isn't kept.

## What I'd build next, in order

**1. The run-up.** For an exam two weeks out, work backwards and put a sitting
on the course on the first day, then around days 2–3, 6–7 and 11–12 (spacing
works best at about 20–40% of the time left, per Cepeda et al. 2008), each one
starting with that course's recall. Recall already pulls things forward, and
this would put the sittings themselves on the page. Keep it weekly rather than
hourly, since in one small study daily plans didn't raise study time and
monthly ones did (Kirschenbaum et al. 1981).

**2. Credit the return.** Your run already forgives a missed day. The step
further, from the gym megastudy, is to make the first sitting back after a
quiet week visibly count. That would be one line on Today, never a broken chain.

**3. Studying alongside someone.** The only solid evidence for "body doubling"
is that feeling like you're working with someone made people stick at a hard
task 48–64% longer (Carr & Walton 2014). Focusmate's own numbers are self-report.
If friends at LUMS start using Akada, a quiet "2 others at their desks" on the
timer is possible with Supabase presence and no new tables. Not worth it for
one user.

**4. Smaller, noticed while reading the code.** The Supabase adapter never
loaded `session_segments`, so after a reload the habits layer saw every
sitting as one unbroken stretch and your block readings stayed coarse. That's
fixed in its own PR: a separate, paged read that tolerates the table missing.
The six duplicate POL readings on your real list are still there though. Tick
the syllabus copies, or ask Claude to. Recall only merges two copies when it's
sure they're the same reading, so if one comes up twice, let go of the extra.
The new tool descriptions should stop new ones appearing.

## What I'd skip

**The "next sitting" calendar invite** (pick a time at the end of a sitting, it
drops into Google Calendar, the link starts the timer). I designed it and then
didn't build it, because the largest studies on exactly this found planned
study sessions plus reminders had no measurable effect on grades. Planning with
a specific date and time does help people turn up to one-off things (a flu
shot, +4 points), it just hasn't carried over to coursework.

**Anything that adds points, badges, levels or a leaderboard.** The evidence
is negative, and the record already goes as far in that direction as it's
safe to.

**Blocking distractions.** The only good result there came from limits students
set for themselves (+24% time on the course, Patterson 2018), and a web app
can't enforce them anyway.

## The evidence, briefly

- Roediger & Karpicke 2006, *Psych Sci*: testing beats rereading at one week (61% vs 40%).
- Dunlosky et al. 2013, *PSPI*: practice testing and distributed practice are the only two techniques rated high utility; rereading and highlighting rated low.
- Adesope et al. 2017, *RER*: testing g=0.51 vs restudy across 272 effect sizes. Rowland 2014, *Psych Bull*: 0.73 with feedback, 0.39 without.
- Rawson & Dunlosky 2011, *JEP:Gen*; Rawson et al. 2013, *EPR*: successive relearning, +10% course exam scores, +40% a month on. Janes et al. 2020: d=0.54–1.10 in a hard biopsychology course.
- Nelson & Dunlosky 1991, *Psych Sci*: delayed judgments of learning predict recall at .90 against .38 immediately.
- Cepeda et al. 2008, *Psych Sci*: best gap is roughly 20–40% of the time until the test.
- Latimier et al. 2021, *EPR*: spaced beats massed retrieval (g=0.74); expanding vs even gaps makes no difference.
- Rohrer et al. 2020, *J Educ Psych*: interleaved maths practice 61% vs 38% a month later.
- Bastani et al. 2025, *PNAS*: open GPT-4 help −17% once removed; hint-only avoided it.
- Deci, Koestner & Ryan 1999, *Psych Bull*; Hanus & Fox 2015, *C&E*; Silverman & Barasch 2023, *JCR*: rewards, badges and broken streaks.
- Milkman et al. 2021, *Nature*: 54 interventions, 61,293 people; rewarding the return after a miss did best.
- Oreopoulos & Petronijevic 2019 (NBER); Oreopoulos et al. 2022, *JHR*: nudges and planned-session reminders, no effect on grades.
- Gollwitzer & Sheeran 2006; Milkman et al. 2011, *PNAS*: implementation intentions, and where they do and don't carry over.
- Carr & Walton 2014, *JESP*: cues of working together, +48–64% persistence.
- Ariely & Wertenbroch 2002 on self-imposed deadlines was retracted in September 2026, so nothing here leans on it.
