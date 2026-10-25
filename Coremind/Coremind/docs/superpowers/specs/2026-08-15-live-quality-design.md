# Coremind — Live Quality: Truth and Presence

**Status:** Approved for execution (2026-08-15 — subagent-driven; plus depth living + life tiers)
**Scope:** Vanilla JS. No new dependencies. Save stays v8. One new module `js/life.js` for per-being XP/tiers.
**Inputs:** Playwright screenshots of `index.html` (PC 1366×768, phone 390×844) plus a full code-vs-spec audit of the 2026-08-14 AURA / loop / layers / upgrades designs.

## Goal

The world is the product. The HUD is a WoW world-maker frame around it. Every control does what it says. Every system that already exists pays off in a way the player can see, hear (as log), and use. The colony feels gritty and alive, not like a teal spreadsheet under a gold border.

## What the screenshots proved

These are not opinions. They are frames from a real NEW GAME.

**PC, first second**
- The map is a brown-teal stain. Sense fog + weather overlay + a 58% tutorial dimmer hide the terrain the world generator actually built.
- Quest 1 says “tap one of your green creatures.” The gold hole is around the Core (mint `#33e6b0`). No scout is readable.
- ANALYZE already shows badge 12. DNA shows `!`. Population chip reads 74–80. WORLD later admits the colony is pop 3. The chip is counting every herbivore and predator on the map.
- A toast (“discovered Needler / Shalefang”) sits on the playfield while the tutorial is still on step 1.
- Quest card and the Surface essay occupy the same right-column slot. Weather / Stack / Fog sit on that essay with no legend.
- The BUILD button is missing from the frame. The later beat says “Tap EXCAVATION.”
- Ten depth buttons, ten command verbs, and a region-name dump (Far Meadows, Amber Flats, …) are all live before the player has selected anything.

**Phone, first second**
- The quest card covers the map. The spotlight is on the Surface card header, not a unit.
- Top bar wraps. Mood and `1x` become a second row. The world is a letterbox under minimap + layer card + quest.
- Opening BUILD reports `best digging 0` and greys Warren / Cistern / Granary. Access Shaft is the only honest first room; the rest of the sheet looks broken.
- ANALYZE at t+0 already contains “Side quest: Watch the Wild is done” and “Quest complete: Foothold.” The game congratulates itself before the player acts.

**WORLD tab**
- Attention / Favor / Gossip / Scars are four unlabeled glyphs. They do not appear anywhere the player commands.
- STANDING is a tiny teal constellation. Region can read Uncharted while the map is labelled Far Meadows.

Boot is the only screen that already looks directed: GB green, gold frame, drop shadow, plain verbs.

## Diagnosis

The 4X burrow (layers, orders, influence, pacing, Veil) is the real game and mostly tells the truth. Weather, thought, peel, sense, sentiment, reputation, and economy **exist as code** and were then **renamed and buried**. Selecting a unit — the only WoW verb that matters — raises `game.thought` and slams the sim to ~18% speed. Overlay toggles change AI. Labels do not match functions.

This is a truth-and-presence pass, not a fifth organ.

## Approaches

### A — Chrome only
Finish the GB+WoW reskin. Leave thought, fog, stamps, and lies alone.
- Faster. Still a game that lies and feels laggy when you click a unit.

### B — Truth and Presence (this spec)
One patch. Four rules. Close the gaps that make existing organs meaningless. Do not add systems.
- Highest fun per line. Matches “do what they say / say what they do.”

### C — Full organ rewrite
Re-implement AURA and loop-mind from the 2026-08-14 specs word for word, including mystic mood names and thought-on-select.
- Fights the new constraints (responsive, gritty WoW, not lame AURA). Too big. Rejected.

**Chosen: B.**

## Four rules

1. **The world is never covered by an essay.** Cards collapse. Tutorial never paints a full-screen dimmer. Toasts never sit on the order bar.
2. **A control’s name is its function.** Weather does not change AI. Population is your colony. BUILD is BUILD. THINK is THINK. Fog hides what you have not tasted.
3. **Commanding is instant.** Thought dilates on Space, an issued order (brief pulse), or an open inspect/designer sheet. Not on select. Not on pan.
4. **Every organ answers in the world or on the portrait.** If a number moves and nothing on screen changes, it is unfinished.

## Depth living

