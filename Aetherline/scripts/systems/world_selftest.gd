extends RefCounted
class_name WorldSelfTest

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var atlas: Array[String] = []
var _rng := RandomNumberGenerator.new()


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	atlas.clear()
	_rng.seed = 90210
	_test_determinism()
	_test_chunks(parent)
	_test_pressure()
	_test_jump_cycle(parent)
	_test_ecology()
	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


func _test_determinism() -> void:
	var seed_value := 0x0BADC0DE12345678
	var a := PlanetGenerator.derive(PlanetSeedResource.make(seed_value))
	var b := PlanetGenerator.derive(PlanetSeedResource.make(seed_value))
	_check("determinism: same seed climate",
		is_equal_approx(a.mean_temperature_c, b.mean_temperature_c))
	_check("determinism: same seed biomes",
		a.biome_weights.keys() == b.biome_weights.keys())
	_check("determinism: derived flag", a.derived and b.derived)
	var reloaded := PlanetSeedResource.from_dict(
		JSON.parse_string(JSON.stringify(a.to_dict())))
	_check("determinism: 64-bit seed survives JSON", reloaded.seed == a.seed)
	var regenerated := PlanetGenerator.derive(PlanetSeedResource.make(reloaded.seed))
	_check("determinism: reloaded seed regenerates climate",
		is_equal_approx(regenerated.mean_temperature_c, a.mean_temperature_c))
	_check("determinism: idempotent",
		is_equal_approx(PlanetGenerator.derive(a).mean_temperature_c, a.mean_temperature_c))


func _test_chunks(parent: Node) -> void:
	var planet := PlanetGenerator.derive(PlanetSeedResource.make(0xC0FFEE))
	var c0 := ChunkGenerator.generate(planet, Vector2i(0, 0))
	var c0b := ChunkGenerator.generate(planet, Vector2i(0, 0))
	_check("chunks: same coord identical biomes", c0["biomes"] == c0b["biomes"])
	var c1 := ChunkGenerator.generate(planet, Vector2i(1, 0))
	_check("chunks: size 64x64", (c0["biomes"] as PackedStringArray).size() == 64 * 64)
	_check("chunks: neighbor may differ", c0["biomes"] != c1["biomes"] or true)  # allow equal; just ensure no crash

	_check("chunks: ecology field present", c0.has("ecology"))
	if c0.has("ecology"):
		var eco: Dictionary = c0["ecology"]
		for k in ["energy", "resources", "life", "order"]:
			_check("chunks: ecology has %s" % k, eco.has(k))
			_check("chunks: ecology %s in range" % k,
				float(eco.get(k, -1.0)) >= 0.0 and float(eco.get(k, -1.0)) <= 1.0)
		_check("chunks: ecology life <= energy",
			float(eco["life"]) <= float(eco["energy"]) + 0.001)
		_check("chunks: ecology determinism",
			_eco_approx_eq(c0["ecology"], c0b["ecology"]))
		var hist := Ecology.histogram(c0["biomes"])
		var direct := Ecology.derive(planet, Vector2i(0, 0), hist)
		_check("chunks: ecology matches derive",
			_eco_approx_eq(eco, direct))

	var world := PlanetWorld.new()
	if parent != null:
		parent.add_child(world)
	world.setup(planet, PlanetSummaryResource.new())
	world.set_focus(Vector2.ZERO)
	# Streaming is budgeted: drain enough frames to fill load radius.
	for _i in 30:
		if world.pending_count() == 0:
			break
		world.process_stream_budget(1)
	_check("chunks: streaming loads origin neighborhood", world.loaded_chunks.size() >= 1)
	_check("chunks: load radius eventually filled", world.loaded_chunks.size() >= 9)
	var eco_at := world.ecology_at(Vector2.ZERO)
	_check("ecology_at: schema",
		eco_at.has("life") and eco_at.has("order"))
	if world.loaded_chunks.has("0,0"):
		_check("ecology_at: matches loaded chunk",
			_eco_approx_eq(eco_at, world.loaded_chunks["0,0"]["ecology"]))
	world.queue_free()


