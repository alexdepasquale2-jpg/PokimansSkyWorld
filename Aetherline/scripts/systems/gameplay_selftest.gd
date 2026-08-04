extends RefCounted
class_name GameplaySelfTest

## Proves the actual game loop holds together, not just the systems under it:
## a colony that harvests, eats, breeds, builds, researches, jumps and comes
## home. Anything here failing means the game is unplayable even if every
## subsystem passes in isolation.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	_rng.seed = 31415

	_test_session()
	_test_harvesting(parent)
	_test_survival_loop(parent)
	_test_full_campaign_arc(parent)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Session --------------------------------------------------------------------

func _test_session() -> void:
	var session := GameSession.new()
	session.start_new_campaign(4242)

	_check("session: a new campaign starts with supplies", session.stock.amount("timber") > 0.0)
	_check("session: a new campaign starts with food", session.food_available() > 0.0)
	_check("session: a new campaign has an empty roster", session.colony_size() == 0)
	_check("session: a new campaign has a universe seed", PlanetManager.universe_seed != 0)

	# Food quality must actually differ, or researching feed is pointless.
	session.stock.add_local("feed", 100.0)
	var good := session.consume_meal()
	session.stock.local.erase("feed")
	session.stock.local.erase("grain")
	var poor := session.consume_meal()
	_check("session: better food is more nourishing", good > poor and poor > 0.0)

	session.stock.local.clear()
	_check("session: an empty larder feeds nobody", session.consume_meal() == 0.0)

	var reloaded := GameSession.new()
	reloaded.from_dict(JSON.parse_string(JSON.stringify(session.to_dict())))
	_check("session: survives serialization",
		reloaded.days_elapsed == session.days_elapsed
		and reloaded.roster.size() == session.roster.size())


# --- Harvesting ------------------------------------------------------------------

func _test_harvesting(parent: Node) -> void:
	var node := ResourceNode.new()
	parent.add_child(node)
	node.setup("timber", 40.0, "test:0")

	var strong := CreatureFactory.spawn_random(parent, _rng, {})
	strong.genetics.genome.set_pair(&"work_haul", "haul_bearer", "haul_bearer")
	strong.genetics.mark_dirty()
	strong.stats.mark_dirty()
	var weak := CreatureFactory.spawn_random(parent, _rng, {})
	weak.genetics.genome.set_pair(&"work_haul", "haul_poor", "haul_poor")
	weak.genetics.mark_dirty()
	weak.stats.mark_dirty()

	var strong_yield := node.harvest(strong)
	node.setup("timber", 40.0, "test:0")
	var weak_yield := node.harvest(weak)
	_check("harvest: work genes change the yield", strong_yield > weak_yield)
	_check("harvest: harvesting is logged as experience",
		strong.experience.count("work_completed_haul") > 0.0)
	_check("harvest: harvesting costs energy", strong.needs.energy < 1.0)

	node.setup("timber", 5.0, "test:0")
	node.harvest(strong)
	_check("harvest: a small deposit is exhausted", node.depleted())
	_check("harvest: an exhausted deposit yields nothing", node.harvest(strong) == 0.0)

	# Deposits must follow the planet's actual biomes, not be sprinkled.
	var planet := PlanetGenerator.derive(PlanetSeedResource.make(90210))
	var summary := PlanetSummaryResource.new()
	var chunk := ChunkGenerator.generate(planet, Vector2i.ZERO)
	var spawned := ResourceNode.spawn_for_chunk(parent, planet, chunk, summary)
	var legal := true
	for entry in spawned:
		var n: ResourceNode = entry
		var found := false
		for biome_id in planet.biome_weights:
			if (PlanetGenerator.get_biome(biome_id).get("resources", {}) as Dictionary) \
					.has(n.resource_id):
				found = true
		if not found:
			legal = false
	_check("harvest: deposits only contain what the planet's biomes offer", legal)

	# Same chunk, same deposits — harvesting must be a durable decision.
	var again := ResourceNode.spawn_for_chunk(parent, planet, chunk, summary)
	_check("harvest: deposits regenerate identically from the seed",
		again.size() == spawned.size())

	for n in spawned + again:
		n.queue_free()
	node.queue_free()
	strong.free()
	weak.free()


# --- Survival loop ----------------------------------------------------------------

func _test_survival_loop(parent: Node) -> void:
	var session := GameSession.new()
	session.start_new_campaign(777)
	var creature := CreatureFactory.spawn_random(parent, _rng, {})
	session.enroll(creature)
	_check("survival: enrolling adds to the roster", session.colony_size() == 1)

	# Neglect must actually kill, or gathering has no stakes.
	session.stock.local.clear()
	creature.needs.hunger = 0.0
	creature.needs.energy = 0.0
	var collapsed := false
	for day in 90:
		creature.tick_days(1.0)
		if creature.needs.health <= 0.0:
			collapsed = true
			break
	_check("survival: neglect drives a creature to collapse", collapsed)

	# And feeding must actually save it. Pinned to a standard frame and
	# metabolism: a randomly-rolled giant can out-eat a day's forage entirely
	# (which is correct — big animals are genuinely expensive) and that would
	# make this measure luck rather than whether care works.
	var fed := CreatureFactory.spawn_random(parent, _rng, {})
	fed.genetics.genome.set_pair(&"morph_size", "size_standard", "size_standard")
	fed.genetics.genome.set_pair(&"meta_efficiency", "metab_typical", "metab_typical")
	fed.genetics.genome.set_pair(&"comb_power", "power_typical", "power_typical")
	fed.genetics.genome.set_pair(&"def_plating", "plate_none", "plate_none")
	fed.genetics.mark_dirty()
	fed.stats.mark_dirty()
	session.stock.add_local("forage", 50000.0)
	for day in 60:
		while fed.needs.hunger < 0.9 and session.food_available() > 0.0:
			fed.needs.feed(session.consume_meal())
		# Care includes rest, not only forage — measures the care loop itself.
		fed.needs.rest(0.8)
		fed.tick_days(1.0)
	_check("survival: a well-fed creature stays healthy",
		fed.needs.health > 0.5 and not fed.stats.downed)
	_check("survival: feeding drew down the larder", session.food_available() < 50000.0)

	creature.free()
	fed.free()


