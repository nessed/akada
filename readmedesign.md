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
in Settings → Paper. `Paper` is what the app ships with; `Warm`, `Stone` and
`Night` are the alternatives. (`White` was a fifth and is gone; a stored
record that still names it reads as `Stone`.) Every value below is the shipped `Paper` tone, and the
authority for all of them is `PAPER_TONES` in `lib/preferences.ts`, mirrored
into `:root` in `globals.css` so the first paint needs no correction.

- **Backgrounds (`bg`, `bg-tint`, `paper`, `paper-2`)**: `#F5F1E8`, `#EDE7D8`,
  `#FBF8EF`, `#F7F3E6`. Warm cream throughout, cards are a lighter cream, not
  white. True `#FFFFFF` appears only in the `Stone` tone.
- **Lines (`line`, `line-soft`, `line-strong`)**: `#DDD6C2`, `#EAE4D3`,
  `#C9C0A8`. Borders and dividers resemble the faint ruled lines of a notebook
  rather than harsh digital borders.
- **Text (`ink`, `ink-soft`, `muted`)**: `#1A1714`, `#4B4640`, `#6F6A5D`.
  Instead of pure black, text relies on deep, warm charcoals, mimicking pen
  ink and reducing eye strain. `muted` carries every label and caption, and it
  is set dark enough to be read rather than only noticed: 4.78:1 on the
  shipped paper, which is the tightest of the daylight stocks.
- **`muted-soft` (`#B5AE99`) is not a text colour.** It is rules, ghost tally
  strokes and disabled states. There is no such thing as text that should
  barely register — if something is not worth reading, take it off the page.
  `scripts/check-contrast.mjs` reads `PAPER_TONES` and `globals.css` directly
  and fails if any text token drops under 4.5:1 on any stock's bg, paper or
  paper-2. Run it with `npm run contrast`.
- **Primary (`primary`)**: resolves to `ink`. It is the fill on the one
  primary action a screen is allowed.

### The Pastel Highlighter Palette
For course categorization and tags, Akada uses a beautifully crafted palette of muted pastels. Each color is paired with a soft "tint" version used for backgrounds, while the strong value is used for text, borders, or accents.

`PASTEL_PALETTE` in `lib/utils.ts` is the source of truth, it is what a course
is actually coloured with. The `--sage`…`--mauve` variables in `globals.css`
mirror it exactly, for the places that need a pastel without owning a course.
If the two ever disagree again, `lib/utils.ts` wins.
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
- **`warn` / `warnSoft` / `warnTint`**: `#9E5A3F`, `#846836`, `#F4ECDC`. The
  quiet tone: an overdue date, a course that has gone untouched.
- **`priority` / `prioritySoft` / `priorityTint`**: `#A8503C`, `#8F4531`,
  `#F4DCD2`. Inline errors, high-priority tasks, destructive affordances.

Both ramps carry words as often as they carry marks — an overdue date is a
word — so both are set at the contrast a word needs: 4.67, 4.64, 4.80 and 6.08
against the shipped paper. Muted does not mean unreadable.

## 🖋️ Typography
Three families, and no choice to make. The heading-font picker is gone along
with the faces it chose between: there is one serif now, and it carries every
heading and every line of prose the app speaks in.
- **Serif (`Source Serif 4`)**: Headings, prose, the quiet italic asides. It is
  here for its optical sizing — the 52px review masthead and a 13px italic
  caption are the same cut of type twice.
- **Sans-Serif (`Schibsted Grotesk`)**: The structural layer. Labels, list
  rows, buttons, anything that is furniture rather than voice.
- **Monospace (`Space Mono`)**: Durations, dates, page counts, the clock.
  Anything that is a measurement rather than a word.
- **No script face.** `Caveat` and the `HandNote` primitive are gone.
  Marginalia is *drawn* now (`Marginalia`, in `components/notebook`), because a
  font pretending to be handwriting reads as a quirky UI font at small sizes,
  not as something a person left on the page. Every mark it draws can be
  turned off in Settings → Paper.

> One trap worth knowing about: `'Source Serif 4'` must keep its quotes
> wherever it is written into a font stack. An unquoted CSS family name is a
> sequence of identifiers and `4` is not a valid one, so the bare form makes
> the whole `font-family` declaration invalid at computed-value time. The
> property then silently falls back to the inherited value, and every heading
> in the app renders in the sans with nothing in the console to say so.

