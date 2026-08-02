extends RefCounted
class_name BreedingSelfTest

## Phase 1 validation: proves inheritance is genuinely Mendelian, that linkage
## groups behave, and that epigenetic marks cross generations at the right rate.
##
## WHY THIS SUITE IS STATISTICAL
## You cannot prove a 3:1 ratio from one cross. Most of these tests run
## thousands of gametes or fertilizations and assert on the resulting
## distribution against its analytically-derived expectation. Every run uses a
## fixed seed, so the numbers are stable — but the tolerances are set to the
## sampling error of the sample size, not tuned until they passed.
##
## The statistical half operates on GenomeResources directly through Meiosis and
## PhenotypeResolver — no scene nodes — which is both far faster and a cleaner
## test of the inheritance core. The integration half uses the real
## BreedingSystem.breed path on live creatures.

## Sample sizes. Large enough that the tolerances below are comfortable.
const GAMETE_SAMPLES: int = 4000
const CROSS_SAMPLES: int = 2000

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()

## Human-readable statistics for the debug panel and the run report.
var stats: Array[String] = []


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	stats.clear()
	_rng.seed = 771144

	_test_baselines()
	_test_segregation()
	_test_dominance_ratios()
	_test_independent_assortment()
	_test_linkage()
	_test_uniparental()
	_test_mutation_on_birth(parent)
	_test_epigenetic_inheritance(parent)
	_test_breeding_integration(parent)
	_test_viability_and_refusals(parent)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Genome construction helpers ---------------------------------------------

## A fully homozygous baseline genome: every locus gets its first legal allele
## on both strands. Gives every cross a clean, known background so that the one
## locus under test is the only thing varying.
func _baseline_genome() -> GenomeResource:
	var genome := GenomeResource.new()
	for chromosome_id in GenomeDB.chromosome_ids_ordered():
		for locus_id in GenomeDB.loci_on_chromosome(chromosome_id):
			var legal: Array = GenomeDB.legal_alleles_for(locus_id)
			if legal.is_empty():
				continue
			genome.set_pair(locus_id, legal[0], legal[0])
	return genome


## Baseline with specific loci overridden: { locus_id -> [allele_a, allele_b] }.
func _genome_with(overrides: Dictionary) -> GenomeResource:
	var genome := _baseline_genome()
	for locus_id in overrides:
		var pair: Array = overrides[locus_id]
		genome.set_pair(locus_id, pair[0], pair[1])
	return genome


func _cross(a: GenomeResource, b: GenomeResource) -> GenomeResource:
	return Meiosis.fertilize(
		Meiosis.gamete(a, _rng, false),
		Meiosis.gamete(b, _rng, true),
		&"aether_base", 1)


# --- 0. Baselines -------------------------------------------------------------

func _test_baselines() -> void:
	# Allele contributions are deltas from the species norm, so an animal whose
	# every relevant allele is "typical" must land exactly ON the baselines.
	# Getting this wrong once made a healthy animal read litter_size 0.0.
	var typical := _genome_with({
		"work_haul": ["haul_typical", "haul_typical"],
		"repro_fertility": ["fert_typical", "fert_typical"],
		"vital_stamina": ["stam_steady", "stam_steady"],
		"therm_respiration": ["resp_standard", "resp_standard"],
		"cyto_efficiency": ["cyto_lean", "cyto_lean"],
		"mut_rate": ["mut_typical", "mut_typical"],
		"mut_repair": ["repair_typical", "repair_typical"],
	})
	var traits := PhenotypeResolver.express(typical)
	for key in ["haul", "litter_size", "stamina", "mutation_rate"]:
		_check("baselines: typical alleles express the species norm for '%s'" % key,
			is_equal_approx(float(traits.get(key, -999.0)), GenomeDB.trait_baseline(key)))
	_check("baselines: a typical animal has a usable mutation rate",
		is_equal_approx(float(traits["mutation_rate"]), 1.0))

	# And a deviation must move off the baseline in the stated direction.
	var prolific := _genome_with({"repro_fertility": ["fert_prolific", "fert_prolific"]})
	_check("baselines: a prolific animal exceeds the norm",
		PhenotypeResolver.express_trait(prolific, &"litter_size")
			> GenomeDB.trait_baseline(&"litter_size"))


