extends RefCounted
class_name DataModelSelfTest

## Proves the Phase 0 core data models survive a to_dict -> JSON -> from_dict
## round trip with full fidelity.
##
## This exists because "everything important must be serializable" is a project
## rule, and a rule with no test is a wish. It runs through real JSON (not just
## dictionary copying) because that is where fidelity actually gets lost:
## StringName collapses to String, ints widen to floats, typed arrays untype.
##
## Run from the bootstrap screen, or from a CI check. Returns a result dict:
##   { "passed": int, "failed": int, "lines": Array[String] }

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []


func run() -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()

	_test_genome()
	_test_epigenetics()
	_test_archetype_state()
	_test_identity()
	_test_lineage()
	_test_planet_seed()
	_test_planet_summary()

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Individual model tests ---------------------------------------------------

func _test_genome() -> void:
	var g := GenomeResource.new()
	g.species_id = &"aether_base"
	g.repro_role = AetherTypes.ReproRole.GAMETE_B
	g.generation = 7
	g.de_novo_loci = ["morph_size"]
	g.set_pair(&"morph_size", &"size_giant", &"size_small")
	g.set_pair(&"meta_diet", &"diet_carnivore", &"diet_carnivore")
	g.set_pair(&"comb_power", &"power_high", &"power_low")

	var before_checksum := g.checksum()
	var round_tripped: GenomeResource = GenomeResource.from_dict(_via_json(g.to_dict()))

	_check("genome: checksum preserved", round_tripped.checksum() == before_checksum)
	_check("genome: phase preserved (strand A)",
		round_tripped.pair_at(&"morph_size")[0] == "size_giant")
	_check("genome: phase preserved (strand B)",
		round_tripped.pair_at(&"morph_size")[1] == "size_small")
	_check("genome: homozygosity preserved", round_tripped.is_homozygous(&"meta_diet"))
	_check("genome: heterozygosity preserved", not round_tripped.is_homozygous(&"comb_power"))
	_check("genome: generation preserved", round_tripped.generation == 7)
	_check("genome: repro role preserved",
		round_tripped.repro_role == AetherTypes.ReproRole.GAMETE_B)
	_check("genome: de novo loci preserved", round_tripped.de_novo_loci == ["morph_size"])
	_check("genome: locus count preserved", round_tripped.locus_ids().size() == 3)

	# Phase is not cosmetic: a genome that silently swapped strands would still
	# pass a naive "same alleles" check, so assert the asymmetry explicitly.
	var swapped := g.clone()
	swapped.set_pair(&"morph_size", &"size_small", &"size_giant")
	_check("genome: strand swap changes checksum (phase is real)",
		swapped.checksum() != before_checksum)


