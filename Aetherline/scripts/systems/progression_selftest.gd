extends RefCounted
class_name ProgressionSelfTest

## Phase 6 validation: an economy that scales across worlds, a legacy score
## that measures history rather than power, a save that has an asymptote
## instead of growing forever, and LOD that actually protects the frame budget.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	_rng.seed = 616161

	_test_stockpile()
	_test_crafting(parent)
	_test_legacy_score()
	_test_save_robustness()
	_test_lod(parent)
	_test_av_hooks(parent)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Stockpile / carry economy ------------------------------------------------

func _test_stockpile() -> void:
	var stock := Stockpile.new()
	stock.carry_capacity = 50.0
	stock.add_local("timber", 100.0)

	_check("stock: local goods counted", stock.amount("timber") == 100.0)
	_check("stock: spending succeeds when affordable", stock.spend({"timber": 30.0}))
	_check("stock: spending deducted", stock.amount("timber") == 70.0)

	# Atomicity: a multi-input spend must not partially consume.
	var before := stock.amount("timber")
	_check("stock: unaffordable spend is refused",
		not stock.spend({"timber": 10.0, "ore_ferrite": 999.0}))
	_check("stock: refused spend changed nothing", stock.amount("timber") == before)

	# The carry limit is the scarcity mechanism — it must bind.
	var moved := stock.load_for_travel("timber", 70.0)
	_check("stock: carry capacity caps what travels", moved <= 50.0)
	_check("stock: hold mass respects capacity", stock.carried_mass() <= stock.carry_capacity)
	_check("stock: what didn't fit stayed local", stock.local["timber"] > 0.0)

	var abandoned := stock.abandon_local()
	_check("stock: abandoned goods are reported", float(abandoned.get("timber", 0.0)) > 0.0)
	_check("stock: abandoning clears the local pile", stock.amount("timber", false) == 0.0)
	_check("stock: the hold survives abandonment", stock.carried_mass() > 0.0)

	stock.unload_on_arrival()
	_check("stock: hold spills onto the new world", stock.amount("timber", false) > 0.0)
	_check("stock: hold is empty after unloading", stock.carried_mass() == 0.0)

	var reloaded := Stockpile.new()
	reloaded.from_dict(JSON.parse_string(JSON.stringify(stock.to_dict())))
	_check("stock: survives serialization",
		is_equal_approx(reloaded.amount("timber"), stock.amount("timber")))


# --- Crafting ------------------------------------------------------------------

func _test_crafting(parent: Node) -> void:
	var summary := PlanetSummaryResource.new()
	summary.planet_id = "pl_craft"
	var research := ResearchSystem.new()
	var stock := Stockpile.new()
	stock.add_local("timber", 200.0)
	stock.add_local("ore_ferrite", 100.0)

	var crafter := CreatureFactory.spawn_random(parent, _rng, {})

	_check("craft: recipe blocked without its station",
		not CraftingSystem.can_craft("craft_planks", summary, research).is_empty())

	var build_resources := {"timber": 100.0, "ore_ferrite": 50.0}
	BaseBuilder.place(summary, "struct_workbench", Vector2i(0, 0), build_resources)
	_check("craft: recipe unblocked once the station exists",
		CraftingSystem.can_craft("craft_planks", summary, research).is_empty())

	_check("craft: recipe still gated by research",
		not CraftingSystem.can_craft("craft_ingot", summary, research).is_empty())

	var result := CraftingSystem.craft("craft_planks", crafter, stock, summary, research)
	_check("craft: crafting succeeds", bool(result["ok"]))
	_check("craft: inputs consumed", stock.amount("timber") < 200.0)
	_check("craft: outputs produced", stock.amount("planks") > 0.0)
	_check("craft: work logged as experience", crafter.experience.count("work_completed_craft") > 0.0)

	# Aptitude must matter economically, not cosmetically.
	var deft := CreatureFactory.spawn_random(parent, _rng, {})
	deft.genetics.genome.set_pair(&"work_craft", "craft_deft", "craft_deft")
	deft.genetics.mark_dirty()
	var clumsy := CreatureFactory.spawn_random(parent, _rng, {})
	clumsy.genetics.genome.set_pair(&"work_craft", "craft_clumsy", "craft_clumsy")
	clumsy.genetics.mark_dirty()

	var stock_a := Stockpile.new()
	stock_a.add_local("timber", 100.0)
	var stock_b := Stockpile.new()
	stock_b.add_local("timber", 100.0)
	CraftingSystem.craft("craft_planks", deft, stock_a, summary, research)
	CraftingSystem.craft("craft_planks", clumsy, stock_b, summary, research)
	_check("craft: a deft crafter yields more from the same materials",
		stock_a.amount("planks") > stock_b.amount("planks"))

	_check("craft: insufficient materials refused",
		not bool(CraftingSystem.craft("craft_planks", crafter, Stockpile.new(),
			summary, research)["ok"]))

	for c in [crafter, deft, clumsy]:
		c.free()


# --- Legacy score ----------------------------------------------------------------