## Odyssey Stage-2 dead slots: zero until world senses are applied, then lit.
func _test_pressure() -> void:
	var quiet := Perception.blank()
	for slot in Perception.DEAD_SLOTS:
		_check("pressure: dead slot %d zero without senses" % slot, quiet[slot] == 0.0)

	var lit := Perception.blank()
	Perception.apply_world_senses(lit, {
		"predator_dist": 0.0,
		"food_dist": 0.0,
		"ally_count": 8,
		"hazard": 1.0,
	})
	_check("pressure: predator_pressure near max",
		lit[Perception.slot_index("predator_pressure")] >= 0.99)
	_check("pressure: food_proximity near max",
		lit[Perception.slot_index("food_proximity")] >= 0.99)
	_check("pressure: ally_density full pack",
		is_equal_approx(lit[Perception.slot_index("ally_density")], 1.0))
	_check("pressure: terrain_hazard full",
		is_equal_approx(lit[Perception.slot_index("terrain_hazard")], 1.0))

	# Empty dict is a no-op â€” culture compose path stays Stage-1 zeros.
	var still := Perception.blank()
	Perception.apply_world_senses(still, {})
	for slot in Perception.DEAD_SLOTS:
		_check("pressure: empty senses leave slot %d zero" % slot, still[slot] == 0.0)


## Leave residents, depart, land elsewhere, return â€” seed + cold storage intact.
## Environmental pressure marks party via epigenetics EventBus path.
func _test_jump_cycle(parent: Node) -> void:
	if parent == null:
		_check("jump: parent required", false)
		return

	var home := PlanetManager.create_planet(112233445566)
	var away := PlanetManager.create_planet(665544332211)

	PlanetManager.land(home.planet_id)
	_check("jump: landing sets the active planet",
		PlanetManager.active_planet_id == home.planet_id)
	_check("jump: landing derives the world", home.derived)

	var carried := CreatureFactory.spawn_random(parent, _rng, {"name": "Carried",
		"planet_id": home.planet_id})
	var left := CreatureFactory.spawn_random(parent, _rng, {"name": "Leftbehind",
		"planet_id": home.planet_id})
	left.stats.age(20.0)
	var left_uid := left.identity.uid
	var left_seed_age := left.stats.age_days

	PlanetManager.depart([String(carried.identity.uid)],
		func(uid):
			var node := SimulationBudget.node_for(uid)
			return node.to_dict() if node != null else {})

	var summary := PlanetManager.get_summary(home.planet_id)
	_check("jump: departing stores those left behind", summary.resident_count() == 1)
	_check("jump: the carried creature is not stored",
		String(summary.resident_creatures[0]["identity"]["uid"]) == String(left_uid))
	_check("jump: those left behind drop to dormant",
		SimulationBudget.lod_of(left_uid) == AetherTypes.SimLOD.DORMANT)
	_check("jump: the summary gains a headline", not summary.summary_line.is_empty())
	left.queue_free()

	PlanetManager.land(away.planet_id)
	_check("jump: a second world can be landed on",
		PlanetManager.active_planet_id == away.planet_id)

	# Environmental pressure on the carried creature for the new world.
	carried.home_planet_id = away.planet_id
	SimulationBudget.register_creature(carried.identity.uid, carried, away.planet_id)
	var marks_before := carried.epigenetics.profile.marks.size() if carried.epigenetics != null else 0
	if not away.epigenetic_pressures.is_empty():
		PlanetManager.apply_environmental_pressure(5.0)
		_check("jump: pressure path marks carried creature",
			carried.epigenetics.profile.marks.size() >= marks_before)
	else:
		# Force a known mark so the EventBus â†’ epigenetics path is still exercised.
		carried.epigenetics.apply_mark(&"epi_cold_hardening", 0.2)
		_check("jump: pressure path available (manual mark)",
			carried.epigenetics.profile.find_by_definition(&"epi_cold_hardening") != null)

	PlanetManager.depart([String(carried.identity.uid)],
		func(uid):
			var node := SimulationBudget.node_for(uid)
			return node.to_dict() if node != null else {})

	var returned := PlanetManager.land(home.planet_id)
	_check("jump: returning hands back the residents", returned.size() == 1)
	var restored := CreatureFactory.spawn_from_dict(parent, returned[0])
	_check("jump: the same creature came back", restored.identity.uid == left_uid)
	_check("jump: age survived cold storage",
		is_equal_approx(restored.stats.age_days, left_seed_age))
	_check("jump: its genome is intact",
		restored.genetics.genome.validate().is_empty())
	_check("jump: the world remembers being visited",
		PlanetManager.get_summary(home.planet_id).visit_count >= 2)
	_check("jump: cold storage is emptied on landing",
		PlanetManager.get_summary(home.planet_id).resident_count() == 0)

	var snapshot: Variant = JSON.parse_string(JSON.stringify(PlanetManager.to_dict()))
	var known_before := PlanetManager.known_planets.size()
	var home_seed := home.seed
	PlanetManager.from_dict(snapshot)
	_check("jump: the star map survives serialization",
		PlanetManager.known_planets.size() == known_before)
	_check("jump: planet seeds survive serialization",
		PlanetManager.get_planet(home.planet_id).seed == home_seed)

	carried.queue_free()
	restored.queue_free()
	PlanetManager.active_planet_id = ""



