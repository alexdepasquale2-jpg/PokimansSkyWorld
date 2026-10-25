# Coremind — AURA

**Status:** Approved (session owner, 2026-08-14 — “blast it / go”)
**Scope:** Local vanilla JS. No new dependencies. Save format v7, loads v1–v6.

## Goal

Stop playing Coremind as a camera over a spreadsheet. Play it as a mind inside a weather of living signals.

The earth peels so three depths are one picture. Time bends when you think. The dark is only what no body has tasted. Hunger, dread, brood and war paint the rock. Under that skin the sim spends its budget where the mind is looking, so a phone can hold a ten-layer war that never paused.

This is one expansion. Four organs. One clock.

## Why this is the leap

Previous passes added floors, orders, upgrades, influence. The player still *looks at a map* and *waits on 10 Hz ants*. AURA changes the verb:

- You do not inspect a layer. You **peel the earth**.
- You do not tap a speed chip to feel precise. You **think**, and the world waits.
- You do not count units. You **read the weather**.
- You are not a god with full vision. You **see through bodies**.

Frame-time is a side effect of that fantasy, not the product.

## The four organs

| Organ | File | What the player feels | What the engine spends |
| --- | --- | --- | --- |
| Weather | `js/aura.js` | The colony is a climate of hunger, dread, brood, war | One coarse grid per *viewed* depth |
| Thought | `js/mind.js` | Issuing an order slows the world; releasing it lets years pass | `effectiveSpeed`, interpolation α, fovea/dream bands |
| Peel | `js/peel.js` | Two ghost strata hang off the one you inhabit | Extra draw of adjacent depths, no extra sim |
| Sense | `js/sense.js` | Unseen ground is rumor, not fog-of-war grey | Coverage grid + decaying pings |

`js/influence.js` stays. Influence is *what the architecture did to the rock*. AURA weather is *what the living are feeling right now*. Both can be on. They are not the same field.

## Organ 1 — Weather

Six channels, stamped each tick onto a coarse grid (cell size **8** world cells → 32×32 per depth):

| Channel | Color | Sources | Gameplay (multipliers on existing AI, no new states) |
| --- | --- | --- | --- |
| `hunger` | 126, 224, 129 | Hunger>55 bodies, stripped forage, empty granary | SEEK_FOOD score `× (1 + min(0.55, hunger*0.18))` toward that cell |
| `dread` | 154, 92, 212 | FLEE state, predator within 6, chamber integrity<70 | FLEE score `× (1 + min(0.7, dread*0.22))`; wild prey leave the cell |
| `brood` | 208, 122, 164 | REPRODUCE, nursery radius, assigned breed labor | REPRODUCE score `× (1 + min(0.4, brood*0.15))` |
| `war` | 239, 91, 91 | ATTACK/melee this tick, hostile on a chamber | Idle DEFEND/HOLD bodies on that layer promote to **fovea** |
| `spore` | 80, 196, 168 | Fungarium, Sporewell, Layer-4 dominance | Deep fauna spawn `× max(0.4, 1 - spore*0.1)` (stacks with influence defense) |
| `mind` | 51, 230, 176 | Selected, Core, fovea band | Render only — the pulse of attention |

**API (`CM.aura`):**

```
CHANNELS = ['hunger','dread','brood','war','spore','mind']
CELL = 8
SIZE = 32                          // world 256 / 8
ensure(game)                       // lazy-create game.aura = { grids: { [depth]: Float32Array(SIZE*SIZE*6) }, gen: 0 }
clearViewed(game, depth)           // zero that depth's grid
stamp(game, depth, x, y, channel, amount, radius=3)
at(game, x, y, depth)              // { hunger, dread, brood, war, spore, mind } (zeros if missing)
sample(game, x, y, depth, channel) // number
tick(game, dt)                     // decay 0.55/sec, then stamp living sources on viewedDepth and (if peel) ±1
draw(game, ctx, w, h, zoom, dpr, depth, worldToScreen)  // additive discs / cell quads, skip if !game.showAura
aiMul(game, org, stateKey)         // 1 + channel bias for that AI state, 1 if aura off
```

Decay is per-channel on the viewed grids only. Dream depths do not keep a grid; they contribute nothing to weather until peeled or viewed.

`showAura` defaults **true**. Toggle on the layer card next to Influence, and key `U`.

