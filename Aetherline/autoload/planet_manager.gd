extends Node
## PlanetManager — owns the universe's worth of worlds and the one the player
## is standing on.
##
## INVARIANT: exactly zero or one planet is "active" (fully simulated, streamed,
## populated with real nodes). Every other known world exists only as a
## PlanetSeedResource (what it is) plus, if visited, a PlanetSummaryResource
## (what the player did to it). Nothing else about a world is kept in memory.
##
## Phase 0 establishes the ownership model, the jump contract and the
## serialization. Phase 3 fills in generation and chunk streaming behind the
## seams marked TODO(phase 3).

## Known worlds: planet_id -> PlanetSeedResource. Grows as the player scans.
var known_planets: Dictionary = {}

## Visited worlds: planet_id -> PlanetSummaryResource.
var summaries: Dictionary = {}

## The world currently landed on, or "" while in transit.
var active_planet_id: String = ""

## Root node of the streamed world scene, if any. Owned by the world scene, not
## by this autoload — PlanetManager coordinates, it does not parent gameplay.
var active_world_root: Node = null

## Master seed for the campaign. Every generated planet seed derives from this,
## so an entire universe is reproducible from one number.
var universe_seed: int = 0

## Monotonic counter feeding deterministic planet seed derivation.
var _planets_generated: int = 0


func _ready() -> void:
	if universe_seed == 0:
		universe_seed = randi() | (randi() << 32)


# --- Universe ----------------------------------------------------------------

func set_universe_seed(s: int) -> void:
	universe_seed = s
	_planets_generated = 0


## Deterministic seed for the Nth planet of this universe. Derived rather than
## random so that the star map is identical on every load of the same save,
## including planets the player has not scanned yet.
func derive_planet_seed(index: int) -> int:
	var rng := RandomNumberGenerator.new()
	rng.seed = universe_seed ^ hash("planet:%d" % index)
	return rng.randi() | (rng.randi() << 32)


## Registers a new world in the star map and returns its seed resource.
## Does NOT run the full generation pipeline — that is `derive_planet` — so
## discovering a hundred distant stars stays nearly free.
func create_planet(seed_value: int = 0) -> PlanetSeedResource:
	var s := seed_value if seed_value != 0 else derive_planet_seed(_planets_generated)
	_planets_generated += 1
	var planet := PlanetSeedResource.make(s)
	known_planets[planet.planet_id] = planet
	EventBus.planet_generated.emit(planet.planet_id, s)
	return planet


## Runs the deterministic derivation pass (orbit -> climate -> biomes ->
## resources -> hazards -> ruins -> fauna) and caches the results on the seed.
## TODO(phase 3): implement in scripts/generators/planet_generator.gd and call
## it from here. Idempotent by contract: calling twice must change nothing.
func derive_planet(planet_id: String) -> PlanetSeedResource:
	var planet: PlanetSeedResource = known_planets.get(planet_id)
	if planet == null:
		push_error("PlanetManager.derive_planet: unknown planet '%s'" % planet_id)
		return null
	if planet.derived:
		return planet
	push_warning("PlanetManager.derive_planet: generator not implemented until Phase 3.")
	return planet


func get_planet(planet_id: String) -> PlanetSeedResource:
	return known_planets.get(planet_id)


func get_summary(planet_id: String) -> PlanetSummaryResource:
	return summaries.get(planet_id)


## Summary for a planet, created on first landing.
func ensure_summary(planet_id: String) -> PlanetSummaryResource:
	if summaries.has(planet_id):
		return summaries[planet_id]
	var planet: PlanetSeedResource = get_planet(planet_id)
	var s := PlanetSummaryResource.new()
	s.planet_id = planet_id
	s.seed = 0 if planet == null else planet.seed
	s.display_name = "" if planet == null else planet.display_name
	s.first_visit_tick = SimulationBudget.current_tick
	summaries[planet_id] = s
	return s


func active_planet() -> PlanetSeedResource:
	return get_planet(active_planet_id)


func active_summary() -> PlanetSummaryResource:
	return get_summary(active_planet_id)


# --- Travel ------------------------------------------------------------------