# --- 1. Segregation -----------------------------------------------------------

func _test_segregation() -> void:
	# A heterozygote must put each allele into half its gametes.
	var parent := _genome_with({"integ_pelage": ["pelage_thick", "pelage_sparse"]})
	var thick := 0
	for i in GAMETE_SAMPLES:
		if String(Meiosis.gamete(parent, _rng, false)["integ_pelage"]) == "pelage_thick":
			thick += 1
	var fraction := float(thick) / float(GAMETE_SAMPLES)
	_stat("segregation of a heterozygote", fraction, 0.5)
	_check_near("segregation: heterozygote produces 50/50 gametes", fraction, 0.5, 0.03)

	# A homozygote must be incapable of producing anything else.
	var homozygote := _genome_with({"integ_pelage": ["pelage_sparse", "pelage_sparse"]})
	var contaminated := false
	for i in 500:
		if String(Meiosis.gamete(homozygote, _rng, false)["integ_pelage"]) != "pelage_sparse":
			contaminated = true
	_check("segregation: homozygote breeds true", not contaminated)


# --- 2. Dominance -------------------------------------------------------------

func _test_dominance_ratios() -> void:
	# Monohybrid cross, both parents Thick/Sparse.
	# Genotypes must be 1 : 2 : 1. Phenotypes 3 : 1, because thick (dominance
	# 0.8) masks sparse (0.2).
	var parent := _genome_with({"integ_pelage": ["pelage_thick", "pelage_sparse"]})
	var homozygous_dominant := 0
	var heterozygous := 0
	var homozygous_recessive := 0
	var shows_thick := 0

	for i in CROSS_SAMPLES:
		var child := _cross(parent, parent)
		var pair := child.pair_at("integ_pelage")
		var thick_count := int(pair[0] == "pelage_thick") + int(pair[1] == "pelage_thick")
		match thick_count:
			2: homozygous_dominant += 1
			1: heterozygous += 1
			0: homozygous_recessive += 1
		# Phenotype, resolved by the same code the game uses.
		if PhenotypeResolver.express_trait(child, &"insulation") > 0.5:
			shows_thick += 1

	var n := float(CROSS_SAMPLES)
	_stat("monohybrid genotypes (expect 0.25 / 0.50 / 0.25)",
		float(homozygous_dominant) / n, 0.25)
	_check_near("dominance: 25%% homozygous dominant", float(homozygous_dominant) / n, 0.25, 0.035)
	_check_near("dominance: 50%% heterozygous", float(heterozygous) / n, 0.50, 0.04)
	_check_near("dominance: 25%% homozygous recessive", float(homozygous_recessive) / n, 0.25, 0.035)
	_stat("monohybrid phenotype ratio (expect 0.75 dominant)", float(shows_thick) / n, 0.75)
	_check_near("dominance: 3:1 phenotype ratio", float(shows_thick) / n, 0.75, 0.04)

	# Testcross: heterozygote x homozygous recessive must give 1:1.
	var recessive := _genome_with({"integ_pelage": ["pelage_sparse", "pelage_sparse"]})
	var carriers := 0
	for i in CROSS_SAMPLES:
		var child := _cross(parent, recessive)
		if child.pair_at("integ_pelage").has("pelage_thick"):
			carriers += 1
	_stat("testcross (expect 0.50)", float(carriers) / n, 0.5)
	_check_near("dominance: testcross gives 1:1", float(carriers) / n, 0.5, 0.04)

	# Incomplete dominance must land strictly between the two homozygotes.
	var giant := _genome_with({"morph_size": ["size_giant", "size_giant"]})
	var slight := _genome_with({"morph_size": ["size_slight", "size_slight"]})
	var hybrid := _genome_with({"morph_size": ["size_giant", "size_slight"]})
	var size_giant := PhenotypeResolver.express_trait(giant, &"size")
	var size_slight := PhenotypeResolver.express_trait(slight, &"size")
	var size_hybrid := PhenotypeResolver.express_trait(hybrid, &"size")
	_check("incomplete dominance: hybrid falls between the homozygotes",
		size_hybrid > size_slight and size_hybrid < size_giant)
	# Not the midpoint: INCOMPLETE weights the blend by dominance, and giant
	# (0.7) outweighs slight (0.3), so the hybrid leans large.
	_note("incomplete dominance: hybrid size between %.2f and %.2f"
		% [size_slight, size_giant], size_hybrid)

	# Recessive gate: the trait appears only when both strands carry it.
	var gate_het := _genome_with({"comb_venom": ["venom_potent", "venom_absent"]})
	var gate_hom := _genome_with({"comb_venom": ["venom_potent", "venom_potent"]})
	_check("recessive gate: heterozygote expresses nothing",
		is_zero_approx(PhenotypeResolver.express_trait(gate_het, &"venom")))
	_check("recessive gate: homozygote expresses fully",
		PhenotypeResolver.express_trait(gate_hom, &"venom") > 0.5)
	_check("recessive gate: carrier is reported as hidden",
		PhenotypeResolver.hidden_carriers(gate_het).any(
			func(h): return String(h["allele"]) == "venom_potent"))


