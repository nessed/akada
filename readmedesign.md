# Akada. UI & Aesthetic Design Choices

This document outlines the core visual philosophy, UI elements, and styling choices behind the Akada Study Planner. The app is designed to feel like a "quiet place to study"-minimalist, organic, and distraction-free, mimicking the tactile feel of a high-quality physical notebook.

## 🎨 Visual Philosophy & Aesthetic
Akada's design moves away from the stark, high-contrast flat designs typical of modern software. Instead, it leans into a **warm, organic "notebook" aesthetic**. It feels tangible, calming, and personal, utilizing soft paper tones, ink-like typography, and soothing pastel accents.

### 🚫 What We Strictly Avoid (The Anti-Patterns)
To maintain the soul of the app, we actively reject standard SaaS UI/UX "best practices" that add noise, urgency, or digital clutter. If an interface element wouldn't look right drawn with pen and highlighter on premium paper, it doesn't belong here:
- **No Heavy UI Chrome:** We avoid thick borders, solid-filled high-contrast buttons (except for the single primary timer action), and harsh drop shadows. Elements should feel like light pencil marks or faint highlighter on a page.
- **No Over-Explaining, after the first time:** We avoid explicit, wordy labels (e.g., "0.0h logged out of 9h goal") on the screens a reader lives in. But a quiet screen only works for someone who already knows it, and for a long time this rule was read as "never explain anything", which left every new reader to find the app out by poking. A thing is explained **once, in place, the first time a reader meets it**, and then it goes quiet for good. See "Explained once".
- **No Clutter & Cramping:** Generous whitespace is a strict requirement. We do not compress or compact elements just to fit more on a screen. 
- **No Alarmist Indicators:** We avoid bright red badges, aggressive error alerts, or high-contrast strikethroughs. For example, completed tasks gently fade, and overdue items use muted tones rather than screaming for attention.
- **No Mono Kicker Over a Serif Heading:** A tiny monospaced line stacked above a large serif title is the shape every generated app arrives in. Metadata above a screen title is a standfirst and is set in the serif. Mono is for digits.
- **No Generic Dashboard Components:** We avoid typical software widgets like text-heavy progress bars, thick tab underlines, or loud "empty state" placeholder blocks.

## 🖌️ Color Palette
The color system is heavily curated to resemble premium paper, ink, and mild highlighters.

### Core Foundation (Paper & Ink)
The foundation is not one palette but four, the **paper tone** a reader picks
in Appearance, plus the `Night` paper. **The app ships on `Night`**: a new
reader, or anyone whose stored record names no tone, lands on the dark page,
and the manifest's `theme_color` is its ground. `Paper`, `Warm`, `Stone` and
`White` are the daylight alternatives, one tap away in Appearance. Every value
below is the `Paper` tone, the reference the others are described against. The
authority for all of them is `PAPER_TONES` in `lib/preferences.ts`; `Paper` is
mirrored into `:root` in `globals.css` only as the no-script fallback, since
the bootstrap script writes the chosen tone (night by default) before first
paint.

- **Backgrounds (`bg`, `bg-tint`, `paper`, `paper-2`, `desk`)**: `#F5F1E8`,
  `#EDE7D8`, `#FBF8EF`, `#F7F3E6`, `#E8E2D5`. `desk` is what the page lies on
  at desktop widths, under the rail (see Layout). Warm cream throughout, cards are a lighter cream, not
  white. True `#FFFFFF` appears only in the `Stone` and `White` tones.
  `bg-tint` is the wash a selection, a hover or a progress track is filled
  with. Most of those are drawn on a `paper` card
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

### The icon

The brand glyph is the ribbon bookmark with Fraunces' italic A in it, the
same mark `AkadaMark` draws in the app. The icon files draw it solid: a ribbon
of ink with the A cut out of it, because a 1px outline and a thin letter turn
to mush at the 16px a browser tab gives it. The A is the real Fraunces glyph
as an outline, never `<text>`, so the tab does not fall back to Georgia.

- `public/icon.svg` is the **tab favicon**. Transparent, and it follows the
  browser's own scheme through `prefers-color-scheme`: an ink ribbon on a
  light tab strip, the night paper's cream ribbon on a dark one.
- `public/app-icon.svg` is the **installed-app tile**, full bleed on the night
  ground (the tone the app ships on), with the mark inside the maskable safe
  zone. The PNGs are rendered from it by `scripts/build-icons.mjs`; rerun
  that after changing it.

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
along the bottom, and the timer dock floating at the top while a session runs.
**The bar never changes on the reader**: Today, Tasks, Courses, Study, Stats,
always in that order. It used to put Courses in the fifth slot until the
first session and then swap it for the Record, so the tab a reader had just
learned moved; it also lit Today on a course page. The Record is reached from
Stats ("The record →") and from the Next Mark line on Today, which links to
it, and on `/stamps` the bar lights Stats, the page it hangs off. The rail on
a wide screen still leaves the Record out until the first session
(`useRecordEarned`, read off the sessions, true while they load so it never
blinks for someone who has them), since it has a row to spare and a list that
grows is not a tab that moves.

At `md` and above a **232px rail** takes over and both of those hide
themselves. The rail is **the margin of the page**, where the contents and
the tabs get written. There is no line between it and the page. The rail sits
on the **desk** (`--desk`, a step darker than `bg`, one per paper tone in
`PAPER_TONES`), and the page is a sheet lying over it (`.page-sheet`): it runs
to the top, the foot and the right edge, and only the edge over the rail
curves, 22px, with a soft shadow falling onto the desk. On daylight paper the
edge of a second sheet shows 4px under that curve. On the night paper a shadow
disappears into the dark, so the desk goes near black and the edge is a lit
hairline and a deeper shadow instead, with no second sheet (`--sheet-shadow`
in `NIGHT_TOKENS`). The sheet follows `--rail`, so it slides with the rail
when that folds. It is fixed behind the content at z-index 0 and the content
is only positioned after it, never given a z-index, so a popover or sheet
opened from the page still rises over the rail. Phone has no desk: the page
is the whole screen, as it always was.

- **The six screens** are words in the serif at 15px (so they follow the
  heading font), the same face as the titles they lead to, with no icons. The
  screen you are on is swiped with the yellow `.hl`, drawn in quickly
  (`.hl-draw-quick`, 0.35s) whenever the screen changes; a pointer draws the
  pencil underline a task title draws; the keyboard gets a thin ink ring, the
  task list's cursor. Three marks, never confused. A course page swipes its
  course and leaves Courses in ink, so a page has one mark. Tasks carries the
  open count in mono; Record carries the news dot.
- **The courses**, in the order they were dragged into, each a 3px spine in
  its colour with its code and open count. A press and hold on a spine lifts
  it, through the same `ReorderList` the dashboard's own course cards use,
  writing the order both read (`reorderCoursesOptimistic`); the shared
  `<ol>` reserves 18px on the left for the grip, and each row is pulled back
  by that much with a negative margin so nothing shifts against the icons
  above it. The one you are on is swiped in its
  own tint, as on the Tasks filter. A sitting on the clock puts a 6px dot in
  the course colour pulsing on `tick` on its row; the rail never draws a
  second clock. A long list fades at whichever end has more behind it and
  keeps the current course in view. Pointing at the list shows a dashed
  "add a course" line after the last one, always there when the term has none.
- **The start** at the foot offers what Up next would start, through the same
  popover a row opens: the round start button in the course tint, the task in
  the serif and its course under it. With no open work it offers to time the
  first course; with no courses, or with a sitting already running, it steps
  aside. `useUpNext` (`lib/use-up-next.ts`) is what both it and Today read, so
  the two never offer different tasks. It used to be a dashed box with a
  `00:00` in it that linked to `/timer`, which sends anyone without a running
  sitting straight back to Today: a start button that started nothing.
- **Settings** at the very foot, set like the screens. On the strip its icon
  becomes the reader's own face once there is one to show — the photo or
  initials-on-peach circle from the Settings profile card, a small gear badge
  at its corner so the row still reads as Settings — and falls back to the
  plain gear with neither a name nor a photo set (`SettingsGlyph`). On a
  phone, Today's header carries the reader's own face at 32px
  (`ReaderAvatar`: photo, initials on peach, or an outline of a person) as a
  link to the same `/settings` page. It used to be a sliders icon, which read
  as a filter, opening a second and older Settings sheet of its own; that
  sheet is gone.

It collapses to a **64px strip**: the AkadaMark is the handle, the screens are
their icons, and each course is a spine label, the letters of its code over
the number in mono ("MATH" over "120"), so courses stay tellable apart
without a pointer. Names come up on a paper tip beside the strip (edge, warm
shadow, like anything that floats). The choice is remembered, and written onto
`<html>` as `data-rail` by the bootstrap script before the first paint
(`lib/rail.ts`); `--rail` in `globals.css` reads it, and the rail and
`PageShell` both take their width from it. They used to read it from an
effect, so a collapsed rail opened for a frame on every navigation and the
page slid back after it. What the rail draws follows its own width through a
container query, so the server's markup is the same whichever way it was left.

From 768 to 1024 there is no room for 232px beside a page: the rail is always
the strip there, and its handle lays the full rail **over** the page instead
(paper, warm shadow), closed by Esc, a click outside, the handle or a
navigation, with focus going in and coming back to the handle. `PageShell`
recentres the content in whatever the rail leaves rather than staying pinned
to a phone column in the middle of a 1440px screen. Pages that lay themselves
out in two columns pass `wide` to opt out of the phone measure.