Cap any channel at 4.0 after stamp so a riot cannot blow out the overlay.

## Organ 2 — Thought (time, presence, bands)

The Core has a metabolic rate (`game.speed`: 0 / 1 / 2 / 3, existing chip). That stays.

**Thought** is a second axis: `game.thought` in `[0, 1]`.

- **Rises** (`+ 3.2 * frameDt`, cap 1) while any of: a selection exists, inspect sheet is open, designer is open, pointer is down on the stage, `commandMode` is set, or the player is holding Space.
- **Falls** (`- 1.6 * frameDt`) otherwise.
- `effectiveSpeed(game) = game.speed * (1 - 0.82 * game.thought)` when `game.speed > 0`, else 0.
- `main.js` loop uses `effectiveSpeed`, not raw `game.speed`, to advance the accumulator.

When `thought > 0.55` the speed chip reads `THINK` and the selection ring breathes. The world did not pause. The mind dilated.

**Presence (interpolation).** Each living organism stores `px, py` (position at the start of the last sim tick; init equal to `x,y` on spawn). `main.js` exposes `game.drawAlpha = acc / SIM_DT` after the step loop (0..1). Render draws at `lerp(px, x, drawAlpha)` / `lerp(py, y, drawAlpha)`. Underground transfers snap: on a depth change set `px,py = x,y` so bodies do not smear through rock.

**Bands.** Every tick `CM.mind.band(game, org)` returns `'fovea' | 'near' | 'dream'`:

| Band | Who | Full AI / sense / melee | Needs + move | Notes |
| --- | --- | --- | --- | --- |
| fovea | On-screen at `viewDepth`, or selected, or `war` cell > 0.8 on their cell, or in ATTACK/melee | Yes | Yes | LOD interval 1 |
| near | Same depth off-screen; adjacent depth with a live fight (`war` > 0.5 anywhere on that depth) | AI every 4 ticks | Yes | Existing mid-LOD |
| dream | Everyone else | No | Every **8** ticks, `dt * 8` on needs, advance along last heading × speed × 0.75 | Skip `gatherContext`. Keep last `order` / `state`. If an order target dies or a needs death hits, resolve immediately |

Combat involving a player organism, or any melee on `viewDepth`, forces both participants to fovea for that tick. Dream bodies never resolve PvP against the player in the cheap path — they promote first.

`CM.mind.tickOrgs` does **not** replace `simulation.tick`. Simulation calls:

```
const band = CM.mind.band(game, org);
if (band === 'dream') { if (!CM.mind.dreamPulse(game, org)) continue; }
```

`dreamPulse` returns true every 8th tick for that org (`org.dreamAcc`), and the caller then runs the existing needs + `executeOrder`/`executeState` with `dt * 8`. False → still apply a tiny hunger/thirst trickle (`dt * 0.25`) so dream time is not free, then `continue`.

**API (`CM.mind`):**

```
effectiveSpeed(game) -> number
tickThought(game, frameDt, flags)  // flags: { pointerDown, sheetOpen }
alpha(game) -> game.drawAlpha || 0
band(game, org) -> 'fovea'|'near'|'dream'
dreamPulse(game, org) -> boolean
markPrev(org)              // org.px = org.x; org.py = org.y  (call at start of a moving tick)
drawXY(org, alpha) -> { x, y }
onDepthChange(org)         // snap prev
```

Space is thought-hold on desktop. Existing 1x/2x/3x/pause chip is unchanged.

## Organ 3 — Peel

When `game.viewDepth >= 1` and `game.peel !== false` (default **true**):

The stratum renderer draws **three** depths in order:

1. `viewDepth - 1` if ≥ 1 — scale `1.07`, screen offset `+(14 * dpr)` px down, alpha `0.28`, no organisms, chambers as silhouettes
2. `viewDepth` — current sharp pass (today’s `drawStratum`)
3. `viewDepth + 1` if ≤ 10 and `layers.viewOpen` — scale `0.93`, offset `-(12 * dpr)` px up, alpha `0.22`, organisms as 2px motes only

Spine sites (`SHAFT`, `DESCENT`, `WELL`, `GALLERY`, `CLEFT`, `CHASM`, `MANTLE`, `ABYSS`, `GATE`, `NEXUS`) draw a **well**: a vertical 2px line connecting the three projected centers of the same xy. That is how the stack reads as one body.

