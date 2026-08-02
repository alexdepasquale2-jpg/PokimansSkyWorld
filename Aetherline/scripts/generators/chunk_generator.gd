extends RefCounted
class_name ChunkGenerator

## Builds one 64x64 chunk of surface from the planet seed and the chunk's own
## coordinate. Pure and deterministic: the same (seed, coord) always yields the
## same tiles, which is what lets the streamer throw chunks away freely and the
## save store nothing but the player's edits.
##
## BIOME PLACEMENT is Voronoi regions modulated by noise, per the design:
##   - a cellular noise field carves the map into irregular regions
##   - low-frequency temperature/moisture fields vary across the world
##   - each region picks the biome that best fits its local conditions, weighted
##     by what the planet supports at all
## The Voronoi cells give biomes hard, believable borders; the noise stops those
## borders being polygonal.

const CHUNK_SIZE: int = 64

## Cached per-planet noise generators, keyed by planet_id.
static var _noise_cache: Dictionary = {}


static func _noise_for(planet: PlanetSeedResource) -> Dictionary:
	if _noise_cache.has(planet.planet_id):
		return _noise_cache[planet.planet_id]

	var temperature := FastNoiseLite.new()
	temperature.seed = int(planet.rng_for("field_temp").randi())
	temperature.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	temperature.frequency = 0.004

	var moisture := FastNoiseLite.new()
	moisture.seed = int(planet.rng_for("field_moisture").randi())
	moisture.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	moisture.frequency = 0.005

	var regions := FastNoiseLite.new()
	regions.seed = int(planet.rng_for("field_regions").randi())
	regions.noise_type = FastNoiseLite.TYPE_CELLULAR
	regions.frequency = 0.012
	regions.cellular_return_type = FastNoiseLite.RETURN_CELL_VALUE

	var detail := FastNoiseLite.new()
	detail.seed = int(planet.rng_for("field_detail").randi())
	detail.frequency = 0.06

	var bundle := {"temperature": temperature, "moisture": moisture,
		"regions": regions, "detail": detail}
	_noise_cache[planet.planet_id] = bundle
	return bundle


static func clear_cache() -> void:
	_noise_cache.clear()


## Generate a chunk. Returns:
##   { "coord": Vector2i, "biomes": PackedStringArray (CHUNK_SIZE^2, row-major),
##     "elevation": PackedFloat32Array, "sites": Array }
static func generate(planet: PlanetSeedResource, coord: Vector2i) -> Dictionary:
	var noise := _noise_for(planet)
	var candidates: Array = planet.biome_weights.keys()
	if candidates.is_empty():
		candidates = ["biome_barrens"]

	var biome_ids := PackedStringArray()
	var elevation := PackedFloat32Array()
	biome_ids.resize(CHUNK_SIZE * CHUNK_SIZE)
	elevation.resize(CHUNK_SIZE * CHUNK_SIZE)

	var origin := coord * CHUNK_SIZE
	for y in CHUNK_SIZE:
		for x in CHUNK_SIZE:
			var world_x := float(origin.x + x)
			var world_y := float(origin.y + y)
			var index := y * CHUNK_SIZE + x

			# Region id snaps neighbouring tiles into the same biome decision,
			# which is what produces coherent regions rather than per-tile noise.
			var region: float = (noise["regions"] as FastNoiseLite).get_noise_2d(world_x, world_y)
			var local_temp: float = planet.mean_temperature_c \
				+ (noise["temperature"] as FastNoiseLite).get_noise_2d(world_x, world_y) \
					* planet.temperature_variance \
				+ region * 4.0
			var local_moisture := clampf(
				planet.hydrosphere_fraction
				+ (noise["moisture"] as FastNoiseLite).get_noise_2d(world_x, world_y) * 0.5
				+ region * 0.1, 0.0, 1.0)

			biome_ids[index] = _best_biome(planet, candidates, local_temp, local_moisture)
			elevation[index] = (noise["detail"] as FastNoiseLite).get_noise_2d(world_x, world_y) \
				* (0.4 + planet.tectonic_activity)

	return {
		"coord": coord,
		"biomes": biome_ids,
		"elevation": elevation,
		"sites": _sites_in(planet, coord),
	}


## The candidate biome that best fits local conditions, tie-broken by how much
## of the planet that biome occupies overall.
static func _best_biome(planet: PlanetSeedResource, candidates: Array,
		temperature: float, moisture: float) -> String:
	var best := String(candidates[0])
	var best_score := -1.0
	for id in candidates:
		var b := PlanetGenerator.get_biome(id)
		if b.is_empty():
			continue
		var fit := PlanetGenerator._band_fit(temperature,
				float(b["temp_min"]), float(b["temp_max"]), 12.0) \
			* PlanetGenerator._band_fit(moisture,
				float(b["moisture_min"]), float(b["moisture_max"]), 0.2)
		var score: float = fit * (0.5 + float(planet.biome_weights.get(id, 0.0)))
		if score > best_score:
			best_score = score
			best = String(id)
	return best


## Ruins and anomalies, placed from a per-chunk RNG so a chunk can be discarded
## and regenerated with its sites intact.
static func _sites_in(planet: PlanetSeedResource, coord: Vector2i) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = planet.seed ^ hash("site:%d,%d" % [coord.x, coord.y])
	var sites: Array = []
	if rng.randf() < planet.ruin_density:
		sites.append({"kind": "ruin", "cell": [rng.randi() % CHUNK_SIZE, rng.randi() % CHUNK_SIZE],
			"key": "ruin_%d_%d" % [coord.x, coord.y]})
	if rng.randf() < planet.anomaly_density:
		sites.append({"kind": "anomaly", "cell": [rng.randi() % CHUNK_SIZE, rng.randi() % CHUNK_SIZE],
			"key": "anom_%d_%d" % [coord.x, coord.y]})
	return sites
