# Aetherline

A portable colony of humans and living creatures, carried across an infinite
scatter of procedurally generated 2D worlds. Creatures are defined by deep
genetics, shaped by epigenetics, and elevated by emergent archetypes.

Creatures do not run individual brains. Every clan shares **one small neural
network** that learns from what its members live through, so a discovery made by
four individuals becomes something all forty of them know — and a fraction of it
is inherited by the generation after.

**Engine:** Godot 4.3+ (2D, GDScript only). Developed against 4.8-dev2, verified
headless on 4.5.1-stable.

---

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 0 | Project skeleton, autoloads, core data models | **complete** |
| 1 | Genetics + epigenetics core | **complete — 239/239 self-tests pass** |
| 2 | Archetypes + StoryDirector foundation | **complete — 312/312 self-tests pass** |
| 3 | Planet generation + world streaming + ecological field | **complete** — chunks, ecology, five-verb overworld |
| 4a | AI: the shared cultural network | **complete — 383/383 self-tests pass** |
| 4b | AI: combat, utility, embodiment | **complete** — combat + work/relationships/audio + culture AI |
| 5 | Colony management + emergent storytelling | **complete** — base builder, research, crafting, colony metrics |
| 6 | Progression, economy, save polish | **in progress** — stockpile, legacy, save compaction, upgrades; all four now under test |

