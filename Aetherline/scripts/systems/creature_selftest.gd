extends RefCounted
class_name CreatureSelfTest

## Phase 0 item 5: proves a creature can be spawned, mutated, marked, saved and
## reloaded with FULL genetic fidelity.
##
## "Full fidelity" is tested strictly: not just that the reloaded creature has
## the same number of genes, but that every locus carries the same allele on
## the same strand, that the genome checksum matches, that the epigenetic marks
## match strength-for-strength, and — the test that actually matters — that the
## resolved phenotype comes out numerically identical. A save that preserves the
## data but not the resolution is still a broken save.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []

## Kept so the harness can print a full readout of a real, mutated, marked,
## round-tripped creature.
var showcase: Creature = null


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()

	var rng := RandomNumberGenerator.new()
	rng.seed = 20260802  # Fixed seed — a probabilistic test is one that eventually lies.

	_test_catalog()
	_test_spawn(parent, rng)
	_test_mutation(parent, rng)
	_test_epigenetic_expression(parent, rng)
	_test_round_trip(parent, rng)
	_test_file_round_trip(parent, rng)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Catalog ------------------------------------------------------------------

func _test_catalog() -> void:
	var problems := GenomeDB.validate_catalog()
	_check("catalog: loads without cross-reference errors", problems.is_empty())
	if not problems.is_empty():
		for p in problems:
			_lines.append("         " + p)
	# Phase 1 target: 12–16 chromosomes covering every required locus category.
	_check("catalog: 12-16 chromosomes",
		GenomeDB.chromosomes.size() >= 12 and GenomeDB.chromosomes.size() <= 16)
	_check("catalog: full locus set", GenomeDB.loci.size() >= 40)
	_check("catalog: full allele set", GenomeDB.alleles.size() >= 100)
	_check("catalog: epigenetic templates present", GenomeDB.epi_mark_templates.size() >= 15)
	_check("catalog: loci sorted into map order",
		_is_map_ordered(GenomeDB.loci_on_chromosome(&"chr_form")))

	# Every locus category the design calls for must actually be represented.
	var categories := {}
	for locus_id in GenomeDB.loci:
		categories[(GenomeDB.loci[locus_id] as LocusDefinitionResource).category] = true
	for required in [AetherTypes.GeneCategory.MORPHOLOGY, AetherTypes.GeneCategory.METABOLISM,
			AetherTypes.GeneCategory.SENSORY, AetherTypes.GeneCategory.COMBAT,
			AetherTypes.GeneCategory.WORK, AetherTypes.GeneCategory.BEHAVIOR,
			AetherTypes.GeneCategory.SPECIAL, AetherTypes.GeneCategory.MUTATION]:
		_check("catalog: category %s represented"
			% AetherTypes.enum_to_key(AetherTypes.GeneCategory, required).to_lower(),
			categories.has(required))

	# Every epigenetic source the design calls for must have at least one mark.
	var sources := {}
	for definition_id in GenomeDB.epi_mark_templates:
		sources[(GenomeDB.epi_mark_templates[definition_id] as EpigeneticMarkResource).source] = true
	for required_source in [AetherTypes.EpiSource.ENVIRONMENT, AetherTypes.EpiSource.DIET,
			AetherTypes.EpiSource.STRESS, AetherTypes.EpiSource.WORK,
			AetherTypes.EpiSource.SOCIAL, AetherTypes.EpiSource.COMBAT,
			AetherTypes.EpiSource.TRAINING, AetherTypes.EpiSource.RESEARCH]:
		_check("catalog: epigenetic source %s covered"
			% AetherTypes.enum_to_key(AetherTypes.EpiSource, required_source).to_lower(),
			sources.has(required_source))

	_check("catalog: a uniparental chromosome exists (maternal line tracking)",
		GenomeDB.chromosomes.values().any(
			func(c): return (c as ChromosomeDefinitionResource).uniparental))


func _is_map_ordered(locus_ids: Array) -> bool:
	var last := -INF
	for locus_id in locus_ids:
		var pos := (GenomeDB.get_locus(locus_id) as LocusDefinitionResource).map_position_cm
		if pos < last:
			return false
		last = pos
	return true


# --- Spawn --------------------------------------------------------------------