func _test_epigenetics() -> void:
	var profile := EpigeneticProfileResource.new()

	var cold := EpigeneticMarkResource.new()
	cold.definition_id = &"epi_cold_hardening"
	cold.display_name = "Cold-Hardened"
	cold.target_trait = &"cold_tolerance"
	cold.effect = AetherTypes.EpiEffect.ADD
	cold.magnitude = 0.5
	cold.stability = 0.8
	cold.source = AetherTypes.EpiSource.ENVIRONMENT
	cold.tags = [&"cold", &"environmental"]

	profile.apply(cold, 0.2)
	# Repeated exposure must reinforce the same mark, not spawn duplicates.
	for i in 5:
		profile.apply(cold, 0.2)

	_check("epi: repeated exposure merges into one mark", profile.marks.size() == 1)
	var m: EpigeneticMarkResource = profile.marks[0]
	_check("epi: exposure count accumulates", m.exposure_count == 6)
	_check("epi: strength climbed but stayed bounded", m.strength > 0.2 and m.strength <= 1.0)
	_check("epi: heritability rose from repeated exposure", m.heritability_chance > 0.0)

	var trauma := EpigeneticMarkResource.new()
	trauma.definition_id = &"epi_maul_trauma"
	trauma.target_trait = &"aggression"
	trauma.effect = AetherTypes.EpiEffect.MULTIPLY
	trauma.magnitude = 0.3
	trauma.stability = 0.95
	trauma.source = AetherTypes.EpiSource.STRESS
	trauma.tags = [&"trauma"]
	profile.apply(trauma, 0.5, true)
	profile.apply(trauma, 0.5, true)
	_check("epi: force_distinct keeps separate episodes", profile.marks.size() == 3)

	var rt: EpigeneticProfileResource = EpigeneticProfileResource.from_dict(
		_via_json(profile.to_dict()))
	_check("epi: mark count survives round trip", rt.marks.size() == profile.marks.size())
	var rt_cold := rt.find_by_definition(&"epi_cold_hardening")
	_check("epi: mark found by definition after round trip", rt_cold != null)
	_check("epi: strength survives round trip",
		rt_cold != null and is_equal_approx(rt_cold.strength, m.strength))
	_check("epi: enum survives round trip",
		rt_cold != null and rt_cold.source == AetherTypes.EpiSource.ENVIRONMENT)
	_check("epi: tags survive round trip", rt_cold != null and rt_cold.has_tag(&"cold"))
	_check("epi: trait modifiers computed",
		is_equal_approx(rt.trait_modifiers(&"cold_tolerance")["add"],
			0.5 * rt_cold.strength))
	_check("epi: tag query works", rt.marks_with_tag(&"trauma").size() == 2)

	# Decay: a low-stability mark should fade; a high-stability one should not.
	var fragile := EpigeneticMarkResource.new()
	fragile.definition_id = &"epi_fragile"
	fragile.target_trait = &"x"
	fragile.stability = 0.0
	rt.apply(fragile, 0.05)
	rt.decay_all(10.0)
	_check("epi: unstable marks decay away", rt.find_by_definition(&"epi_fragile") == null)
	_check("epi: stable marks survive decay", rt.find_by_definition(&"epi_maul_trauma") != null)

	# Heritability: with chance forced to 1.0, every mark must cross.
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	for mark in rt.marks:
		mark.heritability_chance = 1.0
	var inherited := rt.heritable_subset(rng)
	_check("epi: heritable subset crosses at p=1", inherited.size() == rt.marks.size())
	_check("epi: inherited marks record their depth",
		not inherited.is_empty() and inherited[0].inherited_depth == 1)
	_check("epi: inherited marks arrive attenuated",
		not inherited.is_empty() and inherited[0].strength < rt.marks[0].strength)


func _test_archetype_state() -> void:
	var st := ArchetypeStateResource.new()
	st.set_progress(&"arch_guardian", 0.2)
	_check("archetype: low progress reads STIRRING",
		st.stage_of(&"arch_guardian") == AetherTypes.ArchetypeStage.STIRRING)
	var changed := st.set_progress(&"arch_guardian", 0.7)
	_check("archetype: stage change is reported", changed)
	_check("archetype: high progress reads EMERGENT",
		st.stage_of(&"arch_guardian") == AetherTypes.ArchetypeStage.EMERGENT)

	st.crystallize(&"arch_guardian", &"core", 4242, [&"ability_intercept"])
	_check("archetype: crystallized flag set", st.is_crystallized(&"arch_guardian"))
	_check("archetype: group occupancy recorded",
		st.crystallized_in_group(&"core") == "arch_guardian")
	_check("archetype: ability granted",
		st.granted_abilities.has("ability_intercept"))
	# Terminal stages must not be walked backwards by later progress updates.
	st.set_progress(&"arch_guardian", 0.1)
	_check("archetype: crystallization is terminal",
		st.stage_of(&"arch_guardian") == AetherTypes.ArchetypeStage.CRYSTALLIZED)

	var rt: ArchetypeStateResource = ArchetypeStateResource.from_dict(_via_json(st.to_dict()))
	_check("archetype: crystallization survives round trip",
		rt.is_crystallized(&"arch_guardian"))
	_check("archetype: crystallization tick survives",
		int(rt.crystallized_at["arch_guardian"]) == 4242)
	_check("archetype: abilities survive round trip",
		rt.granted_abilities.has("ability_intercept"))

	rt.shatter(&"arch_guardian", &"core", [&"ability_intercept"])
	_check("archetype: shatter clears the group",
		rt.crystallized_in_group(&"core") == "")
	_check("archetype: shatter revokes abilities",
		not rt.granted_abilities.has("ability_intercept"))
	_check("archetype: shatter is remembered forever",
		rt.shattered.has("arch_guardian"))