## Land on a world. Anything left here on a previous visit is handed back to the
## caller (the world scene) to re-inflate into real creatures.
## Returns the array of serialized resident creature dicts.
func land(planet_id: String) -> Array:
	if active_planet_id == planet_id:
		return []
	if active_planet_id != "":
		push_warning("PlanetManager.land: departing '%s' implicitly." % active_planet_id)
		depart([])

	derive_planet(planet_id)
	active_planet_id = planet_id

	var summary := ensure_summary(planet_id)
	summary.visited = true
	summary.visit_count += 1

	# Residents have been in cold storage since departure. Their needs, ageing
	# and epigenetic decay are integrated over the gap in one step rather than
	# simulated, which is what makes leaving a colony behind affordable.
	# TODO(phase 3): run the catch-up integration over `elapsed_days` here.
	var elapsed_days := summary.days_since_departure(
		SimulationBudget.current_tick, SimulationBudget.TICKS_PER_DAY)
	if elapsed_days > 0.0:
		EventBus.trace("planet_catchup", {"planet": planet_id, "days": elapsed_days})

	var residents := summary.take_residents()
	EventBus.planet_landed.emit(planet_id)
	return residents


## Leave the active world. `carried_uids` come with the player; every other
## registered creature on this planet is serialized into the summary and
## dropped to DORMANT.
## `serializer` is a Callable(uid) -> Dictionary supplied by the world scene,
## so PlanetManager never needs to know how a creature serializes itself.
func depart(carried_uids: Array, serializer: Callable = Callable()) -> void:
	if active_planet_id == "":
		return
	var planet_id := active_planet_id
	var summary := ensure_summary(planet_id)
	var left_behind: Array = []

	for uid in SimulationBudget.uids_on_planet(planet_id):
		if carried_uids.has(uid) or carried_uids.has(StringName(uid)):
			continue
		left_behind.append(uid)
		if serializer.is_valid():
			var data: Variant = serializer.call(StringName(uid))
			if typeof(data) == TYPE_DICTIONARY:
				summary.add_resident(data)
		SimulationBudget.set_lod(StringName(uid), AetherTypes.SimLOD.DORMANT)

	summary.last_departure_tick = SimulationBudget.current_tick
	summary.summary_line = _build_summary_line(summary)

	active_planet_id = ""
	active_world_root = null
	EventBus.planet_departed.emit(planet_id, left_behind)


func _build_summary_line(s: PlanetSummaryResource) -> String:
	var planet: PlanetSeedResource = get_planet(s.planet_id)
	var bits: Array[String] = []
	if s.resident_count() > 0:
		bits.append("%d resident%s" % [s.resident_count(), "" if s.resident_count() == 1 else "s"])
	if planet != null and planet.derived:
		bits.append("%.0f°C" % planet.mean_temperature_c)
	if not s.known_hazards.is_empty():
		bits.append("%d hazard%s" % [s.known_hazards.size(), "" if s.known_hazards.size() == 1 else "s"])
	return " · ".join(bits) if not bits.is_empty() else "surveyed"


# --- Environmental pressure ---------------------------------------------------

## Broadcast the active planet's ambient epigenetic pressures. Called on a slow
## cadence (daily, not per-frame) — this is the channel through which a world
## writes itself into the bloodlines living on it.
func apply_environmental_pressure(days: float) -> void:
	var planet := active_planet()
	if planet == null or planet.epigenetic_pressures.is_empty():
		return
	EventBus.environment_pressure_applied.emit(
		active_planet_id, planet.epigenetic_pressures, days)


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	var planets := {}
	for id in known_planets:
		planets[id] = (known_planets[id] as PlanetSeedResource).to_dict()
	var sums := {}
	for id in summaries:
		sums[id] = (summaries[id] as PlanetSummaryResource).to_dict()
	return {
		# 64-bit; must not go through JSON as a number. See AetherTypes.i64_to_json.
		# The universe seed is the root of every derived planet seed — losing
		# precision here would reshuffle the entire star map on load.
		"universe_seed": AetherTypes.i64_to_json(universe_seed),
		"planets_generated": _planets_generated,
		"active_planet_id": active_planet_id,
		"known_planets": planets,
		"summaries": sums,
	}


func from_dict(d: Dictionary) -> void:
	known_planets.clear()
	summaries.clear()
	universe_seed = AetherTypes.i64_from_json(d.get("universe_seed", 0))
	_planets_generated = int(d.get("planets_generated", 0))
	active_planet_id = String(d.get("active_planet_id", ""))
	for id in d.get("known_planets", {}):
		known_planets[String(id)] = PlanetSeedResource.from_dict(d["known_planets"][id])
	for id in d.get("summaries", {}):
		summaries[String(id)] = PlanetSummaryResource.from_dict(d["summaries"][id])


func debug_summary() -> String:
	return "PlanetManager: %d known, %d visited, active '%s'" % [
		known_planets.size(), summaries.size(),
		active_planet_id if active_planet_id != "" else "<in transit>",
	]