Two things follow from the rail. Settings is a **page**, on desktop and on a
phone alike, because a modal reached from a permanent nav item is a screen
pretending to be an interruption; the bar is on it, so a phone has a way back.
And the
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
  `(hover: none) and (pointer: coarse)` and under `data-input="touch"` (see
  the tablet section below). Study does the same with its own `.keys` rules.
- **Fields are 16px on touch.** iOS zooms into any field under 16px on focus
  and stays zoomed. Pinch-zoom is allowed, so the viewport is not the fix:
  `globals.css` lifts inputs and textareas set at `text-xs`, `text-sm` or
  13 to 15px up to 16px under `(pointer: coarse)`. A field set larger keeps
  its size.
- **New task names its course.** The sheet on Today opens on the first course
  and, with more than one, shows the term's courses as a row of chips to move
  it, the same chips as the Tasks filter.
- **New task says what it is.** Every way to write a task down (the sheet on
  Today, New task on Tasks, the "add for Friday" lines in its bands, and the
  Edit sheet) carries the same **Task / Reading / Exam** control
  (`components/tasks/KindFields.tsx`), so the forms cannot drift. Reading
  brings up a pages field (`pp`), Task or Exam a weight (`%` of the grade,
  optional). The kind follows the title until it is picked by hand: a title
  that reads as a reading (`looksLikeReading`) arrives as one, and a kind
  chosen by hand always wins. Without it a new reader never learns the app
  knows what a reading is, which is what turns pages into hours, brings a
  reading back in recall, and lets a weight count toward the grade.


### On a tablet, or a laptop folded into one
An iPad, an Android tablet and a 2-in-1 flipped over all get the desktop
layout by width, so what they need is not a different page but a page that
knows a finger is on it.
- **The page tracks the hand, not the device.** A folded 2-in-1 keeps its
  touchpad, so Windows goes on reporting `pointer: fine` and `hover: hover`
  while the reader taps the glass, and media queries cannot tell. The
  bootstrap script (`lib/input.ts`) writes `data-input="touch"` on `<html>`
  the moment a finger or a pen goes down, and `mouse` once a mouse has moved
  a few pixels; the first guess comes from the primary pointer, then from
  what was last used on this device. Style for it with `touch:` and `mouse:`
  in Tailwind, or `:root[data-input='touch']` in CSS.
- **Nothing waits for a hover a finger cannot give.** A control drawn only
  under the pointer (a row's timer and `···`, "add a course" on the rail, a
  band's "add for Friday", a card's action) hides with `md:mouse:opacity-0`,
  never a bare `md:opacity-0`, so under a finger it is simply there. The
  notes shelf's row tools do the same.
- **Hover stands down under a finger.** `hover:` in Tailwind, and every
  `:hover` rule in `globals.css` and `notes.css`, is scoped to
  `:where(:root:not([data-input='touch']))`, so a tapped quiz option or row
  does not keep a hover tint that reads as picked. A new `:hover` rule in
  plain CSS takes the same prefix. Hover done in script checks
  `pointerType === 'mouse'`; the rail's name tips do too.
- **Targets grow to a finger.** Under touch, rail rows go from 40px to 44px,
  and the handful of 28 to 36px buttons (date picker arrows, a session's
  delete, the grade dash, Undo, recall and weak-point actions, the notes row
  tools) come up to 40px with `touch:h-10` and its kin.
- **The strip swipes.** From 768 to 1024 a swipe right across the rail lays
  the full rail over the page, a swipe left puts it away; the rail and its
  course list are `touch-pan-y` so the browser leaves a sideways swipe to
  them. A plainly sideways swipe only, so scrolling the list and carrying a
  course still work.
- **Sheets stand on the keyboard.** An on-screen keyboard on a tablet is
  half the screen and slides over the page. `lib/input.ts` reads the gap
  from the visual viewport into `--keyboard`, and every bottom sheet carries
  `.sheet-lift`, which takes that as padding and holds the panel to what is
  still visible, so the field and the button under it stay on screen.
- **Focus mode comes back on a tap.** A cursor brings the bar back by
  moving; a finger does it with a tap on the page that lands on nothing
  else.
