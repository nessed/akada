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
fields and buttons, 14 for panels. Hit targets are 40px and a task row is
48px.

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
- **In the margin of the block frame**, the course's open page as a tally,
  `4 / 15` in mono beside it. A mark that lands twelve minutes into a block
  draws itself in twelve minutes into the block: `TallyMarks` takes `fresh`,
  and those strokes animate on with `.tally-fresh`, staggered, the way a pen
  would put them down.
- **On the log sheet**, above the note. The same tally, the same lines, and
  what is nearest after this sitting, so the loop the line opened is closed
  here and opened again in the same breath. This is the one moment a reader
  is guaranteed to look at the sitting, and it used to show a duration and a
  question and not a word about why the duration mattered.

The Today panels (hours, the week's bars, courses against their goals, the
course cards) read the same augmented list, so the hour strokes fill and "2h
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

### Rearranging by hand
Four lists let the reader set their own order, and all four are the same
component, `ReorderList`: the **dashboard's stack of course cards**, the
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

## 🎬 Micro-Animations
Movement in the app is soft and deliberate:
- **`slide-up`**: A smooth `0.26s` entrance using a custom cubic-bezier curve (`0.2, 0.7, 0.2, 1`), ensuring panels and modals float in weightlessly.
- **`fade-in`**: Subtle opacity transitions for dynamic content.
- **`tick`**: A slow, `2.4s` pulsing animation used during active study timers to indicate progression without frantic or stressful ticking.