# --- Full campaign arc ---------------------------------------------------------------

func _test_full_campaign_arc(parent: Node) -> void:
	var session := GameSession.new()
	session.start_new_campaign(20260802)
	var planet := PlanetManager.create_planet()
	PlanetManager.land(planet.planet_id)
	var summary := PlanetManager.active_summary()

	var hero := CreatureFactory.spawn_random(parent, _rng,
		{"name": "Aster", "is_human": true, "planet_id": planet.planet_id})
	session.enroll(hero)
	SimulationBudget.register_creature(hero.identity.uid, hero, planet.planet_id)

	var pair: Array = []
	for role in [AetherTypes.ReproRole.GAMETE_A, AetherTypes.ReproRole.GAMETE_B]:
		var c := CreatureFactory.spawn_random(parent, _rng, {"planet_id": planet.planet_id})
		c.genetics.genome.repro_role = role
		c.home_planet_id = planet.planet_id
		session.enroll(c)
		SimulationBudget.register_creature(c.identity.uid, c, planet.planet_id)
		pair.append(c)
	_check("arc: colony founded", session.colony_size() == 3)

	# Build -> research -> breed, the actual progression chain.
	session.stock.add_local("timber", 300.0)
	session.stock.add_local("ore_ferrite", 100.0)
	var built := BaseBuilder.place(summary, "struct_pen", Vector2i(0, 0), session.stock.local)
	_check("arc: a pen can be built from starting materials", built.is_empty())

	session.research.add_points(500.0)
	_check("arc: research can be spent", session.research.unlock("tech_basic_tools"))
	_check("arc: research unlocks a structure",
		session.research.structure_available("struct_workbench"))

	var offspring := BreedingSystem.breed(pair[0], pair[1], parent, _rng)
	_check("arc: the founding pair can breed", offspring["success"])
	var child: Creature = offspring["child"]
	child.home_planet_id = planet.planet_id
	session.enroll(child)
	SimulationBudget.register_creature(child.identity.uid, child, planet.planet_id)
	_check("arc: offspring join the colony", session.colony_size() == 4)
	_check("arc: offspring are a generation deeper",
		child.identity.generation > pair[0].identity.generation)

	# Jump carrying only the hero — everything else must be left behind.
	session.prepare_hold()
	_check("arc: the hold takes what it can", session.stock.carried_mass() > 0.0)
	var destination := PlanetManager.create_planet()
	PlanetManager.depart([String(hero.identity.uid)],
		func(uid): return SimulationBudget.node_for(uid).to_dict())
	session.complete_jump()

	_check("arc: those not carried are stored on the world",
		PlanetManager.get_summary(planet.planet_id).resident_count() == 3)
	_check("arc: the jump was counted", session.jumps_made == 1)
	_check("arc: the hold spilled on arrival", session.stock.carried_mass() == 0.0)

	# Time passes elsewhere, then come home.
	PlanetManager.land(destination.planet_id)
	var home_summary := PlanetManager.get_summary(planet.planet_id)
	home_summary.last_departure_tick = SimulationBudget.current_tick \
		- int(SimulationBudget.TICKS_PER_DAY * 60.0)
	PlanetManager.depart([])
	var returned := PlanetManager.land(planet.planet_id)
	_check("arc: returning finds the colony where it was left", returned.size() > 0)

	var recovered: Array = []
	for data in returned:
		recovered.append(CreatureFactory.spawn_from_dict(parent, data))
	var aged := recovered.any(func(c): return c.stats.age_days > 55.0)
	_check("arc: those left behind aged in the player's absence", aged)
	_check("arc: their genomes are intact after the round trip",
		recovered.all(func(c): return c.genetics.genome.validate().is_empty()))
	_check("arc: they are still recognised as colonists",
		recovered.any(func(c): return session.is_colonist(c)))

	# The whole campaign must survive a save/load.
	summary.resident_creatures.clear()
	for entry in [hero] + recovered:
		summary.add_resident((entry as Creature).to_dict())
	session._ready()  # register the save provider
	var saved := SaveSystem.save_game("gameplay_test")
	_check("arc: the campaign saves", saved)
	var legacy := LegacyScore.recompute_all()
	_check("arc: the campaign has accumulated legacy", legacy > 0.0)
	SaveSystem.delete_slot("gameplay_test")
	session._exit_tree()

	for entry in [hero, child] + pair + recovered:
		if is_instance_valid(entry):
			SimulationBudget.unregister_creature((entry as Creature).identity.uid)
			(entry as Creature).free()
	PlanetManager.active_planet_id = ""


# --- Harness ------------------------------------------------------------------

func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
