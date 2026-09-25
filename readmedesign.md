# Akada. UI & Aesthetic Design Choices

This document outlines the core visual philosophy, UI elements, and styling choices behind the Akada Study Planner. The app is designed to feel like a "quiet place to study"-minimalist, organic, and distraction-free, mimicking the tactile feel of a high-quality physical notebook.

## 🎨 Visual Philosophy & Aesthetic
Akada's design moves away from the stark, high-contrast flat designs typical of modern software. Instead, it leans into a **warm, organic "notebook" aesthetic**. It feels tangible, calming, and personal, utilizing soft paper tones, ink-like typography, and soothing pastel accents.

### 🚫 What We Strictly Avoid (The Anti-Patterns)
To maintain the soul of the app, we actively reject standard SaaS UI/UX "best practices" that add noise, urgency, or digital clutter. If an interface element wouldn't look right drawn with pen and highlighter on premium paper, it doesn't belong here:
- **No Heavy UI Chrome:** We avoid thick borders, solid-filled high-contrast buttons (except for the single primary timer action), and harsh drop shadows. Elements should feel like light pencil marks or faint highlighter on a page.
- **No Over-Explaining:** We avoid explicit, wordy labels (e.g., "0.0h logged out of 9h goal"). We rely on minimal text, visual hierarchy, and the user's intuition. The interface should not "talk" to the user more than absolutely necessary.
- **No Clutter & Cramping:** Generous whitespace is a strict requirement. We do not compress or compact elements just to fit more on a screen. 
- **No Alarmist Indicators:** We avoid bright red badges, aggressive error alerts, or high-contrast strikethroughs. For example, completed tasks gently fade, and overdue items use muted tones rather than screaming for attention.
- **No Mono Kicker Over a Serif Heading:** A tiny monospaced line stacked above a large serif title is the shape every generated app arrives in. Metadata above a screen title is a standfirst and is set in the serif. Mono is for digits.
- **No Generic Dashboard Components:** We avoid typical software widgets like text-heavy progress bars, thick tab underlines, or loud "empty state" placeholder blocks.

## 🖌️ Color Palette
The color system is heavily curated to resemble premium paper, ink, and mild highlighters.

### Core Foundation (Paper & Ink)
The foundation is not one palette but four, the **paper tone** a reader picks
in Appearance. `Paper` is what the app ships with; `Warm`, `Stone` and `White`
are the alternatives. Every value below is the shipped `Paper` tone, and the
authority for all of them is `PAPER_TONES` in `lib/preferences.ts`, mirrored
into `:root` in `globals.css` so the first paint needs no correction.

- **Backgrounds (`bg`, `bg-tint`, `paper`, `paper-2`)**: `#F5F1E8`, `#EDE7D8`,
  `#FBF8EF`, `#F7F3E6`. Warm cream throughout, cards are a lighter cream, not
  white. True `#FFFFFF` appears only in the `Stone` and `White` tones.
  `bg-tint` is the wash a selection, an active rail item, a hover or a
  progress track is filled with. Most of those are drawn on a `paper` card
  rather than on the ground, so a tone's tint has to stay a readable step off
  its `paper`, in whichever direction its ink lies.
- **Lines (`line`, `line-soft`, `line-strong`)**: `#DDD6C2`, `#EAE4D3`,
  `#C9C0A8`. Borders and dividers resemble the faint ruled lines of a notebook
  rather than harsh digital borders.
- **Text (`ink`, `ink-soft`, `muted`, `muted-soft`)**: `#1A1714`, `#4B4640`,
  `#8C8576`, `#B5AE99`. Instead of pure black, text relies on deep, warm
  charcoals, mimicking pen ink and reducing eye strain. `muted` carries every
  label and caption; `muted-soft` is for text that should barely register.
- **Primary (`primary`)**: resolves to `ink`. The "Sage" option in Appearance
  swaps it for the sage pastel.

### The Pastel Highlighter Palette
For course categorization and tags, Akada uses a beautifully crafted palette of muted pastels. Each color is paired with a soft "tint" version used for backgrounds, while the strong value is used for text, borders, or accents.

`PASTEL_PALETTE` in `lib/utils.ts` is the source of truth, it is what a course
is actually coloured with. The `--sage`…`--mauve` variables in `globals.css`
mirror it exactly, for the places that need a pastel without owning a course.
If the two ever disagree again, `lib/utils.ts` wins.

The strong value below is the course's colour and is the same object on every
paper. The **tint is not**: it is a wash derived from a page, and the night
paper needs a different one, so nothing paints with the hex a course record
stores. Fill through `resolveTint(color, tint)`, which hands back the
`--sage-tint`…`--mauve-tint` custom property for that pastel; the stored hex
is only ever read to recognise which pastel was meant. Painting with it
directly is what left the night page covered in near-white blocks with cream
writing on them.
- **Sage**: `#A8B89B`
- **Rose**: `#D4A5A5`
- **Lavender**: `#B5A8C9`
- **Peach**: `#E2B594`
- **Sky**: `#A8BCC9`
- **Clay**: `#C99B7E`
- **Butter**: `#D9C58C`
- **Mint**: `#9FC1B0`
- **Slate**: `#9AA3AB`
- **Mauve**: `#B89BAA`

### The Alarm Ramp (muted terracotta, never red)
Two semantic ramps carry everything the interface would otherwise say in red.
They are warm clays, and that is the point, see "No Alarmist Indicators".
- **`warn` / `warnSoft` / `warnTint`**: `#B5694C`, `#A38046`, `#F4ECDC`. The
  quiet tone: an overdue date, a course that has gone untouched.
- **`priority` / `prioritySoft` / `priorityTint`**: `#C97A6B`, `#A85C42`,
  `#F4DCD2`. Inline errors, high-priority tasks, destructive affordances.

## 🖋️ Typography
Typography in Akada blends modern readability with classic literary elegance.
- **Sans-Serif (`Inter`)**: Used for the majority of the UI, providing clean, highly legible structure.
- **Serif (`Fraunces`)**: Applied to headings, quotes, or focal points to give the application an elegant, editorial, and sophisticated character. It is the default; **Cormorant Garamond**, **Lora** and **Merriweather** are selectable in Appearance and swap in through `--font-serif`, so no component names a family.
- **Monospace (`IBM Plex Mono`)**: Digits only, the timer face, hour counts, grades and anything tabular. It replaced JetBrains Mono, which is a code editor typeface and read like one on paper; Plex carries the same `0.600em` character advance, so the swap moved nothing. Its x-height is lower (`0.516em` against `0.550em`), which is why the handful of labels under 11px are set half a pixel larger than the face they replaced. Mono never sets prose.
- **Handwriting (`Caveat`)**: Reserved for marginalia, the `HandNote` primitive and the `.font-hand` utility. Never for UI text.

### The Eyebrow
One caption spec, `.eyebrow` in `globals.css`: 10px, 600 weight, uppercase,
`0.16em` tracking, `muted`. Section headers, field labels, course codes and
"Wk 17" all use it. It sits in `@layer components`, so a colour or a tighter
tracking set alongside it still wins, that is how the badges and the timer's
display caption keep their own letterspacing. Nothing sets it in mono: the one
element that did was put back on the sans.

### Type scale
Two title tiers, so a screen title is recognisable as one:
- **Screen title**, `text-[36px]` at `tracking-[-0.025em]`, serif, dropping
  to `32px` on phone.
- **Section heading**, `text-[17px]`/`text-[20px]`, serif medium.

One deliberate exception: the stats masthead is `52px`, which is the one
editorial flourish in the app. Every screen title sits under a **standfirst**
carrying the date, the week and the counts, rather than turning that
information into the title. It is set in the same serif as the title above it,
italic, `13.5px`, muted, the way a magazine sets the line under a headline.

It used to be a `12px` line of mono, and that was the single thing that made
these screens look machine-made. `13.5` is not arbitrary: Fraunces has a
`0.470em` x-height against the mono's `0.516em`, so 12px of mono and 13.2px of
serif read at the same size, and 13.5 rounds that up to give the line some
presence.

Scales the desktop screens are built on: type 10 / 11 / 12 / 13 / 13.5 / 14 /
17 / 20 / 28 / 36, plus half-steps at 9.5 / 10.5 / 11.5 where mono labels needed
them back; space 4 / 8 / 12 / 16 / 24 / 32 / 48; radii 4 for marks, 10 for
fields and buttons, 14 for the few things that still float (popovers,
sheets). Hit targets are 40px and a task row is 48px.