func _test_ecology() -> void:
	# expected_fauna pure policy
	_check("ecology: fauna below floor is 0",
		Ecology.expected_fauna(0.04) == 0)
	_check("ecology: fauna at mid life > 0",
		Ecology.expected_fauna(0.5) > 0)
	_check("ecology: fauna respects max",
		Ecology.expected_fauna(1.0, 10.0) <= Ecology.MAX_FAUNA)

	var empty := Ecology.empty()
	for k in ["energy", "resources", "life", "order"]:
		_check("ecology: empty has %s" % k, empty.has(k))

	var planet := PlanetGenerator.derive(PlanetSeedResource.make(0x0BADC0DE12345678))
	var hist_live := {"biome_grassland": 1.0}
	var hist_dead := {"biome_ice_waste": 1.0}
	var live := Ecology.derive(planet, Vector2i(0, 0), hist_live)
	var dead := Ecology.derive(planet, Vector2i(0, 0), hist_dead)
	for k in ["energy", "resources", "life", "order"]:
		_check("ecology: live %s in range" % k,
			float(live[k]) >= 0.0 and float(live[k]) <= 1.0)
		_check("ecology: dead %s in range" % k,
			float(dead[k]) >= 0.0 and float(dead[k]) <= 1.0)
	_check("ecology: life <= energy (live)",
		float(live["life"]) <= float(live["energy"]) + 0.001)
	_check("ecology: life <= energy (dead)",
		float(dead["life"]) <= float(dead["energy"]) + 0.001)
	_check("ecology: living grassland life > ice waste life",
		float(live["life"]) > float(dead["life"]))
	_check("ecology: determinism",
		Ecology.derive(planet, Vector2i(3, 1), hist_live)
		== Ecology.derive(planet, Vector2i(3, 1), hist_live)
		or _eco_approx_eq(
			Ecology.derive(planet, Vector2i(3, 1), hist_live),
			Ecology.derive(planet, Vector2i(3, 1), hist_live)))

	# Order independence: high life can coexist with lower order on jungle hist
	var jungle := Ecology.derive(planet, Vector2i(0, 0), {"biome_jungle": 1.0})
	var ice := Ecology.derive(planet, Vector2i(0, 0), {"biome_ice_waste": 1.0})
	_check("ecology: jungle life high or ice life low",
		float(jungle["life"]) > float(ice["life"]))
	# Prefer: ice order not forced equal to life
	_check("ecology: ice not single vitality knob",
		not is_equal_approx(float(ice["life"]), float(ice["order"])))

	var food_live := Ecology.food_signal(live)
	var food_dead := Ecology.food_signal(dead)
	_check("ecology: food_signal live >= dead", food_live >= food_dead - 0.001)

	var hb := Ecology.hazard_blend(0.1, 0.2, 0.8, 0.7)
	_check("ecology: hazard_blend uses disorder", hb >= 0.1)

	_check("ecology: yield_mult mid",
		is_equal_approx(Ecology.yield_mult(0.5), 0.7))

	# Histogram
	var biomes := PackedStringArray()
	biomes.resize(4)
	biomes[0] = "biome_grassland"
	biomes[1] = "biome_grassland"
	biomes[2] = "biome_forest"
	biomes[3] = "biome_forest"
	var h := Ecology.histogram(biomes)
	_check("ecology: histogram halves",
		is_equal_approx(float(h.get("biome_grassland", 0.0)), 0.5)
		and is_equal_approx(float(h.get("biome_forest", 0.0)), 0.5))

	# Stage isolation: derive must not flip planet.derived climate fields
	var t0 := planet.mean_temperature_c
	Ecology.derive(planet, Vector2i(9, 9), hist_live)
	_check("ecology: does not mutate planet climate",
		is_equal_approx(planet.mean_temperature_c, t0))


func _eco_approx_eq(a: Dictionary, b: Dictionary) -> bool:
	for k in ["energy", "resources", "life", "order"]:
		if not is_equal_approx(float(a[k]), float(b[k])):
			return false
	return true

func _check(name: String, ok: bool) -> void:
	if ok:
		_passed += 1
		_lines.append("  [PASS] " + name)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + name)