Settled rock is a better home the deeper it is. Surface stays harsh (weather, thirst, predators). A finished chamber on a depth raises `comfort`. Deeper settled depths raise it more.

```
comfort(game, depth) =
  0                              if depth === 0
  0.06 * depth                   if any finished player chamber on that depth
  + 0.08                         if a Warren or Nursery on that depth
  + 0.10                         if layers.layerReady(game, core, depth).ok
  clamped to [0, 0.62]
```

Apply in the needs tick for player (and garrisoned) organisms on that depth:

- hunger and thirst gain `*= (1 - comfort)`
- energy regen while `sheltered` `*= (1 + comfort)`
- `tempStress` `*= (1 - comfort * 0.7)`

Layer card one line, always visible when underground: `Living: Exposed | Cool | Warm | Hearth` from comfort bands 0 / <0.2 / <0.4 / else. This is how the system is represented — not a hidden multiplier.

## Life tiers (per being)

Every living organism carries a life sheet. This is not a colony trophy. It is that body.

| Field | Values |
| --- | --- |
| `xp` | number ≥ 0 |
| `lifeLevel` | 1–10 |
| `lifeTier` | `common` \| `rare` \| `legendary` |
| `lifeMarks` | `{ [id]: simTime }` |
| `lifeFocus` | `forage` \| `kill` \| `dig` \| `sense` — last mark family |

XP grants (player orgs only, wild get half):

- feed 2, drink 1, gather trip 3
- kill 8, extract 6
- dig pulse 1 (throttled 2s)
- reach a new personal max depth 12
- survive a climate event 10
- tribute / gift 5

Level curve: `need(level) = 20 + level * 18`. On level-up, add to `stats` (permanent on this body):

- forage → +2 sense_radius, +1 energyMax
- kill → +2 attack, +1 health
- dig → +3 digging, +1 defense
- sense → +2 vision, +1 camouflage

Marks (achievements on the body): `first_feed`, `first_kill`, `first_extract`, `first_dig`, `first_depth3`, `first_depth6`, `first_depth9`, `five_kills`, `season_lived`, `gifted`. Each mark grants +15 XP and a gold pop on the sprite.

Rarity:

- born `common`
- `rare` when `lifeLevel >= 4` or 3 marks
- `legendary` when `lifeLevel >= 8` or (7 marks and already rare)

Rarity is visible: common = GB lime, rare = gold ring, legendary = gold ring + pulse. Selection line: `Scout · Rare 5 · 84 XP`. Inspect lists marks by name. Legendary is the only life event allowed to toast (`<name> is legend.`).

Serialize on the organism in save v8 (extra fields; old saves default common/1/0).

## HUD slots (no overlap)

Fixed rectangles. Two cards may never share an origin.

| Slot | PC | Phone |
| --- | --- | --- |
| Guide | top-left of stage, under topbar, `left:52px; top:8px; max-width:280px` | under topbar, `left:8px; right:120px; top:8px` |
| Quest | hidden while `body.guiding`; else under guide or `left:52px; top:8px` if no guide | hidden while guiding; else one line under topbar |
| Layer | `right:316px; top:48px` collapsed; never under guide | 1-line under minimap, `max-width:42vw` |
| Toast | `left:52px; bottom:160px` | `top` under guide, never on command row |
| Selection | top-left, but `top` below guide/quest if those are open | top-left, below guide |

`#guide-card` and `#quest-card` must not both be visible as stacked essays. Guiding hides quest. After the tutorial, quest is the only campaign card.

## Non-goals

- New dependencies, sound, multiplayer, a seventh designer slot.
- Locking orders behind attention (already rejected: broke tutorial).
- Replacing emoji with a generated sprite atlas in this pass (HUD uses letter/GB marks; canvas rooms stay geometric).
- Rewriting world generation. The map is already generative. Wildlife stays a canned cast on a generated stage.
- Dist bundle except a final `node tools/build.mjs` so `dist/coremind.html` matches source.

## Presence (HUD)

### Layer card
- Surface default: one line (`Surface · <region> · <foothold checks as 3 ticks>`) plus Weather / Stack / Fog.
- Tap the line to expand the essay. Collapse is the default.
- Underground default: name, owner, hold bar, stance + labor, tools. Tradeoff essay behind the same expand.
- `#layer-card` may never exceed 200px wide on PC or 44vw on phone. `pointer-events` only on the card, never a larger hit box.