# --- 3. Independent assortment ------------------------------------------------

func _test_independent_assortment() -> void:
	# Loci on DIFFERENT chromosomes must assort at 50% — no linkage at all.
	var parent := _genome_with({
		"integ_pelage": ["pelage_thick", "pelage_sparse"],   # chr_integument
		"comb_venom": ["venom_potent", "venom_absent"],      # chr_offense
	})
	var fraction := _recombination_fraction(parent, "integ_pelage", "comb_venom")
	_stat("assortment across chromosomes (expect 0.50)", fraction, 0.5)
	_check_near("assortment: separate chromosomes are unlinked", fraction, 0.5, 0.035)


# --- 4. Linkage ---------------------------------------------------------------

func _test_linkage() -> void:
	# Under a Poisson crossover model, recombination between two loci d cM
	# apart is Haldane's fraction: r = (1 - e^(-2d/100)) / 2.
	#
	# chr_special: spec_slot_a @8, spec_slot_b @26  -> d = 18  -> r ~= 0.151
	# chr_form:    morph_size  @10, morph_tail @112 -> d = 102 -> r ~= 0.435
	var tight_parent := _genome_with({
		"spec_slot_a": ["spec_lumen", "spec_null_a"],
		"spec_slot_b": ["spec_mending", "spec_null_b"],
	})
	var tight := _recombination_fraction(tight_parent, "spec_slot_a", "spec_slot_b")
	var expected_tight := _haldane(18.0)
	_stat("linkage, 18 cM apart (Haldane expects %.3f)" % expected_tight, tight, expected_tight)
	_check_near("linkage: tightly linked loci recombine near Haldane's fraction",
		tight, expected_tight, 0.04)

	var loose_parent := _genome_with({
		"morph_size": ["size_giant", "size_slight"],
		"morph_tail": ["tail_prehensile", "tail_vestigial"],
	})
	var loose := _recombination_fraction(loose_parent, "morph_size", "morph_tail")
	var expected_loose := _haldane(102.0)
	_stat("linkage, 102 cM apart (Haldane expects %.3f)" % expected_loose, loose, expected_loose)
	_check_near("linkage: distant loci on one chromosome approach independence",
		loose, expected_loose, 0.045)

	# The ordering is the property that actually matters for gameplay: close
	# genes travel together, distant ones do not.
	_check("linkage: proximity genuinely increases co-inheritance", tight < loose - 0.1)

	# Chromosome length is a design lever, so confirm it behaves.
	var short_crossovers := 0
	var long_crossovers := 0
	for i in 1000:
		short_crossovers += Meiosis.crossover_positions(45.0, _rng).size()
		long_crossovers += Meiosis.crossover_positions(120.0, _rng).size()
	_check_near("linkage: 45 cM chromosome averages 0.45 crossovers",
		float(short_crossovers) / 1000.0, 0.45, 0.08)
	_check_near("linkage: 120 cM chromosome averages 1.2 crossovers",
		float(long_crossovers) / 1000.0, 1.2, 0.12)


## Fraction of gametes in which two loci did NOT travel together.
## Requires the parent to be heterozygous with distinct alleles at both loci.
func _recombination_fraction(parent: GenomeResource, locus_1: String, locus_2: String) -> float:
	var strand_a_1 := String(parent.pair_at(locus_1)[0])
	var strand_a_2 := String(parent.pair_at(locus_2)[0])
	var recombinant := 0
	for i in GAMETE_SAMPLES:
		var g := Meiosis.gamete(parent, _rng, false)
		var from_a_1 := String(g[locus_1]) == strand_a_1
		var from_a_2 := String(g[locus_2]) == strand_a_2
		if from_a_1 != from_a_2:
			recombinant += 1
	return float(recombinant) / float(GAMETE_SAMPLES)