### Layout: the rail and the sheet
The app is one design read at two widths.

Below `md` it is the sheet it has always been: a centred column, `BottomNav`
along the bottom (Today, Tasks, Stats, Record), and the timer dock floating
at the top while a session runs.

At `md` and above a **232px rail** takes over and both of those hide
themselves. The rail carries the five screens, the term's courses under them
in the order they were dragged into, the timer, and Settings. It
collapses to a 64px strip of icons, the choice is remembered, and `PageShell`
mirrors its width so the content recentres rather than staying pinned to a
phone column in the middle of a 1440px screen. Pages that lay themselves out
in two columns pass `wide` to opt out of the phone measure.

Two things follow from the rail. Settings is a **page** on desktop, because a
modal reached from a permanent nav item is a screen pretending to be an
interruption; the sheet is still what phone gets. And the
`FloatingActionButton` is gone: "New task" lives in the page header, and a
timer starts from the row it belongs to, through a popover that takes a
length without a trip to `/timer` first.

### On a phone
Things a phone reader meets that a desktop one does not:
- **320 is the floor.** A small SE, or a newer one with Display Zoom on, is
  320px wide, and every screen has to hold there without clipping. A grid
  that stacks to one column below a breakpoint says `grid-cols-[minmax(0,1fr)]`
  at the base: a bare `grid` makes an `auto` track as wide as its widest
  child, which is how Today once ran 22px off the right edge. Popovers take
  `min(their width, 100vw - 24px)`.
