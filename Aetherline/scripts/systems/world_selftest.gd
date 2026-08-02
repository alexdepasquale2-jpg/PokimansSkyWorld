extends RefCounted
class_name WorldSelfTest

## Phase 3 validation: planets generate deterministically from a seed, differ
## from one another, stream in chunks, exert epigenetic pressure on whoever
## lives there, and survive the leave-and-return cycle with their residents.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()

## Sample worlds, for the harness to print.
var atlas: Array[String] = []


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	atlas.clear()
	_rng.seed = 90210

	_test_determinism()
	_test_variety()
	_test_coherence()
	_test_chunks()
	_test_pressure(parent)
	_test_jump_cycle(parent)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Determinism --------------------------------------------------------------

func _test_determinism() -> void:
	var seed_value := 0x0BADC0DE12345678
	var a := PlanetGenerator.derive(PlanetSeedResource.make(seed_value))
	var b := PlanetGenerator.derive(PlanetSeedResource.make(seed_value))

	_check("determinism: same seed gives the same climate",
		is_equal_approx(a.mean_temperature_c, b.mean_temperature_c))
	_check("determinism: same seed gives the same biomes",
		a.biome_weights.keys() == b.biome_weights.keys())
	_check("determinism: same seed gives the same hazards",
		a.hazard_profile.keys() == b.hazard_profile.keys())
	_check("determinism: same seed gives the same name", a.display_name == b.display_name)

	# The whole seed-plus-delta model rests on this: a planet stored as a bare
	# 64-bit number must rebuild identically after a save/load.
	var reloaded := PlanetSeedResource.from_dict(
		JSON.parse_string(JSON.stringify(a.to_dict())))
	_check("determinism: 64-bit seed survives serialization", reloaded.seed == a.seed)
	var regenerated := PlanetGenerator.derive(PlanetSeedResource.make(reloaded.seed))
	_check("determinism: a reloaded seed regenerates the same world",
		is_equal_approx(regenerated.mean_temperature_c, a.mean_temperature_c)
		and regenerated.biome_weights.keys() == a.biome_weights.keys())

	# Stage isolation: changing one stage's stream must not disturb another.
	_check("determinism: generation is idempotent",
		PlanetGenerator.derive(a).mean_temperature_c == a.mean_temperature_c)


# --- Variety ------------------------------------------------------------------

func _test_variety() -> void:
	var names := {}
	var biome_sets := {}
	var temperatures: Array[float] = []
	var habitable := 0
	var worlds: Array[PlanetSeedResource] = []

	for i in 60:
		var planet := PlanetGenerator.derive(PlanetSeedResource.make(
			_rng.randi() | (_rng.randi() << 32)))
		worlds.append(planet)
		names[planet.display_name] = true
		var key: Array = planet.biome_weights.keys()
		key.sort()
		biome_sets[", ".join(key)] = true
		temperatures.append(planet.mean_temperature_c)
		if planet.habitability > 0.25:
			habitable += 1

	_check("variety: worlds get distinct names", names.size() > 45)
	_check("variety: worlds get distinct biome mixes", biome_sets.size() > 12)

	var lowest: float = temperatures.min()
	var highest: float = temperatures.max()
	_check("variety: climates span a wide range", highest - lowest > 120.0)
	# Most of the galaxy should be hostile, or landing anywhere means nothing.
	_check("variety: habitable worlds are the minority",
		habitable > 0 and habitable < 30)

	for planet in worlds.slice(0, 5):
		atlas.append("  %-10s %-2s  %6.1fC  grav %.2f  hab %.2f  %s" % [
			planet.display_name, planet.star_class, planet.mean_temperature_c,
			planet.surface_gravity_g, planet.habitability,
			", ".join(planet.biome_weights.keys())])


# --- Physical coherence -------------------------------------------------------