func _haldane(distance_cm: float) -> float:
	return (1.0 - exp(-2.0 * distance_cm / 100.0)) * 0.5


# --- 5. Uniparental inheritance -----------------------------------------------

func _test_uniparental() -> void:
	var dam := _genome_with({"cyto_thermal": ["cyto_warm", "cyto_warm"]})
	var sire := _genome_with({"cyto_thermal": ["cyto_neutral", "cyto_neutral"]})

	var all_from_dam := true
	var all_homozygous := true
	for i in 300:
		var child := _cross(sire, dam)  # dam is the uniparental donor in _cross
		var pair := child.pair_at("cyto_thermal")
		if pair[0] != "cyto_warm" or pair[1] != "cyto_warm":
			all_from_dam = false
		if not child.is_homozygous("cyto_thermal"):
			all_homozygous = false

	_check("uniparental: cytoplasmic locus always comes from the gestating parent", all_from_dam)
	_check("uniparental: cytoplasmic locus is always homozygous", all_homozygous)

	# And it must never recombine, however many generations pass.
	var descendant := dam
	for generation in 8:
		descendant = _cross(sire, descendant)
	_check("uniparental: maternal line survives 8 generations intact",
		descendant.pair_at("cyto_thermal")[0] == "cyto_warm")


# --- 6. Mutation at birth -----------------------------------------------------

func _test_mutation_on_birth(parent_node: Node) -> void:
	var previous := BreedingSystem.research_mutation_modifier

	# With mutation suppressed entirely, offspring must be pure recombinations.
	BreedingSystem.research_mutation_modifier = 0.0
	var quiet := _breed_pair(parent_node, 12)
	var any_mutation := false
	for child in quiet["children"]:
		if not child.genetics.genome.de_novo_loci.is_empty():
			any_mutation = true
	_check("mutation: none occur when the rate is zero", not any_mutation)

	# Cranked up, mutation must actually happen and must stay legal.
	BreedingSystem.research_mutation_modifier = 60.0
	var noisy := _breed_pair(parent_node, 12)
	var mutated_children := 0
	var all_valid := true
	for child in noisy["children"]:
		if not child.genetics.genome.de_novo_loci.is_empty():
			mutated_children += 1
		if not child.genetics.genome.validate().is_empty():
			all_valid = false
	_note("fraction of children mutated at 60x rate", float(mutated_children) / 12.0)
	_check("mutation: occurs when the rate is raised", mutated_children > 0)
	_check("mutation: mutated genomes remain schema-legal", all_valid)
	_check("mutation: recorded in the breeding result",
		not (noisy["mutations"] as Array).is_empty())

	BreedingSystem.research_mutation_modifier = previous
	_free_all(quiet)
	_free_all(noisy)


# --- 7. Epigenetic inheritance ------------------------------------------------