func _test_spawn(parent: Node, rng: RandomNumberGenerator) -> void:
	var creature := CreatureFactory.spawn_random(parent, rng, {"name": "Testsubject"})

	_check("spawn: creature enters the tree", creature.is_inside_tree())
	_check("spawn: all seven components collected",
		creature.genetics != null and creature.epigenetics != null
		and creature.archetype != null and creature.needs != null
		and creature.stats != null and creature.ai != null and creature.visual != null)
	_check("spawn: components know their creature",
		creature.genetics.creature == creature)
	_check("spawn: genome covers every schema locus",
		creature.genetics.genome.locus_ids().size() == GenomeDB.loci.size())
	_check("spawn: genome validates against the schema",
		creature.genetics.genome.validate().is_empty())
	_check("spawn: registered with the simulation budget",
		SimulationBudget.has_creature(creature.identity.uid))
	_check("spawn: lineage record created",
		StoryDirector.get_lineage(creature.identity.lineage_id) != null)

	var traits := creature.stats.phenotype()
	_check("spawn: phenotype resolves to real traits", traits.size() >= 12)
	_check("spawn: derived stats are positive", creature.stats.max_hp() > 0.0)
	_check("spawn: vitals initialized to full",
		is_equal_approx(creature.stats.hp, creature.stats.max_hp()))

	creature.queue_free()


# --- Mutation -----------------------------------------------------------------

func _test_mutation(parent: Node, rng: RandomNumberGenerator) -> void:
	var creature := CreatureFactory.spawn_random(parent, rng, {"name": "Mutable"})
	var before_checksum := creature.genetics.genome.checksum()

	var events: Array = []
	var listener := func(uid, locus, from_allele, to_allele):
		events.append({"uid": uid, "locus": String(locus),
			"from": String(from_allele), "to": String(to_allele)})
	EventBus.mutation_occurred.connect(listener)

	# Drive a mutation deterministically rather than gambling on the rate —
	# a probabilistic test is a test that eventually lies.
	var record := {}
	for attempt in 40:
		record = creature.genetics.force_mutation(&"therm_core", "a", rng)
		if not record.is_empty():
			break

	EventBus.mutation_occurred.disconnect(listener)

	_check("mutation: a point mutation landed", not record.is_empty())
	_check("mutation: genome checksum changed",
		creature.genetics.genome.checksum() != before_checksum)
	_check("mutation: recorded as de novo in this individual",
		creature.genetics.genome.de_novo_loci.has("therm_core"))
	_check("mutation: announced on the bus", events.size() >= 1)
	_check("mutation: bus event names the creature",
		not events.is_empty() and events[0]["uid"] == creature.identity.uid)
	_check("mutation: only the targeted strand changed",
		not record.is_empty() and record["strand"] == "a")
	_check("mutation: genome still validates after mutating",
		creature.genetics.genome.validate().is_empty())

	# The whole point of a mutation is that it changes the animal.
	_check("mutation: expression cache invalidated",
		creature.stats.phenotype().size() > 0)

	creature.queue_free()


# --- Epigenetics --------------------------------------------------------------

func _test_epigenetic_expression(parent: Node, rng: RandomNumberGenerator) -> void:
	var creature := CreatureFactory.spawn_random(parent, rng, {"name": "Weathered"})

	var bred_cold := float(creature.stats.base_traits().get("cold_tolerance", 0.0))
	var bred_aggression := float(creature.stats.base_traits().get("aggression", 0.0))

	creature.epigenetics.apply_mark(&"epi_cold_hardening", 0.5)
	var lived_cold := float(creature.stats.phenotype().get("cold_tolerance", 0.0))

	_check("epigenetics: mark shifts the phenotype", lived_cold > bred_cold)
	_check("epigenetics: DNA itself is untouched",
		is_equal_approx(float(creature.stats.base_traits().get("cold_tolerance", 0.0)), bred_cold))

	# ADD effect scales with strength, so repeated exposure must keep moving it.
	for i in 6:
		creature.epigenetics.apply_mark(&"epi_cold_hardening", 0.3)
	var hardened_cold := float(creature.stats.phenotype().get("cold_tolerance", 0.0))
	_check("epigenetics: repeated exposure deepens the mark", hardened_cold > lived_cold)
	_check("epigenetics: reinforcement does not duplicate the mark",
		creature.epigenetics.profile.marks.size() == 1)

	# SILENCE must pull toward the species baseline, not toward zero.
	creature.epigenetics.apply_mark(&"epi_broken_spirit", 1.0)
	var silenced := float(creature.stats.phenotype().get("aggression", 0.0))
	var baseline := GenomeDB.trait_baseline(&"aggression")
	_check("epigenetics: SILENCE pulls toward baseline, not zero",
		absf(silenced - baseline) < absf(bred_aggression - baseline) + 0.0001)

	_check("epigenetics: unknown mark id is refused safely",
		creature.epigenetics.apply_mark(&"epi_does_not_exist") == null)

	# Environmental pressure is the channel a planet writes bloodlines through.
	var marks_before := creature.epigenetics.profile.marks.size()
	creature.epigenetics.apply_pressures({"epi_dense_frame": 0.8}, 5.0)
	_check("epigenetics: planetary pressure creates marks",
		creature.epigenetics.profile.marks.size() > marks_before)
	var dense := creature.epigenetics.profile.find_by_definition(&"epi_dense_frame")
	_check("epigenetics: pressure accrues as discrete episodes",
		dense != null and dense.exposure_count >= 2)

	# --- And a mark that fades has to say so. -----------------------------------
	#
	# `EventBus.epigenetic_mark_lost` was declared in Phase 1 and emitted by
	# nobody for the life of the project. Marks DO expire — `decay_all` filters
	# them out — so the world would mark a creature, the feed would announce it,
	# and then the mark would quietly vanish along with whatever it was doing to
	# that animal's traits. A player watching a creature get slower with no event
	# to attach it to has been told a lie by omission.
	#
	# Run against the creature this test already has rather than a fresh one.
	# Spawning a second body here shifted the hundredth-monkey generalisation
	# figure by half a point three suites later, because CLAN SIZE IS A PERCEPTION
	# SLOT — every creature in every later suite sees a different input vector.
	# That fragility is worth knowing about; adding to it is not.
	var faded: Array[String] = []
	var fade_handler := func(_uid: StringName, definition_id: StringName):
		faded.append(String(definition_id))
	EventBus.epigenetic_mark_lost.connect(fade_handler)

	var held := creature.epigenetics.profile.marks.size()
	var cold_while_marked := float(creature.stats.phenotype().get("cold_tolerance", 0.0))
	var guard := 0
	while not creature.epigenetics.profile.marks.is_empty() and guard < 4000:
		guard += 1
		creature.epigenetics.decay(1.0)

	EventBus.epigenetic_mark_lost.disconnect(fade_handler)

	_check("fading: marks left alone eventually go (%d days)" % guard,
		creature.epigenetics.profile.marks.is_empty())
	_check("fading: and every one of them is announced, by name (%d of %d)"
		% [faded.size(), held], faded.size() == held)
	_check("fading: the trait one was holding up comes back down",
		float(creature.stats.phenotype().get("cold_tolerance", 0.0)) < cold_while_marked)
	var said := LoreVoice.mark_faded_sentence("Weathered", "epi_cold_hardening")
	_check("fading: the player is told in words, not ids",
		not said.is_empty() and not said.contains("_"))

	creature.queue_free()


