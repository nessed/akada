# Design audit

For ClickUp task [Detailed redesign and audit of the design](https://app.clickup.com/t/86eyv3ggv),
with findings that also belong to
[Remove AI telltale designs](https://app.clickup.com/t/86eyv7tkw) and
[Redesign and polish GPT-touched Akada UI](https://app.clickup.com/t/z8uq9m0bzg).

Audited against `readmedesign.md`, which is treated here as the specification
rather than a description. Every screen, every shared component, `globals.css`
and `lib/preferences.ts`.

## The short version

The app's interior is in better shape than the task list implies. The tasks
screen, the settings sheet, the stats page and the course page have all been
through a redesign since those tickets were written, and they hold the line:
highlighter swipes instead of chips, dashed rules instead of dividers, the
density variables, the eyebrow spec, the alarm ramp instead of red. There is
no red anywhere in the app, no emoji in any UI string, and three drop shadows
in total, all three earned.

The things that were genuinely off were concentrated in two places: the
**landing page**, which had never had the pass the interior screens had, and
the **density preference**, which was a setting that mostly did nothing.

Both are fixed in this branch. What is left is listed under "Still open".

## Fixed here

### 1. The landing page was the generic version of itself

It was the only screen still built out of stock marketing parts, and it broke
the design doc in four places at once.

| What was there | Rule it broke | What it is now |
| --- | --- | --- |
| Two `rounded-full` capsule buttons in the header | "The app does not use pills" | A `hand-underline` text link and a bordered rectangle |
| `<h1>` reading "Akada", under a header already reading "Akada" | The largest type on the page taught a stranger nothing | A sentence about what the app is for |
| Four-up bordered feature-card grid | "No Generic Dashboard Components" | A numbered contents list on the dashed rule the sheets use |
| `shadow-[0_24px_70px_...]` under the product shot | "No harsh drop shadows" | Sits on the ruled paper, tilted, taped down like `StickyNote` |
| A closing section restating the headline and asking for the account a third time | "No Over-Explaining" | One line above the footer |

The feature copy was rewritten at the same time. Each of the four entries
named a category ("Track assignments with priorities and clear due dates")
where it now names something the app actually does. Every claim was checked
against the code before it was written.

### 2. Density was a preference that did not reach the main screens

`Cozy` / `Comfy` / `Compact` in Appearance set `--density-gutter`,
`--density-gap` and `--density-section`, and `readmedesign.md` says anything
that should breathe with the reader's choice reads those rather than a fixed
px value.

Counting `density-` references per file before this branch:

```
app/stats/page.tsx                 10
app/courses/[courseId]/page.tsx     6
components/SettingsSheet.tsx        5
app/timer/page.tsx                  5
app/dashboard/page.tsx              1     <-- the app's home screen
app/tasks/page.tsx                  0     <-- the app's most-used screen
```

So a student who picked Compact got a tighter stats page and a dashboard and
task list that ignored them. The setting looked broken because on the screens
they spend their time on, it was.

Two variables were added rather than reusing the existing three, because the
existing three did not have the right values for this job and reusing them
would have moved the default layout:

```
--density-header    14 / 18 / 22px    a screen title's bottom margin
--density-block     18 / 22 / 28px    separation between blocks on a screen
```

The middle value in each is exactly what the hard-coded px was, so **Comfy
renders pixel-identical to before** and only Cozy and Compact change. Wired
into the tasks header and filter bar, the dashboard header and its week
section, and both course-page headers.

### 3. The doodle layer never worked under a finger

Covered in its own commit, listed here because it is a design failure before
it is a bug. Ink only appeared if the hand held still for 260ms first, there
was no affordance saying so, and the natural gesture — put a finger down and
drag — handed the stroke back to the scroller every time. A feature that only
works when you do the undiscoverable thing does not work.

Now a finger claims the gesture on movement the page had no use for (nothing
in the app scrolls sideways), a pen draws immediately, and the mouse is out of
it entirely.

## Still open

Ranked by how much they actually cost.

### A. The type scale is documented but not enforced

`readmedesign.md` fixes two title tiers and the eyebrow, and says nothing
about body text. In practice the app uses **32 distinct literal type sizes**,
17 of them at or below 20px:

```
9  10  10.5  11  11.5  12  12.5  13  13.5  14  14.5  15  16  17  18  19  20
```

Five of those are half-pixel values, spread across twelve files — the stats
page, the dashboard, the course page, the auth screen, `TaskItem`,
`CourseCard`, `SelectField`, `SectionPicker` and more. A 0.5px difference is
not a design decision anybody can see; it is what happens when a size is
nudged until it looks right in one spot and then copied.

Nothing looks wrong today — each was chosen for its place. The cost is future:
the next person adding a caption has seventeen precedents and no rule, and
that is how a scale rots. Worth putting a body scale in the doc (something
like 11 / 12 / 13 / 15 / 17) and reconciling the outliers to it, starting with
the half-pixels, which can all round without anyone noticing.

### B. Corner radii have drifted

Nine literal radii plus five Tailwind names are in use. `rounded-[10px]` (40
uses, sheet actions) and `rounded-[14px]` (13 uses, cards) are clearly the
system. The strays are `rounded-[8px]` (3), `rounded-[9px]` (1), `rounded-[12px]` (4),
`rounded-lg` (3) and `rounded-md` (2), which are all within 2px of one of the
two real values and read as accidents rather than decisions. Small cleanup,
worth doing in one pass.

### C. `MCP_SETUP.md` documents three of five tools

Out of scope for the visual audit but found on the way through: it omits
`get_tasks` and `get_overview` entirely, and still lists `list_tasks` under
"Roadmap" although it shipped as `get_tasks`. See
`docs/mcp-feature-research.md`.

### D. Things that look like violations and are not

Recorded so the next audit does not re-flag them.

- **`rounded-full`, 76 uses.** Almost all of them are avatars, status dots,
  sheet grab handles and 1.5px progress rails — shapes that are genuinely
  round. The pills the doc bans were the two on the landing page, now gone.
- **Dashed capsule "add" buttons** on the dashboard and onboarding. The doc
  names the dashed outline as a deliberate exception for "there is more you
  could add here".
- **Three drop shadows.** A dragged course card lifting off the page, the
  section picker's dropdown, and one on onboarding. Each is a surface that is
  genuinely above another surface.
- **Multiple `bg-primary` fills per file.** The rule is one filled action per
  *screen*, and a file holding three sheets legitimately holds three, since
  only one is ever on screen.

## Not audited

The onboarding flow and the timer screen were read but not worked on; neither
showed a doc violation. `app/error.tsx`, `not-found.tsx` and the legal pages
were skimmed only.
