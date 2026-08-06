# Pasu — game design

A run-based mobile game. Turn-based, node-graph map, 20–40 minutes per run, one
hand, interruptible, no reflex input.

Every mechanic below cites the axioms it derives from. Numbers refer to
`AXIOMS.md`. Nothing here adds to the axioms; where gameplay needs an answer the
axioms leave open, it is marked as a gameplay-only ruling.

---

## 1. What a run is

A run is a **kin**, not a person (13, 21).

You are born holding one dimension, in a region the erasing forces are already
crossing. You protect what you can. Pasu is open from the first turn. The run ends
when the erasure is stopped or completes its route.

The unit of play is a run because axiom 9 makes forfeiture irreversible.
Irreversibility inside a run is a decision with weight. Irreversibility across a
permanent account is a player who quits with no recourse.

---

## 2. Turn economy

Each turn you take a fixed number of **actions**. The eraser advances after your
turn, on a schedule you can see several turns ahead.

Actions: move along the graph, hold or release a dimension, shape an effect,
shelter a settlement, search a site, speak to kin.

There is no fog of war over the eraser's route. The information is not the
difficulty. The difficulty is that every action spent on one settlement is an
action not spent on another — which is what "as many as possible" (1) means once
"as possible" is a real constraint.

**Triage is the core loop.** Not combat.

---

## 3. Aura — the one dimension you are born holding

Axiom 12. Each run assigns one dimension. It is not a class. It is a property set,
and until Pasu it is everything you can do (14).

Dimensions are vectors over one shared property vocabulary:

| Property | Meaning |
|---|---|
| Solidity | blocks movement |
| Mass | weight, inertia |
| Energy | transforms, damages |
| Persistence | how long the effect survives |
| Extent | how far it reaches |
| Binding | attaches to a target or a place |
| Perception | reveals |
| Motion | displaces |

Shipping roster — fourteen dimensions:

```
Stone        Solidity 3   Mass 2        Persistence 2
Heat         Energy 3     Extent 1      Persistence -1
Presence     Binding 3    Perception 2  Extent 2
Distance     Extent 4     Motion 1      Mass -1
Duration     Persistence 4
Weight       Mass 4       Motion -2
Current      Motion 3     Extent 2      Persistence -1
Silence      Perception -3 Binding 2    Extent 2
Growth       Persistence 3 Mass 1       Energy 1
Cold         Energy -2    Solidity 2    Persistence 2
Depth        Extent 3     Solidity -2   Perception 1
Edge         Energy 4     Extent -2     Binding 1
Echo         Perception 3 Persistence 2 Extent 3
Ash          Mass -3      Extent 2      Persistence 1
```

Negative values are the interesting half. `Silence` has negative Perception, so it
subtracts revelation from anything it is held with. `Ash` has negative Mass, so it
makes a holding that would otherwise sit still travel.

Each run makes only a subset findable (22 permits new dimensions to exist; the
subset is a gameplay ruling, not an axiom).

---

## 4. Combination — the reason to pay Pasu

Axioms 4, 5. Held dimensions **sum their vectors**. Resolution rules turn the sum
into an effect. There is no recipe table and no spell list.

```
Stone + Heat + Presence
  Solidity 3 · Mass 2 · Energy 3 · Persistence 1
  Extent 3 · Binding 3 · Perception 2
  -> a lasting, area, heat-bearing barrier bound to a place
```

Resolution rules — small, fixed, learnable:

- `Solidity > 0 and Persistence > 0` → barrier, standing for `Persistence` turns
- `Energy > 0 and Binding > 0` → applies over time to whatever it is bound to
- `Energy > 0 and Binding <= 0` → resolves once, at range `Extent`
- `Motion > Mass` → displaces rather than holds
- `Perception > 0` → the effect also reveals; `Perception < 0` conceals
- `Persistence <= 0` → resolves this turn and is gone
- `Mass < 0` → the effect travels instead of staying where it was shaped

The rules are printed in the game. The combinations are not. What you learn is
what the sums do.

### Stability

Innocence was the limit; after Pasu the limit is **stability** (14, 15).

Each dimension held past the first strains it. A strained holding does not fail
cleanly — it resolves **wrong**: a property lands at the wrong magnitude, or the
wrong rule fires. Holding four dimensions is possible and is rarely correct.

No mana bar. The resource is how much you are holding at once.

---

## 5. Pasu — the one-way door, once per life

Axioms 6, 8, 9. Always available from turn one. Never gated, never earned, never
purchasable.

Taking it:

- unlocks holding more than one dimension (15)
- removes you permanently from the set of protectable people (9, 14)
- **subtracts you from your own score** — you were one of the innocents you are
  counting (1)
- keeps your aura and your role (15, 21)

Take it early and you have found few dimensions, so combination is weak and you
spent your innocence for very little. Take it late and the erasure has already
run. The run is that timing decision.

Finishing a run **without** taking Pasu is viable and separately scored. The
innocent ceiling is lower and the innocent floor is higher. If a pure-innocent run
cannot win, the choice is theatre.

---

## 6. Erasure — NPC only, permanent, the clock

Axioms 2, 17, 18, 20. There is no player-versus-player anything. The erasing
forces are NPC.

They cross the region on a visible schedule and strip innocence from settlements.
The erased stay alive. They stop counting, stop being protectable, and cannot be
restored (9, 17). The map degrades permanently within a run.