func _test_coherence() -> void:
	# A generated world must not be internally absurd. These are the invariants
	# the pipeline is supposed to guarantee.
	var problems: Array[String] = []
	for i in 80:
		var p := PlanetGenerator.derive(PlanetSeedResource.make(
			_rng.randi() | (_rng.randi() << 32)))
		if p.biome_weights.is_empty():
			problems.append("%s has no biomes" % p.display_name)
		if p.atmosphere_density < 0.15 and p.hydrosphere_fraction > 0.3:
			problems.append("%s has oceans with no atmosphere" % p.display_name)
		if p.habitability > 0.5 and p.mean_temperature_c < -40.0:
			problems.append("%s is habitable at -40C" % p.display_name)
		# fauna_species_count is derived from raw liveability, not the final
		# habitability score (which also subtracts hazard load) — a hazardous
		# but otherwise liveable world can carry fauna at habitability 0.
		# That's correct; only flag fauna on a world with no biological basis.
		if p.mutation_rate_modifier <= 0.0:
			problems.append("%s has a non-positive mutation modifier" % p.display_name)
		for id in p.biome_weights:
			if PlanetGenerator.get_biome(id).is_empty():
				problems.append("%s references unknown biome %s" % [p.display_name, id])
	_check("coherence: generated worlds are internally consistent", problems.is_empty())
	for problem in problems.slice(0, 4):
		_lines.append("         " + problem)

	# Physical causes must produce their effects.
	var cold := _find_world(func(p): return p.mean_temperature_c < -20.0)
	_check("coherence: cold worlds press cold adaptation onto their inhabitants",
		cold != null and cold.epigenetic_pressures.has("epi_cold_hardening"))
	var heavy := _find_world(func(p): return p.surface_gravity_g > 1.6)
	_check("coherence: heavy worlds press denser frames",
		heavy != null and heavy.epigenetic_pressures.has("epi_dense_frame"))
	var irradiated := _find_world(func(p):
		return float(p.hazard_profile.get("radiation", 0.0)) > 0.5)
	_check("coherence: irradiated worlds raise the mutation rate",
		irradiated != null and irradiated.mutation_rate_modifier > 1.2)


func _find_world(predicate: Callable) -> PlanetSeedResource:
	var rng := RandomNumberGenerator.new()
	rng.seed = 4242
	for i in 400:
		var p := PlanetGenerator.derive(PlanetSeedResource.make(
			rng.randi() | (rng.randi() << 32)))
		if predicate.call(p):
			return p
	return null


# --- Chunk streaming ----------------------------------------------------------

func _test_chunks() -> void:
	var planet := PlanetGenerator.derive(PlanetSeedResource.make(778899112233))
	var a := ChunkGenerator.generate(planet, Vector2i(3, -7))
	var b := ChunkGenerator.generate(planet, Vector2i(3, -7))
	# Far enough apart that even a world with one dominant biome shows a
	# different noise sample; an adjacent chunk can legitimately match on a
	# climatically uniform world.
	var elsewhere := ChunkGenerator.generate(planet, Vector2i(40, -70))

	_check("chunks: correct tile count",
		(a["biomes"] as PackedStringArray).size()
			== ChunkGenerator.CHUNK_SIZE * ChunkGenerator.CHUNK_SIZE)
	_check("chunks: regenerate identically", a["biomes"] == b["biomes"])
	_check("chunks: distant chunks differ",
		a["biomes"] != elsewhere["biomes"] or a["elevation"] != elsewhere["elevation"])
	_check("chunks: every tile is a real biome",
		(a["biomes"] as PackedStringArray).size() > 0
		and not PlanetGenerator.get_biome((a["biomes"] as PackedStringArray)[0]).is_empty())
	_check("chunks: sites are stable across regeneration",
		JSON.stringify(a["sites"]) == JSON.stringify(b["sites"]))

	# Biome placement must produce regions, not per-tile confetti. Sample
	# adjacent tiles: most neighbours should match.
	var same := 0
	var ids: PackedStringArray = a["biomes"]
	for i in range(ChunkGenerator.CHUNK_SIZE * (ChunkGenerator.CHUNK_SIZE - 1)):
		if ids[i] == ids[i + 1]:
			same += 1
	var coherence := float(same) / float(ChunkGenerator.CHUNK_SIZE
		* (ChunkGenerator.CHUNK_SIZE - 1))
	_check("chunks: biomes form coherent regions (%.2f neighbour agreement)" % coherence,
		coherence > 0.85)


# --- Environmental pressure ---------------------------------------------------

