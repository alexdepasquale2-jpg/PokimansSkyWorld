# Coremind — Hero Mode (game inside the game)

**Status:** Building (2026-08-15)
**Scope:** Vanilla JS. Save v8 extra fields on organisms + `game.hero`. No new deps.

## Goal

Commander stays. You can drop into any living body and play it like a WoW character: third-person follow, tab-target, eight abilities from that body’s traits, a pack that moves as one, an inventory. The colony AI keeps running everyone else.

## HUD slots (no overlap)

| Slot | PC | Phone | Hero |
| --- | --- | --- | --- |
| Guide / Quest | top-left | top-left, clear of minimap | compact, same slot |
| Selection | **below** guide/quest, never `top:10` | same | becomes the hero portrait at **bottom-left**, above the ability bar |
| Layer | right of map | under minimap | hidden (the body is the zone) |
| Toast | above action bar | under guide | above ability bar |
| Abilities | — | — | bottom-center, 8 keys |
| Target | — | — | top-center |
| Bag | — | — | right sheet, 8 slots |

`#selection-panel` is measured under the visible guide/quest every paint. `body.hero` hides commander bars and the layer card.

## Possess

- Enter: **PLAY** on the portrait, or **Enter**. Possess the selected living organism (any owner if you can see it).
- Exit: **COMMAND** or **Esc**. Camera returns to commander zoom.
- Cycle bodies: **[** / **]** among the pack (selected player orgs, or nearby player orgs).
- You can play any unit you tap, including a wild if you selected it — the commander fantasy is “wear a body.”

## Camera

Close follow, 7 cells behind heading, zoom 28. No world-rotate (HUD and hit-tests stay honest). A facing chevron sits on the hero. Target gets a red/gold ring.

## Move

WASD / arrows: W/S along heading, A/D turn. Mobile: on-screen stick. Pack members hold formation offsets and walk with the hero.

## Tab target

Tab / Shift-Tab cycles living hostiles (then neutrals) in vision. Click a body to lock. Strike and hunt spells use that lock.

## Eight abilities

Always eight, filled from traits/life:

1. Strike  
2. Body: Charge / Burrow / Shove  
3. Sense: Scan / Whisker / Look  
4. Guard: Shell / Hide / Mend / Guard  
5. Hunt: Venom / Pierce / Bite  
6. Guts: Sprint / Feed / Drink  
7. Pack: Rally / Send  
8. Call: Dig / Roar (legendary) / Command (exit)

Cooldowns and energy. Keys 1–8 while hero is on.

## Pack as one

Selected player orgs (else player orgs within 10 of the hero) are the pack. They share:

- Venom → strike DoT  
- Armor → +12% defense  
- Chem sense → longer tab range  
- Regen → slow pack heal  
- Two of the same trait → named combo on the portrait  

Unpossessed colony units keep commander AI.

## Inventory

Each body: 8 slots. Pickup nearby samples / forage / meat (F or Feed). Use from BAG. Serialized on the organism.
