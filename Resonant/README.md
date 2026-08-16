# Resonant

You are a single point of consciousness. You cannot move. You have four dials,
and everything you will ever perceive is a consequence of where they sit.

**Stack:** vanilla JS + Canvas2D + WebAudio. No build step, no dependencies, no
backend, no assets. Runs offline from `index.html`.

```
python3 -m http.server 8000      # then open http://localhost:8000/index.html
node tools/simtest.js            # 232 headless assertions, no DOM
node tools/build.mjs             # -> dist/resonant.html, one self-contained file
```

---

## The four dials

| | | |
|---|---|---|
| **τ** | Time | Rate and direction of the local clock |
| **Σ** | Space | Which rung of the scale ladder is rendered |
| **Δ** | Phase | Offset along the fourth dimension |
| **φ** | Frequency | Which reality layer manifests |

They are the whole interface. There is no second control scheme anywhere in the
game — the dials get *reinterpreted* instead (see [Bodies](#bodies)).

---

## The two halves

### 1. The attunement field — tuning reality

The root layer is **Galactic**. `js/cosmos.js` holds 22 rungs of a scale ladder
built from real numbers: Planck foam at 10⁻³⁵ m, the Bohr radius at 5.29×10⁻¹¹,
the Milky Way disc at ~10²¹, Laniakea at 1.6×10²⁵, the Hubble volume at
8.8×10²⁶. Above the horizon "size in metres" stops being the right coordinate,
so those four rungs carry no metre value and are classified by **Tegmark
multiverse level** instead — the standard taxonomy for what lies beyond an
observer's horizon. You open the ladder inward and outward from Galactic.

The **φ axis** carries twelve reality layers as Gaussian bands — Baryonic,
Thermal, Electromagnetic, Probabilistic, Vital, **Emotional**, Mnemonic,
Causal, Archetypal, Noetic, Null, Unity. Three dial upgrades gate them, and
they gate different things:

- **Range** — extends how far the dial physically reaches. Without it, the high
  bands are not hard, they are *absent*.
- **Precision** — shrinks the smallest step. High bands are narrow; without it
  you step straight over them.
- **Focus** — narrows your carrier. Below a band's `minFocus` your signal is too
  smeared to cohere, so the layer shows as a **ghost**: visible, not holdable.

Reach it, land on it, hold it.

Each layer imposes different mechanics on the field — `accretion` (incremental,
yield accrues unattended), `pulse` (rhythmic gating windows), `superposed`
(each node manifests twice, one is load-bearing), `valence` (attract/repel
social physics), `recursive` (nodes nest; depth is the payout), `causal` (a
node cannot be held before its antecedent), `inverted` (the null layer scores
alignment backwards), `unity`.

**The lock is four-dimensional.** Alignment is the product of four Gaussians,
one per dial, and each band declares how much it *demands* of each axis — the
baryonic layer asks only for φ and Σ; by the causal layer all four are live.
That ramp is the difficulty curve and the tutorial at once: each new layer
introduces exactly one more thing to think about.

### 2. The solar layer — inhabiting it

Turn **Σ** inward past the stellar tier and the ladder itself becomes the
navigation: galactic field → solar system → planet surface. There is no travel
menu.

Everything in it is derived from real astrophysics. A star's **mass is the only
free parameter**; its luminosity (piecewise mass–luminosity), radius,
temperature (inverted Stefan–Boltzmann), main-sequence lifetime, spectral class,
habitable zone and frost line all fall out of it. Then the frost line decides
where gas giants can form, the habitable zone decides where biospheres appear,
and galactic-radius metallicity decides how much rock there was to build with.
Masses are drawn from a Salpeter IMF, so the galaxy is overwhelmingly M dwarfs
with a scattering of giants — and a 20 M☉ star is *always found young*, because
it cannot live long enough to be found otherwise.

Planets run the same chain one level down:

```
mass → radius → density → gravity → escape velocity
                              ↓
orbit + flux → equilibrium temp → which gases survive Jeans escape
                              ↓
       pressure → greenhouse → surface temperature
                              ↓
   liquid water? → biosphere → intelligence → economy
```

Every arrow is a formula. A world has no air because it is small and hot enough
that hydrogen outran its gravity. It is nearly isothermal because a thick
atmosphere transports heat. It is tidally locked because it sits too close to a
dwarf. Free oxygen in its spectrum means something is alive down there — and you
can see that biosignature from orbit before you ever land. The player reads
causes off effects, which is the whole reason to do it this way rather than roll
on a table of planet types.

---

## Bodies

A body is not a new control scheme — it is a **reinterpretation of the same four
dials**, declared per archetype:

| Body | τ | Σ | Δ |
|---|---|---|---|
| Walker | gait rate | stance height | heading |
| Flier | throttle | altitude | bank |
| Swimmer | stroke rate | buoyancy | heading |
| Courier | burn rate | orbital radius | transfer angle |
| Symbiont | urgency | depth of hold | intent |

Muscle memory transfers completely while the meaning changes entirely. And the
constraints are physical: a flier needs `pressure × 3.4 > gravity × 0.8` to
generate lift, so thin-atmosphere worlds genuinely ground you; legs fail above
3.2 g because the square-cube law is not negotiable. Bring the wrong body and
the HUD names the missing condition.

### The modal split

The dials serve two jobs, so the game splits them by mode — and the split is
thematically exact:

> **Observing** (no body): τ scrubs time, Σ moves the scale ladder.
> **Inhabiting** (a body): τ is throttle, Σ is your vertical axis.

A point of consciousness can move through a world's *time* or its *space*, never
both. Detached, you watch four billion years of a biosphere in twenty seconds;
embodied, you are stuck in the present like everything else with a body. Scout a
system by scrubbing its history, then commit to a moment and go there.

### Minds you can ride

Every creature carries a small recurrent neural network whose weights are
**derived from its address** — nothing trained, nothing stored, same mind for
every player. Not a behaviour state machine: a dynamical system with attractors,
limit cycles and hysteresis nobody designed. Feed it real sensory gradients and
foraging, circling, fleeing and stubbornness appear on their own.

The recurrent spectral gain sits just above 1 — the edge-of-chaos band where the
interesting dynamics live. A galaxy census of 60 minds fed identical input
settles into 9+ genuinely distinct behaviours.

**Influence is indirect by construction.** You never set a creature's outputs.
You apply a *bias vector* — an additive pressure on the hidden units. That
deforms the landscape the behaviour lives in rather than commanding it, so the
result depends on where in state space the mind currently is. Push gently and
you nudge a tendency; push hard and you may throw it into an attractor you did
not want. The bias decays when you stop, so influence is a sustained act, not
mind control. Cost: 200 multiply-adds per mind per tick.

---

## Why it is all formulae

**Nothing in this game is stored.** There is no array of world objects anywhere
in the codebase. Everything is derived on demand from its address:

```
(worldSeed, tier, band, cell, slot) ──hash──▶ manifestation
(worldSeed, sector, index)          ──hash──▶ a complete star system
```

Orbits are the clearest case. No body is integrated forward — position is a pure
function of six orbital elements and the time you ask about, via Kepler's
equation solved with **Halley's method** to machine precision in three
iterations. Consequences:

- **No loading.** A 400-body system is "generated" by deciding to look at it.
- **No stutter.** Cost is O(visible), and it is the *same* cost every frame — no
  integrator, no broadphase, no drift correction spikes.
- **Time is exact at any distance.** Scrubbing to t + 10,000 years costs exactly
  what t + 1 second costs, and it is correct — an integrator would smear into
  nonsense long before that. Measured: evaluating a billion years out takes the
  same time as evaluating now.
- **Tiny saves.** A run with 400 explored worlds is ~1.4 kB.

Measured in-browser (430×900, 2× DPR): simulation **0.02 ms/frame**, drawing
0.58–1.26 ms across all three scenes.

### Where the player changes things

The player can never edit a world — that would collapse the whole scheme. They
place **structures**, and the world's actual state is always:

```
effective = derived(address) ⊕ Σ deltas(address)
```

A structure is four numbers keyed by planet address. No structure sets a value:
every one biases a *rate* or a *ceiling* that then resolves through the same
closed-form models. A seeder raises the abiogenesis rate constant, it does not
place life. A lattice raises a culture's technology ceiling; what they do with it
is theirs. Effects mature over in-world time, so you place one and come back.

Because deltas apply *after* the analytic evaluation, time-scrubbing stays
honest: rewind and you see what the world would have done without you.

---

## Two currencies

- **Insight (Ψ)** is spent. Buys dial upgrades and research.
- **Gnosis** is never spent. It counts distinct `(essence, tier, band)` contexts
  you have recognised an essence in — and because it is stored against the
  *essence* rather than the instance, it pays out everywhere at once.

That second one is the premise as an economy. There are 14 **essences** —
Boundary, Flow, Recursion, Attractor, Duality, Emergence, Threshold, Lattice,
Spiral, Void, Seed, Weave, Cascade, Memory — and they are not content; they are
the alphabet every tier spells its content out of. The essence at a cell depends
on the cell alone, *not* on tier or band. So the same essence recurs down the
whole ladder wearing different clothes: `Spiral` is a Spiral Arm at the galactic
tier, a Coiled Flagellum at the cellular one, a Helix at the molecular one — and
observed through the emotional layer, a *Yearning* Spiral Arm. Learning to see
that is the real progression.

---

## Feedback design

The brief was that this must be the most satisfying thing to touch, so the
mechanics of that are load-bearing rather than decorative.

**The beat.** Two tones close in pitch beat at the difference of their
frequencies: far off, a fast ugly warble; closer, a slow throb; identical, the
warble vanishes and the tone goes glassy. That is how a guitar is tuned, and it
is the best feedback mechanism any physical instrument has, because the signal
gets *qualitatively* different as you close in rather than merely louder. So the
φ dial drives a real detuned oscillator pair: 4φ off tune is a 10 Hz flutter,
0.4φ off is a one-per-second throb, dead centre is silence. **A player can find
a layer with their eyes shut.** A ring on screen pulses at the same rate for
anyone playing muted.

**Everything else:**

- Dials have mass, friction scaled by the local tier's drag, and an encoder that
  clicks every notch. Detents are *discovered*, not given — the frequency dial
  only snaps to bands you have already made cohere.
- Distance-scaled precision: finger on the hub is coarse, swung out wide is fine,
  continuously, inside one gesture.
- Multi-touch — two thumbs, two dials. Hold φ steady while walking Δ in.
- Trauma-based shake (renders as trauma², so small events barely register),
  hit-stop that freezes the *simulation* while particles keep moving, pooled
  particles, springs on every needle so nothing ever teleports.
- Redundant channels: a crystallisation shakes, flashes, bursts, pops a number,
  ripples, buzzes the haptics and strikes a just-intonation chord in that band's
  own key — seven channels for one event.
- Feedback scales with **rarity**, not frequency. A detent tick gets 6 ms of
  haptic; first contact with a new reality layer gets everything the engine has.
- A permanent four-arc reticle shows how wrong *each* dial is, with a direction
  arrow. A four-dial lock you cannot diagnose is not difficulty, it is noise.

All audio is synthesised at runtime — there are no sound files.

---

## Files

| | |
|---|---|
| `core.js` | math, easing, springs, seeded hash/noise, event bus |
| `cosmos.js` | the 22-rung scale ladder, real scales + Tegmark levels |
| `spectrum.js` | 12 reality layers as Gaussian bands, resonance, focus gating |
| `dials.js` | dial physics, detents, encoder ticks, upgrade economics |
| `fractal.js` | essences, address→manifestation, the gnosis ledger |
| `field.js` | the attunement loop: four-dial alignment, coherence, per-layer rules |
| `orbital.js` | Kepler/Halley, Hill spheres, Roche limits, Hohmann transfers |
| `stellar.js` | IMF, mass–luminosity, habitable zones, system architecture |
| `planet.js` | Jeans escape, greenhouse, terrain fields, biomes, resources |
| `civ.js` | closed-form biospheres, civilisations, markets, emergent trade, fauna |
| `neural.js` | derived recurrent minds; the influence channel |
| `vessel.js` | archetypes, forces, senses, expenditure, dial remapping |
| `influence.js` | structures, research, sparse deltas, the two fields |
| `scenes.js` | scene stack, the modal split, agents |
| `game.js` `save.js` | state, economy, objectives, persistence |
| `audio.js` `feel.js` | procedural synthesis; shake/hitstop/particles/haptics |
| `render.js` `worldrender.js` `hud.js` `ui.js` `input.js` `reactions.js` | presentation |

`reactions.js` is the single place where "something happened" becomes "the
player felt it" — every other module emits plain events and knows nothing about
presentation.

---

## Tests

`node tools/simtest.js` — 232 assertions under a `window` shim, exercising the
same files the browser loads. It protects the things that are invisible until
they are catastrophic:

- **Determinism** of the fractal store and the save round-trip. Nothing in the
  field is stored, so a hash change silently rewrites every player's world.
- **Reachability**: maxed φ range must actually reach the final band and maxed
  focus must be able to hold it. It could not, once — focus is asymptotic and
  the top band demanded 0.96 while the ceiling was 0.9564, so the endgame was
  unreachable by construction.
- **Kepler to machine precision** across every eccentricity, and that a circular
  orbit returns to its start after exactly one period.
- **A galaxy census.** A percentage bound is too weak to catch what actually
  happened: every biosphere existed but none grew past 4% complexity, so the
  galaxy had life on paper, no complex ecology anywhere, and zero civilisations.
  Only counting the *stages* over ~700 systems finds that. Now asserted: life in
  4–45% of systems, complex ecologies exist, sapience is reached, at least one
  civilisation exists, and the stages get monotonically rarer.
- **The altitude datum.** `seaLevel` returns a −99 sentinel on dry worlds so no
  ocean is drawn; using it as a *height reference* made the lapse rate subtract
  ~99 units of altitude from every dry surface, freezing 640 K greenhouse worlds
  into ice sheets. Invisible, because the global temperature stayed correct and
  only local samples were wrong — 9,984 of 12,660 samples. Now asserted.
- Vessel integration stability through 0.25 s frames, neural minds bounded and
  behaviourally diverse, influence decaying, every research node reachable,
  every vessel and structure unlocked by something.

Verified in Chromium via Playwright: zero console errors, 55–60 fps across all
three scenes, ~1.4 kB saves.

---

## Status

This is a foundation, and complete as one: all three scenes are playable end to
end, every system named above is implemented and tested rather than stubbed.

The clearest things to build next — none of which require changing the
architecture, because the sparse-delta and derive-everything decisions were made
to accommodate them:

- **Per-layer gameplay modes as full scenes.** The twelve `mode` rules currently
  vary the attunement field; the framework is there for each to become its own
  view the way the solar layer did.
- **Multi-system travel.** `reachRadius` and the courier exist; the galactic map
  between systems does not yet.
- **First contact.** `civ.js` derives dispositions, contact thresholds and
  Kardashev indices, and nothing yet talks to you.
- **Deeper inhabitation.** Riding a mind works; riding a *civilisation* — biasing
  a culture's trajectory rather than a creature's — is the same mechanic one
  scale up.
