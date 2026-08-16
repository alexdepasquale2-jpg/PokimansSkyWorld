# DoomSpire

A Doom-simple raycast shooter wearing the bones of a Burning-Crusade-era
MMORPG. The renderer draws flat-shaded walls and emoji-on-a-disc sprites —
no textures, no lightmaps, nothing a phone GPU would notice. Everything you'd
recognize from *that* era of WoW is real: six classes with real talent
trees, sixteen gear slots with an item-level and quality curve, reputation,
two gathering and three crafting professions, thirteen quests across three
zones and a dungeon, and a boss with an enrage phase.

No build step, no dependencies, no network, no server. Open `index.html` and
play. `dist/doomspire.html` is the same game inlined into one file — point
an Android WebView shell (Capacitor, Cordova, a Trusted Web Activity) at it
and that file is the whole app.

```
DoomSpire/
  index.html          the page
  style.css           phone-first skin
  js/
    core.js            RNG, math, formatting, save/load
    content.js         classes, talents, items, bestiary, the four maps,
                        quests, professions, factions — every static number
    engine.js           the raycaster (DDA walls, billboard sprites,
                        minimap) and the touch/keyboard input
    player.js           stat derivation, leveling, gear, bags, talents,
                        professions, reputation, quest log
    combat.js           ability resolution, damage/heal math, buffs,
                        cooldowns, resources (rage/mana/energy/combo points)
    ai.js               mob and companion brains, loot rolls
    world.js             zone runtime, collision, vendors, gathering,
                        crafting, quest turn-ins, the sealed portal
    state.js             the game object, character creation, save/load
    sim.js               the tick: movement, targeting, combat, respawns
    render.js             one frame: scene, nameplates, crosshair, minimap
    ui.js                 every DOM panel and the HUD
    main.js               bootstrap and the game loop
  tools/
    build.mjs           inline everything into one file
  dist/
    doomspire.html            single-file build, openable from disk
    doomspire.fragment.html   the same, without the document wrapper
```

