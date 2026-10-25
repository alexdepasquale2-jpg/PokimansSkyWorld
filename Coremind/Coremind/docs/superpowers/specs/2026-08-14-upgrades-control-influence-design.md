# Coremind — Upgrades, Control Overhaul, Construction Influence

**Status:** Approved (session owner, 2026-08-14)
**Scope:** Local vanilla JS. No new dependencies. Save format v6, loads v1–v5.

## Goal

Chambers grow after they are cut. Idle bodies on a layer follow a labor mix the player sets. Construction paints an influence field that turns a stratum into a district — shelter, water, forage, heat, defense, research, breed, or spine — and that field is what dominates the layer, speeds digging, and quiets fauna.

## Chamber upgrades

Every finished chamber has `site.tier` 0–3. Upgrade is a second excavation: spend, set `upgradingTo`, diggers add `upgradeWork` the same way they cut the room.

- Cost / work scale with the original type (`0.65 / 1.05 / 1.55` cost, `0.55 / 0.85 / 1.20` work).
- `tierMul = 1 + 0.28 * tier` multiplies radius, storage, energy, feed, vein rate, defense. Research is `1 + (bonus - 1) * tierMul`.
- Flavor titles per type (Reinforced collar, Lined cells, …). Fallback: Shoring / Expansion / Masterwork.
- NEXUS cannot be upgraded. GATE can.

## Construction influence

`js/influence.js`. Each finished chamber stamps axes in a falloff disc (`radiusOf * 2.15`, weight `1 + 0.35*tier`, entrenched `×1.2`).

Axes: shelter, water, food, heat, defense, research, breed, spine.

A **district** forms on a layer when one axis is ≥ 2.0 and ≥ 1.35× the runner-up, sampled at the colony's own rooms.

Effects:

- Layer dominance uses influence weight, not raw chamber count.
- Dig speed `1 + min(0.45, (spine+shelter)*0.06)` at the site.
- Deep fauna spawn chance `× max(0.35, 1 - defense*0.12)`.
- A chamber whose primary axis matches the layer district pays `×1.15` income / feed.
- Stance still picks *what* to cut; influence is *how the cut ground behaves*.

## Control overhaul

- **Labor mix** per layer: Dig / Guard / Forage / Breed, each 0–4. Biases utility AI for idle bodies on that stratum.
- **Work crew**: inspect a chamber → assign the current selection. Those organisms always prefer that site (dig, upgrade, or garrison).
- **Layer permits**: the excavation palette can forbid a type on the viewed layer. Auto-expand and `canPlace` honor it.
- **Orders**: PATROL (bounce between here and the tap), RETREAT (nearest warren / rally / shaft), ATTACK_MOVE exposed, QUEUE (append waypoints). Shift+click also queues. Keys: P, R, Q, V.
- Groups 1–6.

## Persistence

Save v6 adds `layerLabor`, `layerPermit`, `showInfluence`, `queueOrders`, `org.assignedSiteId`. Site fields (`tier`, `upgradingTo`, `upgradeWork`, `crewIds`) already ride `structures.serialize`.

## Quests / trophies

Side quests: Raise One, Post a Crew, Paint a District. Achievements `first_upgrade`, `three_upgrades`, `labor_set`, `crew_posted`, `first_district` — trophies only, no new mutations.

## Out of scope

New chamber types, new resources, sound, a seventh designer slot.
