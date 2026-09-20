# Working in this repo

## Shipping: don't ask, just ship

Standing authorization from the repo owner. Take it as given on every task,
in every session, without checking back:

- Commit, push, open the PR, and **merge to `main`** yourself.
- Do not ask whether to push. Do not ask whether to merge. Do not open a PR
  as a draft and wait — mark it ready and merge it.
- Do not ask which branch. Work on the session's designated branch if one was
  given, otherwise a short descriptive one, and merge it into `main` when the
  work is done.
- Do not stop at "want me to also do X?" when X is plainly part of the thing
  that was asked for. Do it.

The one gate: **CI must be green on the head you merge.** Wait for it, then
merge. A red check is work to fix, not a reason to come back and ask. If a
failure is genuinely not yours (red on `main` too), say so in one line and
keep going.

Ask only when the work itself is ambiguous in a way that changes what gets
built — a real fork in taste or scope where guessing wrong wastes the effort.
Never ask about the mechanics of shipping.

## What CI actually runs

`.github/workflows/ci.yml` runs exactly two things, and they're what to run
locally before pushing:

```
npm run typecheck   # next typegen && tsc --noEmit
npm run lint        # eslint .
```

**`npm run build` fails locally and that is expected.** It reaches
`✓ Compiled successfully`, finishes TypeScript, then dies at prerender with
"Akada is not configured: NEXT_PUBLIC_SUPABASE_URL and
NEXT_PUBLIC_SUPABASE_ANON_KEY are both required." That guard in
`lib/data/index.ts` is deliberate and CI deliberately does not run a build —
the workflow file explains why. Don't treat it as a regression, don't
"fix" it, and don't report it as a blocker.

To actually run the app locally:

```
echo 'NEXT_PUBLIC_USE_LOCAL_DATA=true' > .env.local
npm run dev
```

Delete `.env.local` when done. The real production build is verified by the
Vercel deployment on the PR — that's the check that proves a build works.

## Design

**Read [`readmedesign.md`](./readmedesign.md) before changing anything the
user sees.** It is the design spec — the palette, the paper tones, the type
scale, the layout system, and a list of anti-patterns the app deliberately
rejects. It is not background reading; it is the thing that decides whether a
change belongs. Treat its "What We Strictly Avoid" section as binding.

The short version, so a wrong turn is obvious before you open it: the app is a
paper notebook — cream tones, deckle edges, doodles in the margin, Fraunces
for headings, handwriting for marginalia. Small type has a job. The serif sets
prose and standfirsts, `.eyebrow` (10px uppercase sans) sets labels and section
headers, and mono is digits only: the timer face, hour counts, grades, anything
tabular. Mono never sets prose, and never sits as a kicker above a serif
heading — that shape is what makes an app look machine-made and it was
deliberately removed.

**When a change alters any of that, update `readmedesign.md` in the same
commit.** A spec that lags the code is worse than no spec, because the next
session trusts it. This has already bitten once: the file claimed every screen
title sat under a line of 12px mono for as long as it took to notice.

Paper tones, the night paper, and the heading-font choice all live in
`lib/preferences.ts` and are written onto the root element as inline custom
properties before first paint. A stylesheet rule cannot beat them — change
the tokens there, not in `globals.css`.