### Tutorial
- `#guide-hole` is a 3px gold frame only. No `9999px` dimmer.
- Card is a 2-line QUEST chip. It may not cover its own target. On phone it docks under the top bar, not over the command row.
- Copy matches the control:
  - “Tap one of your lime creatures next to the Core.”
  - “Tap GATHER.”
  - “Drag the map. + / − zoom. Home recenters.”
  - “Tap ANALYZE.”
  - “Tap BUILD, choose Access Shaft, tap open ground.”
- Spotlight for `scout` follows the first living player body. If none on screen, camera focuses the Core and the hole sits on the nearest player body — never on `#layer-card`.

### Command surface
- Phone EXPLORE: one row of the four verbs that matter now (Explore, Gather, Hunt, Dig) plus BUILD. Extra verbs live under a `MORE` chip. No 40vh wall.
- PC: action bar stays. BUILD is a labelled gold chip on the right of that bar, always visible, never `bottom:100%` into empty space.
- Order bar only after a player selection. Grouping: Move / Attack / Hold / Stop | Garrison / Patrol | Box / All. Control groups stay. Abbreviations expand to full words or icon+word.

### Toasts
- Combat-log ticks. Max 2. Dedupe. 1.6–2.4s.
- PC: left of the depth stack, above the bottom 120px.
- Phone: under the top bar, never on the command row.
- Allowed kinds: discovery, warn, rival, and order-fail (`res.reason`).
- Forbidden: confirmations of a button just pressed (stance, crew, save strain, deploy, priority, rally). Those already change the button.

### Badge honesty
- ANALYZE badge increments only for `discovery`, `warn`, `rival`, `death` that the player did not just cause by opening the tab. Achievement and “side quest done” lines do not increment the badge and do not toast.
- DNA `!` only when `discoveredTraits` has a trait not used in any saved design and the player has not opened the designer this session.
- No auto-complete of Watch the Wild / Foothold at t=0 from world-gen sightings. Those quests require a player organism to observe after `guide.startedAt`, or after the first issued order if guide is off.

## Honesty (say / do)

| Control | Must mean |
| --- | --- |
| `#stat-pop` | `game.stats.playerPop` only. Title “Colony”. |
| Climate chip | Season + event from `CM.climate`. Never aura. |
| Weather (layer tool) | Overlay visibility only. `aura.aiMul` ignores `showAura`. |
| Stack | Peel ghosts. Does not change sim. |
| Fog | Sense overlay. Unknown cells hide deposits, samples, and unlit wildlife. Box-select only lit friendlies. |
| Speed chip | `II` / `1x` / `2x` / `3x` / `THINK`. THINK only when `thought > 0.55`. |
| Mood chip | Loudest sentiment output, flavored by loudest input. Four families stay plain: Hungry / Fighting / Resting / Exploring. Flavor words (Starving, Bloodied, Brooding, Curious, Grieving, Wary) replace the generic word when that input is clearly winning. The chip tooltip lists the four lean percentages. |
| BUILD | Opens the build sheet. Tutorial says BUILD. |
| Influence | Overlay only. Influence still affects dig/fauna/income regardless of overlay. |

### Copy lies to delete

- Layer 4: stop saying “grows surface flora.” Either tick nearby `world.food` in a 12-cell radius of a dominating L4 chamber, or change the string to “Dominating this layer feeds the Core (+0.35 biomass/s).”
- Layer 6: `defenseAt` must test `site.depth` against the bastion’s depth and the depth above. Then the card is true.
- Layer 8: card names the **Crypt**. Sanctum stays depth 3. `hasSanctum` may still count either; the string must say which room the player is looking at.
- `hold_and_post` `questDone` returns true when Layer 9 is settled or the Gate exists.

## Thought and bands

`mind.thinking` is true only when:

- `game.thoughtHold` (Space), or
- `game.commandMode` is set, or
- inspect / designer / build sheet is open, or
- `game.thoughtPulse` > 0 (set to 0.55s on each issued order or directive, then decays).

False: any selection, any pointer-down, any pan.

`effectiveSpeed` math stays. Dream skip path **moves**: on the cheap tick, advance along last heading × speed × 0.75 × `dt * 8` (or the pulse interval), still trickle needs. Dream pulse still runs `executeOrder` / `executeState`. Melee or player combat on a cell promotes both participants to fovea for that tick.

