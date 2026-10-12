# Places: every stretch of the dive looks new

## What's wrong now

The depth runs on 5 zones: sunlight (0–15 min), twilight (15–50), midnight (50–110), abyss (110–180), trench (180–600). After about 1h50 the screen stops changing:

- the water is near-black from the abyss down. `waterAt` z only goes 0.85 → 1 over 8 hours.
- the floor is one fixed strip of silt, plus vents if the sitting rolled them (`floorSprite` in `draw.ts`)
- the rocks that scroll by carry the same growth kit from 50 min onward, since `KITS[Math.min(2, zone)]` puts midnight, abyss and trench on one kit
- the trench isn't drawn on the live timer at all. Its walls only exist in the saved picture (`trenchWallX` in `picture/layout.ts`).
- the animal pool is one per zone, so the trench runs on the same 12 species from 3h to 10h

A 3–7 hour sitting spends most of its time on one look.

## The idea

Cut the dive into **legs**. Each leg is a **place**: a real piece of the deep sea with its own scenery, water, rock growth, margin name and animal pool. The 5 zones stay as they are (depth, the zone shimmer, events, everything keyed on zone numbers). Places sit inside the zones and turn over as you sink.

Each sitting rolls its own **route**, picking a place for every leg from the ones that live at that depth. The same place never comes twice in a row. So two 5-hour sittings don't go through the same places.

### Where the legs are cut

| zone | legs start at | focus time |
|---|---|---|
| sunlight | 0 m | 0 |
| twilight | 200 m, 500 m | 15, 28 min |
| midnight | 1,000 m, 2,500 m | 50, 80 min |
| abyss | 4,000 m, 5,000 m | 1h50, 2h25 |
| trench | every 500 m from 6,000 m | 3h, then every 42 min |

A 3–7h sitting passes through 6 trench places. A full 7h sitting goes through about 13 places total.

### The places

All real things that live at those depths.

**Sunlight**, one leg, rolled:
- **kelp forest**: already exists (`kelp.ts`)
- **reef**: already exists (the coral rocks)
- **open water**: new. No rocks, more light shafts, the water a little bluer-green. A bait ball can come through (fish task).

**Twilight**, two legs:
- **the scattering layer** (300–500 m): a band of thousands of tiny lanternfish and krill specks you sink through. It's the real layer sonar used to mistake for the sea floor. Drawn like dense marine snow that moves together and catches the light.
- **the drop-off**: a wall down one side of the page that you sink along, with plate coral, fans and whips going pale
- **open twilight**: the current look, kept as one option

**Midnight**, two legs:
- **cold-water coral mounds**: heaps of white branching coral (Lophelia), real down to ~3,000 m
- **seamount flank**: a slope with sponge gardens, bamboo coral and sea lilies
- **brine pool**: a lake on the sea floor with its own shoreline and surface, ringed with mussel beds. Real at ~650–2,000 m.
- **the midwater**: open dark, more lit animals, the storm event more likely

**Abyss**, two legs:
- **nodule plain**: flat ooze strewn with black manganese lumps, xenophyophores (big lumpy single-celled things), sea cucumber trails
- **vent field**: the black smokers that already exist, plus red tube worm bushes, crabs and white shrimp crowding the chimneys
- **cold seep**: mussel and clam beds, tube worms, a faint shimmer of brine
- **the whale fall** stays an event and isn't a place

**Trench**, every 500 m. Rolled per leg from what lives at that depth, never the same twice in a row:
- **trench wall**: the walls rise in from both sides on the live timer for the first time, with ledges carrying sea lilies and sponges. They close in as you go deeper, so the trench actually reads as a trench.
- **rubble slope**: a landslide scar, broken rock tumbled down one wall
- **snailfish grounds** (6,000–8,300 m): pale hovering snailfish over the floor, amphipods swarming
- **hadal seep** (down to 9,500 m): tube worms and clams. This is the deepest life ever found living off chemistry (found 2025).
- **trench floor**: soft sediment, sea cucumbers, xenophyophores, giant amphipods
- **challenger deep** (from 10,500 m): the bottom. The walls nearly meet and the floor is soft ooze. Most sittings never get here, which is the point.

