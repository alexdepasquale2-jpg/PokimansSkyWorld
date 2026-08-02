extends RefCounted
class_name ColonySelfTest

## Phase 5 validation: flexible building, needs/mood/relationships, research
## trees actually reaching back into Phase 1's hooks, and colony-scope story.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	_rng.seed = 771122

	_test_building(parent)
	_test_research()
	_test_relationships_and_needs(parent)
	_test_colony_story(parent)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Building -------------------------------------------------------------------

func _test_building(parent: Node) -> void:
	var summary := PlanetSummaryResource.new()
	summary.planet_id = "pl_test_colony"
	var resources := {"timber": 100.0, "ore_ferrite": 20.0}

	_check("build: unknown structure refused",
		not BaseBuilder.place(summary, "struct_does_not_exist", Vector2i.ZERO, resources).is_empty())

	var err := BaseBuilder.place(summary, "struct_lean_to", Vector2i(0, 0), resources)
	_check("build: valid placement succeeds", err.is_empty())
	_check("build: cost is deducted", resources["timber"] < 100.0)
	_check("build: structure recorded", summary.structures.size() == 1)

	var overlap := BaseBuilder.place(summary, "struct_cabin", Vector2i(1, 1), resources)
	_check("build: overlapping footprint is refused", not overlap.is_empty())

	var far := BaseBuilder.place(summary, "struct_cabin", Vector2i(10, 10), resources)
	_check("build: non-overlapping placement elsewhere succeeds", far.is_empty())

	var poor := {"timber": 1.0}
	_check("build: insufficient resources refused",
		not BaseBuilder.place(summary, "struct_workbench", Vector2i(20, 20), poor).is_empty())

	_check("build: total_effect sums across structures placed",
		BaseBuilder.total_effect(summary, "shelter") > 0.0)

	var removed := BaseBuilder.remove_at(summary, Vector2i(0, 0))
	_check("build: removal frees the footprint", removed)
	_check("build: freed footprint can be rebuilt on",
		BaseBuilder.place(summary, "struct_wall", Vector2i(0, 0), resources).is_empty())

	# Persistence: structures live inside PlanetSummaryResource, which already
	# had this field from Phase 0 — the whole point of reusing it.
	var reloaded := PlanetSummaryResource.from_dict(
		JSON.parse_string(JSON.stringify(summary.to_dict())))
	_check("build: structures survive summary round trip",
		reloaded.structures.size() == summary.structures.size())


# --- Research ---------------------------------------------------------------------

func _test_research() -> void:
	var before_mutation := BreedingSystem.research_mutation_modifier
	var before_heritability := EpigeneticsComponent.research_heritability_bonus

	var research := ResearchSystem.new()
	research.add_points(1000.0)

	_check("research: catalog covers both branches",
		not research.nodes_in_branch("technological").is_empty()
		and not research.nodes_in_branch("biological").is_empty())
	_check("research: locked by prerequisite", not research.can_unlock("tech_metallurgy"))

	_check("research: base node unlocks", research.unlock("tech_basic_tools"))
	_check("research: points are spent", research.points < 1000.0)
	_check("research: unlocking twice is refused", not research.unlock("tech_basic_tools"))
	_check("research: prerequisite now satisfied", research.unlock("tech_metallurgy"))
	_check("research: structure gated by research is now available",
		research.structure_available("struct_forge"))
	_check("research: an ungated structure was always available",
		research.structure_available("struct_lean_to"))

	research.unlock("bio_husbandry_basics")
	research.unlock("bio_selective_breeding")
	# The actual point of the tree: it must reach back into Phase 1's hooks.
	_check("research: selective breeding raises the heritability ceiling",
		EpigeneticsComponent.research_heritability_bonus > before_heritability)

	research.unlock("bio_mutagenics")
	_check("research: mutagenics raises the campaign mutation modifier",
		BreedingSystem.research_mutation_modifier > before_mutation)

	# Save/load must rebuild the process-wide statics, not just remember ids.
	BreedingSystem.research_mutation_modifier = 1.0
	EpigeneticsComponent.research_heritability_bonus = 0.0
	var snapshot: Variant = JSON.parse_string(JSON.stringify(research.to_dict()))
	var reloaded := ResearchSystem.new()
	reloaded.from_dict(snapshot)
	_check("research: unlocked set survives reload", reloaded.unlocked.size() == research.unlocked.size())
	_check("research: effects are REAPPLIED on reload, not just remembered",
		BreedingSystem.research_mutation_modifier > 1.0
		and EpigeneticsComponent.research_heritability_bonus > 0.0)

	BreedingSystem.research_mutation_modifier = before_mutation
	EpigeneticsComponent.research_heritability_bonus = before_heritability


# --- Relationships & needs ---------------------------------------------------------