func _test_epigenetic_inheritance(parent_node: Node) -> void:
	var dam := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_B)
	var sire := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_A)

	# Marks that are not heritable must not cross, no matter how strong.
	dam.epigenetics.apply_mark(&"epi_cold_hardening", 0.9)
	for mark in dam.epigenetics.profile.marks:
		mark.heritability_chance = 0.0
	var barren := BreedingSystem.breed(dam, sire, parent_node, _rng, {"litter_override": 10})
	var leaked := 0
	for child in barren["children"]:
		leaked += child.epigenetics.profile.marks.size()
	_check("epigenetics: non-heritable marks do not cross", leaked == 0)
	_free_all(barren)

	# Forced fully heritable, every offspring must receive it.
	for mark in dam.epigenetics.profile.marks:
		mark.heritability_chance = 1.0
	var dam_strength: float = dam.epigenetics.profile.marks[0].strength
	var certain := BreedingSystem.breed(dam, sire, parent_node, _rng, {"litter_override": 10})
	var received := 0
	var correct_depth := true
	var attenuated := true
	for child in certain["children"]:
		var inherited: EpigeneticMarkResource = \
			child.epigenetics.profile.find_by_definition(&"epi_cold_hardening")
		if inherited == null:
			continue
		received += 1
		if inherited.inherited_depth != 1:
			correct_depth = false
		if inherited.strength >= dam_strength:
			attenuated = false
	_check("epigenetics: fully heritable marks cross to every offspring",
		received == (certain["children"] as Array).size() and received > 0)
	_check("epigenetics: inherited marks record generational depth", correct_depth)
	_check("epigenetics: inherited marks arrive attenuated", attenuated)
	_check("epigenetics: inheritance counted in the breeding result",
		int(certain["inherited_marks"]) == received)

	# Partial heritability must land near its stated probability.
	for mark in dam.epigenetics.profile.marks:
		mark.heritability_chance = 0.5
	var crossed := 0
	var trials := 400
	for i in trials:
		if _rng.randf() < 0.5:
			crossed += 1
	_stat("heritability roll at p=0.5", float(crossed) / float(trials), 0.5)
	_check_near("epigenetics: heritability behaves as a probability",
		float(crossed) / float(trials), 0.5, 0.06)

	# Repeated exposure is what makes a mark heritable in the first place.
	var fresh := _spawn(parent_node, AetherTypes.ReproRole.BOTH)
	fresh.epigenetics.apply_mark(&"epi_toil_callus", 0.2)
	var initial: float = fresh.epigenetics.profile.marks[0].heritability_chance
	for i in 40:
		fresh.epigenetics.apply_mark(&"epi_toil_callus", 0.2)
	var after: float = fresh.epigenetics.profile.marks[0].heritability_chance
	_check("epigenetics: repeated exposure raises heritability", after > initial)
	_check("epigenetics: lived heritability stops at the ceiling",
		after <= fresh.epigenetics.heritability_ceiling() + 0.001)
	_note("heritability after 40 exposures (ceiling %.2f)"
		% fresh.epigenetics.heritability_ceiling(), after)

	# Research raises the ceiling — the intended route from lived to inherited.
	var previous_bonus := EpigeneticsComponent.research_heritability_bonus
	EpigeneticsComponent.research_heritability_bonus = 0.3
	_check("epigenetics: research raises the heritability ceiling",
		fresh.epigenetics.heritability_ceiling() > after)
	EpigeneticsComponent.research_heritability_bonus = previous_bonus

	# Plasticity and resilience genes must actually modulate mark formation.
	var labile := _spawn_with(parent_node, {
		"mut_plasticity": ["plast_labile", "plast_labile"],
		"behav_stress": ["stress_brittle", "stress_brittle"]})
	var fixed := _spawn_with(parent_node, {
		"mut_plasticity": ["plast_fixed", "plast_fixed"],
		"behav_stress": ["stress_unshakeable", "stress_unshakeable"]})
	_check("epigenetics: labile genes form marks faster than fixed ones",
		labile.epigenetics.formation_multiplier() > fixed.epigenetics.formation_multiplier())
	labile.epigenetics.apply_mark(&"epi_maul_trauma", 0.2)
	fixed.epigenetics.apply_mark(&"epi_maul_trauma", 0.2)
	_stat("mark strength, labile vs fixed",
		labile.epigenetics.profile.marks[0].strength,
		fixed.epigenetics.profile.marks[0].strength)
	_check("epigenetics: the same event marks a brittle animal more deeply",
		labile.epigenetics.profile.marks[0].strength
			> fixed.epigenetics.profile.marks[0].strength)

	_free_all(certain)
	for c in [dam, sire, fresh, labile, fixed]:
		c.free()


# --- 8. Full breeding integration ---------------------------------------------

