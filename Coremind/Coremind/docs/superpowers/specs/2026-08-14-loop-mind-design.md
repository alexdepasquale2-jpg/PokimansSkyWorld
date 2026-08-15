# Coremind — Loop, Sentiment, Reputation, Guide

**Status:** Building (session owner, 2026-08-14)
**Scope:** Vanilla JS. Save v8, loads v1–v7. No new dependencies.

## Goal

The loop is not a tutorial of buttons. It is a mind that feels, remembers who touched it, and spends attention like blood. An optional whisper teaches by play. The HUD shows mood, not menus.

## Three organs of the loop

| Organ | File | Player-facing | Engine |
| --- | --- | --- | --- |
| Sentiment | `js/sentiment.js` | Mood chip: Hollow / Blood-minded / Brooding / Listening | Tiny 8→6→4 tanh net, seeded, Hebbian |
| Reputation | `js/reputation.js` | WORLD constellation; species remember overhunt | Directed favor graph, colony↔colony and colony↔species |
| Economy | `js/economy.js` | Attention, Favor, Gossip, Scars | Interactions pay and cost; tribute buys standing |
| Guide | `js/guide.js` | Skipable whisper card | Completes when you *do* the beat |

## Sentiment net

Inputs (0..1): hunger, dread, brood, war (from AURA), trust (mean standing), awe (depth), grief (scars), curiosity (partial observations).

Hidden nuclei (named, shown on inspect): Pulse, Coil, Hearth, Veil, Fang, Root.

Outputs (0..1), multiply existing AI — no new states:

- forage → SEEK_FOOD
- fight → HUNT, ATTACK
- nest → SHELTER, REPRODUCE
- wonder → EXPLORE, INVESTIGATE

Weights start from `rngFrom(seed ^ 0xA11A)`. `learn(outcome)` does a small Hebbian nudge so a colony that keeps killing becomes blood-minded, one that keeps watching becomes listening. Rate 0.012, weights clamped ±2.

Mood label is the loudest output, flavored by the loudest input. That label is the topbar chip.

## Reputation

Edge key `from>to`. Nodes are colony ids or `wild:<speciesId>`.

- Kill colony: existing standing plus edge −0.12 / −0.05
- Kill species: species edge −0.08; below −0.4 that species flees the player harder
- Sight species: +0.02 (naming is respect)
- Extract: −0.04 (you took a piece)
- Tribute: +0.18 both ways, costs 8 biomass + 1 favor
- Peaceful proximity (same cell neighborhood, not attacking): +0.002 / sec, cap 0.15 from this path

Rivals already read `areHostile`. Prey AI reads `reputation.speciesBias`.

## Interaction economy

| Coin | Earn | Spend |
| --- | --- | --- |
| Attention | Fovea time (0.15/s while thinking) | 0.35 per issued order; 0.8 per CREATE |
| Favor | Tribute, peaceful contact | 1 per tribute |
| Gossip | Sighting 0.2, extract 0.6 | Vault research already exists; gossip adds `× (1 + min(0.25, gossip*0.02))` to observe rate |
| Scars | Player organism death +1 | Decays 0.04/s; feeds grief |

Attention cannot go below 0; orders still fire if you are broke (the mind just feels thin — forage/wonder dip via grief/attention emptiness, not a hard lock). That keeps the tutorial from trapping anyone.

## Guide (optional, fun only)

Whisper card. No modal, no “Next”. Skip is always visible.

Beats complete by action: tap a body → think → forage → toggle Aura → name a wild thing. Later beats (peel, tribute) only appear when the world has a shaft or a woken rival.

Boot: **WAKE** (guide on), **WAKE QUIET** (guide off), **REMEMBER** (continue).

Voice is the Core talking to itself. Short. No feature list.

## HUD

- Topbar mood chip (sentiment label + pulse when THINK)
- `#guide-card` above the quest card
- WORLD: economy strip + reputation constellation (nodes + favor strokes)
- Inspect rival: **Offer tribute**
- Boot card: living core pulse

## Persistence

Save v8: `economy`, `rep.edges`, `sentiment.net`, `guide`. Missing fields rebuild from seed.

## Out of scope

Sound, a real ML library, multiplayer, locking orders behind attention, a seventh designer slot.