func _test_legacy_score() -> void:
	var plain := LineageRecordResource.new()
	plain.lineage_id = &"lin_plain"
	plain.display_name = "Plain Line"
	for i in 5:
		plain.record_birth("u%d" % i, i)

	var storied := LineageRecordResource.new()
	storied.lineage_id = &"lin_storied"
	storied.display_name = "Storied Line"
	for i in 5:
		storied.record_birth("s%d" % i, i)
	storied.note_archetype("arch_guardian")
	storied.note_entrenched_mark("epi_cold_hardening", 4)
	storied.note_planet("pl_a")
	storied.note_planet("pl_b")
	storied.add_event(1, "pl_a", "s0", "founding", "It begins.", 1.0)

	var plain_score := LegacyScore.for_lineage(plain)
	var storied_score := LegacyScore.for_lineage(storied)
	_check("legacy: history scores higher than mere headcount", storied_score > plain_score)
	_check("legacy: a bare line still scores something", plain_score > 0.0)

	# The score must reward depth of inheritance, not breadth of accident.
	var deep := LineageRecordResource.new()
	deep.note_entrenched_mark("epi_a", 6)
	var shallow := LineageRecordResource.new()
	for i in 3:
		shallow.note_entrenched_mark("epi_%d" % i, 1)
	_check("legacy: one deeply inherited mark beats several shallow ones",
		LegacyScore.for_lineage(deep) > LegacyScore.for_lineage(shallow))

	var extinct := LineageRecordResource.new()
	for i in 5:
		extinct.record_birth("e%d" % i, i)
	var alive_score := LegacyScore.for_lineage(extinct)
	for uid in extinct.living_uids.duplicate():
		extinct.record_death(uid)
	_check("legacy: extinction reduces but does not erase a line's score",
		LegacyScore.for_lineage(extinct) < alive_score
		and LegacyScore.for_lineage(extinct) > 0.0)

	_check("legacy: breakdown explains the number",
		not LegacyScore.breakdown(storied).is_empty())

	StoryDirector.lineages["lin_plain"] = plain
	StoryDirector.lineages["lin_storied"] = storied
	var total := LegacyScore.recompute_all()
	_check("legacy: recompute caches onto the records", storied.legacy_score > 0.0)
	_check("legacy: campaign total is the sum", total > 0.0)
	# Assert the ORDERING of the two records under test, not an absolute rank —
	# earlier suites have already populated StoryDirector with lineages, and a
	# ranking test that depends on unrelated global state is a flaky test.
	var order := LegacyScore.ranked()
	_check("legacy: a storied line outranks a plain one",
		order.find(storied) < order.find(plain))


# --- Save robustness --------------------------------------------------------------

func _test_save_robustness() -> void:
	var slot := "phase6_test"

	# Flood the story layer well past every compaction ceiling.
	for i in SaveSystem.MAX_LINEAGES_SAVED + 120:
		var record := LineageRecordResource.new()
		record.lineage_id = StringName("lin_bulk_%d" % i)
		record.display_name = "Bulk %d" % i
		StoryDirector.lineages[String(record.lineage_id)] = record
	for i in SaveSystem.MAX_LONG_TERM_SAVED + 400:
		StoryDirector.long_term.append({"tick": i, "kind": "noise", "uid": "u",
			"amount": 1.0, "payload": {}, "weight": 0.05})
	# One moment that must survive compaction no matter what.
	StoryDirector.long_term.append({"tick": 9, "kind": "founding", "uid": "u",
		"amount": 1.0, "payload": {}, "weight": 1.0})

	_check("save: writes successfully under load", SaveSystem.save_game(slot))
	var raw := SaveSystem.deserialize_from_file(SaveSystem.slot_path(slot))
	_check("save: file is readable", not raw.is_empty())

	var saved_story: Dictionary = raw["sections"]["story"]
	_check("save: long-term memory is capped",
		(saved_story["long_term"] as Array).size() <= SaveSystem.MAX_LONG_TERM_SAVED)
	_check("save: lineages are capped",
		(saved_story["lineages"] as Dictionary).size() <= SaveSystem.MAX_LINEAGES_SAVED)
	var kept_founding := (saved_story["long_term"] as Array).any(
		func(e): return String(e["kind"]) == "founding")
	_check("save: high-weight moments survive compaction", kept_founding)
	_check("save: per-section checksums written", raw.has("integrity"))

	_check("save: loads back", SaveSystem.load_game(slot))

	# Corruption isolation: damage one section, everything else must still load.
	var corrupted := raw.duplicate(true)
	corrupted["sections"]["story"]["lineages"] = {"tampered": {}}
	SaveSystem.serialize_to_file(SaveSystem.slot_path(slot), corrupted)
	var planets_before := PlanetManager.known_planets.size()
	var loaded := SaveSystem.load_game(slot)
	_check("save: a corrupt section does not abort the load", loaded)
	_check("save: the untouched sections still applied",
		PlanetManager.known_planets.size() == planets_before)

	SaveSystem.delete_slot(slot)
	StoryDirector.lineages.clear()
	StoryDirector.long_term.clear()