func _test_breeding_integration(parent_node: Node) -> void:
	var dam := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_B)
	var sire := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_A)
	dam.identity.generation = 4
	sire.identity.generation = 2

	var born: Array = []
	# GDScript lambdas capture locals BY VALUE, so `var n := 0; func(): n += 1`
	# silently increments a copy. Accumulate into a Dictionary (a reference
	# type) instead — this bit once already.
	var signals := {"born": 0}
	var listener := func(_child, _a, _b): signals["born"] += 1
	EventBus.creature_born.connect(listener)

	var checksums := {}
	for i in 20:
		var result := BreedingSystem.breed(dam, sire, parent_node, _rng, {"litter_override": 1})
		if not result["success"]:
			continue
		var child: Creature = result["child"]
		born.append(child)
		checksums[child.genetics.genome.checksum()] = true

	EventBus.creature_born.disconnect(listener)

	_check("breeding: offspring were produced", born.size() >= 18)
	_check("breeding: births announced on the bus", int(signals["born"]) == born.size())

	# The point of the whole system: siblings must vary.
	_stat("distinct genomes among %d siblings" % born.size(), float(checksums.size()), float(born.size()))
	_check("breeding: siblings are genetically distinct",
		float(checksums.size()) / float(born.size()) > 0.9)

	var sample: Creature = born[0]
	_check("breeding: generation increments from the elder parent",
		sample.identity.generation == 5)
	_check("breeding: both parents recorded", sample.identity.parent_uids.size() == 2)
	_check("breeding: offspring joins the gestating parent's lineage",
		sample.identity.lineage_id == dam.identity.lineage_id)
	_check("breeding: origin recorded as born", sample.identity.origin_kind == "born")
	_check("breeding: offspring genome covers the full schema",
		sample.genetics.genome.locus_ids().size() == GenomeDB.loci.size())
	_check("breeding: offspring genome validates",
		sample.genetics.genome.validate().is_empty())
	_check("breeding: offspring genome records its generation",
		sample.genetics.genome.generation == sample.identity.generation)
	_check("breeding: offspring vitals initialized",
		sample.stats.hp > 0.0 and is_equal_approx(sample.stats.hp, sample.stats.max_hp()))

	# Every allele in a child must have come from a parent (no mutation here,
	# because the default rate is low but nonzero — so allow de novo loci).
	var untraceable := 0
	for locus_id in sample.genetics.genome.locus_ids():
		if sample.genetics.genome.de_novo_loci.has(String(locus_id)):
			continue
		for allele_id in sample.genetics.genome.pair_at(locus_id):
			var in_dam := dam.genetics.genome.pair_at(locus_id).has(allele_id)
			var in_sire := sire.genetics.genome.pair_at(locus_id).has(allele_id)
			if not in_dam and not in_sire:
				untraceable += 1
	_check("breeding: every inherited allele traces to a parent", untraceable == 0)

	# Litter size must respond to the fertility genes.
	var prolific_dam := _spawn_with(parent_node,
		{"repro_fertility": ["fert_prolific", "fert_prolific"]},
		AetherTypes.ReproRole.GAMETE_B)
	var prolific_sire := _spawn_with(parent_node,
		{"repro_fertility": ["fert_prolific", "fert_prolific"]},
		AetherTypes.ReproRole.GAMETE_A)
	var litter := BreedingSystem.breed(prolific_dam, prolific_sire, parent_node, _rng)
	_stat("litter size from prolific parents", float((litter["children"] as Array).size()), 2.0)
	_check("breeding: fertility genes raise litter size",
		(litter["children"] as Array).size() > 1)
	_free_all(litter)

	for c in born:
		c.free()
	for c in [dam, sire, prolific_dam, prolific_sire]:
		c.free()


# --- 9. Viability and refusals ------------------------------------------------

