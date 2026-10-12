# Fish variety: brief for the fish task

Read `CLAUDE.md` and the "The deep" section of `readmedesign.md` first. That section is binding and some of its rules will need editing on purpose (see the spec edits section). Another chat is doing the **places** work in parallel. Its plan is in `plans/zones-plan.md`. The seam between the two tasks is in "Where this plugs in".

## The problem

Every fish in the deep is the same animal with different settings.

- A fish is one body profile: `prof()` in `bilateral()`, `lib/ocean/anatomy.ts` ~line 1016. It's built from 3 numbers in the genome (`A` depth, `skew`, `blunt`), plus fins, tail type, pattern and so on (`rollGenome` in `lib/ocean/genome.ts`).
- The only real other shapes are the two lure fish, angler and dragon (`lureKind`).
- So every fish reads as "an oval fish with a forked or round tail". Different spots and fins don't fix that.
- Pools are 12 species per zone (`biome.ts`, `PER_ZONE`). Fish average 4.8 species in sunlight down to 1.8 in the trench, and 10%+ of sittings get **zero** fish in the abyss or trench.

The goal is **variety, not more fish**. Don't grow the pools. Cap fish per pool and make the fish in it different kinds of fish.

## The system

### 1. Fish forms

Add `form` to the fish genome: an archetype with its own silhouette, fins, posture and behaviour. Every form is a real fish family, drawn like a natural-history plate in the same pen (`pen.ts`), one ink and colour only in washes, per the spec. Continuous traits (size, pattern, hue, lit, clear) still roll inside a form, so two species of the same form still differ.

Form ids (the places task uses these exact strings in its `fishForms` wishlists):

| id | real fish | depth | silhouette and parts | behaviour |
|---|---|---|---|---|
| `jack` | mackerel, jack | sunlight | the current default body: torpedo, forked tail | schools |
| `sardine` | sardine, anchovy | sunlight, twilight top | small slim silver, forked tail | big schools, bait ball |
| `disc` | butterflyfish, angelfish | sunlight | tall flat disc, long dorsal and anal fins sweeping back, small mouth | alone or pairs, slow |
| `puffer` | puffer, boxfish | sunlight | round or boxy, tiny fins, small tail, beak mouth | slow, hovers |
| `barracuda` | barracuda, needlefish | sunlight, twilight | long and slim, pointed jaw jutting forward, two small dorsals set far back | alone, fast, still then darting |
| `sunfish` | mola | sunlight, twilight | huge tall disc cut off behind, tall dorsal and anal fins, no real tail (a clavus) | rare, very slow, big |
| `lantern` | lanternfish | twilight, midnight | small, huge eye, rows of photophores along the belly | schools, blinks |
| `hatchet` | hatchetfish | twilight | deep keel belly, very thin tail stock, tubular eyes looking up, silver | small groups, hangs |
| `barreleye` | barreleye | twilight | clear dome head with green tubular eyes inside it, big flat fins | alone, hovers still |
| `bristlemouth` | bristlemouth | twilight, midnight | tiny, slim, long jaw | big loose shoals, faint |
| `viper` | viperfish | twilight, midnight | long body, fangs too long for the mouth, first dorsal ray long and lit | alone (extends the dragon) |
| `fangtooth` | fangtooth | midnight, abyss | short and heavy, huge head, huge teeth | alone, slow |
| `angler` | anglerfish | midnight, abyss | already exists | alone |
| `gulper` | gulper eel | midnight, abyss | mostly mouth, a whip body, lit tail tip (eel plan, own form) | alone, drifts |
| `grenadier` | rattail, grenadier | midnight to trench | big head, body tapering to a rat tail with **no tail fin** | swims head-down, near the floor |
| `tripod` | tripod fish | abyss | stands on the floor on two long fin-ray stilts and a tail ray, facing the current | floor, still for long spells |
| `cusk` | cusk-eel | abyss, trench | long and soft, fins run round the back end, small eye | near the floor |
| `snailfish` | hadal snailfish | trench | tadpole: big soft head, tapering body, pale pink and see-through, no scales | hovers over the floor, slow |
| `eelpout` | vent eelpout | abyss vents | thick eel-ish body, big lips | lies by vents |
| `flatfish` | flounder, tonguefish | sunlight sand to abyss | flat on the floor, both eyes on top | floor, lies still then shuffles |

Keep `angler` and `dragon` working as they are, and fold them in as forms. `jawed()` and the spec's "a fish with a lure is a dark hunter" still hold.

### 2. Pool makeup with a cap

Pools stay **12 species**. Inside a pool:

- **fish budget by depth:** sunlight 6, twilight 6, midnight 5, abyss 4, trench 4
- **floor of 2 fish** in every pool, so no zone or place is ever fishless
- **no two fish species of the same form in one pool.** Two are allowed only for the schooling forms (`sardine`, `lantern`, `bristlemouth`), and only if they look different (different hue and pattern).
- **forms are drawn from the depth's list**, weighted by the place's `fishForms` wishlist when there is one
- the rest of the pool (jellies, eels, rays, squid, floor things) rolls as now

That gives a pool of 4–6 fish that are 4–6 *different kinds* of fish.

### 3. Behaviour per form

`schedule.ts` already does schools, curious fish, floor animals and per-plan speed. Add per-form posture and motion through the same `Visitor` fields:

- the tripod standing still on the floor
- the snailfish and barreleye hovering
- the grenadier swimming tilted head-down
- the barracuda's still-then-dart
- the sunfish's slow roll

Keep `visitorsAt` a pure function of the slot. No simulation, per the spec's "Reproducible".

### 4. Names

`names.ts` builds names from plan roots. Give each form its own Latin-ish roots, e.g. `-myctum` for lantern, `-sternus` for hatchet, `-coryphus` for grenadier, `-liparis` for snailfish, `-mola` for sunfish. That way names read as different animals too. Keep names invented and never a real binomial, per the comment at the top of `names.ts`.

### 5. Variety across sittings (optional, do last)

A course's 6 regulars are the same forever right now. Consider rotating the regulars slowly, e.g. re-roll half of them per term week, so a course's sea drifts over a term without losing its familiar faces inside a week. Only do this if it stays a pure function of the course and the sitting's start time.

## Where this plugs in

The places task changes pools from one per **zone** to one per **leg** (a stretch of the dive with its own place). It builds each leg's pool by calling:

```ts
composePool(src: { courseKey: string; sittingKey: string }, leg: Leg, place: Place): Species[]
```

Its first PR fills `composePool` with today's logic, a straight move of `rollSpecies` / the pool loop from `biome.ts`. **This task owns what's inside `composePool`**, plus `genome.ts`, `anatomy.ts`, `names.ts` and `sprites.ts`. The places task won't touch those files.

To avoid conflicts:
- **Before the places PR lands:** build the forms in `genome.ts` / `anatomy.ts` / `names.ts` / `sprites.ts` with tests, and leave `biome.ts` alone. A form can be rolled from a test without any pool.
- **After it lands:** pull `main`, then put the fish budget and form picking inside `composePool`, reading `place.fishForms`.

## Spec edits this needs

These rules in `readmedesign.md` ("The deep") will fail on purpose with the new forms. Change them in the same commit as the form that breaks them:

- "every fish has a tail fin at least a fifth of its body long": the grenadier has a rat tail with no fin, and the sunfish has a clavus. Keep the rule for the rest. The lemon problem it guards against is real.
- "A fish carries one dorsal fin, no higher than a third of its depth": the disc, sunfish and viper break it
- "its mouth is a shut, level cleft": the fangtooth, viper and gulper don't have one
- the "nine body plans" line: add that fish come in forms

Add a short line per form to the spec saying how it's drawn, matching how the angler and dragon are described now.

## Checks

- `npm run typecheck` and `npm run lint` (all CI runs). `npm test` for the ocean tests: `lib/ocean/ocean.test.ts`, `lib/ocean/picture/picture.test.ts`.
- New tests:
  - every form rolls and builds an anatomy without NaNs
  - pool budget and the floor of 2 hold over a few thousand seeds
  - no duplicate forms except the schooling ones
  - forms only appear inside their depth range
- Look at each form drawn big (the picture path, `printDetail`) and small (live). The spec's anti-patterns apply: no gloss highlights, no cartoon, no patterns that read as a grid.
- To run the app: `echo 'NEXT_PUBLIC_USE_LOCAL_DATA=true' > .env.local && npm run dev`, choose the deep in Settings › Timer. Delete `.env.local` after.

## Shipping order

1. Forms batch 1, sunlight and twilight: `jack` (refactor of today's), `sardine`, `disc`, `puffer`, `barracuda`, `lantern`, `hatchet`, `barreleye`
2. Forms batch 2, deep: `viper`, `fangtooth`, `gulper`, `grenadier`, `cusk`, `snailfish`, `eelpout`, `tripod`, `flatfish`, `sunfish`, `bristlemouth`
3. The pool cap system inside `composePool` (after the places PR is on `main`)
4. Behaviour per form
5. Optional: regulars rotating over a term