**1,014 assertions pass** across nineteen suites plus a whole-project compile
gate. Run them with the command in [Running](#running) — note that it names
`bootstrap.tscn` explicitly, because the main scene is the game now.

The compile gate is first and is not a formality. The suites exercise *systems*,
and the largest script in the project — `overworld.gd`, where the game actually
happens — is touched by none of them, so a compile error there used to show a
clean pass and then fail on New Game. Every `.gd` file outside `addons/` is now
loaded and checked before anything else runs.

---

## Folder structure

```
Aetherline/
├── autoload/                     6 singletons, loaded in dependency order
│   ├── event_bus.gd              global signal hub — the decoupling spine
│   ├── simulation_budget.gd      LOD banding + tick slicing; the "never
│   │                             simulate everything" governor
│   ├── genome_db.gd              content registry: chromosomes, loci, alleles,
│   │                             epigenetic templates, archetype definitions
│   ├── planet_manager.gd         owns every known world; exactly one is active
│   ├── story_director.gd         observes, remembers, narrates
│   └── save_system.gd            atomic, sectioned, versioned persistence
├── resources/                    core data models (.gd, all .tres-capable)
│   ├── genetics/
│   │   ├── allele_resource.gd
│   │   ├── locus_definition_resource.gd
│   │   ├── chromosome_definition_resource.gd
│   │   └── genome_resource.gd            ← per-creature, phased haplotypes
│   ├── epigenetics/
│   │   ├── epigenetic_mark_resource.gd
│   │   └── epigenetic_profile_resource.gd
│   ├── archetypes/
│   │   ├── archetype_definition_resource.gd
│   │   └── archetype_state_resource.gd
│   ├── identity/
│   │   ├── creature_identity_resource.gd
│   │   └── lineage_record_resource.gd
│   ├── world/
│   │   ├── planet_seed_resource.gd       ← what a planet *is* (regenerable)
│   │   └── planet_summary_resource.gd    ← what the player *did to it*
│   └── culture/
│       └── culture_resource.gd           ← one clan's brain: live + locked
├── scenes/
│   ├── creatures/
│   │   ├── creature.tscn         composition root: 12 sibling components
│   │   └── creature.gd           wiring, ticking, serialization only
│   ├── world/
│   │   ├── overworld.gd          the planet layer: five verbs, chunk streaming
│   │   └── planet_world.gd       per-planet host + ecological field
│   └── ui/
│       ├── main_menu.tscn/.gd    THE MAIN SCENE since Phase 5
│       ├── bootstrap.tscn/.gd    test harness + creature readout
│       ├── genome_lab.tscn/.gd   interactive breeding bench
│       ├── culture_lab.tscn/.gd  watch a culture form; drift chart + ledger
│       ├── star_map.gd           choose where to fall next
│       ├── ship_view.gd          the incremental layer's shopfront
│       ├── service_menu.gd · inventory_panel.gd · party_panel.gd
│       ├── lineage_panel.gd · landfall_card.gd
│       └── fps_bench.gd          population stress bench
├── scripts/
│   ├── systems/
│   │   ├── aether_types.gd       shared enums + i64 JSON helpers
│   │   ├── culture_net.gd        the MLP + REINFORCE kernel; no engine types
│   │   ├── culture_registry.gd   every clan's culture, static, save-provider
│   │   ├── perception.gd         the 32-slot layout, owned in exactly one place
│   │   ├── culture_reward_router.gd  events -> rewards -> gradients
│   │   ├── culture_ticker.gd     drives FULL/NEAR/ABSTRACT off the LOD slices
│   │   ├── culture_selftest.gd       88 assertions: hundredth monkey + separation
│   │   ├── ship_system.gd        the incremental layer: modules, salvage
│   │   ├── ship_selftest.gd          55 assertions, mostly salvage conservation
│   │   ├── phenotype_resolver.gd genome -> traits, pure & static
│   │   ├── condition_eval.gd     shared by archetypes and story templates
│   │   ├── creature_factory.gd   the only place creatures come into existence
│   │   ├── breeding_system.gd    the conception pipeline
│   │   ├── data_model_selftest.gd    82 assertions over the resources
│   │   ├── creature_selftest.gd      94 assertions over the live creature
│   │   ├── breeding_selftest.gd      62 assertions, statistical
│   │   └── archetype_selftest.gd     73 assertions, incl. the Guardian arc
│   ├── components/
│   │   ├── creature_component.gd     shared contract (two-phase load)
│   │   ├── genetics_component.gd     genome + expression resolver + mutation
│   │   ├── epigenetics_component.gd  marks, pressure, decay, overlay
│   │   ├── experience_component.gd   counters · extremes · bounded episodes
│   │   ├── archetype_component.gd    progress, crystallization, shatter
│   │   ├── stats_component.gd        the phenotype pipeline; single read point
│   │   ├── needs_component.gd        hunger / energy / health / mood
│   │   ├── perception_component.gd   smoothed senses; drop it and AI still runs
│   │   ├── ai_controller.gd          network + authored gates -> action
│   │   └── visual_controller.gd      phenotype -> silhouette (Phase 6 replaces)
│   └── generators/
│       └── meiosis.gd            crossover, segregation, fertilization
└── data/                         authored JSON catalogs
	├── genome/                   chromosomes.json + loci/ + alleles/
	│                             15 chromosomes · 49 loci · 136 alleles
	├── epigenetics/              marks.json (20 templates, all 8 sources)
	├── archetypes/               archetypes.json (10 definitions)
	├── culture/                  drives.json (12) · rewards.json (22) ·
	│                             priors.json (6 authored dispositions)
	├── biomes/                   biomes.json
	├── colony/                   structures.json
	├── economy/                  market.json · recipes.json
	├── research/                 research.json
	├── settlements/              buildings.json
	├── ship/                     modules.json · achievements.json
	├── upgrades/                 catalog.json
	├── world/                    forage/population tables
	└── events/                   story_events.json (8 templates)
```

---

## Key architectural decisions

**Genomes store IDs, not objects.** A `GenomeResource` holds allele *ids*;
the alleles live once in `GenomeDB`. This is what makes a creature cheap to
serialize, cheap to diff against a sibling, and safe to keep tens of thousands
of in cold storage.

**Genomes are phased.** Storage is two haplotypes (`haplotype_a` /
`haplotype_b`), not an unordered pair per locus. Phase is required for linkage:
recombination has to know which alleles physically travelled together. This is
what lets "the giant frame and the bad joints came from the same grandparent's
chromosome" be a real, discoverable fact instead of flavour text.

**Epigenetics never edits DNA.** Marks are applied on top during phenotype
resolution and can fade. The genome is what a creature *could* be; the profile
is what its history *made* of it.

**Planets are seed + delta.** `PlanetSeedResource` is fully regenerable from one
64-bit number and is the only thing stored for unvisited worlds.
`PlanetSummaryResource` stores only the irreducible player-caused delta. Each
generation stage draws from its own named RNG stream (`rng_for("climate")`) so
changing one stage's algorithm cannot shift the others' output.

**Enums serialize as names, not integers.** Inserting a value into
`AetherTypes` mid-enum can never silently corrupt an old save.

**64-bit integers serialize as decimal strings.** Godot's JSON parser returns
*every* number as a double, so anything above 2⁵³ comes back mangled —
`841540765408843384` parses as `...392`. Since a planet seed is the sole source
of truth for regenerating a world, an 8-off seed silently rebuilds a completely
different planet with the player's outpost still attached to it. All 64-bit
quantities go through `AetherTypes.i64_to_json` / `i64_from_json`. **Any new
serializer touching a seed or 64-bit id must do the same.** Caught by the
self-test on the first run; see `DataModelSelfTest`.

**Saves are atomic and sectioned.** temp → verify-parse → rotate to `.bak` →
commit. A crash leaves either the old save or the new one, never a hybrid.
Campaigns here are measured in generations; a corrupt save is a lost campaign.

**Everything narrative flows through EventBus.** The climate system reports
"this creature was exposed to hard cold" without knowing that epigenetics, the
archetype tracker, the story director and three UI panels all care.

**The phenotype pipeline has three visible stages**, and `StatsComponent` is
the only place gameplay reads them from:

```
genetics.express_base()  ->  epigenetics.apply_to()  ->  archetype.apply_to()
		bred                        lived                      earned
```

Each stage stays separately queryable (`base_traits()`, `lived_traits()`,
`phenotype()`) because the debug readout has to show a player *why* their
animal is what it is. No system reads `GeneticsComponent` directly — otherwise
half the codebase would silently be using the un-lived version of the creature.

**Allele contributions are deltas, not absolutes.** Expression seeds from
`GenomeDB.baseline_traits()` — the species norm — and every allele adds a
deviation. This is the only way several loci can meaningfully sum into one
polygenic trait (`armor` comes from three genes, `mass` from four). Schema
convention: exactly one locus per trait declares a non-zero baseline; every
other contributor declares `0.0`, or the baseline would be counted twice.

**Linkage is simulated, not tabulated.** `Meiosis` scatters crossovers along a
chromosome as a Poisson process and flips strands while walking it, rather than
applying a pairwise recombination fraction per locus. Pairwise fractions give
correct two-locus statistics but wrong three-locus ones — they cannot express
that one crossover between loci 1 and 3 moves locus 2 as well. Measured output
matches Haldane's fraction to within sampling error (0.154 vs 0.151 predicted
at 18 cM; 0.434 vs 0.435 at 102 cM).