That ratchet is the design. You cannot save everything, so you choose.

Each run draws one eraser with a distinct method:

- **The route** — moves settlement to settlement in a fixed order. Predictable,
  fast, and unstoppable in a straight fight; you play ahead of it.
- **The spread** — erases outward from wherever it last erased. Slow start,
  exponential. Containment beats interception.
- **The answer** — erases nothing until opposed, then erases the nearest
  settlement to whoever opposed it. Punishes the practitioner directly.
- **The patient** — erases on a long timer but cannot be delayed at all, only
  outpaced. Pure triage, no defense.
- **The quiet** — erases without any visible signal. Only Perception-positive
  holdings reveal where it has been.

An eraser's method is identified on sight only if you have met it in an earlier
run. Otherwise you find out by watching it work.

Erasers were once innocent and are life (10, 19). Nothing in the game frames them
as a different kind of thing, and nothing narrates a judgement about them.

---

## 7. Roles and death — the lives system

Axioms 11, 13, 21.

Your role is a **constraint**, not a class:

- the one who does not leave the kin's ground
- the one who carries — you must be holding something at end of turn
- the one who counts — you must visit each settlement before shaping anything at it
- the one who does not shape twice in the same place
- the one who speaks first — you must speak to kin at a settlement before acting there

Break your role and the kin stops supporting you: no shelter, no resupply, no
replacement on death.

**Death does not end the run.** The role vacates (21), another member of your kin
takes it, and you continue as them. They share your aura (13) and hold a different
role (11) — so a death changes your constraints, never your power. When the kin is
exhausted, the run ends.

A practitioner who dies is replaced by someone innocent. All held dimensions are
gone and Pasu must be paid again. That is the cost of dying late.

*Gameplay ruling:* the axioms do not say who inherits a vacated role. The game
picks the next kin member; the axiom stays open.

---

## 8. Scoring

Score is what remained innocent when the run ended (1). Two figures, both shown:

- **Held** — settlements never erased.
- **Yours** — whether you still hold your own innocence.

An innocent run and a practitioner run are scored on the same first figure and
distinguished by the second. A practitioner who saves more people has a lower
`Yours` and a higher `Held`, permanently, and the run summary shows both without
ranking them.

The summary reports what was **saved**. It does not tally what was lost.

---

## 9. Meta-progression — knowledge, never power

Axiom 16: knowing the operation is not the same as being able to perform it. So
knowledge crosses runs and capability does not.

- Combinations you have observed fill in a codex, permanently. The codex records
  what you saw the sum do, not a recipe you were handed.
- Dimensions you have held are named on sight in later runs. Unheld ones read as
  unknown until held.
- Eraser methods you have survived are identified early instead of late.

Nothing carries stats, gear, currency, or unlocks. Run 1 is winnable in principle.
Run 40 is winnable more often because you know what `Stone + Duration + Motion`
does before spending a turn to find out.

---

## 10. Freshness — five independent rerolls per run

1. Which dimension is your aura
2. Which role you hold, and therefore what you may not do
3. Which dimensions are findable in the region
4. Which eraser, and its method
5. Region layout and which settlements exist

The cross-product is large without procedural generation beyond the map graph. The
run varies because the *constraints* vary, not because the numbers were rerolled.

---

## 11. Mobile shape

- Turn-based. No timing, no dexterity, no reflex.
- Node graph, not a free 2D world. Readable on a phone, cheap to render.
- Save on every action. A run survives being closed mid-turn.
- Combination UI: drag dimensions into the holding set; the property sum updates
  live and the predicted rule fires are shown as **properties**, never as a spell
  name. The player reads `Solidity 3 · Persistence 2 → barrier, 2 turns`.
- The Pasu screen is plain text and a single confirm. No cinematic, no fanfare, no
  warning copy beyond what is already true.

---

## 12. Cut

- All PvP.
- Player-inflicted erasure.
- Persistent accounts, per-account permanent forfeiture, async raids on other
  players.
- Exclusive kin-role queues gated behind other players' characters staying alive.

---

## 13. Risks

- **Composition is the whole game and the hard part.** If the resolution rules do
  not produce results that are surprising but legible, there is no reason to pay
  Pasu and this is a triage puzzle with a decorative magic system.
- **Permanent in-run degradation reads as punishment** unless the interface makes
  triage feel like a decision. Hence the score showing what was saved.
- **Roles-as-constraints become annoyance** if the constraint is not legible
  before it is violated. It must be visible on the action, not in a menu.
- **Knowledge-only meta-progression hooks slowly.** The first three runs have to
  teach enough to feel like gain, or the retention curve never starts.
- **Monetization.** Irreversible choices and no power progression leave nothing
  coherent to sell. Premium one-time purchase, or cosmetics. Decide this before it
  gets decided by default.

---

## 14. Open design questions

1. How many dimensions are findable per run. Too few and combination is trivial;
   too many and stability is the only limit that matters.
2. Whether the codex should record failed combinations as prominently as
   successful ones. Recommend yes — a wrong sum is knowledge.
3. Whether kin size (lives) should vary by run or be fixed. Varying it is a sixth
   reroll; it may be one too many.
4. Whether the erased should remain visible on the map. Visible is honest and may
   be miserable.
5. Whether an eraser can be stopped at all, or only outpaced. "The patient" says
   no; the other four imply yes. Both cannot be the default.