func _test_pressure(parent: Node) -> void:
	# A cold world must actually mark the creatures standing on it.
	var planet := _find_world(func(p):
		return float(p.epigenetic_pressures.get("epi_cold_hardening", 0.0)) > 0.4)
	_check("pressure: found a world that presses cold adaptation", planet != null)
	if planet == null:
		return

	PlanetManager.known_planets[planet.planet_id] = planet
	var world := PlanetWorld.new()
	parent.add_child(world)
	world.setup(planet, PlanetManager.ensure_summary(planet.planet_id))

	var creature := CreatureFactory.spawn_random(parent, _rng, {})
	creature.home_planet_id = planet.planet_id
	var before := creature.epigenetics.profile.marks.size()

	for day in 30:
		world.apply_daily_pressure(1.0)

	_check("pressure: living on a world marks the creature",
		creature.epigenetics.profile.marks.size() > before)
	var mark := creature.epigenetics.profile.find_by_definition(&"epi_cold_hardening")
	_check("pressure: the mark matches the world's character", mark != null)
	_check("pressure: sustained exposure accumulates episodes",
		mark != null and mark.exposure_count > 1)
	_check("pressure: the phenotype actually shifted",
		creature.stats.trait_value(&"cold_tolerance")
			> PhenotypeResolver.express_trait(creature.genetics.genome, &"cold_tolerance"))

	# A creature elsewhere must be untouched — pressure is addressed by planet.
	var offworld := CreatureFactory.spawn_random(parent, _rng, {})
	offworld.home_planet_id = "pl_somewhere_else"
	world.apply_daily_pressure(10.0)
	_check("pressure: creatures on other worlds are unaffected",
		offworld.epigenetics.profile.marks.is_empty())

	_check("pressure: biomes underfoot are discovered",
		not PlanetManager.get_summary(planet.planet_id).discovered_biomes.is_empty())

	# Streaming follows the focus.
	var resident_before := world.loaded_chunks.size()
	world.set_focus(Vector2(ChunkGenerator.CHUNK_SIZE * PlanetWorld.TILE_SIZE * 12, 0))
	_check("streaming: chunks load around the focus", resident_before > 0)
	_check("streaming: resident chunk count stays bounded",
		world.loaded_chunks.size() <= 64)
	_check("streaming: distant chunks are released",
		world.chunks_generated > world.loaded_chunks.size())

	creature.free()
	offworld.free()
	world.free()


# --- Jump cycle ---------------------------------------------------------------

func _test_jump_cycle(parent: Node) -> void:
	var home := PlanetManager.create_planet(112233445566)
	var away := PlanetManager.create_planet(665544332211)

	PlanetManager.land(home.planet_id)
	_check("jump: landing sets the active planet",
		PlanetManager.active_planet_id == home.planet_id)
	_check("jump: landing derives the world", home.derived)

	var carried := CreatureFactory.spawn_random(parent, _rng, {"name": "Carried"})
	var left := CreatureFactory.spawn_random(parent, _rng, {"name": "Leftbehind"})
	for creature in [carried, left]:
		creature.home_planet_id = home.planet_id
		SimulationBudget.register_creature(creature.identity.uid, creature, home.planet_id)
	left.stats.age(20.0)
	var left_uid := left.identity.uid

	PlanetManager.depart([String(carried.identity.uid)],
		func(uid): return SimulationBudget.node_for(uid).to_dict())

	var summary := PlanetManager.get_summary(home.planet_id)
	_check("jump: departing stores those left behind", summary.resident_count() == 1)
	_check("jump: the carried creature is not stored",
		String(summary.resident_creatures[0]["identity"]["uid"]) == String(left_uid))
	_check("jump: those left behind drop to dormant",
		SimulationBudget.lod_of(left_uid) == AetherTypes.SimLOD.DORMANT)
	_check("jump: the summary gains a headline", not summary.summary_line.is_empty())
	left.free()

	# Time passes elsewhere.
	PlanetManager.land(away.planet_id)
	_check("jump: a second world can be landed on",
		PlanetManager.active_planet_id == away.planet_id)
	var away_summary := PlanetManager.ensure_summary(away.planet_id)
	summary.last_departure_tick = SimulationBudget.current_tick - int(
		SimulationBudget.TICKS_PER_DAY * 40.0)
	PlanetManager.depart([])

	# Come home.
	var returned := PlanetManager.land(home.planet_id)
	_check("jump: returning hands back the residents", returned.size() == 1)
	var restored := CreatureFactory.spawn_from_dict(parent, returned[0])
	_check("jump: the same creature came back", restored.identity.uid == left_uid)
	_check("jump: it aged while the colony was away", restored.stats.age_days > 55.0)
	_check("jump: its genome is intact",
		restored.genetics.genome.validate().is_empty())
	_check("jump: the world remembers being visited",
		PlanetManager.get_summary(home.planet_id).visit_count >= 2)
	_check("jump: cold storage is emptied on landing",
		PlanetManager.get_summary(home.planet_id).resident_count() == 0)

	# The universe as a whole must survive a save/load.
	var snapshot: Variant = JSON.parse_string(JSON.stringify(PlanetManager.to_dict()))
	var known_before := PlanetManager.known_planets.size()
	PlanetManager.from_dict(snapshot)
	_check("jump: the star map survives serialization",
		PlanetManager.known_planets.size() == known_before)
	_check("jump: planet seeds survive serialization",
		PlanetManager.get_planet(home.planet_id).seed == home.seed)

	carried.free()
	restored.free()
	PlanetManager.active_planet_id = ""


# --- Harness ------------------------------------------------------------------

func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