**Chromosome length is a balance lever.** Expected crossovers = `length_cm/100`,
so the 45 cM `chr_special` hands its latent traits down as a near-intact package
while the 120 cM `chr_form` reshuffles size, build and posture every generation.
`chr_thermal` is deliberately short so a hard-won survival adaptation inherits
as a unit; `chr_temperament` is deliberately long so a bloodline does not have
one personality.

**Components load in two phases.** Every component's `from_dict` runs, *then*
every component's `post_load`. Components routinely read each other (Stats
needs Genetics and Epigenetics populated before it can resolve anything), and
single-phase loading would make correctness depend on scene child order.

**Archetype conditions read the creature's own experience log, not a global
tally.** An animal left behind on another world for nine years — or reloaded
from a save into a fresh session — must still know what it became and why.

**Age is a prerequisite, never a weighted condition.** Scoring `age_days` as
progress would give every elderly animal phantom progress toward every
archetype, making the percentage meaningless. A catalog test enforces this.

**One condition evaluator, shared.** `ConditionEval` backs both archetype
crystallization and story templates, so an archetype and the event announcing
it can never disagree about whether the thing happened.

**Story events are polled, not pushed.** The StoryDirector reads creature state
on a slow cadence and decides what is worth saying, rather than every system
knowing which beats it should trigger. Per-kind cooldowns stop repetition;
once-in-a-lifetime events (crystallization) opt out with `cooldown_ticks: 0`.

**Creatures are found by node name, not by type.** Dropping a component out of
`creature.tscn` produces a valid variant — a plant-creature with no AI, a
corpse with no needs — and everything else keeps working.

---

### Phase 4: the shared cultural network

**A clan has one brain, not forty.** Every creature in a culture queries the same
weights and writes its gradients back into the same weights. That is the whole
mechanism behind the "hundredth monkey" effect: a thing learned by four
individuals is, mechanically and immediately, known to all of them. It is a
property of the *sharing*, not of the network — which is why the self-test proves
it by running the identical scenario twice, once shared and once with a private
network per creature, and showing the naive creatures learn in one and not the
other. Measured: 0.019 → 0.566 shared, 0.017 → 0.017 private.

**Arbitration folds into the softmax as an additive logit bias.** Utility
modifiers here have always been multiplicative — that is what `archetype.ai_bias()`
means — and a multiplicative factor is an additive term in log space. So

```
pi(a | s) = softmax( network_logit[a] + log(needs x phenotype x archetype) )
```

is exact rather than an approximation. Three things fall out of that one
identity: the Phase 2 archetype semantics survive untouched, the policy gradient
stays the clean `onehot(a) - pi` because the gates do not depend on the weights,
and every term stays separately printable — so a neural policy remains as
inspectable as the genome is. The debug readout prints *learned*, *gates*,
*final* in the same three-column grammar `StatsComponent` uses for
bred / lived / earned.