Surface (`viewDepth === 0`): each finished Access Shaft draws a **wound** — a dark ellipse and, if peel is on, a 40% alpha glimpse of the Layer-1 chamber ring under it. Tap still hits surface objects; the glimpse is not selectable.

Depth strip stays. Peel is not a new navigation model. It is the picture of the one you already picked.

**API (`CM.peel`):**

```
enabled(game) -> boolean
offsets(dpr) -> { below: { scale, dy, alpha }, above: { scale, dy, alpha } }
project(game, w, h, zoom, dpr, x, y, layerDelta) -> { x, y }   // layerDelta -1|0|+1
drawWells(game, ctx, w, h, zoom, dpr, depth)
drawWound(game, ctx, w, h, zoom, dpr)   // surface shafts
```

Toggle Peel on the layer card. Key `O`.

## Organ 4 — Sense-sight

The player colony does not get a free map. Coverage is the union of living player (and, on a raid, that raid’s) sense radii on the viewed depth.

- Grid: same `CELL = 8`, `SIZE = 32`, one `Uint8Array` of current coverage plus a `Float32Array` of `memory` (seconds since last seen, cap 24).
- A cell is **lit** if any friendly organism’s `max(stats.vision, stats.sense_radius)` reaches it this tick.
- **Lit**: today’s full draw.
- **Memory** (`memory < 16` and not lit): terrain at 0.45 brightness, last-seen organism pings as 3px motes fading with memory, no flora specks.
- **Unknown**: terrain at 0.22, no organisms, no deposits, no samples. Hazards still wash the cell so climate remains honest.
- Trait **Chemical Sensing**: organisms you do not see but that sit in a hunger/dread/war cell you *do* cover appear as a channel-colored blip (size 2–3px). That is the counter to camouflage, drawn.

Rivals and wildlife always sim as if they can see; sense-sight is a **player render + selection** rule. You cannot tap-select an unseen organism. Box-select only hits lit cells.

`game.senseSight` defaults **true**. Toggle on the layer card. Key `I` is already used? Depth keys exist — use `K` (know). If `I` is free in explore mode it may alias; do not steal build/order keys (A/M/H/S/G/P/R/Q/V).

**API (`CM.sense`):**

```
CELL = 8, SIZE = 32, MEMORY = 16
ensure(game)
tick(game, dt)                 // rebuild coverage for viewDepth; age memory
lit(game, x, y, depth) -> boolean
memory(game, x, y, depth) -> number   // seconds since last lit, 99 if never
visibleOrg(game, org) -> boolean      // true if same depth and (lit or chemical blip)
drawUnknown(game, ctx, w, h, zoom, dpr, depth)  // darken unlit; called after terrain blit, before organisms
```

The Veil (depth 10) is always lit. It is shared thought-space; hiding it would lie about the endgame.

## Data flow

```
frame:
  mind.tickThought(game, frameDt, flags)
  acc += frameDt * mind.effectiveSpeed(game)
  while acc >= 0.1:
      for org: mind.markPrev(org)
      simulation.tick  →  (per org) mind.band / dreamPulse
                       →  aura.tick (after org loop, uses this tick’s states)
                       →  sense.tick
      acc -= 0.1
  game.drawAlpha = acc / 0.1
  render.draw → peel (strata) → sense.drawUnknown → aura.draw → organisms at mind.drawXY
  ui.render (dirty; see below)
```

## HUD and input

- Layer card tools: `Influence` | `Aura` | `Peel` | `Sense`. Each is a toggle, state class `active`.
- Speed chip: if `thought > 0.55` and speed > 0, label `THINK`; otherwise existing `II` / `Nx`.
- Keys: `U` aura, `O` peel, `K` sense, `Space` thought-hold (keydown sets a flag `game.thoughtHold`, keyup clears). Do not prevent Space when a text field is focused (none exist today).
- `ui.render` already throttles the depth strip to ~2 Hz. Extend that: topbar stats every 6 frames; order bar and selection HTML only when `game.ui.selDirty` (set by select/order/inspect). Canvas remains every frame.

## Persistence

Save **v7**. New fields on the root snapshot:

```
showAura: bool (default true on missing)
peel: bool (default true)
senseSight: bool (default true)
```

