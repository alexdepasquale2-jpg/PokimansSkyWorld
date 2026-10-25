# Coremind — Individual Command & Ten-Layer Burrows

**Status:** Approved (session owner, 2026-08-14)
**Scope:** Local vanilla JS. No new dependencies. Save format v4, forward-compatible with v1–v3.

## Goal

Play like a 4X: micro-manage selected organisms and still issue colony-wide directives. The underground is a ten-layer campaign. Layer 10 is the shared endgame. Losing the Layer-9 Gate loses the whole burrow. Fortifying the Layer-1 shaft can still save the surface Core.

## Individual command

- `game.selectedIds` is the current group; `game.selection` is the primary.
- With a player group selected, a tap is an order, not a deselect:
  - empty ground → MOVE to that point on the current view depth
  - hostile organism → ATTACK
  - chamber → GARRISON (excavate if unfinished)
- Order bar: MOVE, ATTACK, HOLD, GARRISON, STOP, ADD (multi-select), X (clear).
- Directives still apply to the selection, or to the whole colony when nothing is selected.
- Orders yield to critical hunger / thirst / health, then resume.
- Desktop: A/M/H/S/Esc.

## Ten layers

| Depth | Name | Role |
| --- | --- | --- |
| 0 | Surface | Core, forage, climate |
| 1 | Shallow Works | Shaft, water, shelter, **fortifiable base node** |
| 2 | Deep Galleries | Nursery, vault, redoubt, fungarium |
| 3 | Abyssal Reach | Heat, veins, first sanctum |
| 4 | Spore March | Growth independence |
| 5 | Resonant Clefts | Warning / research |
| 6 | Bastion Deeps | Layer defense |
| 7 | Mantle Hearth | Deep energy and seams |
| 8 | Hollow Abyss | Second seat |
| 9 | Gateworks | **Gate to the Veil** — lose this, lose the burrow |
| 10 | The Veil | Shared nexus. All completed Gates appear here |

Spine ladder: SHAFT → DESCENT → WELL → GALLERY → CLEFT → CHASM → MANTLE → ABYSS → GATE. Completing a Gate opens a Veil portal at the same xy.

## PvP path

Enter own Gate → walk The Veil → enter a foreign Gate → climb 9 → 8 → … → 1. You cannot enter a foreign shaft from the surface. A fortified L1 shaft blocks 1 → 0 until the barrier is broken.

## Gate loss

Destroying or capturing a Gate sets `colony.burrowLost`. Every chamber of that colony becomes uncontrolled: no income, no layer bonus. Organisms at depth ≥ 1 are ejected to the surface. The colony may:

1. Retake — garrison the uncontrolled Gate until reclaim completes.
2. Fortify the original Access Shaft (even while uncontrolled) so climbers cannot reach the Core.
3. Sink a new shaft and climb the ladder again.

## Layer trade-offs

Each viewed layer shows who dominates it, the live bonus, and two sentences: what expanding costs, what defending buys. Dominance is “most controlled chambers on that stratum.”

## Persistence

Save v6 stores chamber tiers, layer labor and permits, construction influence flags, plus v5 fields (mutations/achievements/quests, layer stance and rally, build-from). Older saves load at depth 0 with full control; already-cut spines retro-settle the layers above them.

## Layer pacing

Each stratum has to be *lived in* before the next spine opens. The card on the right is the checklist.

- **Surface foothold** — first shaft waits on ~48s, 5 living, a first discovery, or 90 biomass.
- **Per layer** — spine cut, the layer's role chamber, enough rooms, a hold timer, and (on 6 and 8) a posted defense.
- Walking the layer and posting bodies on the spine burn the hold faster than standing still.
- Freshly opened layers have a fauna grace window so there is time to place and garrison before the rock answers.
- Rivals use the same fill-then-cut rule. The ladder is not a race to the Gate.

## Out of scope

Sound, interpolation, new resource types, Android packaging.