**The authored floor is a floor, not a suggestion — and gates alone could not
deliver that.** Additive gates can always be outvoted by a confident enough
network; a softmax cannot express "always". For ordinary pressure that is
correct and desirable. For an animal that is dying it is not, so a need past
`CRITICAL_THRESHOLD` is an *imperative* that overrides the policy outright. A
clan must not be able to learn its way into starving to death. Deliberately the
narrowest override that achieves it: two needs, only when critical — and a
compelled decision teaches the clan nothing, because the creature did not choose.

**The genome supplies the innate prior; the network supplies the learned one.**
The catalog already carried a trait for every drive in the roster — `curiosity`,
`boldness`, `aggression`, `sociability`, `empathy`, `forage`, `dexterity`. So the
same drive can be strong in an animal because of what it was bred to be or
because of what its people have learned, and those are separately visible.
Nature and culture are a real axis here rather than a metaphor.

**Dead perception slots are forced to zero AND initialised to zero.** Four slots
await Phase 3's world. The gradient into a zero input is already zero, so
training cannot corrupt them — but with *random* init those weights would sit at
their birth values while a clan trained for hours, and switching the slot on
later would inject pure noise into a culture that had learned something. Zero
init makes activating a sense a bit-exact no-op at the moment it happens. Same
append-only discipline as the genome schema and the `AetherTypes` enums, and
`CultureNet.grow_inputs` widens the matrix while keeping everything learned.

**Nothing the animal could not perceive goes in the perception vector.** No
`SimLOD`, no uid, no tick count, no camera distance. If the network can see the
simulation it will learn the simulation, and "when I am off-screen, do X" is the
tell-tale of a game that cheats. LOD gates *participation*, never perception, and
a self-test asserts no engine-only key appears in the layout.

**Two networks per culture: `locked` and `live`.** `locked` is what the clan *is*;
`live` is what this generation is *becoming*. Every decision reads `live`, every
update writes it, with a continuous elastic pull back toward `locked` — three
lines that are the entire answer to catastrophic forgetting. At a generation
advance `locked` moves `inheritance_fraction` of the way toward `live`, picks up
drift, and `live` restarts from it. Retention is measured in **log-odds**, not
probability: blending weights blends logits linearly, and probability is the
exponential of that, so "75% inherited" never means "75% of the probability".
Measured retention: 63% of the learned preference across a generation.

**Drift is relative to each layer's own scale.** Absolute noise would be wildly
uneven — the output layer initialises around 0.025 and the first hidden layer
around 0.25, so one fixed sigma is a rounding error in one place and a lobotomy
in another. Scaling by layer RMS makes `drift` mean the same thing everywhere:
"this generation remembers it about 5% differently". It is what makes two clans,
separated on two worlds from identical weights, become different peoples.

**Weights serialize as base64 float32, never as JSON numbers.** ~9 KB per network
instead of ~45 KB, and — the part that matters — exact. Godot's JSON parser
returns every number as a double and `stringify` shortens floats, so a save/load
would quietly change a clan's behaviour. This project has already paid for one
float-through-text precision bug; the culture seed is 64-bit and goes through
`AetherTypes.i64_to_json` for the same reason.

**An architecture change never silently reinterprets weights.** Layer-0 columns
are indexed by perception slot and layer-2 rows by drive. Growth in either
direction is reconciled; a change to the *hidden* geometry cannot be, so the
weights are reseeded, the clan's history and generation count are kept, and it
says so loudly. Subtly wrong is worse than loudly broken.

**Credit assignment is an eligibility trace.** An action and the outcome that
judges it are separated by seconds or days — the tool was picked up long before
the food it opened. Rewards are distributed backward over a creature's last eight
decisions with exponential decay, so nothing else in the system has to know about
the delay. Elders and archetyped individuals carry more weight into the update
than anonymous yearlings do.

**Reward routing hangs off `experience_logged`, which was already the single
funnel.** One router for the whole game, not one per creature — N subscribers
would make every event cost N dispatches, and the bus forbids that traffic. It
also means a clan can only learn from events that are genuinely part of a
creature's recorded history, and per-kind daily caps mean farming one event stops
paying. The learning update itself emits nothing; only "the clan changed its
mind" reaches the bus, throttled.

**The AI driver lives outside the governor.** `SimulationBudget`'s contract is
accounting. `CultureTicker` calls `take_near_slice()` / `take_abstract_slice()`
from outside, because a governor that knows what it is governing is one every
future system has to edit too. Tier 3 runs **no forward pass at all** — the whole
ABSTRACT band shares one cached policy, refreshed every 300 ticks — which is what
lets a distant herd still reflect what the clan knows for near-zero cost.

---

## Assumptions made (flag any you disagree with)

