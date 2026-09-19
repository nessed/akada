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
- **Monospace (`JetBrains Mono`)**: Used purposefully for data, durations, and the study timer, grounding the numbers in a precise, tool-like feel.
- **Handwriting (`Caveat`)**: Reserved for marginalia, the `HandNote` primitive and the `.font-hand` utility. Never for UI text.

### The Eyebrow
One caption spec, `.eyebrow` in `globals.css`: 10px, 600 weight, uppercase,
`0.16em` tracking, `muted`. Section headers, field labels, course codes and
"Wk 14" all use it. It sits in `@layer components`, so a colour, a mono family
or a tighter tracking set alongside it still wins, that is how the badges and
the timer's display caption keep their own letterspacing.

### Type scale
Two title tiers, so a screen title is recognisable as one:
- **Screen title**, `text-[36px]` at `tracking-[-0.025em]`, serif, dropping
  to `32px` on phone.
- **Section heading**, `text-[17px]`/`text-[20px]`, serif medium.

One deliberate exception: the stats masthead is `52px`, which is the one
editorial flourish in the app. Every screen title now sits under a line of
mono at `12px` carrying the date, the week and the counts, rather than
turning that information into the title.

Scales the desktop screens are built on: type 10 / 11 / 12 / 13 / 14 / 17 /
20 / 28 / 36; space 4 / 8 / 12 / 16 / 24 / 32 / 48; radii 4 for marks, 10 for
fields and buttons, 14 for panels. Hit targets are 40px and a task row is
48px.

### Layout: the rail and the sheet
The app is one design read at two widths.

Below `md` it is the sheet it has always been: a centred column, `BottomNav`
along the bottom (Today, Tasks, Stats, Stamps), and the timer dock floating
at the top while a session runs.

At `md` and above a **232px rail** takes over and both of those hide
themselves. The rail carries the five screens, the term's courses under them
in the order the dashboard was dragged into, the timer, and Settings. It
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

Open mode is the **one screen in the app that inverts**, and it does so with
literal values rather than the paper tokens, because on the night ground
`text-ink` is still the daylight ink.

### Marks, not chips
The app does not use pills. A capsule with a tinted fill is how software says
"selected"; a page says it with a **swipe of highlighter** (`.hl`, or
`.hl-swipe` with `--hl` set to a course's tint), a **hand-drawn underline**
(`.hand-underline`), a **scribble box** and tick (`.scribble-box` +
`HandCheck`), or a note in the margin (`HandNote`, Caveat). Filters, chosen
courses, reflection tags, timer goals and priority marks all read this way.

The exceptions are deliberate: a **dashed outline** for "there is more you
could add here", and the timer's single filled action.

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