# --- LOD / performance ------------------------------------------------------------

func _test_lod(parent: Node) -> void:
	var planet := PlanetManager.create_planet(5150)
	PlanetManager.active_planet_id = planet.planet_id
	SimulationBudget.set_focus_point(Vector2.ZERO)

	var near_creature := CreatureFactory.spawn_random(parent, _rng, {})
	near_creature.position = Vector2(100, 0)
	SimulationBudget.register_creature(near_creature.identity.uid, near_creature, planet.planet_id)

	var mid := CreatureFactory.spawn_random(parent, _rng, {})
	mid.position = Vector2(SimulationBudget.full_radius + 500.0, 0)
	SimulationBudget.register_creature(mid.identity.uid, mid, planet.planet_id)

	var far := CreatureFactory.spawn_random(parent, _rng, {})
	far.position = Vector2(SimulationBudget.near_radius + 5000.0, 0)
	SimulationBudget.register_creature(far.identity.uid, far, planet.planet_id)

	var offworld := CreatureFactory.spawn_random(parent, _rng, {})
	SimulationBudget.register_creature(offworld.identity.uid, offworld, "pl_elsewhere")

	SimulationBudget.reassign_lod()
	_check("lod: nearby creatures are fully simulated",
		SimulationBudget.lod_of(near_creature.identity.uid) == AetherTypes.SimLOD.FULL)
	_check("lod: mid-distance creatures drop to NEAR",
		SimulationBudget.lod_of(mid.identity.uid) == AetherTypes.SimLOD.NEAR)
	_check("lod: distant creatures drop to ABSTRACT",
		SimulationBudget.lod_of(far.identity.uid) == AetherTypes.SimLOD.ABSTRACT)
	_check("lod: creatures on other worlds are dormant regardless of position",
		SimulationBudget.lod_of(offworld.identity.uid) == AetherTypes.SimLOD.DORMANT)

	# The ceiling must bind, and priority must decide who keeps their slot.
	var crowd: Array = []
	for i in SimulationBudget.max_full_creatures + 20:
		var c := CreatureFactory.spawn_random(parent, _rng, {})
		c.position = Vector2(_rng.randf_range(-300, 300), _rng.randf_range(-300, 300))
		SimulationBudget.register_creature(c.identity.uid, c, planet.planet_id)
		crowd.append(c)
	var treasured: Creature = crowd[crowd.size() - 1]
	treasured.position = Vector2(1000, 0)  # furthest of the crowd
	SimulationBudget.set_priority(treasured.identity.uid, 1.0)

	SimulationBudget.reassign_lod()
	var full_count := SimulationBudget.uids_in_band(AetherTypes.SimLOD.FULL).size()
	_check("lod: the FULL band respects its ceiling",
		full_count <= SimulationBudget.max_full_creatures)
	_check("lod: a story-relevant creature keeps its slot over anonymous ones",
		SimulationBudget.lod_of(treasured.identity.uid) == AetherTypes.SimLOD.FULL)

	# Round-robin slicing must stay bounded as population grows.
	var slice := SimulationBudget.take_near_slice()
	_check("lod: near-band slice is bounded by its per-frame budget",
		slice.size() <= SimulationBudget.near_updates_per_frame)

	for c in [near_creature, mid, far, offworld] + crowd:
		SimulationBudget.unregister_creature(c.identity.uid)
		c.free()
	PlanetManager.active_planet_id = ""


# --- Art / audio hooks --------------------------------------------------------------

func _test_av_hooks(parent: Node) -> void:
	var big := CreatureFactory.spawn_random(parent, _rng, {})
	big.genetics.genome.set_pair(&"morph_size", "size_giant", "size_giant")
	big.genetics.mark_dirty()
	big.stats.mark_dirty()
	big.audio.refresh()
	big.visual.refresh()

	var small := CreatureFactory.spawn_random(parent, _rng, {})
	small.genetics.genome.set_pair(&"morph_size", "size_slight", "size_slight")
	small.genetics.mark_dirty()
	small.stats.mark_dirty()
	small.audio.refresh()
	small.visual.refresh()

	_check("audio: a bigger creature has a lower voice",
		big.audio.player.pitch_scale < small.audio.player.pitch_scale)
	_check("audio: every creature gets a generated voice stream",
		big.audio.player.stream != null)
	_check("audio: voice is described for the readout", not big.audio.describe().is_empty())

	_check("visual: size drives the drawn silhouette",
		big.visual.describe()[0] != small.visual.describe()[0])

	# Crystallizing must change both the look and the sound.
	var pitch_before: float = small.audio.player.pitch_scale
	small.stats.age(60.0)
	for i in 30:
		small.experience.log_event("protect_ally")
		small.experience.log_event("damage_absorbed_for_ally", 6.0)
	small.archetype.evaluate()
	_check("av: crystallizing is audible", small.audio.player.pitch_scale != pitch_before)
	_check("av: crystallizing is visible",
		small.visual.describe()[0].contains("crystallized"))

	big.free()
	small.free()


# --- Harness ------------------------------------------------------------------

func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