- **No keyboard lines on touch.** A line naming shortcuts ("Space pause · Esc
  back", "Enter starts…") carries `.key-hint`, which hides under
  `(hover: none) and (pointer: coarse)`. Notes does the same with its own
  `.keys` rules.
- **Fields are 16px on touch.** iOS zooms into any field under 16px on focus
  and stays zoomed. Pinch-zoom is allowed, so the viewport is not the fix:
  `globals.css` lifts inputs and textareas set at `text-xs`, `text-sm` or
  13 to 15px up to 16px under `(pointer: coarse)`. A field set larger keeps
  its size.
- **New task names its course.** The sheet on Today opens on the first course
  and, with more than one, shows the term's courses as a row of chips to move
  it, the same chips as the Tasks filter.

### Rules, not panels
Today and a course page draw no boxes. Every section used to be its own
bordered, rounded panel with a fill step behind it, twelve of them on Today
at the same weight, and a box that everything has stops meaning anything.
The page is separated by its own ruling instead, the way a ruled pad is:

- **The head band.** On Today, Up next is the one thing that spans the page,
  with today's hours beside it (from `xl`), since Start is what fills them. On
  a course page the band is the strip of four figures. Nothing frames it: it
  leads by position and size.
- **The fold.** `.fold`, two `line-strong` rules 2px apart, the full content
  width. It closes the head band and is the one heavier line on the screen.
- **The column rule.** From `xl` the page below the fold is two columns, the
  day's work and the readings, with a 1px `line` between them. It belongs to
  the right column, so it ends where that column does. Below `xl` it is one
  column in reading order and the rule becomes a cutoff.
- **Cutoffs.** A section is an eyebrow and a body, ended by a 1px `line`
  cutoff with 28px either side (`divide-y` on the column). The last section in
  a column has none.
- **Rows** are written on the page (`TaskRow` with `ground="page"`) with a
  `line-soft` hairline between them. Their hover wash reaches 15px past the
  column on either side, the way a highlighter overshoots.
- **The course rule.** `.course-rule`, a 20×3 stroke in the course colour set
  before the code: the stripe that ran down a card's edge, turned on its side.
  The code beside it stays in `ink-soft`, since a pastel on the bare page
  reads at 1.5 to 2:1 on cream.

What still floats keeps its edge and warm shadow: popovers, menus, the date
picker, toasts, sheets and the timer dock. With the page unboxed they are the
only edged things on screen, so they read as above it again. Tasks is ruled
this way too (see Tasks: the planner). Stats and the Record are deckle
cards by design (see Stats: the chase, and The Record); Settings is not yet
ruled.

### Hours, not percentages
Nothing in the app draws a percentage bar. A week against a goal is **one
stroke per hour**, filled in the course colour, with a part hour filling its
own stroke from the bottom: `HourStrokes`. "Four of six" is the shape of an
afternoon; "68%" is a number nobody asked for and cannot act on. The label
beside the strokes carries the exact figure, and what is left to go.

### The sitting as a chain
A finished sitting is drawn as a row of marks, `SessionChain`: the blocks as
strokes in the course colour, sized by how long they ran, and the breaks
between them as the thin rules that separate them. Same reasoning as
`HourStrokes` — "two blocks of forty-five with ten in the middle" is the shape
of an afternoon, and there is no percentage anywhere in it to read. Widths are
proportional rather than absolute so the row fills what it is given, with a
four-pixel floor so a short break does not vanish between its neighbours.

It appears twice: under the controls while a break runs, and in the log sheet
at the end, where the rest total sits beneath the focus total in a quieter
mono and the block notes follow it in order. **Rest is reported and never added in.** The hours a course is credited
with are the hours that were worked, and every goal, count and run in the app
reads that one figure.

### The study fan
The timer draws a fan rather than a ring. One stem from the bottom edge
splitting two or three ways at each step, in the course colour, round tips.
Every segment is born at a depth and the session's progress unlocks depths,
so it extends and branches the longer the reader sits. A ring says what
fraction is gone, which is the one thing a reader in the middle of a chapter
has no use for; the fan only ever grows.

The geometry is in `lib/fan.ts` and is deterministic per seed, so a session
that is paused, reloaded or restored comes back as the same shape.
`StudyFan` eases toward its target rather than snapping, and parks the
animation frame once it arrives. Block mode sizes the fan to fill its frame
exactly at the target, which is what makes touching the top edge the
completion; open mode sizes it to the screen and keeps going. `trunkWidth`
and `padTop` are CSS pixels and are scaled by the device ratio internally.

The fan can be taken hold of and pulled. A drag bends it and letting go
springs it back, overshooting once and settling inside a couple of seconds,
and the bend reaches the outer branches a few frames after the stem so the
pull travels out through the tree rather than turning all of it at once.
Sideways is the lean, up and down is the give in the branches. It is a hand
on a branch and nothing else: **the pull never touches progress**, so the fan
comes to rest in exactly the shape it was in before it was touched, and the
clock, the block and the record are untouched by it. The weights live in
`StudyFan` (`SWAY_MAX`, `STIFFNESS`, `DAMPING`), the bending itself in
`drawFan`'s `bends` and `slack`, and a reader who has asked for reduced
motion gets a fan that does not answer a hand at all.

Early in a block there is barely any tree to pull, so the lean is shared out
over the depths that have actually grown. A stem and one split give more than
a full crown does, which is also true of saplings.

Open mode is the **one screen in the app that inverts**, and it does so with
literal values rather than the paper tokens, because on the night ground
`text-ink` is still the daylight ink. Its chrome floats over the fan and only
the chrome takes the pointer: the empty middle of that screen is left to the
tree, so a hand that reaches into it lands on a branch rather than on a sheet
of glass laid over one.

### The break
A block that runs out keeps running, shown as overrun rather than stopped for
the reader. A **break** is a stretch taken by hand, from the timer, and the
sitting carries on as a chain of blocks and the rests between them.

The break does not bring a screen of its own. It borrows the timer's: the same
frame, the same deckle, the same two-line clock. Three things change and
nothing else does.

- **The fan holds.** It does not grow during a break and it never runs
  backwards. Rest is not progress, and a fan that shrank back would be telling
  a reader they had lost the block they just finished. Each *new* block grows
  its own fan from a seed of `sessionId-blockIndex`, so the second block is not
  a replay of the first and a completed block is still a completed block.
- **The eyebrow says so.** `CODE · Break`, in the same 10px uppercase the
  open-mode screen uses for `CODE · Open`. That line is the whole announcement.
- **The two swap slots take the break's version.** The header's `Block / Open`
  marks become the break's `5m / 10m / 15m`, and `NextMarkLine` under the
  controls becomes the sitting's chain. Neither is added to; both are
  exchanged, so the break screen is exactly as dense as the block screen.

The break also asks the one question worth asking there. A sitting's own note
is written at the end, by which point the first block is two hours and two
breaks ago and gets remembered as "algorithms, I think"; a break is five
minutes with nothing in them, and the block that just ended is still there. So
`what did that cover?` sits under the controls as **a line to write on rather
than a field to fill in**: no box, no label, no save, the question itself set
faintly in the serif on the `.hand-underline` rule. Every keystroke is already
on the block it belongs to. It is drawn only once there is a block to attach
it to, because a line that silently swallowed what was typed into it would be
worse than no line. The log sheet reads them back at the end, each block's
length in mono beside what it covered in the serif.

A break that runs past its length turns the digits `warn`, the muted
terracotta, and never `priority` or anything redder. See "No Alarmist
Indicators": a reader who is four minutes over a break does not need to be
shouted at, and the number going quietly warm is enough.

No dialog is raised at the end of a block. A question at the exact moment a
reader has stopped deciding things is the wrong thing to hand them; "Back to
it" is one tap, or the space bar.

### Next Mark, and the sitting on the clock
The progression layer (`lib/progression`) is derived from logged sessions and
tasks on every read and stores nothing. For a long time it read *only* logged
sessions, so the one line it puts on Today and under the timer, "20 minutes to
the next mark on MATH", sat there saying twenty for the whole forty minutes
the timer ran underneath it. A prompt that does not move while you act on it
is a caption.

The sitting on the clock is now folded in as one more session
(`lib/live-session.ts`, `useLiveSession`), marked with a `live:` id so nothing
can mistake it for a record, and the layer is read twice: once from the log,
once with the sitting on top. Every distance moves while the reader sits. The
difference between the two readings is **what the sitting has done**
(`lib/progression/effect.ts`), and it is said in three places and nowhere
else:

- **Under the timer**, on the same line as Next Mark. What has landed is set
  in the ink, what is next a step softer, joined by a middle dot: "a mark
  inked on MATH · today counts · 38 minutes to the next mark on MATH". The
  landed part stays for the rest of the sitting, because it is the sitting's
  own record. The open-mode night screen carries only the landed part and
  never a prompt, since that screen exists to hold one thing.
- **In the margin of the timer**, the course's open page as a tally, `4 / 15`
  in mono beside it. A mark that lands twelve minutes into a block draws
  itself in twelve minutes into the block: `TallyMarks` takes `fresh`, and
  those strokes animate on with `.tally-fresh`, staggered, the way a pen would
  put them down. Both modes carry it — the block frame in its own corner, open
  mode beside the clock — because the page filling is the record of the
  sitting and an untimed sitting fills it exactly as a timed one does. Open
  mode passes `trackColor` for the marks still to come, since that screen
  inverts with literal values and the paper's own rule there is the daylight
  one.
- **On the log sheet**, above the note. The same tally, the same lines, and
  what is nearest after this sitting, so the loop the line opened is closed
  here and opened again in the same breath. This is the one moment a reader
  is guaranteed to look at the sitting, and it used to show a duration and a
  question and not a word about why the duration mattered.

The Today sections (hours, the week's bars, the course list under the day)
read the same augmented list, so the hour strokes fill and "2h
to go" counts down while the clock runs. Anything that *decides* something,
which task is up next, which course has gone quiet, still reads the record.

Two candidates were added to the ranking. The **first mark** on a course is
now named ("15 minutes to the first mark on MATH"); it is the short one
precisely so it can be, and a course with no marks used to get no line at
all. And the **week**: on the day that would make this week count, by either
route, the line says so ("20 minutes makes this week count", "20 minutes
makes it 4 weeks running") in place of "until today counts", because the week
is the only thing on the board that moves the run. It sits at the top of the
ranking beside the course just worked, and the shorter distance decides.

The voice is unchanged: lowercase, factual, no praise. A sitting that inked a
mark is told a mark was inked. It is not told well done.

### What the term teaches
Everything above reads how *much* was studied. `lib/progression/habits.ts`
reads how: how long a sitting and a block actually run, per course and in
all, whether blocks run past what they were set to, when in the day the work
lands, which weekday carries the most, what a break really costs against what
it was meant to, how fast the reading goes on each course, which course opens
the day. Every figure is a median over the reader's own rows and is withheld
until there is enough behind it to be a habit rather than a coincidence
(`HABIT_MIN_*` in `constants.ts`). Nothing here is a target and nothing is
compared to anybody else.

The app uses it in four places, and says it back in three.

- **Next Mark reaches as far as your sitting.** The line names only what is
  within roughly one sitting. That was a fixed fifty minutes; once five
  sittings are in it is the upper quartile of your own, bounded between
  thirty minutes and two hours.
- **The ranking learns.** Every line shown is logged on the device with
  whether a sitting followed within the hour (`log.ts`, which used to write
  this only to a table nobody read). Once a kind of line has been shown six
  times, its follow rate against the others moves it up or down the ranking
  by at most half a tier: enough to prefer the lines you act on, never enough
  to jump a course with an exam over one without.
- **The start popover opens on your length.** Given enough timed blocks on a
  course, it opens on the fixed length nearest to how long your blocks on that
  course run, and says "your MATH blocks run about 35 min" under the choices.
- **The log sheet sets this sitting beside your usual one**, two facts and no
  verb, the same shape as the week beside a typical week.

Said back: **marginalia**. `observations.ts` turns the habits into single
sentences in the Next Mark voice ("your sittings mostly land in the evening",
"MATH runs past the block more often than not · 5 of 7", "a 5 minute break of
yours usually runs to 10") and `Marginalia` sets one of them under the Today
title and under a course's title, in Caveat, rotated, the way the sort note
already sits on Up next. A note about the present moment ("this is usually
your hour", on a day nothing has been logged yet) wins outright; otherwise
the choice rotates by date among the best few, so the margin reads
differently tomorrow. None of it says "you should" and none of it counts what
was missed. A note that stops being true simply goes.

And the **How you study** panel on the Record lays the habits out so they
can be seen filling in: a figure in mono beside a sentence once a habit has
taken shape, a dashed line saying "after 3 more sittings" until it has. That
dashed line is the one place the app says, in so many words, that it gets to
know you as you use it.

#### It reads the whole term, not just the part recorded since

A habits layer that only understood data recorded after it shipped would
greet a student with a term behind them as a stranger, which is the one thing
it must not do. Two sources of history were being left on the floor.

**Sittings with no chain.** A sitting only carries blocks and breaks if it
was timed in continuous mode; one from before that, or reported through the
connector, carries a duration and nothing else. The chains are read back from
`session_segments` on every load. For a while they were written and never read
again, so after a reload every continuous sitting looked like one of these,
and the habits layer quietly fell back to its coarse reading for everyone. Those used to contribute
nothing to any block reading, so a six week account opened the panel to a
column of dashes. A chainless sitting is now read as what the record says it
was — one unbroken stretch — but only when no rest was reported against it,
because rest with no chain means the stretch was broken somewhere nobody
wrote down. They stand in only where there are too few measured blocks to
speak, `blocksFrom` records which happened, and every surface that shows the
figure says "stretches" or "sittings" rather than "blocks" when it is the
coarse reading. Once four real blocks exist the chainless ones stop standing
in, so nobody's reading gets worse as they use the app.

**The impressions the server already held.** `mark_candidates` has collected
every Next Mark impression since the table was created, and the ranking's
device ledger starts the day the learning shipped. The ledger is now seeded
from that table once (`seedLedgerFromServer`), keyed so an impression held by
both sides is one fact, with the device's copy winning because only it knows
about a follow the server has not been told about. Bounded to three attempts
ever, so an account with no Supabase behind it does not run a doomed query on
every load. That table was written before anyone asked for it precisely so
this would be possible.

### Recall: what came out of the hours
Everything above measures the hours going in. Marks, pages, the run, Next
Mark and the habits are all readings of logged time, and a student who has
logged forty hours can still sit an exam having kept very little of them.
Recall (`lib/recall`) is the one part of the app that asks what came out: a
few things a day, brought back to be given with the book shut, at gaps that
widen each time they come back clear. Asking is the studying. Pulling a thing
out of memory does more for keeping it than reading it again, and it tells the
reader the one thing an hour count cannot, which is what they no longer have.

**What gets asked about.** Finished readings, on their own: a task whose kind
is `reading`, or whose title reads as one (it starts with "Read", cites an
author and a year, or names a chapter), comes into recall the day after it was
ticked. Nothing is stored for it until it is first answered, so a term that
started before recall existed arrives with its readings already in it. The
same reading written down twice, once off the syllabus and once when it was
done, is one thing to remember. Anything else is kept by hand: a finished task
from its sheet ("Keep this for recall"), the ticked steps of a concept list
("keep 5 ticked for recall", in the Subtasks header), a line on a course page,
a line on the log sheet, or through the connector.

**The card.** One thing at a time, written on the page under the fold with no
box around it, the course rule before its code: the course code, when it was learned or how
it last went ("hazy 3 days ago"), the thing itself in the serif, and one line
on how to recall it in italic ("the argument, without looking", "do one fresh,
nothing in front of you"). Three words answer it: **clear**, **hazy**,
**gone**, each with a hand mark rather than a colour: a tick, a wave, an open
ring that does not quite meet itself. There is no cross and no red, see "No
Alarmist Indicators": a thing that slipped is why recall exists. The card
never shows an answer, since a recall with the answer in view is a re-read,
and never scores one; the reader knows whether they had it.

After an answer the next card is already there, and one line under it says
what the answer did in the Next Mark voice: "Angell (1912)… · hazy · back
tomorrow". That line carries **undo**, because an answer is one tap on a phone
and a mistaken one moves a thing weeks out of sight, and after a slip it
carries the way back to the material ("reread it", "work on it"), which opens
the start popover on the task the thing came from. A step answered **gone** is
unticked on its task, and the line says so: the tick on a concept list claimed
"I can do this fresh", and the recall just found out it is not true.

**The schedule** is worked out from the answers on every read, never stored.
The first asking is the day after a thing was learned; after that the gap
grows with each clear, 3, 7, 16 and 35 days, steps one gap back in on hazy, and
goes back to tomorrow on gone. An exam within three weeks in the same course,
or a piece worth a fifth of it, pulls in anything whose ordinary gap would
carry it past the exam unasked, to the day before, so it is all asked once
more with the exam in view. Only that: a thing already asked in the few days
before the eve keeps its gap, and weekly work pulls nothing, a problem set
worth a tenth or a quiz worth two per cent, marked as an exam or not, since a
course with something due every week would otherwise have every reading asked
every week and no gap would ever widen. A piece is judged by its weight
whenever it has one; an exam with none counts only when it calls itself a
midterm, a final or an exam. Like Next Mark's
deadlines, the exam steers the order and the timing and never appears in the
copy. A second answer the same day replaces the first, and answers are kept
in date order whichever way they arrive.

**The day's few.** Today asks for five at most, no more than three from one
course unless nothing else is due, slipped things first, then things never
asked, then the clear ones coming round again. A reader with a term of
readings behind them would otherwise open the app to thirty cards at once,
which is a backlog, and the app does not draw backlogs. When the five are
answered the card becomes one line, "That's today's recall.", for the
rest of the visit, and on the next visit the section is simply not there. A
course page asks for the rest of its own on request ("Recall 4 now"), with no
limit, because the reader asked.

**Settled.** One clear recall the morning after is a good sign and not yet a
thing kept; what holds up on an exam is recalling it clear across several
spaced sittings. A thing whose last three answers were clear, each on a later
day, is **settled**, and the course's standing counts it apart from the ones
clear once: "1 settled · 1 clear · 1 hazy · 1 gone · 1 not asked yet". It is
read off the answers, not off how far out the schedule has got, because hazy
steps the schedule back one gap rather than to the start, and clear, clear,
clear, hazy, clear is as far out as three clears without being three clears.

**Keeping never forgets.** Keeping a thing that is already kept does nothing,
and keeping one that was let go brings it back with the answers it had, in the
app and through the connector alike. A reading written down twice is asked
about once, and the second copy's sheet says where it stands rather than
offering to keep it again. Copies count as one when everything after the
citation matches word for word (less "the", and the class session they were
set for), or when one stops where the other goes on, the way a copy ticked off
a syllabus carries the journal and the pages the finished one left out, and
it is the start of only that one; a copy that says nothing after its citation
is the start of every titled one, so it joins only when there is just one.
What goes on after it cannot be a bare number, since "Ch 1" is not the start
of "Ch 1-3". So two chapters of one book, or two papers an author published
the same year, are two readings. The card asks about a reading by its own
words: no "Read:", no "— done with Claude", no "— Session 4". A title that
opens with work, "Practice", "Watch", "Write", is that work and not a reading,
whatever chapter it names. Nothing that
shows or answers what is stored is drawn until the rows have loaded, since
every row is written whole and an answer given against a list that never
arrived would write over a real history. A new line can be kept from the log
sheet at any time, because keeping never writes over anything, and a keep
made before the list is read leaves the list unread and reads it fresh.

**Where it is drawn.**
- **Today**, under Up next and over the day's task lists: the card, the
  day's few. Under Up next rather than over it, because it is a few minutes
  and the day's work is still the day's work.
- **The course page**, under the tasks: the course's standing as uprights
  and a sentence, then every kept thing in the order it comes up, its last
  three answers as marks in the margin ("new" before it has been asked), and
  when it next comes up in the serif. Each row has a "let go" at its end,
  shown on hover on a wide screen and always on a phone, where there is no
  hover to find it with; letting go leaves a line with undo, since a line
  written by hand has nowhere else it could be brought back from. A line to
  write the next thing on sits at the foot, drawn the way the subtask sheet's
  "one more step…" is.
- **The Coming section**, under an exam's row, once per course: the same
  uprights, and "2 of 5 clear" in mono. A countdown on its own says how close
  an exam is; this says how close the reader is to it.
- **The task sheet**: for a finished task, where it stands ("in recall ·
  hazy 3 days ago · next thursday") or the words that keep it ("Bring this
  back into recall" when it was let go); for a concept
  list, the recall loop in the margin of each kept step, where a grip or a
  tick would be, and the last answer's mark once it has one. A reading not
  read yet offers "Questions before you read", which copies a prompt for
  three questions the reading answers, a one-line guess at each first, and
  the questions kept for recall: being asked before reading makes those
  points stick even when the guesses were wrong.
- **The log sheet**: "Worth keeping?", a line to write on under the tags,
  like the break's own question. One thing from the sitting to be asked about
  later. Most sittings leave it empty and that is the expected case.

**The uprights.** A course's standing is one upright per thing kept, in the
same stroke as the tally in its margin. Pressed hard for settled, inked for
clear, broken for hazy, and the paper's own rule for gone and for not asked
yet, which is the part still between the reader and ready. "Nine of fourteen"
is a count of things; a percentage of them would be a number nobody can act
on, see "Hours, not percentages".

**Ask Claude.** A card can only ask; it cannot check, and for a concept
"could you do one fresh?" is best answered by doing one. "ask Claude", on
every card and in a course's Recall header, copies a prompt for a chat that
has the connector on. The prompt is built on three rules: nothing is shown
before the attempt (no answer, no worked example, a hint only when asked for,
and the smallest one); everything is shown after it, so the reader grades
against the right answer rather than against their own sense of it; and the
verdict goes back through `record_recall`, so a quiz in a chat lands in the
same schedule as a card on Today. A course's prompt asks for its due things
mixed rather than in order, since practice that makes the reader decide which
method a problem needs is what holds up on an exam, most of all in
mathematics.

**Before the table exists.** Recall reads finished readings off the task list
with no table at all, so on a database that has not run the latest
`supabase/schema.sql` the cards still draw. An answer has nowhere to go there,
and the card says so once, in a quiet line under it, rather than failing on
every tap.

### Practice papers, plotted by hand
A sitting spent on a practice paper can say what the paper scored. It is the
one number in the record that is an outcome rather than time put in, so it is
only ever what the reader wrote down, never inferred from anything, and most
sittings have none.

**On the log sheet** it is a line under "Worth keeping?", written the same
way: "Scored" as an eyebrow, two short hand-underlined blanks for the score
and what it was out of in mono, and "on a practice paper, if this was one" in
the serif. Nothing is required. Something written there that is not a score
out of something (half of one, more than it was out of) gets one quiet line
saying it will not be kept, once both halves are in or the line has been left
rather than on the first keystroke, and the sitting saves anyway, because the
sitting is the record and the score is commentary on it. A database that has
nowhere to put a score yet saves the sitting without it and says so once. The
sheet scrolls when it is taller than the screen, which with a task and the
marks above it it can be on a small phone.

**On the course page** a **Practice** panel sits under the grade, once there
is a paper to show. Each paper is one short pen mark, a little uphill the way
a hand plots one, at the height of what it scored against what it was out of,
oldest on the left, between a dashed line for full marks and a ruled baseline.
It is deliberately not a bar that fills, which is the percentage bar this app
does not draw, and nothing joins the marks or points an arrow over them: four
papers on four readings are four facts, not a trend. Under the plot, the last
four written out, what the sitting's note said it was, the day in the serif,
and "6.5/8" in mono.

**On a session row**, on the course page and in the Stats journal, the score
sits in quiet mono before the hours, since the hours are what those lists are.

### The chime
The one sound the app makes, beyond the ambient noise a reader turns on
themselves. It is a **struck glass**: three sine partials over a 1.5s
exponential tail, two notes settling downward into a break and three opening
upward out of one. Not an alarm, for the same reason nothing else in the app
raises its voice, and a timer that jolts a reader out of a break has defeated
the break.

The mechanics are in `lib/chime.ts` and matter as much as the sound. The note
that ends a break is put on the **Web Audio clock the moment the break
starts**, because `setInterval` is throttled to roughly once a minute in a
backgrounded tab and stops altogether on a sleeping phone. A locked iPhone
suspends the audio context along with the screen, which no web page can
prevent; `flushChime` notices a note whose moment passed unplayed and rings it
late, and a Notification goes out alongside, which is the only thing that
reaches a phone in a pocket.

Both the chime and the break length are the reader's to set, in Settings.
`BreakLengthPicker` is written in `DayEndPicker`'s idiom: a sentence about
their own habit, with the marks appearing only once the line is touched, so
the panel stays a page of sentences until something is being changed.

### Marks, not chips
The app does not use pills. A capsule with a tinted fill is how software says
"selected"; a page says it with a **swipe of highlighter** (`.hl`, or
`.hl-swipe` with `--hl` set to a course's tint), a **hand-drawn underline**
(`.hand-underline`), a **scribble box** and tick (`.scribble-box` +
`HandCheck`), or a note in the margin (`HandNote`, Caveat). Filters, chosen
courses, reflection tags, timer goals and priority marks all read this way.

The exceptions are deliberate: a **dashed outline** for "there is more you
could add here", and the timer's single filled action.

### The task row, and the way into a task
A task row is 48px and carries the ticked box, the title, the marks and the
due date. The **title is the way in** — a full-bleed button behind the row
would swallow the timer and the menu beside it — so it is the one thing on
the row that opens the task's reading view, where the description and the
steps live. It says so by drawing the same pencil underline as
`.hand-underline` on hover and on focus, as a background rather than that
class's padding, so pointing at a row never shifts it 6px.

Two marks ride in the margin between the title and the course, both mono
because both are digits: what the piece is **worth** or what it is
(`EXAM 20%`, `14pp`, `5%`), and how far through its **steps** it is (`1/4`).
The steps count draws only when a task has steps, and it is the only thing on
the row that says so — without it a task with four steps reads exactly like
one with none, and nobody opens it to find out.

At the right edge the row carries the timer: a play mark that starts one, or,
on the row a session is already running, the elapsed time and a control that
holds it and lets it go again. That control draws **only when it is given a
handler**, which is the rule that matters — it used to draw whenever a timer
ran and call nothing, so it was a live-looking button that did nothing when
pressed.

### Keys on the task list
The list is walkable without a pointer: `↑ ↓` move a cursor, which the row
draws as an ink ring rather than a fill; `X` selects the row under it and
opens the bulk bar; `Enter` opens it; `N` starts a task, `S` changes the
order, `⌘Z` undoes the last bulk move, `Esc` closes whatever is in front. The
hint under the list names exactly these and nothing else. It used to offer
`X select` and `⌘Z undo` with neither bound to anything, which is a worse lie
than saying nothing, and the help sheet behind `?` listed a third, different
set.

### Tasks: the planner
`/tasks` used to be a bordered table with column heads and grey band strips,
the one screen that looked like a spreadsheet. It is now a planner spread.

- **The fortnight.** Across the top, the next fourteen days as a strip of
  columns: the weekday as an eyebrow, the date in mono (today's under a
  highlighter swipe), and every open task due that day as a 7px bar in its
  course colour, stacked from the foot up. An exam is a hollow ring in its
  course colour above the bars, because an exam changes what the days before
  it are for. More than five bars on a day becomes `+n`. Weekends sit on a
  faint `paper-2` wash, each Monday gets a `line-strong` rule, and anything
  past its date piles up in a **Late** column at the far left in `warn`. The
  busiest day, if it has three or more, gets "busy" in Caveat in the margin.
  The strip draws the load rather than the items: it answers "is Thursday
  bad" before the list answers "what is on it". Pressing a day narrows the
  list to that day, a line under the controls says so and lets it go, and
  pressing the day again does the same. The fold closes the strip. On a phone
  it scrolls sideways as an `.app-scroll` strip.
- **The controls** are marks, not dropdowns. The band filter is the
  highlighter swipe it always was; each course is its `.course-rule` and
  code, the chosen one swiped in its own tint; how the list is cut is two
  serif words, "day" and "course", with the chosen one hand-underlined; and
  the order says what it is ("what matters", "by date", "newest") and changes
  on a press or `S`.
- **The bands.** By day, the list reads Overdue, Today, then each of the next
  seven days by name (Tomorrow, then Friday, Saturday...), then Later and
  Open ended. By course, one band per course. Each band holds its name in a
  168px left margin, serif 20px with the date or course name under it in
  italic, and on desktop that margin is **sticky** while the band's rows go
  past, the way a diary keeps the date at the head of the page. Bands are
  ended by the page's `line` cutoff; nothing is boxed. Overdue sets its name
  in `warn` and carries "n to catch up" in Caveat. Today stays on the page
  when nothing is due, reading "Nothing due. A clear day." Rows are
  `TaskRow` on `ground="page"`.
- **No date repeated.** Under a heading that already names the day, a row
  passes `hideDue`: on a phone the date column goes and the title gets its
  width, and on desktop the column stays empty so courses still line up down
  the page.
- **Adding into a band.** Every band a task can land in ends with a dashed
  `+` line ("add for Friday", "add to CS 200", "add without a date"). It
  shows on hover on desktop and always on a phone, and opens the draft right
  there with the date or course already filled in. New task and `N` still
  open it at the top of the list.

### Keys for the running clock
Two more, and they work from every screen rather than from the timer.

A sitting is started from a row on Today or Tasks and the reader then goes
back to their book. The timer's own keys (Space, B, F) only exist on the
timer screen, which is the one screen a reader mid-chapter is least likely to
be looking at, so stopping meant finding the dock with a mouse. `P` and `K`
reach the clock from wherever they are: `P` holds it or lets it go, and means
**back to it** while a break runs; `K` finishes the sitting and the log sheet
opens on the spot, because `PageShell` already carries one on every tab. On
the few screens that carry neither sheet nor shell, `K` opens the timer
instead, so the key never ends a sitting with nothing to show for it.

`TimerHotkeys` is mounted in the root layout and **binds nothing at all
unless a sitting is running**, which is the same rule the task list follows.
It stands down for a held key, for anything typed into a field, and for any
chord: `⌘P` is print and `⌘K` is the browser's, and a chord belongs to
whoever the reader thinks they are talking to. The dock's two buttons name
the keys in their tooltips, and the help sheet behind `?` lists them only
while a sitting is running, for the same reason it lists nothing else that
is not bound.

### Rearranging by hand
Four lists let the reader set their own order, and all four are the same
component, `ReorderList`: the **course list on Today** (carried as a `row`,
since its entries are lines on the page), the
**course panels in Settings**, the **subtasks inside a task**, and the
**pieces of a marking scheme** on a course page. It is written against
pointer events rather than a drag-and-drop library, because a carried thing
here has to keep looking like a sheet of paper.

What it looks like is fixed by two choices.

`shape` is what is being carried. A **sheet** is a card the size of a hand:
the grip is two pencil strokes across its top edge, and the space it will
settle into is outlined with a deckle rule. A **row** is a line in a list:
the grip is two strokes out in the margin beside it, clear of the fields, and
the landing space is a plain dashed box. Either way the carried thing lifts
with a warm `drop-shadow` that follows its own cut corners — the tone the
sticky note casts — tilts under half a degree, and everything else steps
aside rather than rearranging under it.

`carry` is what lifts it, and it follows from what the item already does. A
card that is a link lifts on a **press**: a mouse must travel 6px, a finger
must rest 320ms without wandering 9px, so a tap still opens the course and a
swipe still scrolls the page. Its grip only appears under a cursor, which is
honest, because on a touch screen nothing hovers and the press is the gesture.
An item made of text fields lifts from the **grip** alone, and that grip stays
faintly drawn at 45% so a finger can find it.

Both paths have a keyboard twin: the grip is a real button, and up and down
arrows move the item one place, with every move said out loud through a
polite live region.

### Notes: the reader

`/notes` is Markd folded into the app, a reader for long study notes written
in markdown. It sits in the rail and the bottom bar between Courses and Stats.
It has three states on one route, driven by the query string: the shelf
(`/notes`), a note (`?n=id`) and the editor (`?n=id&edit=1`, `?new=1`), so the
back button walks out the way you came in.

- **The shelf** is ruled like Today. The standfirst carries the count, the
  reading time and how many checks are waiting to be revisited. Under the
  title, the note last read leads the page the way Up next leads Today:
  "Where you left off", its title large in the serif, the section it was left
  in, the opening lines of that section, and **Keep reading** / **Focus**.
  Beside it, the note's sections as strokes, the ones behind the reader inked
  in the course colour, and "~ 6 min left" in Caveat. Then the fold, then the
  tools: course filters and Recent / A–Z as highlighter marks (never tabs),
  and a search that looks through every note and shows the words around the
  hit. Rows are written on the page with a `line-soft` hairline between them,
  split into "This week" and "Earlier" when sorted by recent. Each note
  gets a pastel from the course palette, picked from its id, drawn as the
  same 3px stripe a course carries in the rail. On the right of a row, what
  is left to read in mono ("4m left"), a hand tick once it has been read
  through, and on hover the way into focus and delete. The list walks with
  `↑ ↓`, `Enter` reads, `F` focuses, `/` searches, and the hint at the foot
  names exactly those. How far a note has been read and which note was last
  read stay in the browser, with the scroll position.
- **A note** is set in the serif at 17px, with its own `#` title as the
  screen title and the fold under it. Callouts (`> [!DEF]`, `[!EXAM]`,
  `[!TRAP]`, `[!CHECK]` and the rest) are a `.course-rule` tab and an
  eyebrow on a faint wash of their pastel, not a bordered box. Tables are
  ruled top and bottom with `line-strong` and hairlines between rows.
- **The contents column** (from 1280px, a sheet below it) follows the section
  being read with a highlighter swipe and dims the ones behind it. How long
  is left is a line of Caveat marginalia, never a bar.
- **Checks** hide their answer until asked, then take "Got it" or "Not yet".
  They are drawn as strokes, one per question, the way hours are.
- **The AI prompt** is a sheet holding the exact format rules. A reader copies
  it into their own chat with a summary, and pastes the answer back onto the
  page, which makes a note of it (one outer code fence is peeled off).
- Paper tone and heading font come from Appearance. The reader only owns text
  size and column width, in the `Aa` popover.

#### Focus

`?n=id&focus=1`, from **Focus** on a note, from the shelf, or `F`. The note
and nothing else: one sheet on the desk, portalled over the rail, the bar and
the timer dock, and under the log sheet and the toasts so a sitting can still
end on top of it. `Esc` or `F` leaves, and the page behind opens on the
section focus was on rather than on a pixel offset, since the two are laid
out differently.

- **The sheet.** `paper` a step off the desk, a deckle corner, the warm
  shadow a floating thing keeps, the edge of a second sheet under it, and a
  faint rose margin rule down the left the way a ruled pad has. The prose is
  a size up from the reader. On a phone it drops the sheet and is the page.
- **The spotlight** (`D`, on by default). The section under the reading line,
  about a third of the way down, keeps its ink; every other section lets it
  down to a fifth, and comes back up under a pointer. It is written onto the
  DOM as `data-lit`, never state, so a scroll does not re-render the note.
- **The bar** goes away as the reader scrolls down and comes back for a
  scroll up, a moving pointer or a Tab into it. It carries the course code
  and the section being read in the serif, the clock, and four quiet tools:
  spotlight, lamp, `A A` for text size (`−` / `+`), and full screen. With a
  sitting running the clock is that sitting in mono, beside a dot in the
  course colour pulsing on `tick`; without one, a note on a course offers
  "Time this", which starts one.
- **The lamp** (`L`) puts this note under the night paper without changing
  the app, through `paperToneStyle` in `lib/preferences.ts` set on the focus
  root. A reader already on night paper gets daylight instead.
- **The margin.** From 1100px, one stroke per section down the left of the
  desk: long and inked for the one being read, muted behind, the paper's rule
  ahead. Their names come up under a pointer and a click goes there. `← →`
  walk the sections; up, down and space are the scroller's own.
- **The foot.** "3/7" in mono on the left, "~ 6 min left" in Caveat on the
  right. At the end, the hand tick, "that's the lot", how long the reader sat
  with it, and the next note on the pile, which `]` also opens in focus.

#### Studying a note, and the reader's pace

A note can be **studied under a task**. "Study this" (in the reader's head,
and as "Study" in the focus bar) opens a popover that either names the task
the note is under, with Start and Unlink, or offers the ways to give it one:
a course picked with highlighter marks, "New reading: *title*" (a `reading`
task made from the note on the spot), the open tasks already on that course
(readings first, then any whose title shares a word with the note's), and
"or just time it, without a task". Every path ends in the usual start
popover, so the block length is chosen the same way it is from a task row.
The link is `notes.task_id`, `on delete set null`, so deleting the task
leaves the note alone. A task with a note shows it on its sheet: the title,
where it was left and how long is left, **Resume** into the reader and
**Focus**, which picks up in the same section.

**Resuming.** A note opened partway through goes back to where it was left
and says so in the slip, "Picked up in *section*", with **Start from the top**
beside it. Focus opened from the shelf or a task does the same, with the
same offer in a chip at the foot of the desk.

**A read-through is timed only from the top.** With a sitting running on the
note's task and the reader at the top of the note, a run begins; reaching
the end keeps it as `{ seconds, words, at }` in `notes.reads`. The time is the
sitting's focus time, so a break in the middle is not counted as reading. A
run started partway down never begins, one whose sitting ends before the
note does is dropped, and one faster than 600 words a minute or shorter than
a minute is thrown away as a skim. While a run is going the standfirst and
the focus foot say "timing this read" and nothing else.

**The pace is the reader's own.** `readingPace` in `lib/notes/reads.ts` takes
the median words a minute over every timed read once there are two, per
course once a course has two, and every "min left", "min read" and
"of reading" in Notes goes through `minutesForNote`: a note's own last read
scaled to its current length, then the course pace, then the reader's, then
200. The reader's standfirst says which it is ("read in 14 min last time",
"~12 min at your pace", "12 min read"). Under the shelf, **Your reading** says
it back in one line of serif with the figures in mono: words a minute, how
long a read-through takes, how many are behind it. Before any read is timed
that line says, once, how the minutes become theirs.

Notes live in the `notes` table in Supabase, owned by the student and not
scoped to a semester; a note linked to a course takes the course's colour for
its stripe and its code in the standfirst, and one sent by an assistant over
the connector says "From your assistant" there instead of "Edited". The self-check
results are stored on the note, so the strokes follow the student between
devices and fill in when Claude quizzes them through `record_note_checks`.
Only the reading position, the draft in progress and the `Aa` choices stay in
the browser. Notes written before this, when they lived in localStorage, are
carried up into the account the first time the shelf loads. Everything the
reader draws lives in `app/notes/notes.css`, scoped under `.notes`.

### Courses: the shelf

`/courses` is the term as a bookshelf, laid out as a grid of books standing
face out. It used to be a bordered table of rows, and that was the one screen
that still looked like an admin panel.

- **A book** is a `.book-cover`: the course's tint (through `resolveTint`) as
  the board, a 10px spine down the left in the course colour, and a crease
  just inside it at a third of the colour's strength. The only depth is a
  `line` hairline on the fore edge and the foot, never a shadow. The code
  sits at the top as an eyebrow in `ink-soft`, the name in the serif under
  it, and the week's `HourStrokes` at the foot with the mono figure over them.
- **Heights vary** by a few percent, picked from the course id so a book
  keeps its height, and the row is bottom-aligned so they stand on the
  plank rather than hang from a line. Pointing at one lifts it 6px, the way
  you tip a book off the shelf.
- **The plank**, `.shelf-plank`, is the fold thickened into a board: two
  `line-strong` rules with a `bg-tint` wash between them, the full content
  width, one under each row.
- **The label on the plank** is what a library would write there: what is
  open (serif italic, overdue in `warn`), then the term's hours in mono and
  when it was last sat.
- **The last slot** is a dashed book, "Add a course", which opens the
  catalog sheet on Today. It is the dashed-outline exception from Marks, not
  Chips, and it replaces the header button this screen used to carry.
- Two books a shelf on phone, three from 560px and on the narrow desktop
  beside the rail, four from 1024px and five from 1280px.

### Stats: the chase

Stats used to be a page of totals: what happened, printed, and an Export CSV
button in the masthead. Totals say what the term was; nothing on the page said
what the next sitting would change, so there was nothing to come back for. The
export is in Settings, where a spreadsheet is looked for, and the masthead
carries the hours alone. Everything below is read off the logged sessions on
every render (`lib/stats-reading.ts`) and nothing is stored.

- **The masthead figure rolls up** to the term's hours when the page opens
  (`useCountUp`), and under it a line of Caveat sets the hours beside
  something anybody can picture: "that's 5 runs of the extended lord of the
  rings". Only comparisons that land between one and a few dozen are
  offered, and the pick turns over with the date.
- **The chase row**, three cards dealt onto the page one after the other
  (`.deal-in`), under the ledger line:
  - **You vs last week** (`PaceRace`). Both weeks as running totals on one
    ruled plot, last week pencilled in whole, this week inked over it up to
    today. Where the two stand today is joined by a short dashed stroke, so
    ahead or behind is a distance before it is a figure. The headline is the
    gap ("29m behind", "1h 10m ahead", "neck and neck") and the line under
    it is what closes it.
  - **The next line** (`NextMilestone`). The next round number in the
    term's hours, named in the serif ("half a century", "the century"),
    counted out as `TallyMarks` from the last line crossed. Never more than
    twenty five marks, so a long stretch has each mark stand for more than
    an hour and the margin says how much. Not a bar.
  - **Your day, as a clock** (`StudyClock`). Midnight at the top, one stroke
    per hour as long as the time that has landed in it, the usual three hours
    inked and the rest pencil, a `warn` hand pointing at now. Under it the
    kind of studier those strokes make ("an evening regular", in the serif
    italic) with one more thing in Caveat ("and a weekend warrior"). It is
    read off `habits.peak`, so it is withheld until the habits layer has
    enough to call it, and says how many sittings are left until it does.
- **Records to beat** (`PersonalBests`), at the head of the aside: longest
  sitting, biggest day, best week, longest run, each with a dotted leader to
  the figure and, under it, the one in progress that could take it ("this
  week so far 3h 42m · 7h 13m to beat it"). A record set inside the last week
  gets a `warn` stamp that comes down on the page (`.stamp-down`), the one
  moment on Stats allowed to be loud.
- **The charts arrive.** The heatmap inks in a week at a time from the
  oldest (`.heat-in`) and rings today; the week's bars fill up from the rule
  (`.bar-grow`); the course rules draw (`.rule-draw`) and their hour counts
  roll up.

All of it fills backwards only and holds no transform once landed, and
reduced motion drops the delays with the durations.

### The Record: the term as a ledger

`/stamps` (the Record tab) is laid out the way Stats is, since the two are
read side by side. It used to be three plain rounded boxes with eyebrow-only
headers, the one screen that still looked like a settings panel.

- **Masthead.** Standfirst (pages bound, impressions struck) in the serif
  italic with the term-week `Stamp` beside it, the title at the screen-title
  tier ("The *record*"), and the Next Mark line under it with its tally glyph.
  This copy does not log an impression: Record is where the line is looked
  up, not where it is offered. On the right, the one figure the page is
  about: weeks running, in mono, with a Caveat note that says "best is N" or
  "your longest yet", so a broken run never hides the best.
- **The ledger line**, the same newspaper rule as Stats: marks inked, pages
  bound, best run, margin days banked.
- **Course pages** (deckle card, serif heading). Each row is a link to the
  course: course rule and code, the name in the serif, the page's
  `TallyMarks` drawing themselves in on open, the distance to the next mark
  and to binding, and the bound pages drawn as the edge of a stack of ruled
  sheets. Ink fading is unchanged. The header says what a page is in hours
  ("15 marks, about 10 hours, binds a page"), and a "how pages work"
  disclosure at the foot of the card (`PagesExplainer`, the same fold as
  "what makes a week count") says in plain words what a mark is in minutes,
  what binding does, and that bound pages feed the Pages bound impression and
  nothing else. It shows before any course exists too, since that is when
  the question gets asked. The course screen's panel carries the same fold,
  with the time to the next mark and to binding in mono figures.
- **The run** (aside). Weekday initials over the grid, the week in progress
  outlined, a `HandCheck` in the margin for a week that counted, and a legend
  for studied / margin / blank. The rules for what counts sit behind a
  "what makes a week count" disclosure, since they are looked up once and the
  grid is read daily.
- **Within reach** (aside). The first four Next Mark candidates. Today and the
  timer say one line and go quiet; this is where the rest of the board is.
- **How you study**, full width, figures on the left, by-course and what the
  ranking has learned on the right from `lg`.
- **Since you last looked.** Record remembers, on the device, what it
  showed on the last visit (`lib/progression/visits.ts`, a convenience like
  the Next Mark ledger, never part of the record). On arrival it diffs the
  logged record against that and, when something landed, tapes a note to the
  top of the page: marks inked by course, pages bound, rungs struck, weeks
  added to the run, with the figure in mono and the header in Caveat. Facts
  only, and nothing about what was missed; a visit with nothing new shows
  nothing. Only the marks inked since draw themselves in, and an impression
  struck since gets the `warn` "New" stamp brought down (`.stamp-down`), the
  same one loud moment Stats allows a new record. The baseline is rewritten
  on every visit, so the news belongs to that visit.
- **The dot.** While there is news, the Record item in the rail and the
  bottom bar carries a 6px `ink` dot, never a count and never red. It reads
  the logged record, not the sitting on the clock, and clears the moment the
  page opens. This is the reason to come back to the Record.
- **Impressions** are rubber stamps on one deckle sheet, drawn in SVG as
  the mark each leaves: the ladder's name set round the rim like a postmark
  (uppercase sans on a `textPath`), its own emblem and pastel (hours peach,
  run rose, pages lavender, breadth sky, sitting clay, early mint, days
  sage), the count it keeps in mono in the middle, an inner ring filling
  toward the next rung, and one pip a rung along the foot, struck ones inked.
  A stamp under way is inked in its colour over the colour's tint, roughened
  by a faint displacement filter so it reads as pressed rubber; a finished
  one is double ringed and struck off the square; one not started is a
  dashed pencil outline. Each sits at a steady tilt picked from its id. The
  one furthest toward its next rung is drawn large at the head of the sheet
  as **Closest to striking**, with a ruled line between where the count
  stands and the next rung. Under every stamp, one line in words says what
  the next rung takes ("17 more hours for the 50h stamp"). Only the next rung
  is ever named. A stamp struck since the last visit comes down with
  `.stamp-down` and wears the `warn` "New" stamp.

### Buttons
Two shapes, not four:
- **Page CTA**, full width, `min-h-[56px]`, `rounded-2xl`, `text-[15px]`.
- **Sheet action pair**, `flex-1`, `py-3.5`, `rounded-[10px]`, `text-sm`,
  matching the radius of the fields above it in the same sheet.

Desktop adds a third, which is the same idea at pointer scale: a **header
action** at `h-10`/`h-11`, `rounded-[10px]`, `text-[13px]`, bordered in
`line-strong` or filled for the one primary action on the screen.

Solid `bg-primary` fill belongs to the one primary action on a screen. A
*selection* is never a solid fill: it is a `bg-tint` wash with an ink border
or an accent tick (see `SectionPicker`).

### Density
`Cozy` / `Comfy` / `Compact` in Appearance set `--density-gutter`,
`--density-gap` and `--density-section` on `:root`. Anything that wants to
breathe with the reader's choice should use those rather than a fixed px
value. `Comfy` is the shipped middle at a 22px gutter.

## 🖼️ Textures & Custom UI Elements
- **Radial Mesh Gradients**: The global background (`globals.css`) incorporates very subtle radial gradients `rgba(180, 170, 140, 0.10)`. This uneven lighting effect breathes life into the background, making the "paper" feel slightly textured and organic rather than a flat digital canvas.
- **Notebook Range Sliders**: The native `<input type="range">` elements are deeply customized to resemble tactile physical knobs sitting on top of notebook lines.
- **Clean App Chrome**: Scrollbars are entirely hidden across the application, achieving a seamless, native-app feel that doesn't distract the user.

## 📜 Scrolling
Scrolling is the page moving under a hand, so it is kept quiet and physical:
- **The page has weight under a wheel.** `SmoothScroll` (mounted in the root layout) takes the wheel and trackpad over for the page: each notch moves a target and the page glides after it, closing a fixed share of the distance every frame, so it eases to rest instead of jumping 100px and stopping dead. Touch is left to the platform's own momentum.
- **Nothing repaints under a scroll.** The paper glow is a fixed `body::before` layer, not `background-attachment: fixed` on body, which forced a full-viewport repaint every frame. The doodle canvas is `display: none` until there is ink on it, so its blend mode is not composited over the page while it scrolls. `SmoothScroll` decides who owns the wheel once per gesture instead of walking computed styles on every event.
- **The ends give.** Pushing past the top or the bottom pulls the page's content (`[data-scroll-content]` in `PageShell`, so the rail, the dock and the bar stay put) up to about 96px against rising resistance, and it springs home once the wheel stops. A flick that reaches the end mid-glide spends what is left of itself as that pull. On touch the same thing is the platform's own rubber band: `html` sets `overscroll-behavior-y: contain`, not `none`, which still stops pull-to-refresh but keeps the bounce.
- **Only the page.** Sheets, the rail, dropdowns, sideways strips, anything inside a fixed layer, the whole page while something is modal or the body is locked, pinch zoom and sideways swipes all keep the browser's scrolling. Reduced motion gets the browser as it is. A scroll the component did not make (keys, the scrollbar, a link, a route change) is followed, never fought.
- **Sections settle in from below.** `.settle-in` on a column (Today's two, the course page's two, Stats' two) lets each child rise 14px and fade in as it comes up past the fold, on the app's `0.2, 0.7, 0.2, 1` curve. It is a scroll-driven animation (`animation-timeline: view()`), so it follows the scroll exactly rather than playing on a clock, and runs backwards if the section is scrolled back off. What is already in view on arrival does not move. It fills backwards only, so a section that has fully arrived carries no transform and no stacking context, and the popovers inside it still sit over the section below. Browsers without view timelines, and anyone who asked for reduced motion, get the page still.
- **body clips, it does not scroll.** `overflow-x: clip` where supported, not `hidden`, so body is not a scroll container and a view timeline binds to the viewport that actually scrolls.
- **Jumps glide.** `scroll-behavior: smooth` on `html`, with `data-scroll-behavior="smooth"` on the root so Next drops it during route changes and a new page still opens at its top. Code that scrolls per frame (the drag autoscroll in `ReorderList`) asks for `instant`.
- **Nothing lands under the chrome.** `scroll-padding` keeps a jump or a Tab stop clear of the notch and, on phone, of the bottom bar.
- **Every inner scroller stops at its own end.** Sheets, dropdown lists, the contents column and every `.app-scroll` strip use `overscroll-behavior: contain`, so a flick inside one never drags the page behind it and a sideways strip never turns into a trackpad swipe back.

## 🎬 Micro-Animations
Movement in the app is soft and deliberate:
- **`slide-up`**: A smooth `0.26s` entrance using a custom cubic-bezier curve (`0.2, 0.7, 0.2, 1`), ensuring panels and modals float in weightlessly.
- **`fade-in`**: Subtle opacity transitions for dynamic content.
- **`tick`**: A slow, `2.4s` pulsing animation used during active study timers to indicate progression without frantic or stressful ticking.
- **`settle`**: `0.34s` on the same curve, a 4px rise and fade. Whatever swaps in place on the timer screen (focus controls for break controls, the clock face going from block to rest, the "· paused" note) settles in with it rather than cutting.
- **Pause** is the timer screen going quiet, not a switch: the clock lets its ink down to half over `480ms`, the fan loses colour over `700ms`, and the pause button crosses its glyph and word over (both are always rendered, stacked, so the button never changes width). Resume runs the same way back.
- **Presses** on the timer's buttons give a `0.97` scale on `:active`. Small enough to feel, never enough to read as a bounce.
- **Up next arriving.** The task body is keyed on the task, so when it changes (Done, Tomorrow, or the rule switched) the new one settles in, its course rule draws left to right (`.rule-draw`, `0.5s`) and a highlighter swipe in the course's pastel is pulled under the title a beat after (`.hl-draw`, `0.7s`). Done and Tomorrow first let the old task go with `.lift-away`, a `0.22s` fade and 6px lift, so the next one comes up into a space instead of replacing it in the same frame. The handwritten rule note settles when it is switched.
- **Up next is live.** Its meta line carries the time already put into the task (mono digits) and when it was last sat. With a timer running on it the line says "on the clock" beside a dot in the course colour pulsing on `tick`, and the figure counts up with the sitting.
- **Stats arriving.** Cards dealt in (`.deal-in`, `0.55s`, a 12px rise off a `-1.2deg` tilt), the heatmap inking in (`.heat-in`), bars filling from the rule (`.bar-grow`), lines drawn with a pen (`.ink-draw`, any path with `pathLength=1`), dots popping on (`.pop-in`), and a record stamped down (`.stamp-down`). See "Stats: the chase".
- **Every screen arrives.** `PageShell` sets `.page-in` on the content column: a `0.34s` 6px rise and fade on the app's curve, so moving between tabs no longer cuts in whole while Stats and the timer each had an entrance of their own. The rail, the bar and the dock hold still around it. Backwards fill only, so `main` carries no transform once it has landed and a sheet inside it is still placed against the viewport.
- **Sheets leave the way they came.** Every bottom sheet used to slide up and then vanish in a frame. `useLeaving` (and `<Leaving>` for a sheet written inline as `{value && ...}`) holds the last value on screen for `220ms` while `.sheet-leaving` fades the scrim and drops the panel 32px. The panel must be the wrapper's last child. A value that comes back mid-exit cancels it.
- **A tick is written in.** Ticking a task on a row fills the box with a small press (`.check-press`) and writes the `HandCheck` in a beat later (`drawn`, `.check-draw`), and the row fades to its done opacity over `300ms`. The toggle itself lands `420ms` after the tap, because Today's lists drop finished work and took the row away in the same frame it was ticked, so the check was never seen. Leaving the screen in that moment still saves it. A task that loads already done is drawn done, with no animation.
- **Hour strokes fill up.** `HourStrokes` fills each stroke from the bottom when it is first drawn, one hour after another (`.stroke-fill`, `45ms` apart), and a part hour rises in place while the clock runs. `HourTicks` in the rail does not, since the rail is redrawn with every screen.
- **The tab mark draws.** The rule under the current tab in `BottomNav` is drawn out from the middle as the screen changes (`.nav-mark`), a tab gives a `0.94` press, and the Record news dot pops on (`.pop-in`) in the bar and the rail.
- **Finish and log** holds the last frame of the sitting still behind the log sheet as it rises. Stopping empties the timer, and a block screen with no target left used to flip to open mode's night paper at 00:00 under the sheet.