1. **GDScript only, no C#**, despite a Mono build being present. Mixing adds
   marshalling cost on the hottest path in the game (per-creature simulation)
   for no clear benefit yet.
2. **JSON catalogs over hand-authored `.tres`** for the genome schema. The
   schema is large, tuned numerically, and benefits from being diffable and
   tool-generatable. The classes are still `Resource`s, so editor authoring
   stays available via `register_*`.
3. **`GenomeDB` is the single content registry**, including epigenetic mark
   templates and archetype definitions, not just genetics. The autoload list is
   fixed at six; splitting registries would need a seventh.
   **Held in Phase 4, and worth stating why rather than quietly routing around
   it.** Drives, reward values and pretrained priors are *authored content* and
   went into `GenomeDB` accordingly. The learned weights they act on did not:
   those are runtime-mutated, per-campaign state, and putting them in the one
   registry that is safe to reload from disk at any moment would have made it
   unsafe. They live in `CultureRegistry`, a **static class, not a seventh
   autoload** — because the six autoloads are *processes* (they tick, they
   listen, they own a load order or a filesystem) and a culture registry is a
   *place*. The precedent already existed: `CreatureFactory._uid_counter` and
   `BreedingSystem.research_mutation_modifier` are static campaign-wide state
   for the same reason. The one real cost is that a static class has no `_ready`
   to register its save provider from, so `install()` is idempotent and is
   called from every entry point — and asserted against a real save file.
4. **Humans and creatures share one component stack.** Humans are creatures
   with `is_human = true`, a different genome schema, and a richer social model.
5. **`TICKS_PER_DAY = 1200`** at 60 physics ticks/sec ⇒ 20 real seconds per
   in-game day at 1× speed. Placeholder; easy to retune, single constant.
6. **Reproductive role is `ReproRole`, not sex.** Species vary; some lineages
   are monomorphic or budding.
7. **Mutation selects from catalog alleles**, rather than synthesizing novel
   alleles at runtime. Keeps genomes id-addressable and diffable. See open
   question 1.
8. ~~The Phase 0 schema is provisional scaffolding.~~ **Replaced in Phase 1** by
   the real schema: 15 chromosomes, 49 loci, 136 alleles, 20 epigenetic mark
   templates. The swap needed no changes to any system code — only the JSON and
   the test fixtures that hardcoded old locus ids — which was the point of the
   data-driven design.
9. **Reproductive role is decided at conception, not inherited as a gene.**
   Simpler than a sex-determination locus and sufficient; a species that needs
   genetic sex determination can add a locus later without disturbing this.
10. **Offspring join the gestating parent's lineage**, because the cytoplasmic
   chromosome does. Lineages therefore follow an unbroken maternal line.
11. **Derived stats are never serialized**, only true state (hp, age, needs).
   A balance change therefore applies to existing creatures instead of leaving
   a generation frozen at old numbers. Phase 4 holds to this: perception
   vectors, eligibility traces, drive logits and the drift chart's history are
   all absent from saves. The weights are the state that matters, and they are
   stored once per clan rather than once per animal.
12. **Culture is inherited maternally, like lineage.** A child joins the
   gestating parent's people, on the same reasoning as assumption #10 — a child
   is raised by whoever carried it, and culture is transmitted by raising.
   `culture_id` empty means "fall through to `lineage_id`", so every bloodline
   founds its own culture and Phase 4 needed no content authored per creature.
   Stage 3 sets it explicitly when clans merge and split, at no schema cost.
13. **A generation advances because a clan lived, not because a timer fired.**
   Consolidation triggers when the clan's high-water generation passes the
   culture's, from `BreedingSystem._announce_birth`. The same function backs the
   player-facing button.
14. **Culture is not carried in gametes.** `Meiosis` stays pure genome
   mathematics and was not touched. Genes and culture are separate inheritance
   channels on purpose — that a clan can lose its knowledge while keeping its
   bloodline, or the reverse, is the point.

## Open questions (need answers before the phase that depends on them)

1. **Novel alleles.** *Built as authored-only* — mutation moves between catalog
   alleles rather than synthesizing new ones. Still open as a possible Phase 6
   extension; changing it later means giving campaigns their own allele
   catalog in the save, which the id-addressed genome makes feasible.
2. **Humans vs creatures.** Still open. Humans currently share the creature
   schema. Do they get their own chromosome set, or the same 15 with
   human-only alleles? Needed before Phase 5's colonist social model.
3. **Inbreeding.** Lethal recessives already punish a narrowing gene pool (a
   carrier × carrier cross loses ~25% of the litter, measured). Should there
   also be an explicit inbreeding-coefficient penalty, or is emergent recessive
   pressure enough? Recommend leaving it emergent.