The trench wall is the base of every trench leg. The other trench places sit on top of it.

### What changes per place

Each place in the catalogue sets:

- **margin name**: crossing into a leg writes `the vent field · 4,000 m` in the margin, the same hand and timing as the zone note now. The shimmer stays on zone changes only.
- **water**: a haze tint mixed into the zone's colour, held within a few L* so the deep stays dark the way the spec wants. Plus snow density, and how much the animals' own light shows. The vents get a faint warm murk, the brine pool a cold sheen, the trench floor a thick silt snow.
- **scenery**: the set-piece. Floor places swap the floor sprite. Wall places draw walls. Midwater places have neither.
- **rock growth kit**: what grows on passing rocks, per place instead of per zone
- **animal pool**: its own pool (see the animals section)

### Moving between places

Midwater places hand over as you sink. The old place's scenery scrolls up and out, like the kelp ledge does now, and the new one comes up from below.

Floor places can't scroll up because the floor stays at the bottom. So the current carries you across instead: the old floor slides off one side over about 90 seconds and the new one comes in from the other, in the current's direction.

The trench walls are continuous across trench legs. They narrow with depth, and only what's on them changes.

### Animals (the seam with the fish task)

Pools go from one per **zone** to one per **leg**. Same size, 12 species, so there are no more animals on screen, only different ones as you go. Half are course regulars and half are new for that sitting, same as now.

The route builds each leg's pool by calling `composePool(src, leg, place)`. My first PR does that with today's logic, so nothing changes in what gets rolled except that pools turn over per leg. The fish task then owns what's inside `composePool`: fish forms, the fish cap, and pool makeup. Each place carries a `fishForms` wishlist (ids listed in the fish brief) that `composePool` reads.

`Species` gets a `leg` field next to `zone`. Recap and picture keep reading `zone` for "deepest water", so nothing there breaks.

## Code

- `lib/ocean/places.ts` (new): the place catalogue, `routeOf(sittingKey)`, `legAt(focusSeconds)`. Pure data and tested, like `depth.ts`.
- `lib/ocean/biome.ts`: pools per leg via `composePool`
- `lib/ocean/schedule.ts`: pick from the leg's pool instead of the zone's
- `lib/ocean/palette.ts`: `waterAt` takes the place's haze, snow and glow
- `lib/ocean/outcrop.ts`: growth kit per place
- `lib/ocean/walls.ts` (new): live trench walls, sharing the geometry with the picture's (`trenchWallX` moves out of `picture/layout.ts` into here)
- `lib/ocean/scenery.ts` (new): the floor and midwater set-pieces, all in `pen.ts`
- `components/OceanScene.tsx`: crossing marks per leg, handovers
- `lib/ocean/recap.ts`: the recap can name the deepest place reached, e.g. `down to 7,412 m · the snailfish grounds · met …`
- `picture/`: the whole-sitting picture shows the places it passed
- `readmedesign.md`: the deep section gets a "places" part, and "The way down is marked" changes
- `CLAUDE.md`: a "where things live" line for `places.ts`

## Shipping order

1. **The route.** Places, legs, margin names, water per place, pools per leg (today's composition), growth kits per place, live trench walls. The biggest visible change on its own, because the trench finally looks like a trench.
2. **Floor and wall set-pieces:** nodule plain, vent field with tube worms, cold seep, brine pool, coral mounds, seamount flank, rubble slope, hadal seep, trench floor, challenger deep. Plus the floor handover.
3. **Midwater set-pieces:** the scattering layer, open water, the drop-off.
4. **The picture and the recap** know about places.

Each one: typecheck, lint and tests green, then merge.

## Decisions

- **Old sittings:** a sitting dived again after this shows the new places and per-leg pools. Pictures already saved as files don't change. Default: fine.
- **Below 8,400 m** real fish stop, and only amphipods and sea cucumbers live there. Default: fish thin out down there but never hit zero, since you want fish.
- **No population increase:** the screen stays at today's crowd. Variety comes from turnover.