func _test_relationships_and_needs(parent: Node) -> void:
	var a := CreatureFactory.spawn_random(parent, _rng, {"name": "Vane"})
	var b := CreatureFactory.spawn_random(parent, _rng, {"name": "Sorrel"})

	_check("relationships: strangers have no bond", a.relationships.affinity(b.identity.uid) == 0.0)
	a.relationships.adjust(b.identity.uid, 0.3, 0.1)
	_check("relationships: adjust records affinity",
		is_equal_approx(a.relationships.affinity(b.identity.uid), 0.3))
	_check("relationships: bond is directional (b does not automatically reciprocate)",
		b.relationships.affinity(a.identity.uid) == 0.0)
	for i in 20:
		a.relationships.adjust(b.identity.uid, 1.0)
	_check("relationships: bonds clamp to [-1,1]", a.relationships.affinity(b.identity.uid) <= 1.0)
	_check("relationships: strongest_bond finds it", a.relationships.strongest_bond() == String(b.identity.uid))

	# Husbandry work must actually form a mutual bond.
	var minder := CreatureFactory.spawn_random(parent, _rng, {"name": "Marn"})
	var charge := CreatureFactory.spawn_random(parent, _rng, {"name": "Rha"})
	minder.work.perform("husbandry", 3.0, charge)
	_check("relationships: husbandry work forms a mutual bond",
		minder.relationships.affinity(charge.identity.uid) > 0.0
		and charge.relationships.affinity(minder.identity.uid) > 0.0)

	# Social need should follow the strongest bond, not just physical needs.
	charge.needs.hunger = 1.0
	charge.needs.energy = 1.0
	charge.needs.health = 1.0
	charge.needs.social = 0.1
	charge.needs.tick(5.0)
	_check("needs: social state moves toward the creature's bonds", charge.needs.social > 0.1)

	# Guardian protection must also bond protector and protected.
	var guardian := CreatureFactory.spawn_random(parent, _rng, {"name": "Ossa"})
	guardian.stats.age(60.0)
	var ward := CreatureFactory.spawn_random(parent, _rng, {"name": "Isk"})
	var attacker := CreatureFactory.spawn_random(parent, _rng, {})
	for i in 30:
		guardian.experience.log_event("protect_ally")
		guardian.experience.log_event("damage_absorbed_for_ally", 6.0)
	guardian.archetype.evaluate()
	_check("relationships: test guardian crystallized",
		guardian.archetype.state.is_crystallized(&"arch_guardian"))
	var protected_at_least_once := false
	for i in 20:
		var outcome := CombatSystem.attack_with_protection(attacker, ward, [guardian], _rng)
		if outcome["target"] == guardian:
			protected_at_least_once = true
	_check("relationships: intercepting for an ally bonds protector and protected",
		protected_at_least_once
		and guardian.relationships.affinity(ward.identity.uid) > 0.0
		and ward.relationships.affinity(guardian.identity.uid) > 0.0)

	for c in [a, b, minder, charge, guardian, ward, attacker]:
		c.free()


# --- Colony story -------------------------------------------------------------------

func _test_colony_story(parent: Node) -> void:
	var summary := PlanetSummaryResource.new()
	summary.planet_id = "pl_story_colony"
	var resources := {"timber": 999.0}
	BaseBuilder.place(summary, "struct_lean_to", Vector2i(0, 0), resources)

	var research := ResearchSystem.new()
	var planet := PlanetSeedResource.make(112233)
	planet.habitability = 0.4

	var creatures: Array = []
	for i in 3:
		creatures.append(CreatureFactory.spawn_random(parent, _rng, {}))

	var metrics := ColonyMetrics.build(creatures, summary, research, planet)
	_check("colony metrics: population counted", metrics["population"] == 3.0)
	_check("colony metrics: structure count counted", metrics["structure_count"] == 1.0)

	# Colony-scope story beats are DELIBERATELY disabled — data/events/
	# colony_events.json is retired. The evaluator still has to behave (fire
	# nothing, suppress repeats) so the machinery stays sound if a future mode
	# reinstates the templates.
	var fired := StoryDirector.evaluate_colony(metrics, {"planet": "Test-1"})
	_check("colony story: no colony beats fire while the templates are retired",
		fired.is_empty())

	# A creature-scope evaluation must never accidentally fire a colony beat.
	var lone := CreatureFactory.spawn_random(parent, _rng, {"name": "Solitary"})
	var creature_fired := StoryDirector.evaluate_creature(lone)
	_check("colony story: colony-tagged templates never fire from evaluate_creature",
		creature_fired.all(func(e): return not String(e.get("kind", "")).begins_with("colony_")))

	for c in creatures:
		c.free()
	lone.free()


# --- Harness ------------------------------------------------------------------

func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