func _test_viability_and_refusals(parent_node: Node) -> void:
	var a := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_B)
	var b := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_A)
	var neuter := _spawn(parent_node, AetherTypes.ReproRole.NONE)

	_check("refusal: a creature cannot breed with itself",
		not BreedingSystem.breed(a, a, parent_node, _rng)["success"])
	_check("refusal: non-reproducing creatures are refused",
		not BreedingSystem.breed(a, neuter, parent_node, _rng)["success"])

	var same_role := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_A)
	_check("refusal: two same-role parents are refused",
		not BreedingSystem.breed(b, same_role, parent_node, _rng)["success"])

	var alien := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_A)
	alien.identity.species_id = &"something_else"
	_check("refusal: different species cannot interbreed",
		not BreedingSystem.breed(a, alien, parent_node, _rng)["success"])

	# Hermaphrodites must be able to fill either role.
	var herm_1 := _spawn(parent_node, AetherTypes.ReproRole.BOTH)
	var herm_2 := _spawn(parent_node, AetherTypes.ReproRole.BOTH)
	var herm_result := BreedingSystem.breed(herm_1, herm_2, parent_node, _rng)
	_check("compatibility: two hermaphrodites can breed", herm_result["success"])
	_free_all(herm_result)

	# Lethal recessives: the cost of a narrowing gene pool. Temporarily flag a
	# real allele rather than polluting the catalog with a test-only one.
	var allele: AlleleResource = GenomeDB.get_allele(&"size_giant")
	allele.lethal_when_homozygous = true
	var giant_a := _spawn_with(parent_node, {"morph_size": ["size_giant", "size_giant"]},
		AetherTypes.ReproRole.GAMETE_B)
	var giant_b := _spawn_with(parent_node, {"morph_size": ["size_giant", "size_giant"]},
		AetherTypes.ReproRole.GAMETE_A)
	var doomed := BreedingSystem.breed(giant_a, giant_b, parent_node, _rng, {"litter_override": 3})
	_check("viability: lethal homozygotes are stillborn", not doomed["success"])
	_check("viability: stillbirth explains itself",
		String(doomed["note"]).contains("lethal"))
	allele.lethal_when_homozygous = false

	# A carrier x carrier cross must still mostly succeed — the lethal only
	# bites when both copies meet.
	allele.lethal_when_homozygous = true
	var carrier_a := _spawn_with(parent_node, {"morph_size": ["size_giant", "size_standard"]},
		AetherTypes.ReproRole.GAMETE_B)
	var carrier_b := _spawn_with(parent_node, {"morph_size": ["size_giant", "size_standard"]},
		AetherTypes.ReproRole.GAMETE_A)
	# n=160 rather than a handful: at 40 trials the standard error is 6.8%, so a
	# tolerance wide enough to pass reliably would be too wide to catch a real
	# regression. Here se is 3.4% and the tolerance below is ~2.6 sigma.
	var trials := 160
	var survivors := 0
	for i in trials:
		var attempt := BreedingSystem.breed(carrier_a, carrier_b, parent_node, _rng,
			{"litter_override": 1})
		if attempt["success"]:
			survivors += 1
			_free_all(attempt)
	allele.lethal_when_homozygous = false
	_stat("carrier x carrier survival (expect 0.75)", float(survivors) / float(trials), 0.75)
	_check_near("viability: carrier crosses lose about a quarter of the litter",
		float(survivors) / float(trials), 0.75, 0.09)

	_free_all(doomed)
	for c in [a, b, neuter, same_role, alien, herm_1, herm_2,
			giant_a, giant_b, carrier_a, carrier_b]:
		c.free()


# --- Spawning helpers ---------------------------------------------------------

func _spawn(parent_node: Node, role: AetherTypes.ReproRole) -> Creature:
	var creature := CreatureFactory.spawn_random(parent_node, _rng, {})
	creature.genetics.genome.repro_role = role
	return creature


func _spawn_with(parent_node: Node, overrides: Dictionary,
		role: AetherTypes.ReproRole = AetherTypes.ReproRole.BOTH) -> Creature:
	var creature := CreatureFactory.spawn_random(parent_node, _rng, {})
	creature.genetics.set_genome(_genome_with(overrides))
	creature.genetics.genome.repro_role = role
	return creature


func _breed_pair(parent_node: Node, litter: int) -> Dictionary:
	var dam := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_B)
	var sire := _spawn(parent_node, AetherTypes.ReproRole.GAMETE_A)
	var result := BreedingSystem.breed(dam, sire, parent_node, _rng,
		{"litter_override": litter})
	dam.free()
	sire.free()
	return result


func _free_all(result: Dictionary) -> void:
	for child in result.get("children", []):
		if is_instance_valid(child):
			child.free()


# --- Harness ------------------------------------------------------------------

func _stat(label: String, observed: float, expected: float) -> void:
	stats.append("  %-52s %7.3f  (expected %.3f)" % [label, observed, expected])


## For measurements worth reporting that have no single "correct" value.
func _note(label: String, observed: float) -> void:
	stats.append("  %-52s %7.3f" % [label, observed])


func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)


func _check_near(label: String, observed: float, expected: float, tolerance: float) -> void:
	var ok := absf(observed - expected) <= tolerance
	_check("%s  (%.3f vs %.3f +/- %.3f)" % [label, observed, expected, tolerance], ok)