func _test_identity() -> void:
	var id := CreatureIdentityResource.new()
	id.uid = CreatureIdentityResource.make_uid(1000, 3)
	id.given_name = "Vess"
	id.lineage_id = &"lin_vess"
	id.birth_planet_name = "Kel-9"
	id.birth_tick = 1000
	id.generation = 4
	id.parent_uids = ["cr_000001f4_0001", "cr_000001f4_0002"]
	id.origin_kind = "born"
	id.appearance_seed = 0x7EEDBEEF12345671
	# Deliberate duplicate: epithets are appended by the story layer, which has
	# no memory of what it already granted.
	id.add_epithet("the Unbroken")
	id.add_epithet("the Unbroken")

	_check("identity: uid is deterministic",
		id.uid == CreatureIdentityResource.make_uid(1000, 3))
	_check("identity: epithets deduplicate", id.epithets.size() == 1)
	_check("identity: display name includes epithet",
		id.display_name() == "Vess the Unbroken")
	_check("identity: alive by default", id.is_alive())

	var rt: CreatureIdentityResource = CreatureIdentityResource.from_dict(_via_json(id.to_dict()))
	_check("identity: uid survives round trip", rt.uid == id.uid)
	_check("identity: parents survive round trip", rt.parent_uids.size() == 2)
	_check("identity: generation survives round trip", rt.generation == 4)
	_check("identity: birth planet survives round trip", rt.birth_planet_name == "Kel-9")
	_check("identity: 64-bit appearance seed survives round trip",
		rt.appearance_seed == id.appearance_seed)

	rt.death_tick = 9000
	rt.death_cause = "exposure"
	_check("identity: death is recorded", not rt.is_alive())


func _test_lineage() -> void:
	var rec := LineageRecordResource.new()
	rec.lineage_id = &"lin_vess"
	rec.display_name = "Line of Vess"
	rec.founder_uid = "cr_00000001_0000"

	for i in 5:
		rec.record_birth("cr_%08x_0000" % i, i)
	rec.record_death("cr_00000000_0000")

	_check("lineage: members tracked", rec.member_uids.size() == 5)
	_check("lineage: living tracked", rec.living_uids.size() == 4)
	_check("lineage: max generation tracked", rec.max_generation == 4)
	_check("lineage: birth/death totals", rec.total("births") == 5.0 and rec.total("deaths") == 1.0)
	_check("lineage: not extinct while members live", not rec.is_extinct())

	# Overflow the event cap and confirm the important ones survive compaction.
	rec.add_event(1, "pl_x", "u", "founding", "The line begins.", 1.0)
	for i in LineageRecordResource.MAX_NOTABLE_EVENTS + 50:
		rec.add_event(i + 2, "pl_x", "u", "chore", "Routine day %d." % i, 0.05)

	_check("lineage: event list is capped",
		rec.notable_events.size() == LineageRecordResource.MAX_NOTABLE_EVENTS)
	var kept_founding := false
	for e in rec.notable_events:
		if String(e["kind"]) == "founding":
			kept_founding = true
	_check("lineage: high-weight events survive compaction", kept_founding)
	_check("lineage: totals outlive pruned events",
		rec.total("events_recorded") == float(LineageRecordResource.MAX_NOTABLE_EVENTS + 51))

	rec.note_archetype("arch_guardian")
	rec.note_archetype("arch_guardian")
	rec.note_entrenched_mark("epi_cold_hardening", 3)
	rec.note_planet("pl_x")
	rec.note_planet("pl_x")

	var rt: LineageRecordResource = LineageRecordResource.from_dict(_via_json(rec.to_dict()))
	_check("lineage: members survive round trip", rt.member_uids.size() == 5)
	_check("lineage: archetype history survives",
		int(rt.archetype_history["arch_guardian"]) == 2)
	_check("lineage: entrenched marks survive",
		int(rt.entrenched_marks["epi_cold_hardening"]) == 3)
	_check("lineage: planets deduplicate", rt.planets_inhabited.size() == 1)

	for uid in rt.living_uids.duplicate():
		rt.record_death(uid)
	_check("lineage: extinction detected once all die", rt.is_extinct())