## Running it

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000     # then http://localhost:8000/DoomSpire/
```

`dist/doomspire.html` is the same game inlined into one file. Rebuild with:

```sh
node tools/build.mjs
node tools/build.mjs --fragment   # for hosts that supply their own <html> shell
```

Progress autosaves to `localStorage` every eight seconds and on tab hide.
Only the character persists — level, gear, bags, talents, quest log,
reputation, professions, companions recruited. Zones rebuild fresh each
session, mobs and gathering nodes back where their spawn tables put them,
the same way PrimalIsle rebuilds its island from a seed instead of saving it.

## Controls

Portrait, both thumbs.

| | |
|---|---|
| drag the lower-left | move — strafe and forward/back, relative to facing |
| drag anywhere else on the scene | look — turn left/right |
| tap an ability icon | use it on your current target |
| the pill button above the ability bar | interact — talk, gather, enter a portal |
| ☰ / the tab row | character, talents, bags, quests, professions, reputation, party |

At a desk: `WASD` to move, `Q`/`E` or arrow keys to turn, number keys `1–8`
for abilities.

Targeting has no tab-target button: whatever hostile is nearest your
crosshair, within a cone in front of you, is the target, exactly like a
Doom shooter picks what you're aiming at. Abilities fire at that target.

---

# What's actually simple, and what isn't

**The renderer.** One DDA raycast per screen column, a flat colour per wall
type shaded by which side of the cell it hit and how far away it is, two
cheap horizontal bands for floor and ceiling instead of per-pixel casting,
and sprites that are a coloured disc with an emoji glyph on it, depth-tested
against the same wall buffer the columns wrote. That is the entire
`engine.js` rendering path. No textures are loaded, decoded, or sampled —
"very simple Doom rendering" was the brief and it's taken literally.

**The character isn't.** Six classes — Warrior, Paladin, Hunter, Mage,
Priest, Rogue — each with its own resource (rage, mana, or energy-and-combo-
points for the Rogue), seven or eight class abilities, and a seventeen-talent
tree spread across five tiers unlocked by points spent, the way Burning
Crusade gated its trees. A talent is data — a modifier key and a per-rank
value, or in a few cases an ability it unlocks outright (Death Wish,
Bloodthirst, Pyroblast, Holy Shock, Barrage, Mind Flay, Adrenaline Rush) —
read generically by `combat.js`, so the trees are additions to `content.js`,
never new engine code.

**Itemization** runs on the same stat-budget idea real WoW itemization
runs on: item level × quality multiplier × slot weight becomes a pool of
points spread across stamina, a primary stat, and a chance at a secondary
rating, across sixteen slots and six quality tiers (grey through orange).
Boss and quest rewards are curated on top of that — the Ashguard
Cinderplate, the Hollow King's Crown — because a few named items matter more
than an algorithm.

**Combat** is real-time and aimed, not turn-based: melee has range, casts
have a bar, dots and hots tick on their own timers, buffs stack fields
(attack power, armor, damage taken, speed, dodge, a shield that absorbs
before health does), and a global cooldown ties every ability together the
way WoW's 1.5s GCD does. A Rogue's finishers scale off combo points banked
by their generators; a Warrior's rage builds from swinging and being swung
at and bleeds away out of combat; a Mage's Blink is a raycast-collision
dash forward, which is the one place the "simple renderer" and the "deep
RPG" halves of this game are the same three lines of code.

**Group content without a server.** Two companions — Bruggo Ironhide, a
tank, and Sister Vell, a healer — are recruited through quests and then run
through the exact same ability pipeline as the player: `DS.player.derived()`
tolerates a companion's empty gear and talent objects, so a companion is
just a player-shaped object without a body behind the keyboard. Their AI is
two or three lines each — the healer casts on whoever's lowest, the tank
sticks to whatever you're fighting — the way PrimalIsle's other
thirty-four dinosaurs run the same `dino.js` the player does.

**The Sealed Vault.** Frostmarch's dungeon portal has a `requiresFlag` on
it that nothing but one quest — killing the Sigil Keeper — sets. Walking
into the portal before that just tells you it's sealed. It's the one real
gate in an otherwise open world, on purpose: everything else is paced by
mob level and gear rather than a wall.

## Zones

Four raycast levels, each a handful of rectangular rooms and corridors
carved into a wall grid by a tiny level-compiler (`mkGrid`/`carve` in
`content.js`) rather than hand-aligned ASCII art, so a map can't be
misaligned by a stray character:

- **The Scar** (1–8) — the Ashen Vigil's camp, ash imps and a branded yard
  boss.
- **Bloomreach** (6–14) — a druidic circle losing ground to a blight,
  ending at the Withered Matriarch.
- **Frostmarch** (12–22) — the Wardens' hold, frost wraiths and constructs,
  and the sealed door to —
- **The Hollow King's Vault** (20–27) — an instance: two trash halls, a
  boss chamber, and the Hollow King, who gains a second ability set and
  hits harder below 50% health.

Thirteen quests thread through them — kill/collect chains that finish in a
named encounter — plus two companion-recruitment quests. A map-connectivity
check (flood fill from the spawn point to every NPC, node, mob, exit, and
portal) runs against all four zones before anything ships; nothing in this
build is placed somewhere a player can't actually walk to.

## Professions

Two gathering skills (Mining, Herbalism) feed three crafting skills
(Blacksmithing, Alchemy, Enchanting), skill 1–300 in the classic-WoW sense —
recipes gate on a skill threshold, skill rises on use up to that recipe's
cap. A character learns up to two professions total, gathering or crafting
in any combination, from the Professions panel or the profession trainer in
The Scar.

## Reputation

Four factions, one per zone (plus the Hollow Court, unlocked only by
killing the Hollow King), six tiers apiece from Hated to Exalted. Quest
turn-ins are the only source of reputation, and each zone vendor has one
item gated behind a tier — nothing spectacular, just the small, real reason
to keep doing quests for a faction after its story quests run out.
