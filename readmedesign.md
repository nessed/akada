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
- **Screen title**, `text-[36px]` at `tracking-[-0.025em]`, serif.
- **Section heading**, `text-[17px]`/`text-[20px]`, serif medium.

Two deliberate exceptions: the stats masthead is `52px`, which is the one
editorial flourish in the app, and the dashboard's date is `32px` because it
is a date rather than a title. Everything else follows the tiers.

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