## Organs — close the holes, do not add organs

### Weather (`aura.js`)
Keep 6 channels. Add the missing stamps the 2026-08-14 spec already named: empty granary hunger, predator-within-6 dread, breed-labor brood, hostile-on-chamber war, Layer-4 dominance spore, fovea/selection mind. Overlay draws the loudest channel (cheap) but a 4-swatch legend on the expanded layer card names Hunger / Dread / Brood / War.
`deepFaunaTick` multiplies by `max(0.4, 1 - spore * 0.1)` stacked with influence.

### Peel (`peel.js`)
Wells use `--gold` / GB green, never purple. Surface shaft wound is a dark ellipse **and** a 40% glimpse of the Layer-1 chamber ring if peel is on. Wound is selectable (same as the shaft).

### Sense (`sense.js`)
Chemical reveal: `memory === NEVER` **or** `memory < MEMORY`, plus chem trait, plus aura-hot **or** the body is within sense radius. Floor change does not wipe memory; it swaps the active grid and keeps the previous depth’s grid.
`orders.selectInBox` rejects unlit cells when Fog is on.

### Sentiment (`sentiment.js`)
Net stays. Flavor table becomes real (different strings per loudest input). Inspect colony shows the six hidden nuclei as a 6-bar strip. `aiMul` stays.

### Reputation (`reputation.js`)
`areHostile` reads the graph when an edge exists, else the old standing. Species with bias < −0.4 add a WORLD line “<species> avoids you.” Overhunt still multiplies FLEE; also stamps a small dread on that cell.

### Economy (`economy.js`)
Four coins render as a compact strip on the top bar (PC) or under mood (phone): `ATT 2.0  FAV 0  GOS 1.8  SCR 0`. Tooltips state earn/spend in one sentence each. `thinMul` also scales SEEK_FOOD when attention < 0.4 (spec: forage dips). Peaceful proximity grants a trickle of Favor as already specified. Spent attention is visible: the ATT number ticks down when you issue.

### Guide / progress
Guide beats stay select → gather → look → analyze → build → (later) floor 1 → rivals. Campaign quests no longer auto-complete from world-gen. `hold_and_post` can finish.

## Skin

One palette. Delete the third skin.

- Player ink: `#8bac0f` / `#9bbc0f`. Core, selection ring, samples, order lines, designer preview, constellation friends: GB lime. No `#33e6b0`.
- Panels: `--panel` / `--panel2`. Delete leftover `rgba(11,20,29)`.
- No `--muted`. Sanctum uses `--gold-hi` and `--gb2`, not `#c88cff`.
- Favicon matches the lime Core.
- HUD numerals: biomass `B`, energy `E`, colony `C`, climate a small thermometer mark or `T`. Mood keeps the diamond. No color-emoji in the top bar or directive bar.
- Climate chip uses `--gb3`, not ice-blue.
- `dist/coremind.html` rebuilt at the end of the patch so it is not a fourth game.

## Generative, still gritty

- Terrain, rivers, regions, hazards, deposits, veins stay seeded.
- Climate event timing uses `rngFrom(seed ^ 0xC11)` so two loads of the same save do not fork the weather.
- Wildlife remains a canned bestiary on that generated ground (WoW does this: named mobs, generated camps). Rival genomes stay generated from known traits.
- Region labels draw only for the region under the camera plus the home region, not a dump of every name in view.

## Testing

- `node tools/simtest.js` stays the contract. Update assertions that encode old lies (pop, thought-on-select, aura-gated AI, dream freeze, surface shaft miss).
- `tools/visual-review.mjs` (Playwright, system Chrome) captures boot / new game / gather / analyze / world / build on PC and phone. A pass means: map readable, BUILD visible, quest not covering the scout, pop equals player count, no ANALYZE double-digit badge at t=0, no full-screen dimmer.
- No new npm dependency in the game. Playwright stays a temp/dev runner, not a project dep.

## Success

A new player on a phone can see a lime scout, tap it, tap GATHER, watch it walk to plants, and see ATT tick and a one-line log. The world does not dim. The sim does not crawl. The population chip matches the bodies they own. Weather paint is optional candy. The burrow, the Gate, and the generated map are still the game.