func _test_planet_seed() -> void:
	var p := PlanetSeedResource.make(0x0BADC0DE12345678)
	p.display_name = "Kel-9"
	p.mean_temperature_c = -31.5
	p.surface_gravity_g = 1.4
	p.epigenetic_pressures = {"epi_cold_hardening": 0.35}
	p.biome_weights = {"biome_ice_waste": 3.0, "biome_tundra": 1.0}
	p.galactic_position = Vector2(120.5, -44.25)
	p.derived = true

	_check("planet: id derives from seed",
		p.planet_id == PlanetSeedResource.id_from_seed(p.seed))

	# Determinism is the whole contract: the same stage stream must reproduce,
	# and different stages must not collide.
	var a := p.rng_for("climate")
	var b := p.rng_for("climate")
	var c := p.rng_for("biomes")
	_check("planet: named RNG stream is reproducible", a.randf() == b.randf())
	_check("planet: different stages use different streams",
		p.rng_for("climate").randf() != c.randf())

	var rt: PlanetSeedResource = PlanetSeedResource.from_dict(_via_json(p.to_dict()))
	_check("planet: seed survives round trip", rt.seed == p.seed)
	_check("planet: id survives round trip", rt.planet_id == p.planet_id)
	_check("planet: climate survives round trip",
		is_equal_approx(rt.mean_temperature_c, -31.5))
	_check("planet: pressures survive round trip",
		is_equal_approx(float(rt.epigenetic_pressures["epi_cold_hardening"]), 0.35))
	_check("planet: vector survives round trip",
		rt.galactic_position.is_equal_approx(Vector2(120.5, -44.25)))
	_check("planet: RNG streams reproduce after round trip",
		rt.rng_for("climate").randf() == p.rng_for("climate").randf())


func _test_planet_summary() -> void:
	var s := PlanetSummaryResource.new()
	s.planet_id = "pl_0badc0de12345678"
	s.seed = 0x0BADC0DE12345678
	s.visited = true
	s.last_departure_tick = 1000
	s.mark_discovered("biome_ice_waste")
	s.mark_discovered("biome_ice_waste")
	s.resource_depletion = {"ore_ferrite": 0.42}
	s.add_resident({"identity": {"uid": "cr_1", "given_name": "Vess"}})
	s.add_resident({"identity": {"uid": "cr_2", "given_name": "Torr"}})

	_check("summary: discovered biomes deduplicate", s.discovered_biomes.size() == 1)
	_check("summary: residents counted", s.resident_count() == 2)
	_check("summary: elapsed days computed",
		is_equal_approx(s.days_since_departure(1000 + 2400, 1200.0), 2.0))
	_check("summary: elapsed days never negative",
		s.days_since_departure(0, 1200.0) == 0.0)

	for i in 100:
		s.note_event(i, "Day %d." % i)
	_check("summary: event log is capped", s.notable_events.size() == 60)

	var rt: PlanetSummaryResource = PlanetSummaryResource.from_dict(_via_json(s.to_dict()))
	_check("summary: residents survive round trip", rt.resident_count() == 2)
	_check("summary: nested resident data survives",
		String(rt.resident_creatures[0]["identity"]["given_name"]) == "Vess")
	_check("summary: depletion survives round trip",
		is_equal_approx(float(rt.resource_depletion["ore_ferrite"]), 0.42))
	_check("summary: 64-bit seed survives round trip", rt.seed == s.seed)

	# take_residents is a move, not a copy — landing must not leave ghosts
	# behind in cold storage.
	var taken := rt.take_residents()
	_check("summary: take_residents moves rather than copies",
		taken.size() == 2 and rt.resident_count() == 0)


# --- Harness ------------------------------------------------------------------

## Round-trips a dictionary through actual JSON text. Using JSON here rather
## than duplicate(true) is the point: it is the serializer that will really run,
## and it is where type fidelity is genuinely at risk.
func _via_json(d: Dictionary) -> Dictionary:
	var parsed: Variant = JSON.parse_string(JSON.stringify(d))
	if typeof(parsed) != TYPE_DICTIONARY:
		_check("JSON round trip produced a dictionary", false)
		return {}
	return parsed


func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
