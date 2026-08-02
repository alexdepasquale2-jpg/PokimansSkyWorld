# Aetherline

A portable colony of humans and living creatures, carried across an infinite
scatter of procedurally generated 2D worlds. Creatures are defined by deep
genetics, shaped by epigenetics, and elevated by emergent archetypes.

**Engine:** Godot 4.3+ (2D, GDScript only). Developed against 4.8-dev2.

---

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 0 | Project skeleton, autoloads, core data models | **complete** |
| 1 | Genetics + epigenetics core | **complete — 239/239 self-tests pass** |
| 2 | Archetypes + StoryDirector foundation | **complete — 312/312 self-tests pass** |
| 3 | Planet generation + world streaming | not started |
| 4 | AI, combat, utility | not started |
| 5 | Colony management + emergent storytelling | not started |
| 6 | Progression, economy, save, polish | not started |

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
│   └── world/
│       ├── planet_seed_resource.gd       ← what a planet *is* (regenerable)
│       └── planet_summary_resource.gd    ← what the player *did to it*
├── scenes/
│   ├── creatures/
│   │   ├── creature.tscn         composition root: 7 sibling components
│   │   └── creature.gd           wiring, ticking, serialization only
│   ├── world/                    (Phase 3)
│   └── ui/
│       ├── bootstrap.tscn/.gd    test harness + creature readout
│       └── genome_lab.tscn/.gd   interactive breeding bench
├── scripts/
│   ├── systems/
│   │   ├── aether_types.gd       shared enums + i64 JSON helpers
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
│   │   ├── ai_controller.gd          utility scoring (Phase 4 extends)
│   │   └── visual_controller.gd      phenotype -> silhouette (Phase 6 replaces)
│   └── generators/
│       └── meiosis.gd            crossover, segregation, fertilization
└── data/                         authored JSON catalogs
	├── genome/                   chromosomes.json + loci/ + alleles/
	│                             15 chromosomes · 49 loci · 136 alleles
	├── epigenetics/              marks.json (20 templates, all 8 sources)
	├── archetypes/               archetypes.json (10 definitions)
	├── biomes/                   (Phase 3)
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
   a generation frozen at old numbers.

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

---

## Running

Open the folder in Godot 4.3+ and press F5, or headless:

```bash
godot --path . --headless --import && godot --path . --headless --quit-after 120
```

The `--import` pass is required after adding any new `class_name`; without it
Godot has no global class registry and every type reference fails to parse.

The bootstrap screen prints every autoload's self-report, runs both suites, and
dumps a full readout of a creature that has been spawned, mutated, marked by
its environment, saved and reloaded:

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
- `GenomeLab.run_smoke_test` — drives the debug panel end to end, so a broken
  debug tool fails the build rather than being discovered later.

Then press **Open Genome Lab** for the interactive bench: make founders, assign
two parents, breed them repeatedly, drive creatures through experience presets
until archetypes crystallize, and inspect any animal's genome, marks,
three-column phenotype, hidden carriers, experience log, archetype progress
(with what it still needs) and parentage. The Chronicle pane collects every
story beat the game fires.

Only failures are listed by default; pass `-- --verbose-tests` for every
assertion. One `push_warning` about `epi_does_not_exist` during the creature
suite is expected — a test deliberately asks for an unknown mark to prove it is
refused safely.

The "archetypes.json not present yet" catalog note is expected until Phase 2.