# --- Round trip in memory -----------------------------------------------------

func _test_round_trip(parent: Node, rng: RandomNumberGenerator) -> void:
	var original := _build_rich_creature(parent, rng, "Vess")

	# Through real JSON, because that is the path a save actually takes.
	var snapshot: Dictionary = CreatureFactory.serialize(original)
	var text := JSON.stringify(snapshot)
	var reloaded_data: Variant = JSON.parse_string(text)
	_check("round trip: snapshot is valid JSON", typeof(reloaded_data) == TYPE_DICTIONARY)
	if typeof(reloaded_data) != TYPE_DICTIONARY:
		return

	var clone := CreatureFactory.spawn_from_dict(parent, reloaded_data)
	_compare("round trip", original, clone)

	showcase = clone
	original.queue_free()


# --- Round trip through the save file -----------------------------------------

func _test_file_round_trip(parent: Node, rng: RandomNumberGenerator) -> void:
	var original := _build_rich_creature(parent, rng, "Torr")
	var path := "user://phase0_creature_test.json"

	var wrote := SaveSystem.serialize_to_file(path, CreatureFactory.serialize(original))
	_check("file: creature written atomically", wrote)

	var read_back := SaveSystem.deserialize_from_file(path)
	_check("file: creature read back", not read_back.is_empty())
	if read_back.is_empty():
		original.queue_free()
		return

	var clone := CreatureFactory.spawn_from_dict(parent, read_back)
	_compare("file", original, clone)

	original.queue_free()
	clone.queue_free()
	DirAccess.remove_absolute(path)


## A creature with genuine history: mutated, marked, aged, worn down. A save
## test against a pristine newborn proves almost nothing.
func _build_rich_creature(parent: Node, rng: RandomNumberGenerator, name: String) -> Creature:
	var creature := CreatureFactory.spawn_random(parent, rng, {
		"name": name, "planet_name": "Kel-9", "origin_kind": "born", "generation": 3,
	})
	creature.identity.add_epithet("the Unbroken")

	for locus_id in ["therm_core", "behav_aggression", "morph_build"]:
		creature.genetics.force_mutation(StringName(locus_id), "b", rng)

	creature.epigenetics.apply_mark(&"epi_cold_hardening", 0.4)
	creature.epigenetics.apply_mark(&"epi_cold_hardening", 0.4)
	creature.epigenetics.apply_mark(&"epi_maul_trauma", 0.7, true)
	creature.epigenetics.apply_mark(&"epi_toil_callus", 0.25)

	creature.stats.age(84.0)
	creature.stats.hp = creature.stats.max_hp() * 0.62
	creature.needs.hunger = 0.41
	creature.needs.energy = 0.29
	creature.needs.mood = 0.55
	creature.ai.decide()
	creature.visual.refresh()
	return creature