Do not save `thought`, `drawAlpha`, aura grids, or sense grids. They rebuild in one tick.

v1–v6 load as today, then those three flags default on.

Organism `px,py` are not saved; hydrate sets them to `x,y`.

## Quests / trophies

Side quests (progress.js pattern, trophies only):

| id | Title | Trigger |
| --- | --- | --- |
| `first_thought` | Dilate | `thought` crossed 0.55 while a player order existed |
| `read_weather` | Read the Weather | player toggled `showAura` |
| `peel_earth` | Peel the Earth | viewed a depth ≥ 1 with peel on for 8s |
| `smell_dark` | Smell the Dark | a player organism with chemical sensing revealed an unlit org |

Achievements of the same ids. No new mutations.

## Testing

`tools/simtest.js` loads the four new files after `orders.js` and before `coremind.js`. Headless asserts:

1. `effectiveSpeed` at thought 0 equals `game.speed`; at thought 1 equals `speed * 0.18`.
2. An off-layer wildlife org is `dream`; a selected player org is `fovea`.
3. `dreamPulse` is true once per 8 calls.
4. Aura `stamp` then `sample` on the same cell is > 0; after 10s of decay with no stamp it is < 10% of peak.
5. `aiMul` for SEEK_FOOD on a hungry cell is > 1.
6. Sense: an isolated org lits its cell; a point 40 cells away is unlit; after `tick` memory on the abandoned cell rises.
7. Peel `project` at layerDelta 0 matches the current `worldToScreen` contract (same formula as `render.worldToScreenDpr`).
8. Existing 4000-tick run still: no NaN, bounded pop, combat occurs, saves v7 round-trip the three flags.

Render/peel/sense drawing is not asserted in simtest (no canvas). Manual: new world → select a scout (THINK, motion interpolates) → sink a shaft → peel shows a well → toggle Sense and walk off a grazer (it fades to rumor).

## Error handling

- Every organ no-ops if `CM.aura` / `mind` / `peel` / `sense` is missing (old bundles, tests mid-port). Simulation and render keep today’s path.
- Grids allocate lazily. If `world.size` is not 256, `SIZE = ceil(size / CELL)`.
- `band` without a camera (simtest) treats camera as the player Core; selected still fovea; others near if depth === viewDepth else dream.

## Out of scope

Sound, particles beyond aura quads and sense motes, Web Workers, raising the 500 cap, new chambers, new resources, Android packaging, replacing the depth strip, multiplayer Veil networking.

The 500 cap can rise in a later spec because dream exists. This spec does not spend that headroom.

## File plan

| File | Role |
| --- | --- |
| `js/aura.js` | Weather grid, stamp, AI multipliers, overlay draw |
| `js/mind.js` | Thought, effectiveSpeed, bands, dreamPulse, interpolation helpers |
| `js/peel.js` | Multi-depth projection, wells, surface wounds |
| `js/sense.js` | Coverage, memory, visibility, unknown darkening |
| `js/simulation.js` | Call markPrev / band / dreamPulse; call aura.tick + sense.tick |
| `js/ai.js` | Multiply relevant utility scores by `aura.aiMul` |
| `js/render.js` | drawAlpha positions; peel pass; sense darken; aura overlay |
| `js/main.js` | effectiveSpeed; drawAlpha; thought flags |
| `js/ui.js` | Layer-card toggles; THINK label; selDirty |
| `js/input.js` | U / O / K / Space |
| `js/coremind.js` | Defaults: showAura, peel, senseSight, thought=0, thoughtHold=false |
| `js/save.js` | v7 flags |
| `js/progress.js` | Four side quests + achievements |
| `index.html` | Four script tags after `orders.js` |
| `tools/simtest.js` | Load new files + assertions |
| `tools/build.mjs` | No special case if it concatenates all `js/` or the html list — follow whatever it already does |

## Architecture rules

- One purpose per file. Render does not compute coverage. Aura does not move bodies. Mind does not draw.
- No new global besides `CM.aura`, `CM.mind`, `CM.peel`, `CM.sense`.
- Determinism: stamps and bands use existing sim state only. `Math.random` is not added to these four files.
- YAGNI: no seventh channel, no custom shaders, no offscreen aura canvas unless a profiler later proves cell quads are hot.