- **Focus mode pinches.** Two fingers, a trackpad pinch (ctrl + wheel in
  Chrome and Firefox, Safari's gesture events) or ctrl/⌘ `+` `−` `0` zoom the
  note from 75% to 250%. It reflows rather than magnifies: the type and the
  measure grow together until the measure meets the screen, then the lines
  rewrap, so nothing runs off the side, and the block under the fingers holds
  still. The reflow happens once, when the fingers let go; while they move
  the sheet is only scaled on the compositor from the point between them,
  since laying out a whole note every frame is what made it stutter. Off 100%, the bar shows the figure in mono; a tap on it goes back.
  The zoom is kept with the spotlight and the lamp.
- **A pen can trace a line.** A stylus run left to right along the text is a
  sideways drag, and the browser used to take it for its back swipe. On a
  note the page pans up and down only (`touch-action: pan-y`, a wide table or
  code block still scrolls on its own) and the root drops its sideways
  overscroll while a note is open.
- **Upright gets the phone's bands.** Tasks keeps each band's name in its
  168px margin only from 1024px; below that it sits over the rows, since the
  margin beside a row's fixed columns left a title about 86px wide.
- **Either way up.** The manifest's orientation is `any`, and the rail, the
  dock, Undo and the page's foot all keep clear of the safe-area insets.

### Rules, not panels
Today and a course page draw no boxes. Every section used to be its own
bordered, rounded panel with a fill step behind it, twelve of them on Today
at the same weight, and a box that everything has stops meaning anything.
The page is separated by its own ruling instead, the way a ruled pad is:

- **The head band.** On Today, Up next is the one thing that spans the page,
  with the hours beside it (from `xl`), since Start is what fills them.
  **Up next** is the course rule and code with the course name in the serif
  italic, the title at 40px (30 on a phone) with no swipe behind it, then a
  row of labelled figures (`UpNextFact`): **Due** (Today, "2d overdue" in
  `warn`, or the date, with a small `High` tag on `priority-tint`), **Spent**
  in mono (**On the clock**, with the pulsing dot, while a timer runs on it)
  and **Steps** done over total when the task has any. The steps themselves
  follow as a line of stops joined by a `line-strong` rule: a filled dot with
  a tick for a done one, a ring in the course colour and "Now" for the first
  open one, an empty circle for the rest; a tap ticks one. It used to be one
  italic sentence with the figures dropped into it, under a highlighter swipe
  that went muddy on the night paper. Under the buttons, **After this** names
  what Up next would offer next. The rest of the day's work (the recall card,
  Overdue, Due today) follows in the same column, under a cutoff: below the
  fold it left the band's left half empty for as long as the hours ran beside
  it, whenever Up next had no steps. The sort rule sits top right as a serif
  italic line with a cycle mark, not in the hand face.
  Beside it the day's hours, then under a cutoff **This week** (`WeekHours`)
  at the same size, 40px mono. Under the day's figure is the **day ledger**
  (`DayLedger`): a strip from 7am to midnight (stretched for an early start
  or a late night) with each timed block laid where it happened in its course
  colour and a thin ink mark for now. Only a sitting the timer ran knows when
  it happened, from its segments; one logged by hand counts in the figure and
  is not placed. With a day that ends after midnight (Settings, "day ends
  at"), the strip also carries **the small hours before today began**: the
  day before's blocks that ran past midnight, at 45% in their course
  colours, left of a dashed `ink-soft` line where the day started, and a
  serif line under it ("4h 24m before 8am, counted to Sunday · your day ends
  at 8am", the last part a link to Settings). They stay out of the day's
  figure, since they are not today's, but a reader who studied from four to
  seven used to open Today at nine and find no trace of it. The week is the week's hours against its goal, which is the
  course goals added up (there is no separate one to set), drawn as **a bar
  a day**, Monday to Sunday, each bar stacked in the colours of the courses it
  went to with its hours written over it in mono (on a scrap of paper, so the
  goal line never runs through a figure), and a dashed line at the day's share
  of the goal. Today's label is "Today" on the yellow highlighter; days still
  to come are left blank. The key under it says what the dashed line is
  ("goal 2h 51m a day") and names the colours when more than one course had
  time; the goal's label used to sit on the line itself, where a tall day ran
  straight through it. It replaced one
  stroke per goal hour, twenty-odd thin marks that read as a barcode: a week
  is read by its days. A serif line under it says what is left and how many
  days the week has ("4h 20m to go · 3 days left"). With no course goals it
  links to Settings instead. The Next Mark line comes under both: it is a
  reward line read off them, not a to-do, so it never sits over Up next. On a
  course page the band is the strip of four figures. Nothing frames it: it
  leads by position and size.
- **Today is three things.** Up next, the hours (the day's and the week's),
  and Coming. Everything else
  it carries is conditional: the recall card when something is due, Overdue
  when something is, **Due today** only for what Up next is not already
  showing (a section whose one row is the Up next task said it twice), and
  **Before the exam** in the week before one. The course cards that used to
  stand under the day, the week's bar chart and the "New here?" link to the
  guide are gone (the week came back as `WeekHours` in the head band). Under
  the fold, **Your courses this week** (`CourseLine`) is a row of four
  (two on a phone): each course's rule and code, its name in the serif, its
  hours this week in mono over its goal, its `HourStrokes` in the course
  colour and how many tasks it has open, each a link to its page. It was a
  single line of codes and hours that read as a footnote. **Coming** sets
  each row's date like a diary's margin, the weekday as an eyebrow over the
  day of the month in mono (`warn` within two days), with the course, "exam"
  on `warn-tint` and the weight on the eyebrow line over the title. Under the
  run and the day of the term, the term is a row of one mark per week: the
  ones behind in `ink-soft`, this one on the highlighter, the rest in
  `bg-tint`. Up next's row is **Start · Done · Tomorrow**, Start filled and
  the other two outlined in `line`; the Untimed button beside Start went,
  since Start's popover already offers 25/45/60/Untimed.
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
beside the strokes carries the exact figure, and what is left to go. A goal
past a dozen hours is the exception: Today's week is a bar a day against a
dashed daily share, since two dozen strokes stop being countable and read as
a barcode.

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

### The log sheet
The sheet that ends a session used to ask seven things at once: mark done,
what did you do, the hashtags, worth keeping, scored, discard and save. Now
the sheet is **the time, the Mark the task done tick (when a task is
attached), and Save**, with what the session did (the tally, the Next Mark
lines, "your ECON sittings usually…") read back above them. Everything else,
the note with its suggestions and tags, "Worth keeping?" and the practice
score, folds under one serif line, **› Add a note**, which says "· written"
beside it when something is in there while folded. Whether the fold opens is
remembered (`logNotesOpen` in `lib/preferences.ts`): it is a layout choice,
not an explanation, so it is a preference rather than a dismissed flag. Save
says **Save** (it said "Save to journal").

The sheet follows the reader to every screen until it is answered, so it
says why it is there, in the serif italic under the heading: "You stopped a
1h 10m session on ECON 100 and haven't saved it", or why the clock was
stopped for them (left running while the page was closed, a break past 45
minutes, the 18 hour limit).

### The blink on P

`P` holds or lets go of the clock from any screen (`TimerHotkeys`), and it is
pressed with the eyes on the book, not on the dock. So the page answers it:
it blinks once, like an eye. Two lids of `ink` come in from the top and bottom
edges, deepest at the edge and gone by the middle, close in 130ms and open
over 230ms, with a faint 7% wash over the whole page as they meet. It used to
be one flat veil at 16%, which read as the screen flickering rather than as a
blink. It sits over focus mode too and catches no clicks. Only the key does
it; a click on the dock already lands where the eye is. Reduced motion takes
it away with every other animation. (A ring sent across the page from the
press was tried in its place and taken back out: too much, for something
that only has to say "heard".)

### The forgotten timer
The timer's heartbeat keeps a tab alive while it is open, so an open page
says nothing about anybody being at it: a laptop left on the timer through
dinner logged an eight-hour sitting, which then set the longest-sitting
record, struck "One sitting 3h", made its reader a night owl and pushed
Next Mark's reach to its cap. The timer now keeps **`lastInputAt`** apart
from `lastSeenAt`: a pointer, a key, a scroll, a touch, the page coming back
into view, and every timer action. The rules are in `lib/timer-idle.ts`:

- **A block** past its target with no input for **20 minutes** is held. The
  block itself is its own evidence (a chapter on paper touches nothing), so
  only the overrun is in doubt, and the cut is at the later of the last input
  and the moment the target was reached.
- **An untimed session** with no input for **60 minutes** is held, cut at the
  last input.
- Held is never discarded. The log sheet opens pre-trimmed: "You went quiet
  at 9:42. Logging up to there, 1h 10m." with **Keep the full 2h 30m** beside
  it, and the reverse link once the full time is chosen.
- **Any session over four hours**, however it ended, is asked "Is it right?"
  on the sheet, with "Log up to 9:42 instead" when there was a quiet stretch
  to cut.

A session saved after a hold, a trim or a recovery carries **`recovery`**
(`idle`, `away`, `break` or `max`; `sessions.recovery`). Its hours still count
everywhere hours count, on Stats, the ledger and the run, since the reader
chose to keep them. Records to beat, the One sitting stamp and every habit
median leave it out, because a length the reader did not end is not a fact
about how they study.

### The study fan
The timer draws a fan rather than a ring. One stem from the bottom edge
splitting two or three ways at each step, in the course colour, round tips.
Every segment is born at a depth and the session's progress unlocks depths,
so it extends and branches the longer the reader sits. A ring says what
fraction is gone, which is the one thing a reader in the middle of a chapter
has no use for; the fan only ever grows.

It is drawn, not ruled. Every branch is a shallow curve, bowed to one side by
its own seed (`bow`, from a second generator so adding it moved no branch and
old sessions still grow the shape they always grew), and the thick ones taper
from the width they leave their parent at to the width their own branches
leave them at, so the joins are seamless. The colour runs smoothly from the
dark stem to the pale tips rather than in three bands.

- **Leaves** sit on the growing edge, one per tip, turned off the branch to
  alternate sides, coming in small and opening as the branch lengthens. They
  are the course colour mixed toward the paper, edged in a darker shade.
- **Flowers.** When a block is done, one in three of the outermost tips
  flowers instead. That is the moment the fan touches the top, and it is the
  only thing on the screen that says so.
- **The pencil sketch.** In the block frame the part of the shape still to
  come is dotted in `line-strong` pencil, and the ink fills it as the reader
  sits. It is an underdrawing, not a gauge: faint, no number, and it shows
  the shape rather than a fraction. Open mode has no top, so nothing to
  sketch; it is off there.
- **The ground.** The block frame's stem stands on a drawn pencil line with a
  few strokes of grass, and the stem's foot is flat on it.

All four are options on `StudyFan` (`leaves`, on by default; `sketch` and
`ground`, off), drawn by `drawFan` in `lib/fan.ts`.

The block frame is a page from the notebook: `line-soft` rules every 32px, a
`line` margin 64px in, a folded corner, and one warm shadow under the sheet.
The course code at its head is a short course-colour rule with the code in
`ink-soft` beside it; a pastel is never the text itself.

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

A held clock closes the fan (`resting` on `StudyFan`). Every split draws in
toward the branch it grows from by about a third and the whole of it comes a
few percent shorter, the stem first and the tips a few frames after it, on a
spring slower and more damped than the hand's (`FOLD_REST`, `FOLD_SLACK`,
`FOLD_STIFFNESS`, `FOLD_DAMPING`): closing is a settling, not a swing. Letting
go opens it back out with a small overshoot, the tree waking up rather than
being switched on. Like the pull, it never touches progress, and reduced
motion gets a fan that only loses its colour.

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
- **The two swap slots take the break's version.** The header, empty while a
  block runs, carries the break's `5m / 10m / 15m`, and `NextMarkLine` under
  the controls becomes the sitting's chain. The header used to carry a
  `Block / Open` switch as well; that choice is made once, in the start
  popover (25 / 45 / 60 / Untimed), and the controls under the clock are
  Pause, +5 min, Break and **Finish** (it said "Finish and log").

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
reader has stopped deciding things is the wrong thing to hand them.

**The face is the stretch on the clock**, and the timer, the dock and the
tab all show the same number (`stretchFace` in `lib/timer-face.ts`). A break
counts down its length and then up past it; a block counts down its target
and then counts the overrun up (it used to sit at `00:00`); an open stretch
counts up. Past its length the digits carry a plus, `+16:23`, on the face
and the dock alike: without it, sixteen minutes over read as sixteen left. So after a break the face starts again on the new block rather
than carrying the session. The session's running total, blocks added up and
breaks left out, moves to second place once there is an earlier block to add
up: a line under the clock on the timer (`1:04:12 in this session`, the
digits in mono, the words in the serif) and a smaller muted figure beside the
dock's digits. Before the first break the two would be the same number
twice, so it is not drawn.

Nothing starts on its own after a break either. **End break** (one tap, or
the space bar, or `P`) closes the rest and sets out the next block at the
same length, held at zero: the clock reads `· ready` instead of `· paused`
and the solid button says **Start**. The block begins when that is pressed,
and its stretch in the chain starts there, not when the break ended. A block
that ran the moment rest stopped was counting the walk back to the desk as
work.

### One word for each thing
Outside the Record, the app says **session** (never "sitting" or
"journal"), **task**, **course**, **reading** and **exam**, one word per
thing, the same everywhere: the log sheet, Stats, the start popover, the
marginalia on Today and a course page, the quiz shelf (a quiz is taken in
**attempts**). The Record keeps its own vocabulary (tallies, pages bound,
impressions struck, margin days), because it is the one screen that is
meant to be a game, and Next Mark's lines carry a word of it ("tally") to
the screens that lead there. Headings in this document that still say
"sitting" describe the code's names, not what a reader sees.

### Next Mark, and the sitting on the clock
**Words first.** The unit this layer inks is called a **tally** on every
screen: forty credited minutes on a course, fifteen for the first. It was
called a mark, which is also what a LUMS student calls a grade, and "the
next mark on ECON 100" read as their next grade. "Marks" on any screen now
means grades only. The code keeps its old names (`MARK_SECONDS`,
`NextMarkLine`, `course-mark`) because they are stored in impression logs;
only the words a reader sees changed. Stats' milestone counts in
**strokes**, not tallies, because its unit is not forty minutes. There is
one run in the app and it is counted in weeks: Stats says "weeks running"
like Today and the Record, and nothing counts days in a row.

The progression layer (`lib/progression`) is derived from logged sessions and
tasks on every read and stores nothing. For a long time it read *only* logged
sessions, so the one line it puts on Today and under the timer, "20 minutes to
the next tally on MATH", sat there saying twenty for the whole forty minutes
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
  in the ink, what is next a step softer, joined by a middle dot: "a tally
  inked on MATH · today counts · 38 minutes to the next tally on MATH". The
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

The Today sections (the hours, the course line under the day) read the same
augmented list, so the hour strokes fill and "2h
to go" counts down while the clock runs. Anything that *decides* something,
which task is up next, which course has gone quiet, still reads the record.

Two candidates were added to the ranking. The **first mark** on a course is
now named ("15 minutes to the first tally on MATH"); it is the short one
precisely so it can be, and a course with no marks used to get no line at
all. And the **week**: on the day that would make this week count, by either
route, the line says so ("20 minutes makes this week count", "20 minutes
makes it 4 weeks running") in place of "until today counts", because the week
is the only thing on the board that moves the run. It sits at the top of the
ranking beside the course just worked, and the shorter distance decides.

The voice is unchanged: lowercase, factual, no praise. A sitting that inked a
tally is told a tally was inked. It is not told well done.

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

Two kinds of session never teach it anything: one closed for the reader
(`recovery`, see The forgotten timer) and any over four hours, however it
ended. Up next's "carry on where you left off" likewise ignores a session
under ten minutes, which is a timer started and dropped.

The app uses it in four places, and says it back in three.

- **Next Mark reaches as far as your sitting.** The line names only what is
  within roughly one sitting. That was a fixed fifty minutes; once five
  sittings are in it is the upper quartile of your own, bounded between
  thirty minutes and two hours.
- **The ranking learns.** Every line shown is logged on the device with
  whether a session followed within the hour (`log.ts`, which used to write
  this only to a table nobody read). **Followed means on that course**: a
  line naming ECON is answered by an ECON session and nothing else, and only
  the lines about the whole week or the day ("20 minutes makes this week
  count", "until today counts") are answered by any course (`followsLine`).
  It used to count any session at all, so a CS session after an ECON line
  taught the ranking that ECON lines work. Once a kind of line has been shown six
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

**What gets asked about.** Finished readings that were read: a task whose
kind is `reading`, or whose title reads as one (it starts with "Read", cites
an author and a year, or names a chapter, and does not name itself as work:
a problem set, pset, "PS 2", homework, HW, an assignment, quiz, lab,
tutorial or exercise), comes into recall on its own the day after it was
finished, **when it was worked** (time logged on it, see "Worked, not ticked,
and Skip") or finished from the log sheet. One only ticked is not asked about
on its own, since a tick does not say it was read and eight readings
bulk-ticked from last month would flood the week: it waits on the course
page's Recall under "not asked yet · ticked off with no time logged on it",
each with **Ask me about this**, which keeps it (and the task sheet's "Keep
this for recall" does the same). Nothing is stored for it until it is first answered, so a term that
started before recall existed arrives with its readings already in it. The
same reading written down twice, once off the syllabus and once when it was
done, is one thing to remember. A reading skipped rather than done (see
"Worked, not ticked, and Skip") is never asked about. Anything else is kept by hand: a finished task
from its sheet ("Keep this for recall"), the ticked steps of a concept list
("keep 5 ticked for recall", in the Subtasks header), a line on a course page,
a line on the log sheet, or through the connector.

**The card.** One thing at a time, written on the page under the fold with no
box around it, the course rule before its code, and once it has been asked,
how it went last time ("last time: roughly, 3 days ago"). **The card is the
explanation**: it asks a question in the serif, with the thing itself in ink,
that says when it was finished and what to give back without looking. "You
finished **Mankiw Ch 2** two days ago. Without opening it, what was the
argument?" (`recallQuestion` in `lib/recall/words.ts`; a task or step asks
whether it could be done fresh, a kept line whether it can be said back). The
paragraph that used to sit over the first card explaining recall is gone.
Three answers: **Got it**, **Roughly**, **Blank**, each with a hand mark
rather than a colour: a tick, a wave, an open ring that does not quite meet
itself. They are only the buttons' words (`VERDICT_WORDS`): the data, and the
course's standing line ("2 clear · 1 hazy"), keep `clear`, `hazy` and `gone`.
Stopping, which used to be "let go" beside the answers, is **Stop asking about
this** behind a `···` overflow on the card, and "stop asking" at the end of a
row on the course page. There is no cross and no red, see "No
Alarmist Indicators": a thing that slipped is why recall exists. The card
never shows an answer, since a recall with the answer in view is a re-read,
and never scores one; the reader knows whether they had it.

After an answer the next card is already there, and one line under it says
what the answer did in the Next Mark voice: "Angell (1912)… · roughly · back
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
  when it next comes up in the serif. Each row has a "stop asking" at its end,
  shown on hover on a wide screen and always on a phone, where there is no
  hover to find it with; letting go leaves a line with undo, since a line
  written by hand has nowhere else it could be brought back from. A line to
  write the next thing on sits at the foot, drawn the way the subtask sheet's
  "one more step…" is.
- **The Coming section**, under an exam's row, once per course: the same
  uprights, and "2 of 5 clear" in mono. Only under a piece recall prepares
  for (`preparesFor`: worth a fifth of the course, or an unweighted midterm,
  final or exam), and only once something in the course has been asked; it
  used to say "0 of 1 clear" under a problem set. A countdown on its own says how close
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
- **The log sheet, under "What did you do?"**: lines read off what the
  record says happened while the clock ran (a quiz handed in, with its mark;
  a quiz half done on this device; a note read through or written; a task
  ticked off; the task the sitting was against), each a serif italic line
  with a `+` that drops it into the note on its own line and takes the
  course's highlighter swipe once taken. Offered, never pre-filled: the note
  stays the reader's to write.
- **The log sheet**: "Worth keeping?", under Add a note, a line to write on under the tags,
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
every card and in a course's Recall header, opens the Claude sheet (see
The guide) with a prompt for a chat that has the connector on. The prompt is built on three rules: nothing is shown
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

**On the log sheet** it is a line under "Worth keeping?", inside the **Add a
note** fold (see The log sheet), written the same way: "Scored" as an eyebrow, two short hand-underlined blanks for the score
and what it was out of in mono, and "on a practice paper, if this was one" in
the serif. Nothing is required. Something written there that is not a score
out of something (half of one, more than it was out of) gets one quiet line
saying it will not be kept, once both halves are in or the line has been left
rather than on the first keystroke, and the sitting saves anyway, because the
sitting is the record and the score is commentary on it. A database that has
nowhere to put a score yet saves the sitting without it and says so once. The
sheet scrolls when it is taller than the screen, which with a task and the
marks above it it can be on a small phone.

**On the course page** a **Practice** panel heads the right column, over the
sessions, once there is a paper to show. Each paper is one short pen mark, a little uphill the way
a hand plots one, at the height of what it scored against what it was out of,
oldest on the left, between a dashed line for full marks and a ruled baseline.
It is deliberately not a bar that fills, which is the percentage bar this app
does not draw, and nothing joins the marks or points an arrow over them: four
papers on four readings are four facts, not a trend. Under the plot, the last
four written out, what the sitting's note said it was, the day in the serif,
and "6.5/8" in mono.

**On a session row**, on the course page and in the Stats log, the score
sits in quiet mono before the hours, since the hours are what those lists are.

### The reader's day, not the calendar's
Settings lets a day end as late as 8am. `isoDate()` with no argument is that
day, and anything that means "today" reads it; `new Date()` is only the wall
clock. Arithmetic from today goes through `logicalToday()` and `addDays()` in
`lib/utils.ts`: "tomorrow" worked out from the wall clock at 3am, for a day
that ends at 8, was the day after tomorrow, so Snooze skipped a day, the date
picker's Tomorrow was wrong, Today's date line said Monday over Sunday's
hours, and the log's Yesterday pointed at the day still being lived. Where the
day starts as an instant, `dayStartsAt(iso)`.

### The chime
The one sound that announces something; the rest only answer a finger (see
"Sounds under a finger"), and the ambient noise is one a reader turns on
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

### Sounds under a finger
A press makes a small sound, the way a pencil makes one on a desk. It is a
**palette of three materials**, all synthesised on the Web Audio clock in
`lib/sounds.ts`, no files, so nothing is ever late or a download:

- **Wood** for something done to the page. `tap` is the default for anything
  pressed, a light pencil-on-desk tok. `knock` is lower, for a choice made or
  "hazy" in recall. `tick` is a task done, a firm tok with a small bubble up
  out of it; `untick` is only softer and lower, because undoing is not a
  failure.
- **Bubble** for something turned on or coming up: `bubble` when a toggle
  goes on, `drop` when it goes off, `bright` (two, rising) for a card
  remembered clearly.
- **Paper** for something put away: a swipe to delete, a recall card let go.

The timer gets a **mallet**, wood left to ring: `start` is two bars a fifth
apart going up (a sitting begun, resumed, or a break ended early), `pause` one
low bar, `stop` the fifth coming home. Every strike is detuned a percent or two
and struck a touch harder or softer, so ten ticks down a list do not sound
like a machine. All of it sits under the chime.

One capture-phase click listener (`components/TapSounds.tsx`) gives every
button, link and switch the plain `tap`, so a new control is never silent. A
control that wants something else says so with `data-sound` on itself or an
ancestor (`data-sound="none"` for quiet); a handler that plays its own sound
wins over both, because the listener's tap is deferred a turn and cleared by
any `playSound` in between. Settings has its own toggle (apart from the
chime's) and a "Listen" row to audition the palette.

### Marks, not chips
The app does not use pills. A capsule with a tinted fill is how software says
"selected"; a page says it with a **swipe of highlighter** (`.hl`, or
`.hl-swipe` with `--hl` set to a course's tint), a **hand-drawn underline**
(`.hand-underline`), a **scribble box** and tick (`.scribble-box` +
`HandCheck`), or a note in the margin (`HandNote`, Caveat). Filters, chosen
courses, reflection tags, timer goals, priority marks and the page you are on
in the rail all read this way.

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

### Worked, not ticked, and Skip
A tick is one tap and says nothing about whether a thing was read, studied or
learned. So the app keeps one rule for every figure it derives about the
reader from finished work: a finished task is **worked** when time was logged
against it (a session on it, or a kept timed read-through of a note studied
under it), and otherwise only **ticked**. `workedTaskIds` in `lib/derive.ts`
is the one place that decides it, read at derive time off rows that already
exist; nothing else re-derives it.

A task can also be **skipped**: taken off the list without being done, from
the row menu ("Skip") or the task sheet ("Skip it"). It leaves the list the
way a finished one does, but it is never worked, never enters recall, and
never counts as pages, a study day or Finished early. It is drawn apart from
done: the box left unfilled with the hand check struck through in `muted`
(`HandCheck struck`), "skipped" where the date column says "done", and a
muted "Skipped" stamp on its sheet. Never a cross and never red. It is stored
as `tasks.completed_via = 'skip'`; the log sheet's "Mark the task done" writes
`'session'`, a plain tick writes nothing, and putting a task back clears it.
A database without the column still takes ticks, and refuses a skip in words
rather than saving it as a tick.

**Pages an hour** is the first thing read through that rule. It stands only
on pairs: a finished reading that was worked, its own pages over its own
logged time (`readingPairs` in `lib/derive.ts`). Each pair is held between 2
and 120 pages an hour, and the pace is the **median** of them, never one
pooled ratio, so a 200-page tick with five minutes on it cannot speak for the
term. It is the reader's own only from three pairs; before that Today says
"at the usual 20 pages an hour", and after it "at your 34 pages an hour". A
reading with no page count is named ("and 1 without a page count") rather
than quietly left out of the sum. A course's pace on the Record and in the
start popover is the same median over that course's pairs (from two), and
**Finished early** counts only worked tasks finished three days out.

### Keys on the task list
The list is walkable without a pointer: `↑ ↓` move a cursor, which the row
draws as an ink ring rather than a fill; `X` selects the row under it and
opens the bulk bar; `Enter` opens it; `N` starts a task, `S` changes the
order, `Z` (or `⌘Z`) undoes the last change, `Esc` closes whatever is in
front. The hint under the list names exactly these and nothing else. It used
to offer `X select` and `⌘Z undo` with neither bound to anything, which is a
worse lie than saying nothing, and the help sheet behind `?` listed a third,
different set. The hint line and the `?` that opens that sheet both carry `.key-hint`,
so neither is drawn on a touch screen, where there are no keys to name.

### Undo
One slip, app wide (`components/Undo.tsx`, mounted in the root layout). A
tick on any task row, on Today, Tasks or a course page, leaves "Done: <title>"
with an Undo on it for eight seconds, and so does every bulk move and the
open-ended date on Tasks. `Z` or `⌘Z` takes it from the keyboard, from any
screen, but only while the slip is up, so the key is never bound to nothing.
A new change replaces the slip rather than stacking, and undo only ever takes
back the change the slip names. A tick is one tap on a phone and a list that
hides finished work takes the row away as it lands, so without this a stray
tick was a task gone with nothing to say where.

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
- **The controls** are marks, not dropdowns, and fewer of them. The band
  filter (All, Overdue, Today, This week, Done) is the highlighter swipe it
  always was, on a wide screen only, and a filter with nothing in it is not
  drawn ("Overdue 0" went), All aside. Each course is its `.course-rule` and
  code, the chosen one swiped in its own tint. How the list is cut and
  ordered is **one** control, "Sort · by day, what's urgent", which opens a
  small sheet of plain words, the chosen one hand-underlined: **Group by** day
  / course, **Sort by** what's urgent / due date / newest / my order, and on a
  phone **Show** All / Overdue / Done, since the band filters leave a phone
  (the fortnight already filters it by day). It used to be two controls in
  the app's own dialect, "BY day course" and "ORDER what matters". `S` still
  steps through the orders. "My order" is the order each
  course's tasks were dragged into on its course page, course by course in the
  reader's own course order; tasks nobody has placed follow in "what's
  urgent". There is no dragging on Tasks itself: a hand-made order across
  date bands would fight the dates, so it is made where it means something,
  inside one course.
- **The bands.** By day, the list reads Overdue, Today, then each of the next
  seven days by name (Tomorrow, then Friday, Saturday...), then Later and
  Open ended. By course, one band per course. Each band holds its name in a
  168px left margin, serif 20px with the date or course name under it in
  italic, and from 1024px that margin is **sticky** while the band's rows go
  past, the way a diary keeps the date at the head of the page. Below 1024,
  a tablet upright included, the name sits over its rows as on a phone: the
  margin and the row's fixed columns together left a title about 86px wide
  on an iPad held upright. Bands are
  ended by the page's `line` cutoff; nothing is boxed. Overdue sets its name
  in `warn` and carries "n to catch up" in Caveat. Today stays on the page
  when nothing is due, reading "Nothing due. A clear day.", but only when the
  term has tasks. A term with none shows the same two ways in as Today's Up
  next ("Get them in with Claude", "Add a deadline") in place of the bands,
  since "a clear day" on an empty term reads as caught up. Rows are
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
**end break** while a break runs (the next block then waits for another `P`); `K` finishes the sitting and the log sheet
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
Five lists let the reader set their own order, and all five are the same
component, `ReorderList`: the **course spines in the rail**
(a `row` carried on press too, since each is a whole link), the
**course panels in Settings**, the **subtasks inside a task**, the
**pieces of a marking scheme** on a course page, and the **open tasks on a
course page** (a `row` carried from its grip, since every other part of a task
row already does something). A course's tasks read in "what matters" until
the first drag, and a task added after that, or moved in from another
course, lands at the bottom. It is written against
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

### Study: the reader

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
  tools on one line: Everything / Notes / Quizzes (once any quiz exists), a
  hairline, the course filters, and Recent / A–Z, all as highlighter marks
  (never tabs), and a search that looks through every note and quiz and shows
  the words around the hit. Notes and quizzes are **one list**, and the
  course filter and search apply to both. Rows are written on the page with
  a `line-soft` hairline between them, split into "This week" and "Earlier"
  when sorted by recent. **What is finished folds away**: a note read through
  and a quiz taken and fully marked drop out of the list into **Done** at its
  foot, an `.eyebrow` with its count in mono that opens and closes them, the
  rows under it let down a little. A search opens Done for itself. Which
  kind is shown and whether Done is open stay in the browser. Each note
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

**A read-through is timed only from the top.** With a session running on the
note's task and the reader at the top of the note, a run begins; reaching
the end keeps it as `{ seconds, words, at }` in `notes.reads`. **The time is
the note's own** (`seenSeconds` on the run): a second counts only while the
page is visible, the reader is on this note, and the session is in focus,
not paused or on a break. It used to be the session's focus time from the
top, so a note left open on another tab was being "read". The run also has
to be **seen passing** a quarter, a half and three quarters of the way down,
with at least ten seconds between each and on to the end (`passedThrough`),
or a jump to the end after a minute would count. A run started partway down
never begins, one whose session ends before the note does is dropped, a note
whose task is already finished is never timed (that is a look-up, not a
read), and one faster than 600 words a minute, slower than 40, or shorter
than a minute is thrown away. While a run is going the standfirst and
the focus foot say "timing this read" and nothing else.

**The pace is the reader's own.** `readingPace` in `lib/notes/reads.ts` takes
the median words a minute over every timed read once there are two, per
course once a course has two, and every "min left", "min read" and
"of reading" in Study goes through `minutesForNote`: the median of a note's
own reads, each scaled to its current length, then the course pace, then the
reader's, then 200. The reader's standfirst says which it is ("read in 14 min
last time", "usually 14 min, from 3 reads", "~12 min at your pace", "12 min
read"). A word count leaves out fenced code and a table's rules. Under the shelf, **Your reading** says
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

### Study: quizzes

A quiz is sent by an assistant over MCP and lands on the Study shelf in the
same list as the notes, dated by its last sitting or marking (or its arrival),
so a new one sits at the top of "This week". The standfirst counts them and
says how many are to take or waiting on the assistant. Each is a shelf row
like a note's: the course stripe, the title, a sans sub-line opening with
"quiz" (then course, task, question count, when), the last sitting's strokes in sage and peach, and the
last mark in mono where a note has its minutes, or an italic *new* before it
has been taken, or *to mark* while written answers wait on the assistant.
Before any quiz arrives, an `.eyebrow` **Quizzes** under the list stands
with one italic serif line saying how one gets there, since nothing in the
app makes one (on an empty shelf it sits under the ways to start a note).

Taken (`/notes/quiz?q=…`), a quiz is a paper at a 720px measure: numbered
questions (the number in mono, it is a digit), the prompt in the serif, and
options as quiet rows with a small lettered circle. Picking one fills the
circle in ink and sweeps a yellow highlighter under the words; nothing is
marked until **Hand it in**. Then the mark is written in the margin in the
handwriting face (`7 / 10`) beside one stroke per question, the right option
takes a sage circle and a sage wash, a wrong pick a peach circle and a peach
wash (never a strikethrough), the rest fade, and the *why* sits under each
question in muted italic serif.

Under each multiple-choice question sits a quiet italic serif *unclear?* in
the faintest muted tone. Tapping it flags the question as badly worded: it
reads *unclear · won't count* with a wavy pencil underline, and the prompt
eases to a softer ink. A flagged question is still answered and still shows
the key when handed in, but it is left out of the mark both ways (`6 / 9`
rather than `7 / 10`), its stroke is a faint grey one, its *why* opens with
*marked unclear, not counted*, and the margin line says how many were set
aside. The flag lives on the sitting (`unclear` on the attempt), and
`get_quiz` hands it to the assistant so it can explain or reword them.

A paper being sat is kept on the device as it is filled in (every pick,
every keystroke, every *unclear* flag), so a refresh or a closed tab opens it
back where it was; the count beside **Hand it in** adds *kept on this
device* once anything is answered. It is cleared when the sitting is filed
or started again.

When the assistant judged the paper should run against a clock, it says so
sending it, and Akada shows the time it set as a running countdown, mono
digits at 21px, directly under the title, from the moment the paper opens.
Turning it off is a quiet italic serif link beside the face, in the same
hand as *unclear?* below — never a switch, since this is a one-off choice
for the sitting rather than a setting. Off, the face freezes where it was
rather than disappearing, so the time already spent is still there to see;
tapping the link again picks the clock back up from that point. Time running
low is a warm shift on the digits themselves (the paper tone's peach), never
a flashing or shaking indicator: the app has no alarmist ones. Running out
hands the paper in exactly as **Hand it in** would, whatever is filled in.
A quiz the assistant sent with no time on it shows no timer at all, and nothing changes.

A written question has no options. It carries its marks in italic after the
prompt and takes its answer on ruled lines (a borderless textarea over the
page's own rule), not in a box. The lines grow with the answer, a line at a
time, so a long answer never scrolls inside itself. Handed in, the answer stays on its lines and
waits: its stroke is an empty dashed one and the margin says *written: to
mark* and to tell the assistant. When the assistant has marked it the mark
is written by hand under the answer, its feedback follows in the serif, and
*What a full answer says* folds open the model answer. A part mark is a
half-inked stroke. A quiz with written questions opens on its last sitting,
so the whole of it is marked in one place when the student comes back. Past sittings are listed above the paper as
a mono mark, a row of strokes and when. A quiz filed under a task shows on
that task's sheet under the note line, as an `.eyebrow` *Quiz*, its title and
the last mark. Everything is in
`app/notes/notes.css` under `.notes`.

### Weak points

What a course keeps going wrong, written by the assistant after it marks a
quiz. On the course page it is the last panel in the left column, under
the tally page: the `.eyebrow` **Weak points** with the open count in mono, then the
open ones grouped under their section, each section an `.eyebrow` (`§ 1.3`,
*No section* last). A row is the times missed in mono (`×3`, a digit), the
summary in the serif, and under it one muted italic line: the confusion, the
pages, and the quiz it came from as a hand-underlined link (or the note on
its task). *fixed* sits at the right in the faintest italic, on hover at
desktop widths and always on a phone, like *stop asking* on Recall, with
*delete* beside it the same way. Delete takes two taps: the first turns it
into *delete it?* in `prioritySoft`, held in view, and it stands down after
four seconds; the second removes the row for good. Ticked, a row
moves to a folded **Fixed** list, opened the way done tasks are (`Fixed 3`
beside the eyebrow), where the rows fade and read *reopen*. Never a
strikethrough. Before anything has been recorded for the course the panel
is not drawn at all: an empty section explaining a feature was one more
thing on a page already too deep.

When a course has an exam within seven days and anything open, Today's right
column carries **Before the exam** under Coming: per course, the course rule,
code and exam title on the eyebrow with the days in mono, then the top five,
most missed first, each `×n` in mono and the summary in the serif with the
section and pages trailing in muted italic, and a quiet link to the rest on
the course page. Nothing at all otherwise. `components/course/WeakPointsPanel.tsx`
and `components/today/BeforeExamPanel.tsx`.

### The course page
Work first, the ledger last. Under the strip of four figures and the fold
the page reads, in one column on a phone and down the left column from `xl`:
**Tasks**, **This week** with the weekly goal, **Where the grade stands**,
**Recall**, the course's **page** (the tally ledger, the Record's
vocabulary, which used to open the page), then **Weak points** once Claude
has recorded any. The right column carries **Practice** (once there is a
paper) and **Sessions** with Log time; below `xl` they follow in that order.

**Where the grade stands**, on a course with no scheme, says "Akada does not
know how ECON 100 is marked yet." over two equal buttons. **Type it in**
opens the scheme editor already holding the usual pieces (Quizzes,
Assignments, Midterm, Final, Participation) with the weights blank, so it is
thirty seconds with the outline open. **Ask Claude to read the outline**
hands the outline to Claude. The primary button used to copy a prompt to the
clipboard without a word of what it had done, with typing it in as an
italic afterthought under it.

### Log time
Time spent away from the timer, a chapter on paper or a problem set at the
library, gets in through **Log time**, a serif link in the header of a course
page's Sessions section. It opens a sheet (`LogTimeSheet`): the course rule
and code, "Log time" in the serif, one italic line on what it is for, the
length as mono marks (15m to 2h) or typed minutes, the day (today by default,
never a future one), and optionally the task it went on. It writes an
ordinary session with no chain, which everything that reads sessions already
takes as one unbroken stretch, so it counts for study days, tallies and hours
the way a timed one does.

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
- **Start** sits at the top right of a book as a word beside a small play
  mark, on hover at desktop widths and always on a phone. It was a bare
  circle, which on a book cover could have meant anything. The rail's rows
  keep the round mark, since their label is right beside it.
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
  - **You vs another week** (`PaceRace`). Both weeks as running totals on
    one ruled plot, the other week pencilled in whole, this week inked over
    it up to today. Where the two stand today is joined by a short dashed
    stroke, so ahead or behind is a distance before it is a figure. The
    headline is the gap ("29m behind", "1h 10m ahead", "neck and neck") and
    the line under it is what closes it. The other week is **last week**
    unless the serif line over the headline ("against last week · usual ·
    best", the picked one on the highlighter) says otherwise: **usual** is
    the median of every whole week before this one, empty ones included, a
    day at a time and held so it never dips (offered once three whole weeks
    are in, `USUAL_MIN_WEEKS`); **best** is the best whole week so far. Last
    week alone was the harshest bar after a good week and no bar at all
    after a quiet one. The card's title follows the pick.
  - **Next milestone** (`NextMilestone`). The next round number in the
    term's hours, its figure first and its name as the aside ("10 hours ·
    double digits"; titled "The next line" and led by the name alone, it read
    as a riddle),
    counted out as `TallyMarks` from the last line crossed. Never more than
    twenty five strokes, so a long stretch has each stroke stand for more than
    an hour and the margin says how much. Not a bar.
  - **Your day, as a clock** (`StudyClock`). Midnight at the top, one stroke
    per hour as long as the time that has landed in it, the usual three hours
    inked and the rest pencil, a `warn` hand pointing at now. Under it the
    kind of studier those strokes make ("an evening regular", in the serif
    italic) with one more thing in Caveat ("and a weekend warrior", only once
    three weeks are in). Under the clock, "from 12 timed sessions": **only a
    session the timer watched is put on the clock**, since it is the only kind
    that knows when it happened. One logged after the fact used to be placed
    half its length before it was saved, and people log at night, so every
    one of them leaned the clock toward evening. It is read off `habits.peak`,
    which now needs five timed sessions across three days as well as 40% of
    the time in three hours, and says how many timed sessions are left until
    it does.
- **Records to beat** (`PersonalBests`), at the head of the aside: longest
  session, biggest day, best week, longest run, each with a dotted leader to
  the figure and, under it, the one in progress that could take it ("this
  week so far 3h 42m · 7h 13m to beat it"). A record set inside the last week
  gets a `warn` stamp that comes down on the page (`.stamp-down`), the one
  moment on Stats allowed to be loud. **Nothing is a record before two weeks
  and ten sessions** (`RECORDS_MIN_*`): in the first week every card was a
  new best every day. Until then the figures stand as they are under one
  line, "your first weeks set the marks", with no chase line and no stamp. A
  session closed for the reader (`recovery`) never sets one.
- **The lens.** Under the ledger line, a serif line "Reading · Every course
  · CS 101 · …", the picked one on the course's highlighter. It is read
  through everything under it: the race, the milestone (titled with the
  course), the clock, the records, Side by side, the weeks, the heatmap, the
  list, the grade and the log. It used to sit on the heatmap alone, so the
  rest of the page could only be read for the whole term. The masthead stays
  the term's hours.
- **Side by side** (`lib/stats-lens.ts`), under the chase row: a stretch of
  the term from every side the log can be read from, each figure set beside
  the same one for the stretch before. The stretch is picked top right,
  **This week · 4 weeks · Term**, and the standfirst under the heading says
  what it is set against. A week is this week so far against last week *by
  the same day* ("last week by now"), since a Wednesday against a whole week
  is a race nobody could win; four weeks is the last 28 days against the 28
  before; the term stands alone.
  - **The figures** (`SpanFigures`), one deckle card of labelled figures, an
    eyebrow over a 24px mono figure: hours, a day, days studied "of 7",
    sittings, usual sitting (the median, recovered sittings left out),
    longest, tasks finished "12 added", courses touched "3 of 4" (or time
    on a task when one course is being read), and practice papers with
    their average once one is marked. Under each, the change is **written,
    never drawn**: a small arrow, sage for more and clay (`warn`) for less,
    the difference in mono, then "on last week by now" in the serif. Less is
    a fact about the stretch, never an alarm; the same figure says "same as".
  - **Course against course** (`CourseBalance`), full width: each course's
    hours for the stretch as a rule in its colour, with a 1px `ink-soft`
    tick where its weekly goal, scaled to the stretch, falls ("asks 5h
    51m"). Every rule is on one scale, so the longest is the course that got
    the most. Beside it the last eight weeks as small bars with the goal as
    a dash, whole weeks on goal ("5/7", the week being lived never counted
    as a miss), sittings and the usual one, and when it was last sat ("last
    sat 9d ago" in `warn` past a week). The figure, right, carries its own
    change. Hours against hours: nothing on it is a percentage. Each row is
    a link to the course.
  - **When in the week** (`WeekRhythm`): a row per weekday, a column per
    hour, each cell inked as deep as the time that landed in it, with the
    fullest cell named over it ("fullest on tuesdays 9pm to 10pm · 55m")
    and a hovered or tapped one read out in its place. Only a sitting the
    timer ran is placed, each block spread across the hours it ran through;
    every sitting still counts toward its weekday's total at the row's end.
    Rows are the reader's days: with a day that ends at 8am, 3am after
    Sunday sits on Sunday's row, and the hours run from 8am across, so a
    night reads left to right instead of breaking at midnight. The clock in
    the chase row says when in the day; this says which evenings.
  - **How long you sit** (`SittingLengths`): sittings sorted into lengths,
    under 15m to 2h+. The bar is how many sittings; the mono figure under
    each is the hours that length carried, since twenty short sittings and
    two long ones can hold the same afternoon. The length carrying the most
    hours is inked, the rest pencil (`line-strong`).
- **Week by week** (`TermWeeks`), at the head of the main column: one bar a
  week for the whole term, stacked in the course colours, against the
  week's goal as a dashed line, with weeks still to come as dashed empty
  slots so the chart says where in the term today is. This week's number
  is on the highlighter. Over it, "a usual week 6h 38m · on goal 3 of 5".
  **A tap opens the week** underneath: its seven days as small stacked bars,
  each course's hours on a rule against a tick at its goal ("2h 52m / 4h"),
  and days, sittings, tasks finished and how far over or under a usual week
  it ran. It opens on this week, and replaced a chart of the last seven days
  that said less than Today's own week does. **Hours by course** in the
  aside went with it; Course against course says all of that and more.
- **Every day so far** (`Heatmap`): the months named in the serif italic
  over the week they start in, M / W / F down the side, the strip opened
  scrolled to today, as many weeks as the term has had (13 to 26). A blank
  day is drawn in the paper's tint at full strength: at 8% it vanished on
  the night paper and the grid looked half printed. A "less … more" key and
  a line that reads a tapped day ("Tuesday, Sep 22 · 1h 40m") sit under it.
- **The list, in and out** (`TaskFlow`), in the aside under the records:
  added and finished a pair of marks a week for eight weeks, added as a
  pencil outline and finished in ink, so a week that added more than it
  finished reads as an outline taller than its ink. Under it, what is open
  past its date (the figure in `warn`), what is due in the next seven days,
  and what a finished task with time on it has usually taken.
- **The log** at the foot is one dated list: sessions under the day they
  were studied, tasks under the day they were added or finished ("added",
  "finished", "skipped"). More than three tasks added on one day fold into
  one line, "14 tasks added", since an outline read in by Claude adds forty
  at once and buried the day's study under them.
- **The charts arrive.** The heatmap inks in a week at a time from the
  oldest (`.heat-in`) and rings today; the bars fill up from the rule
  (`.bar-grow`); the rules draw (`.rule-draw`); the figures in Side by side
  are dealt in (`.deal-in`).

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
- **The ledger line**, the same newspaper rule as Stats: tallies inked, pages
  bound, best run, margin days banked.
- **Explained once.** Until the first page binds anywhere, a `FirstNote`
  under the ledger line says what a tally is in minutes, that fifteen bind a
  page, that the run counts weeks and a day counts on time logged rather than
  on a tick, and that stamps come with the hours.
- **Course pages** (deckle card, serif heading). Each row is a link to the
  course: course rule and code, the name in the serif, the page's
  `TallyMarks` drawing themselves in on open, the distance to the next mark
  and to binding, and the bound pages drawn as the edge of a stack of ruled
  sheets. Ink fading is unchanged. The header says what a page is in hours
  ("15 tallies, about 10 hours, binds a page"), and a "how pages work"
  disclosure at the foot of the card (`PagesExplainer`, the same fold as
  "what makes a week count") says in plain words what a tally is in minutes,
  what binding does, and that bound pages feed the Pages bound impression and
  nothing else. It shows before any course exists too, since that is when
  the question gets asked. The course screen's panel carries the same fold,
  with the time to the next mark and to binding in mono figures.
- **The run** (aside). Weekday initials over the grid, the week in progress
  outlined, a `HandCheck` in the margin for a week that counted, and a legend
  for studied / margin / blank. The rules for what counts sit behind a
  "what makes a week count" disclosure, since they are looked up once and the
  grid is read daily. **A day counts on time, never on a tick**: twenty
  minutes logged, or pages that logged time stands behind (`creditedPages` on
  the day's `DayCredit`, each finished reading's pages held to the time on
  that very task, `min(claimed, covered)`). Ticking "buy the textbook" used to
  make a study day, and four of those banked a margin day. A skipped task
  contributes nothing. Paper still counts, through **Log time** on a course
  page (see Courses below).
- **Within reach** (aside). The first four Next Mark candidates. Today and the
  timer say one line and go quiet; this is where the rest of the board is.
- **The term, week by week** (`WeekLedger`, from `lib/progression/weeks.ts`),
  full width under the pages and the run: the term as a ledger, a line a
  week, newest first. Each line is "Wk 5" over the Monday's date, the week's
  days as the run draws them, its hours in mono over a thin rule against the
  best week (which carries "best week" in Caveat), the tallies it inked
  ("+14", and "1 bound" under it when a page bound), a stroke in each
  course's colour for every course it touched, and the week's `HandCheck`.
  Column heads are eyebrows from `md`. A tap opens the line: how the week
  counted in words ("5 study days, counted on its study days"), its biggest
  day, the tasks it finished, and each course's hours, tallies and bound
  pages for the week. Tallies are read off the credited running total per
  course, so a week's tallies always add up to the marks on the pages
  above. The run in the aside says which weeks counted; this says what each
  one held. Eight lines, then "every week, all 14".
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
- **The dot.** While there is news, the Record item in the rail, and the
  Stats tab in the bottom bar (the way to the Record on a phone), carry a 6px
  `ink` dot, never a count and never red. It reads
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

### Explained once
The rule under the quiet. Every screen is written for someone on their
thirtieth visit, and a screen written only for them is a wall to someone on
their first. So a thing explains itself the first time it is met, where it is
met, and never again:

- **When it goes is read off the data**, never a dismissed flag. The
  "Next Mark" line is not drawn at all on Today until the first session is
  logged. Better still is a thing that needs no note at all: the recall card
  explains itself by asking its question in full, so it has none. Nothing to close, nothing to reset, and a returning reader who has
  already done the thing never sees it.
- **`FirstNote`** (`components/FirstNote.tsx`) is how it is set: the serif in
  italic, 13.5px, `ink-soft`, a 2px `line-strong` rule down its left edge.
  It is the one place the app writes a paragraph on a working screen, so it
  is kept to three or four plain sentences that say what the thing is and
  what to do with it. No "tip", no icon, no close button.
- **An empty screen says what fills it.** A term with no tasks does not say
  "nothing due", which reads as caught up; Up next says what the space is
  for and offers the two ways to fill it (Claude, or adding a deadline), and
  a course timer while no session exists. It goes when the first task lands.

**Setup** (`/onboarding`) follows the same idea. It is four steps: what
Akada is, the courses (searched in the catalog, section picked, weekly goal
set at two hours a credit, a typed name for anything not listed), the term
(the one under way is already chosen), and **what's due**: the two ways to
get deadlines in, since everything Today draws runs off them. It asks for no
photo and not for the name signup already took; the daily goal keeps its
default and lives in Settings. Adding a new term's courses
(`?newSemester=1`) is the courses step and the deadlines step.

### The document shell
Every document (the guide, `/claude`, `/docs`, `/privacy`, `/terms`) sits in
one shell, `LegalPage`, drawn the way the app is on a laptop:

- **The rail** (`components/docs/DocRail.tsx`) sits on the desk
  (`--desk`), like the app's rail: the Akada mark, **Reading** (the five
  documents in `DOC_PAGES`, the open one on a `bg-tint` wash), the open
  page's sections under it (read off the sheet, any `section[id]` with an
  h2, so a page never restates its headings; the one being read follows the
  scroll), and at the foot "new here?" in the hand face over Create account
  and Open Akada. Laptop only (`lg`).
- **The sheet**: the page itself, `ruled-paper` with the margin rule, lying
  over the desk with the curved left edge and `--sheet-shadow`, exactly like
  `.page-sheet` in the app. On a phone there is no desk: a bar with the mark
  and Open Akada, then the page.
- **Type**: a 60px serif title (`Updated …` eyebrow above it on the legal
  pages), a 21px standfirst, section headings at 32px on a `line-strong`
  rule, prose at 17px/1.7 (`.legal-prose`). Steps a reader follows in order
  are `<ol class="doc-steps">`, numbered in mono in the margin.
- **Margin notes**: `Section` takes an `aside`, a few words in the hand face,
  out in the right margin at `xl` and under the heading below that. One or
  two a page, never a sentence of their own content that the page needs.
- **The pager** at the foot: previous and next in the reading order.
- A document's own "On this page" list (the guide and `/docs` have one)
  hides at `lg`, where the rail already lists the sections.

The shell changes how `/docs` and `/privacy` look without touching what they
say; their words belong to the connector's own work.

### The guide
`/guide` is the one place the app is allowed to explain itself at length,
which is why a screen explains a thing only once (see Explained once): the screens
stay quiet and the guide does the talking. It is public, set in the same
document shell as the privacy page and the terms (`LegalPage`, above, with a
standfirst instead of an "Updated" date), and written for someone who has
never used a planner. It opens on **Your first week**, the three habits everything
else is worked out from (deadlines in, the timer running, recall answered),
because that is the question a new reader actually arrives with; the
screens come after. Every sentence in it has to stay true of the app, so a
screen that changes changes its sentence here too. Bold words in it are the labels on the screen, so a
reader can go and find them.

It is reached from the landing page (the hero line, the feature rows, which
each link to their section, and the footer), from the onboarding welcome
and from Settings. Today used to carry a "New here? How Akada works" line
too; nobody leaves the app to read a guide on day one, and the empty states
do that job in place, so it went.

**Akada in Claude** (`/claude`) is the guide's sibling for the connector,
in the same shell and public for the same reason: it is the page to send a
friend. It shows the exchange (an outline handed over, the deadlines landing
on Today) as a drawn example labelled as one, the three-step setup, things
to say with a copy beside each, and what happens to data, in claims the code
backs. It never says "MCP", says "connector" only where Claude's own screens
do, and names no Claude plan. `/docs` stays the reference for every tool, and
`/privacy#assistants` the policy; both belong to the connector's own work and
are linked, never restated. Everything in the app that hands work to Claude
goes through **one sheet** (`components/claude/ClaudeSheet.tsx`, opened with
`useClaudeSheet().ask`, mounted once in the root layout): "Get them in with
Claude" on Today and in setup, "Ask Claude to read the outline" on a course,
"ask Claude" on a recall card and a course's Recall, "Questions before you
read" on a task, and "have Claude write one" and "ask Claude for one" on the
Study shelf. It used to be six behaviours: links to this page, toasts saying
something was copied, a button that copied without a word. The sheet says
what this one will do in one serif line ("Claude reads the ECON 100 outline
and proposes how it is marked. Nothing counts until you accept it here."),
shows the exact prompt it is about to copy in a scrollable serif block, has
Copy beside Close, and carries the same footer under every prompt: "Akada is
a connector in Claude. Connect it once (Claude › Customize › Connectors ›
Akada), then paste this into a chat with Akada switched on. **How to
connect**", which leads here through `CLAUDE_PAGE`. The app cannot see
whether an account is connected, so the footer is always there. After the
first one a reader knows what every Claude button does. The prompts live
beside what they are for (`lib/grading-prompt.ts`, `lib/recall/prompt.ts`,
`lib/notes/prompt.ts`, and `lib/claude-asks.ts` for the outline, note and
quiz asks). Settings has a Claude section for the same links.

**The landing page** is written for a LUMS student arriving from a group
chat link on a phone. The hero says the outcome (every deadline this term on
one page, filled in from the course outlines) and names the LUMS catalog,
since that is the hook nobody else has.

It is drawn in the app's own hand, because the page it replaced looked
nothing like the app it was selling: boxed cards on a flat ground, and cream
screenshots on a dark page. Now the page is **ruled paper** (`.ruled-paper`,
one faint line every 36px) with the notebook's **margin rule** down the left
(`.margin-rule`, a thin double line in faded rose), and everything sits on
rules rather than in panels:

- **Today, drawn** (`components/public/TodaySketch.tsx`) as a loose sheet
  (`.lift`, `bg-paper`) taped down (`.tape-strip`) over a second sheet turned
  the other way. Markup, not a screenshot, so it sits on the reader's paper.
  The screenshots it replaced went stale twice, once in tone and once in
  words; the drawing goes stale the same way if nobody minds it, so **when
  Today's parts or their names change, change the sketch in the same PR**.
  It shows only what Today really shows: the date line, Up next with its
  course rule and its row of figures, Start/Done/Tomorrow, today's hours with
  the day ledger, and Coming with its dates.
- **Margin notes** in the hand face (`font-hand`, muted ink), a few words
  each, with a drawn arrow where one points at something. Only where there is
  a margin: the ones beside the sketch appear at `xl`.
- **How it goes**: three steps divided by rules, numbered in mono (`01` `02`
  `03`), since those are digits.
- **Works inside Claude**: the same drawn exchange as `/claude` (ChatSketch,
  now two taped sheets), and beside the copy a two-column **Akada gets / Never
  gets** under a rule, each headed by a course rule in sage or rose rather
  than coloured text, which would fail contrast on cream.
- **What a to-do list doesn't do**: six rows on rules, two columns wide, each
  with a small drawing of the thing itself (48 pages over 2h 24m, a mono 80,
  clear/hazy/gone, week squares, a tally gate, a fan). Each row links to its
  guide section. If a row's claim stops being true, change the row.
- **The timer**: the real StudyFan standing on a rule, not boxed.

Highlighter (`.hl`) goes under "on one page" twice, top and bottom, and
nowhere else. The page makes no claim it cannot back: it said "works
offline" for a while, with no service worker behind it.

### The connector docs
`/docs` is the guide's sibling for the Claude connector, in the same
`LegalPage` shell with a standfirst: how to connect, what connecting allows,
and every tool. It is public, since the directory listing links to it. Each
tool is a row of its name, set like the guide's server URL (sans `code` on
`bg-tint`, never mono, since a tool name is a word and not a figure), and an
`.eyebrow` saying **Reads**, **Changes** or **Deletes**, which is the tool's
MCP annotation in words. Deletes is tinted `prioritySoft` rather than red.
The list lives in `app/docs/tools.ts`, and `app/api/mcp/scopes.test.ts`
fails when it drifts from the tools the server registers.

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
- **Pause** is the timer screen going quiet, not a switch: the clock lets its ink down to half over `480ms` and then breathes, slowly dimming and coming back on a `4.2s` cycle (`.held-breath`, dim to dimmer, never bright), the fan loses colour over `700ms` and closes its branches in like a flower at dusk, and the pause button crosses its glyph and word over (both are always rendered, stacked, so the button never changes width). Resume runs the same way back, the fan opening out with a small overshoot.
- **Presses** on the timer's buttons give a `0.97` scale on `:active`. Small enough to feel, never enough to read as a bounce.
- **Up next arriving.** The task body is keyed on the task, so when it changes (Done, Tomorrow, or the rule switched) the new one settles in and its course rule draws left to right (`.rule-draw`, `0.5s`). Done and Tomorrow first let the old task go with `.lift-away`, a `0.22s` fade and 6px lift, so the next one comes up into a space instead of replacing it in the same frame. The handwritten rule note settles when it is switched.
- **Up next is live.** Its meta line carries the time already put into the task (mono digits) and when it was last sat. With a timer running on it the line says "on the clock" beside a dot in the course colour pulsing on `tick`, and the figure counts up with the sitting.
- **Stats arriving.** Cards dealt in (`.deal-in`, `0.55s`, a 12px rise off a `-1.2deg` tilt), the heatmap inking in (`.heat-in`), bars filling from the rule (`.bar-grow`), lines drawn with a pen (`.ink-draw`, any path with `pathLength=1`), dots popping on (`.pop-in`), and a record stamped down (`.stamp-down`). See "Stats: the chase".
- **Every screen arrives.** `PageShell` sets `.page-in` on the content column: a `0.34s` 6px rise and fade on the app's curve, so moving between tabs no longer cuts in whole while Stats and the timer each had an entrance of their own. The rail, the bar and the dock hold still around it. Backwards fill only, so `main` carries no transform once it has landed and a sheet inside it is still placed against the viewport.
- **Sheets leave the way they came.** Every bottom sheet used to slide up and then vanish in a frame. `useLeaving` (and `<Leaving>` for a sheet written inline as `{value && ...}`) holds the last value on screen for `220ms` while `.sheet-leaving` fades the scrim and drops the panel 32px. The panel must be the wrapper's last child. A value that comes back mid-exit cancels it.
- **A tick is written in.** Ticking a task on a row fills the box with a small press (`.check-press`) and writes the `HandCheck` in a beat later (`drawn`, `.check-draw`), and the row fades to its done opacity over `300ms`. The toggle itself lands `420ms` after the tap, because Today's lists drop finished work and took the row away in the same frame it was ticked, so the check was never seen. Leaving the screen in that moment still saves it. A task that loads already done is drawn done, with no animation.
- **Hour strokes fill up.** `HourStrokes` fills each stroke from the bottom when it is first drawn, one hour after another (`.stroke-fill`, `45ms` apart), and a part hour rises in place while the clock runs.
- **The tab mark draws.** The rule under the current tab in `BottomNav` is drawn out from the middle as the screen changes (`.nav-mark`), a tab gives a `0.94` press, and the Record news dot pops on (`.pop-in`) in the bar and the rail.
- **Finish** holds the last frame of the sitting still behind the log sheet as it rises. Stopping empties the timer, and a block screen with no target left used to flip to open mode's night paper at 00:00 under the sheet.