# --- Comparison ---------------------------------------------------------------

## The heart of the deliverable. Compares two creatures field by field.
func _compare(label: String, a: Creature, b: Creature) -> void:
	# Identity
	_check("%s: uid preserved" % label, a.identity.uid == b.identity.uid)
	_check("%s: name preserved" % label, a.identity.display_name() == b.identity.display_name())
	_check("%s: lineage preserved" % label, a.identity.lineage_id == b.identity.lineage_id)
	_check("%s: generation preserved" % label, a.identity.generation == b.identity.generation)
	_check("%s: genome and identity agree on generation" % label,
		b.genetics.genome.generation == b.identity.generation)
	_check("%s: birth planet preserved" % label,
		a.identity.birth_planet_name == b.identity.birth_planet_name)

	# Genome — strand by strand, not just "same alleles somewhere".
	var genome_a := a.genetics.genome
	var genome_b := b.genetics.genome
	_check("%s: genome checksum identical" % label, genome_a.checksum() == genome_b.checksum())
	_check("%s: locus count identical" % label,
		genome_a.locus_ids().size() == genome_b.locus_ids().size())
	var strands_match := true
	for locus_id in genome_a.locus_ids():
		var pair_a := genome_a.pair_at(locus_id)
		var pair_b := genome_b.pair_at(locus_id)
		if pair_a != pair_b:
			strands_match = false
			_lines.append("         locus %s: %s vs %s" % [locus_id, pair_a, pair_b])
	_check("%s: every locus identical on both strands (phase intact)" % label, strands_match)
	_check("%s: de novo mutation history preserved" % label,
		genome_a.de_novo_loci == genome_b.de_novo_loci)
	_check("%s: repro role preserved" % label, genome_a.repro_role == genome_b.repro_role)

	# Epigenetics
	var marks_a: Array = a.epigenetics.profile.marks
	var marks_b: Array = b.epigenetics.profile.marks
	_check("%s: mark count preserved" % label, marks_a.size() == marks_b.size())
	var marks_match := marks_a.size() == marks_b.size()
	if marks_match:
		for i in marks_a.size():
			var ma: EpigeneticMarkResource = marks_a[i]
			var mb: EpigeneticMarkResource = marks_b[i]
			if ma.definition_id != mb.definition_id \
					or not is_equal_approx(ma.strength, mb.strength) \
					or not is_equal_approx(ma.heritability_chance, mb.heritability_chance) \
					or ma.exposure_count != mb.exposure_count \
					or ma.source != mb.source \
					or ma.inherited_depth != mb.inherited_depth:
				marks_match = false
				_lines.append("         mark %s differs" % ma.definition_id)
	_check("%s: every mark preserved exactly" % label, marks_match)

	# Archetype
	_check("%s: archetype progress preserved" % label,
		a.archetype.state.progress == b.archetype.state.progress)
	_check("%s: crystallizations preserved" % label,
		a.archetype.state.crystallized == b.archetype.state.crystallized)

	# Vitals and behaviour
	_check("%s: hp preserved" % label, is_equal_approx(a.stats.hp, b.stats.hp))
	_check("%s: age preserved" % label, is_equal_approx(a.stats.age_days, b.stats.age_days))
	_check("%s: needs preserved" % label,
		is_equal_approx(a.needs.hunger, b.needs.hunger)
		and is_equal_approx(a.needs.energy, b.needs.energy)
		and is_equal_approx(a.needs.mood, b.needs.mood))
	_check("%s: AI state preserved" % label, a.ai.state == b.ai.state)

	# The test that actually matters: does the reloaded creature *resolve* the
	# same? Data fidelity without expression fidelity is still a broken save.
	var pheno_a := a.stats.phenotype()
	var pheno_b := b.stats.phenotype()
	var pheno_match := pheno_a.size() == pheno_b.size()
	for key in pheno_a:
		if not pheno_b.has(key) or not is_equal_approx(float(pheno_a[key]), float(pheno_b[key])):
			pheno_match = false
			_lines.append("         trait %s: %.6f vs %.6f"
				% [key, pheno_a[key], pheno_b.get(key, NAN)])
	_check("%s: resolved phenotype numerically identical" % label, pheno_match)

	var derived_a := a.stats.derived()
	var derived_b := b.stats.derived()
	var derived_match := true
	for key in derived_a:
		if not is_equal_approx(float(derived_a[key]), float(derived_b.get(key, NAN))):
			derived_match = false
	_check("%s: derived stats identical" % label, derived_match)


# --- Harness ------------------------------------------------------------------

func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