4. **Archetype exclusivity.** *Built as* one per exclusivity group. Nine
   archetypes share group `"core"` so identity is a real choice; `Broken` sits
   in group `"scar"` and can co-exist — a Guardian who is also Broken is the
   better story. Revisit if the roster grows.
5. **Phase 3 — chunk size.** 64×64 vs 128×128 was left open in the brief.
   Depends on tile size and how dense fauna is; recommend deciding after the
   first streaming prototype.
6. **Phase 5/6 — save cadence.** Autosave on jump only, or also on a timer?
   Jump-only is cleaner for the "carry living history" fantasy, but harsher.
7. **Phase 4b — how much does a clan generalise?** The measured lesson is
   context-bound but not perfectly so: migration rose 0.547 in the cold snap and
   0.256 in an unrelated situation. Some transfer is correct — that is what
   makes a culture more than a lookup table — but the right ratio is a design
   question, tuned by network width and the entropy bonus. Answer it against a
   real world in Stage 2, not against synthetic situations.
8. **Stage 3 — who owns the clan roster?** Culture merging and splitting needs a
   list of who is in a clan, and so does Phase 5's colony model. Build it once in
   Stage 3 rather than twice.
9. **Stage 2 — the four reserved perception slots.** `predator_pressure`,
   `food_proximity`, `ally_density` and `terrain_hazard` are wired, zeroed and
   waiting. Whether four is enough, and whether they should be scalar or
   directional, depends on what Phase 3's chunks can answer cheaply.

---

## Pacing

Every number in the progression was invented: three evolution leaps to win, six
understandings per crossing, two living members per pending neuron, a generation
every forty gradient applications. Nothing could check them, because the suites
drive systems directly — `StakesSelfTest` reaches the ambition by handing the
tree a thousand support and unlimited energy, which says nothing about whether a
player gets there.

`PacingSelfTest` plays one campaign forward instead. A clan of six, kept fed, for
three in-game years, through the real router and the real generational clock,
buying the cheapest thing it can afford and crossing whenever it has earned it.
One in-game day is 1,200 ticks at 60Hz — twenty real seconds.

```
in-game days to carry the bloodline across              300.00
in-game days per generation                              60.00
real hours of play, at twenty seconds a day               1.67
generations that turned over                              5.00
neuronal energy earned in total                        2212.00
understandings locked into the lineage                   21.00
understandings lost at a boundary                         8.00
share of what they worked out that survived               0.72
children born into the clan                               5.00
living at the end                                        11.00

  day   59  generation 1 ·  3 locked · 445 banked
  day  119  generation 2 ·  7 locked · 751 banked
  day  120  EVOLUTION LEAP 1 ·  7 understandings held
  day  179  generation 3 · 11 locked · 242 banked
  day  239  generation 4 · 16 locked · 493 banked
  day  240  EVOLUTION LEAP 2 · 16 understandings held
  day  299  generation 5 · 21 locked ·   8 banked
  day  300  EVOLUTION LEAP 3 · 21 understandings held
```

### What the probe found

**The boundary was firing on a level, not an edge.** The rule was
`live.applies % 40 == 0`, checked once per village lesson. An apply lands only
every sixteen accumulated gradients, so the condition stayed true across every
check in between. The first run of this probe reported **7,086 generations** and
a clan keeping **3%** of what it worked out — buy an understanding, watch it
evaporate before the next lesson. The `degenerate softmax; falling back to
uniform` warnings the run was throwing were the network being blended and
drifted seven thousand times.

**And it was clocked off the wrong thing.** Edge-triggering fixed the storm but
not the premise. Generations tied to gradient throughput meant a clan aged
faster when it was learning hard, so the cadence decayed as the reward baseline
converged: 21, 23, 24, 39, 107, 169 days apart, the last third of a campaign
spent waiting with 1,422 unspendable energy banked. Worse, it disagreed with
`age_unattended` — leave a colony for three hundred days and it aged once; stay
with it and it aged five times. **The same clan aged at two different rates
depending on whether anybody was watching.**

The clock is lived days now, for both paths, with `GENERATION_DAYS` as the only
knob and an assertion that a watched clan and an absence buy exactly the same
generations. The cadence is uniform and banked energy no longer runs away — most
of that problem was the decay, not the catalog.