### The Eyebrow
One caption spec, `.eyebrow` in `globals.css`: 11px, 600 weight, uppercase,
`0.12em` tracking, `ink-soft`. Section headers, field labels, course codes and
"Wk 14" all use it. It names every section on every screen, so it is set to be
read at a glance: 10px of `muted` at `0.16em` was a texture where a word was
wanted. Nothing in the app is set below 11px. It sits in `@layer components`, so a colour, a mono family
or a tighter tracking set alongside it still wins, that is how the badges and
the timer's display caption keep their own letterspacing.

### Type scale
Two title tiers, so a screen title is recognisable as one:
- **Screen title**, `text-[36px]` at `tracking-[-0.025em]`, serif.
- **Section heading**, `text-[17px]`/`text-[20px]`, serif medium.

Two deliberate exceptions: the Review masthead is `52px`, which is the one
editorial flourish in the app, and the dashboard's date runs to `46px` because
it is a date rather than a title. Everything else follows the tiers.

### Marks, not chips
The app does not use pills, and **corners are square throughout**. The only
curves left are circles (an avatar, a course dot) and the deliberately uneven
radius of a hand-drawn checkbox.

A capsule with a tinted fill is how software says "selected"; a page says it
with a **swipe of highlighter** (`.hl`, or `.hl-swipe` with `--hl` set to a
course's tint), a **rule bitten across the page** (`.rule-ink`, 1.5px of full
ink, which is how every screen opens), a **dashed row divider** (`.row-rule`),
a **tally stroke** (`Tally`, `.tally-stroke`), a **scribble box** and tick
(`.scribble-box` + `HandCheck`), or a **drawn mark in the margin**
(`Marginalia`). Filters, chosen courses, reflection tags, paper stocks, the
review day and priority marks all read this way.

The exceptions are deliberate: a **dashed outline** for "there is more you
could add here", and the one filled action per screen.

**Tally marks replace every progress bar.** A bar says "73% complete"; a row
of strokes says "you did four, you said eight", which is the same fact without
the arithmetic. The last stroke is allowed to be a stub, so half an hour reads
as half a mark rather than rounding up to flatter anybody.

**But the strokes never carry the fact alone.** Counting marks is work, and
nobody arrives knowing what one stroke is worth, so every tally is set beside
its own reading in mono — "4h of 8h" — and carries that sentence as its
accessible name. The same rule holds anywhere the app draws rather than
writes: a duration is words first and a picture second. This is the one place
the "no over-explaining" rule above is deliberately overruled. Not explaining
and not saying are different things, and a number nobody can read is not
restraint.

### Buttons
Two shapes, not four:
- **Page CTA**, full width, `min-h-[56px]`, square, `text-[15px]`.
- **Sheet action pair**, the confirming half `flex-1` and the quiet half
  `flex-none`, `py-3.5`, square, `text-sm`. See `SheetActions` in
  `components/Sheet.tsx`, which is the only place either shape is written.

Solid `bg-primary` fill belongs to the one primary action on a screen. A
*selection* is never a solid fill: it is a `bg-tint` wash with an ink border
or an accent tick (see `SectionPicker`).

### Density
`Airy` / `Normal` / `Tight` in Settings → Paper set `--density-gutter`,
`--density-gap` and `--density-section` on `:root`. Anything that wants to
breathe with the reader's choice should use those rather than a fixed px
value. `Normal` is the shipped middle at a 22px gutter. (These were `Cozy` /
`Comfy` / `Compact`; the values did not change, only the names, and a stored
record is migrated on read.)

## 🖼️ Textures & Custom UI Elements
- **Radial Mesh Gradients**: The global background (`globals.css`) incorporates very subtle radial gradients `rgba(180, 170, 140, 0.10)`. This uneven lighting effect breathes life into the background, making the "paper" feel slightly textured and organic rather than a flat digital canvas.
- **Notebook Range Sliders**: The native `<input type="range">` elements are deeply customized to resemble tactile physical knobs sitting on top of notebook lines.
- **Clean App Chrome**: Scrollbars are entirely hidden across the application, achieving a seamless, native-app feel that doesn't distract the user.

## 🎬 Micro-Animations
Movement in the app is soft and deliberate:
- **`slide-up`**: A smooth `0.26s` entrance using a custom cubic-bezier curve (`0.2, 0.7, 0.2, 1`), ensuring panels and modals float in weightlessly.
- **`fade-in`**: Subtle opacity transitions for dynamic content.
- **`tick`**: A slow, `2.4s` pulsing animation used during active study timers to indicate progression without frantic or stressful ticking.