**And the clan could not grow.** `BreedingSystem` has been complete since
Phase 1 and was reachable in play from exactly one place: paying for "the
stalls" at a settlement service menu. But the ceiling on everything the neuronal
tree does is the number of living members — a boundary carries
`floor(living / 2)` provisional understandings — so a clan that could not grow
had a ceiling fixed at character creation that could only ever fall. `ClanGrowth`
breeds one child per boundary from parents who are fed, whole and grown, which
turns "look after your people" into "your people can hold more of what they have
worked out". It is the arc the support arithmetic was always describing and
nothing was producing. Locked-per-generation now climbs 3, 4, 4, 5, 5 as the
clan grows from six to eleven, and the share of understandings that survive a
boundary went from 0.55 to 0.72.

### Still a judgement call

`GENERATION_DAYS` is **60**, chosen to preserve what the old broken clock was
actually delivering, so that fixing the clock did not silently reprice the
campaign. It used to be 300, justified as the species' default `max_age_days` —
a generation is a lifetime, which is the better story. Set it back to 300 and
the same campaign takes about ten hours. That trade is a design decision, the
constant is where to make it, and the probe prints what the change did.

Re-run the probe after any change to the reward catalog, the neuron costs, or
the boundary rule.

---

## Running

Open the folder in Godot 4.3+ and press F5 — that starts the **game**, at the
main menu. The test harness is a separate scene and has to be named explicitly:

```bash
# once, and after adding any new class_name
godot --path . --headless --import

# the full suite (1,014 assertions)
godot --path . --headless res://scenes/ui/bootstrap.tscn --quit-after 2500
```

Naming `bootstrap.tscn` matters and is easy to get wrong: `run/main_scene` is
`main_menu.tscn` since Phase 5, so a bare `--quit-after` boots the game and runs
no tests at all while looking like a clean pass.

The `--import` pass is required after adding any new `class_name`; without it
Godot has no global class registry and every type reference fails to parse.

The bootstrap screen prints every autoload's self-report, runs every suite, and
dumps a full readout of a creature that has been spawned, mutated, marked by
its environment, saved and reloaded:

- **The compile gate** — 114 assertions, one per `.gd` file in the project: it
  loads every script and asks whether it compiled into something instantiable.
  `load()` alone is not the check — a GDScript that fails to parse still comes
  back non-null, and the first version of this gate passed a deliberately broken
  `overworld.gd` and reported 114/114.
- `DataModelSelfTest` — 82 assertions over the core resources, round-tripped
  through real JSON.
- `CreatureSelfTest` — 94 assertions over the live creature: schema coverage
  (every gene category and epigenetic source represented), spawn, deterministic
  mutation, epigenetic expression, and two save/load round trips (in-memory and
  through a real file) compared strand-by-strand.
- `BreedingSelfTest` — 62 assertions, mostly statistical: segregation, 3:1 and
  1:2:1 ratios, testcross, independent assortment, linkage against Haldane's
  fraction, uniparental inheritance over 8 generations, mutation at birth,
  epigenetic crossing, and lethal-recessive viability. Fixed seed, with
  tolerances set from the sampling error of each sample size.
- `ArchetypeSelfTest` — 73 assertions: experience logging, condition
  evaluation, the full Guardian arc (progression → foreshadowing →
  crystallization → consequences → narration), exclusivity, shattering,
  prerequisites, story templates, and save/load of all of it. Prints the
  narrative it actually produced.
- `CultureSelfTest` — 88 assertions over the shared network: the analytic
  gradient checked against a numeric one in every layer (the assertion that
  separates "this learns" from "this random-walks"), softmax stability at
  ±900 logits, gradient clipping, NaN rollback, dead-slot inertness, the
  authored floor holding against a network pinned against it, 5,000 adversarial
  updates without collapse, a real save file round-tripped bit-for-bit — and the
  headline scenario below.
- `CombatSelfTest` — 16 assertions over damage, defence and resolution.
- `CatchingSelfTest` — 34 assertions: party limits, ship overflow, discovery,
  the catch itself, and session state.
- `ColonySelfTest` — 36 assertions: building, research, relationships, work.
- `ProgressionSelfTest` — 53 assertions: stockpile, crafting, legacy score,
  save robustness, LOD banding, and the audio/visual hooks.
- `ShipSelfTest` — 55 assertions over the incremental layer, and mostly about
  conservation rather than features: 400 randomised buy/sell operations must
  never drive salvage negative nor create it from nothing, no owned level may
  exist without a record of having been paid for, an achievement must not pay
  twice, and a save written before the sell ledger existed must still refund
  something when its modules are sold.
- `StakesSelfTest` — 36 assertions about whether this game can be lost: neglect
  killing, the tough collapsing before they die, extinction latching so a run
  cannot be reloaded back into life, and the one that the rest exist to make
  reachable — a clan thinned by death losing understandings it had worked out,
  driven through `CultureRegistry.note_birth` with real registered creatures
  rather than by calling the tree, because the tree was never the broken part.
- `NeuronalSelfTest` — 67 assertions over the Ancestors loop end to end:
  discovery paying only once, fear paying every time, prerequisites gating on
  *locked* rather than pending, the generational boundary keeping what a clan can
  support and losing the rest cheapest-first, leaps carrying banked surplus
  forward, and — through the live router rather than by calling the tree — that
  earning announces itself on the bus at all.
- `LoreVoiceSelfTest` — 40 assertions that the game can explain itself, pulling
  in two directions on purpose: the plain view must contain no ids, digits or
  underscores, the advanced view must contain plenty, and every drive in the
  catalog and every experience kind in the reward catalog must have a sentence.
  Adding a drive and forgetting its voice fails the build rather than shipping
  *"The Vess are becoming more tool_confidence."*
- `PacingSelfTest` — plays a competent campaign forward for three in-game years
  through the real router, real decisions, the real settlement generation rule
  and a spend-the-cheapest-thing policy, and reports what happened. Only seven
  assertions, all of them things that must hold whatever the tuning is — chiefly
  that a competent clan can actually finish. Everything else is measured and
  printed rather than asserted, because a test that pinned those numbers would
  be freezing a guess into a requirement. See [Pacing](#pacing). It then saves
  that finished campaign to a real file, reloads it, and asserts it came back
  identical — the only place a campaign with a history is round-tripped rather
  than a clean object built seconds earlier — and opens both player-facing
  panels on it, which is the only place they meet a clan that has forgotten
  something.
- `GameplaySelfTest` — 35 assertions over the loop end to end: colony, harvest,
  jump, save.
- `WorldSelfTest` — 79 assertions over planet derivation and chunk streaming.
- `NeuronPanel.run_smoke_test` — drives the Understandings screen: it opens,
  refuses with a reason rather than greying out, and spends energy.
- `CultureLab.run_smoke_test` — drives the culture bench end to end: teaching
  moves the clan, reset-to-inherited is an exact undo, generations advance,
  priors seed, clans fork.
- `GenomeLab.run_smoke_test` — drives the debug panel end to end, so a broken
  debug tool fails the build rather than being discovered later.
- `EndingScreen.run_smoke_test` — both ways a run finishes, asserted to read
  differently from each other, to name what the lineage understood and what it
  could not keep, to say something rather than nothing for a clan that achieved
  neither, and to report the way out being taken.

**The hundredth monkey**, run verbatim as the Phase 4 deliverable: twenty
creatures share one culture, a synthetic cold snap rewards migrating, and **only
four of the twenty ever meet it**. The other sixteen are then measured on a
condition they have never experienced and a behaviour they were never rewarded
for. The suite prints the adoption curve it actually measured:

```
naive migrate probability before discovery             0.019
adoption among the naive:  0.019 -> 0.025 -> 0.042 -> 0.566
control (no shared network) before / after     0.017 / 0.017
fraction of the learned preference inherited (log-odds)  0.634
policy entropy after adversarial training (max 2.485)    2.370
```

The control arm is the important half. Sixteen creatures growing more likely to
migrate proves nothing on its own — drift, a moving baseline or a broken
measurement would all produce it. The same scenario, same seed, same events, run
with a private network per creature leaves them at chance. The difference between
those two rows is the entire claim.

Then press **Open Genome Lab** for the interactive bench: make founders, assign
two parents, breed them repeatedly, drive creatures through experience presets
until archetypes crystallize, and inspect any animal's genome, marks,
three-column phenotype, hidden carriers, experience log, archetype progress
(with what it still needs) and parentage. The Chronicle pane collects every
story beat the game fires.

Then press **Open Culture Lab** for the cultural bench: found a clan, teach it a
situation and watch the drift chart and drive bars respond, advance a generation,
discard a generation's learning, seed an authored prior, or fork a clan and watch
two peoples diverge from one starting point. The reward ledger shows what has
been teaching the clan, broken down by kind — one kind swallowing the ledger is
what an exploit looks like from the outside.

Only failures are listed by default; pass `-- --verbose-tests` for every
assertion. Two loud messages during the run are expected and are tests passing,
not failing:

- a `push_warning` about `epi_does_not_exist` in the creature suite — a test
  deliberately asks for an unknown mark to prove it is refused safely;
- a `push_error` from `CultureNet` about non-finite weights being rolled back —
  the culture suite deliberately feeds it a NaN update to prove the rollback
  restores the last known-good weights rather than persisting a poisoned brain.

The "archetypes.json not present yet" catalog note is expected until Phase 2.
