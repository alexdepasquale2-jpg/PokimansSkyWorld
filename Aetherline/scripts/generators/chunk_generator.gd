extends RefCounted
class_name ChunkGenerator

## Deterministic 64x64 chunk from (planet seed, coord).
## Multi-octave elevation, moisture rivers, and coast bias so the world reads
## like a living continent rather than flat noise tiles.
## PERF: 2x2 biome lattice + cached noise/candidate bands.

const CHUNK_SIZE: int = 64
const BIOME_STEP: int = 2

static var _noise_cache: Dictionary = {}
static var _candidate_cache: Dictionary = {}


static func _noise_for(planet: PlanetSeedResource) -> Dictionary:
	if _noise_cache.has(planet.planet_id):
		return _noise_cache[planet.planet_id]

	var temperature := FastNoiseLite.new()
	temperature.seed = int(planet.rng_for("field_temp").randi())
	temperature.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	temperature.frequency = 0.0035
	temperature.fractal_type = FastNoiseLite.FRACTAL_FBM
	temperature.fractal_octaves = 3

	var moisture := FastNoiseLite.new()
	moisture.seed = int(planet.rng_for("field_moisture").randi())
	moisture.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	moisture.frequency = 0.0045
	moisture.fractal_type = FastNoiseLite.FRACTAL_FBM
	moisture.fractal_octaves = 3

	var regions := FastNoiseLite.new()
	regions.seed = int(planet.rng_for("field_regions").randi())
	regions.noise_type = FastNoiseLite.TYPE_CELLULAR
	regions.frequency = 0.011
	regions.cellular_return_type = FastNoiseLite.RETURN_CELL_VALUE
	regions.cellular_jitter = 0.55

	# Continent-scale massing — the "where land rises" read.
	var continent := FastNoiseLite.new()
	continent.seed = int(planet.rng_for("field_continent").randi())
	continent.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	continent.frequency = 0.0018
	continent.fractal_type = FastNoiseLite.FRACTAL_FBM
	continent.fractal_octaves = 4

	var ridge := FastNoiseLite.new()
	ridge.seed = int(planet.rng_for("field_ridge").randi())
	ridge.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	ridge.frequency = 0.012
	ridge.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	ridge.fractal_octaves = 3

	var detail := FastNoiseLite.new()
	detail.seed = int(planet.rng_for("field_detail").randi())
	detail.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	detail.frequency = 0.055
	detail.fractal_type = FastNoiseLite.FRACTAL_FBM
	detail.fractal_octaves = 2

	# River / drainage field: absolute value of low-freq noise ≈ valley lines.
	var drainage := FastNoiseLite.new()
	drainage.seed = int(planet.rng_for("field_drainage").randi())
	drainage.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	drainage.frequency = 0.008
	drainage.fractal_type = FastNoiseLite.FRACTAL_FBM
	drainage.fractal_octaves = 2

	var warp := FastNoiseLite.new()
	warp.seed = int(planet.rng_for("field_warp").randi())
	warp.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	warp.frequency = 0.01

	var bundle := {
		"temperature": temperature, "moisture": moisture,
		"regions": regions, "continent": continent, "ridge": ridge,
		"detail": detail, "drainage": drainage, "warp": warp,
	}
	_noise_cache[planet.planet_id] = bundle
	return bundle


static func _candidates_for(planet: PlanetSeedResource) -> Array:
	if _candidate_cache.has(planet.planet_id):
		return _candidate_cache[planet.planet_id]
	var out: Array = []
	var keys: Array = planet.biome_weights.keys()
	if keys.is_empty():
		keys = ["biome_barrens"]
	for id in keys:
		var b := PlanetGenerator.get_biome(id)
		if b.is_empty():
			continue
		out.append({
			"id": String(id),
			"temp_min": float(b["temp_min"]),
			"temp_max": float(b["temp_max"]),
			"moist_min": float(b["moisture_min"]),
			"moist_max": float(b["moisture_max"]),
			"weight": 0.5 + float(planet.biome_weights.get(id, 0.0)),
		})
	if out.is_empty():
		out.append({
			"id": "biome_barrens",
			"temp_min": -60.0, "temp_max": 70.0,
			"moist_min": 0.0, "moist_max": 0.3,
			"weight": 1.0,
		})
	_candidate_cache[planet.planet_id] = out
	return out


static func clear_cache() -> void:
	_noise_cache.clear()
	_candidate_cache.clear()


## Returns:
##   coord, biomes, elevation, moisture, sites, ecology, features
static func generate(planet: PlanetSeedResource, coord: Vector2i) -> Dictionary:
	var noise := _noise_for(planet)
	var candidates: Array = _candidates_for(planet)
	var n_temp: FastNoiseLite = noise["temperature"]
	var n_moist: FastNoiseLite = noise["moisture"]
	var n_reg: FastNoiseLite = noise["regions"]
	var n_continent: FastNoiseLite = noise["continent"]
	var n_ridge: FastNoiseLite = noise["ridge"]
	var n_detail: FastNoiseLite = noise["detail"]
	var n_drain: FastNoiseLite = noise["drainage"]
	var n_warp: FastNoiseLite = noise["warp"]
	var mean_t := planet.mean_temperature_c
	var t_var := planet.temperature_variance
	var hydro := planet.hydrosphere_fraction
	var elev_scale := 0.35 + planet.tectonic_activity * 0.9
	var river_strength := clampf(hydro * 1.4 * planet.precipitation_base * 0.5, 0.0, 1.0)

	var biome_ids := PackedStringArray()
	var elevation := PackedFloat32Array()
	var moisture_field := PackedFloat32Array()
	biome_ids.resize(CHUNK_SIZE * CHUNK_SIZE)
	elevation.resize(CHUNK_SIZE * CHUNK_SIZE)
	moisture_field.resize(CHUNK_SIZE * CHUNK_SIZE)

	var origin := coord * CHUNK_SIZE
	# Pass 1: biome lattice at BIOME_STEP (temperature / moisture driven).
	for y in range(0, CHUNK_SIZE, BIOME_STEP):
		for x in range(0, CHUNK_SIZE, BIOME_STEP):
			var world_x := float(origin.x + x)
			var world_y := float(origin.y + y)
			var wx := world_x + n_warp.get_noise_2d(world_x, world_y) * 12.0
			var wy := world_y + n_warp.get_noise_2d(world_x + 50.0, world_y) * 12.0
			var region: float = n_reg.get_noise_2d(wx, wy)
			var cont := n_continent.get_noise_2d(wx * 0.6, wy * 0.6)
			var local_temp: float = mean_t \
				+ n_temp.get_noise_2d(wx, wy) * t_var \
				+ region * 4.0 \
				- cont * 3.0 * elev_scale
			var base_moist := hydro + n_moist.get_noise_2d(wx, wy) * 0.48 + region * 0.08
			# Low elevations / high hydro pull moisture toward shallows/wetland.
			var local_moisture := clampf(base_moist - cont * 0.12, 0.0, 1.0)
			var biome := _best_biome_fast(candidates, local_temp, local_moisture)
			# Coast bias: very low continent + high hydro → shallows.
			if hydro > 0.35 and cont < -0.22 and local_moisture > 0.45:
				if _has_candidate(candidates, "biome_shallows"):
					biome = "biome_shallows"
				elif _has_candidate(candidates, "biome_wetland"):
					biome = "biome_wetland"
			var y_end := mini(y + BIOME_STEP, CHUNK_SIZE)
			var x_end := mini(x + BIOME_STEP, CHUNK_SIZE)
			for yy in range(y, y_end):
				var row := yy * CHUNK_SIZE
				for xx in range(x, x_end):
					biome_ids[row + xx] = biome
					moisture_field[row + xx] = local_moisture

	# Pass 2: multi-octave elevation + river carving (per-cell).
	for y in CHUNK_SIZE:
		var row := y * CHUNK_SIZE
		var world_y := float(origin.y + y)
		for x in CHUNK_SIZE:
			var world_x := float(origin.x + x)
			var cont := n_continent.get_noise_2d(world_x * 0.6, world_y * 0.6)
			var ridge := absf(n_ridge.get_noise_2d(world_x, world_y))
			var micro := n_detail.get_noise_2d(world_x, world_y)
			var elev := cont * 0.55 + ridge * 0.35 * elev_scale + micro * 0.22 * elev_scale

			# River valleys: narrow corridors of lowered elevation when hydro allows.
			if river_strength > 0.12:
				var drain := absf(n_drain.get_noise_2d(world_x, world_y))
				var valley := smoothstep_local(0.12, 0.0, drain)  # peak at 0
				elev -= valley * river_strength * 0.55
				if valley > 0.35 and moisture_field[row + x] > 0.25:
					moisture_field[row + x] = clampf(moisture_field[row + x] + valley * 0.35, 0.0, 1.0)
					# Carve wet biomes into river corridors when candidates allow.
					if valley > 0.55 and hydro > 0.3:
						var wet_id := _river_biome(candidates, mean_t)
						if not wet_id.is_empty() and String(biome_ids[row + x]) != "biome_shallows":
							biome_ids[row + x] = wet_id

			elevation[row + x] = elev

	var hist := Ecology.histogram(biome_ids)
	var ecology := Ecology.derive(planet, coord, hist)
	var sites := _sites_in(planet, coord, elevation, biome_ids)
	var features := _features_in(planet, coord, elevation, moisture_field, river_strength)

	return {
		"coord": coord,
		"biomes": biome_ids,
		"elevation": elevation,
		"moisture": moisture_field,
		"sites": sites,
		"ecology": ecology,
		"features": features,
	}


static func smoothstep_local(edge0: float, edge1: float, x: float) -> float:
	var t := clampf((x - edge0) / maxf(0.0001, edge1 - edge0), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


static func _has_candidate(candidates: Array, id: String) -> bool:
	for c in candidates:
		if String(c["id"]) == id:
			return true
	return false


static func _river_biome(candidates: Array, mean_t: float) -> String:
	if mean_t < -5.0 and _has_candidate(candidates, "biome_tundra"):
		return "biome_tundra"
	if _has_candidate(candidates, "biome_wetland"):
		return "biome_wetland"
	if _has_candidate(candidates, "biome_shallows"):
		return "biome_shallows"
	if _has_candidate(candidates, "biome_forest"):
		return "biome_forest"
	return ""


static func _best_biome_fast(candidates: Array, temperature: float, moisture: float) -> String:
	var best_id: String = candidates[0]["id"]
	var best_score := -1.0
	for c in candidates:
		var fit := _band_fit(temperature, c["temp_min"], c["temp_max"], 12.0) \
			* _band_fit(moisture, c["moist_min"], c["moist_max"], 0.2)
		var score: float = fit * c["weight"]
		if score > best_score:
			best_score = score
			best_id = c["id"]
	return best_id


static func _best_biome(planet: PlanetSeedResource, candidates: Array,
		temperature: float, moisture: float) -> String:
	var resolved: Array = []
	for id in candidates:
		var b := PlanetGenerator.get_biome(id)
		if b.is_empty():
			continue
		resolved.append({
			"id": String(id),
			"temp_min": float(b["temp_min"]),
			"temp_max": float(b["temp_max"]),
			"moist_min": float(b["moisture_min"]),
			"moist_max": float(b["moisture_max"]),
			"weight": 0.5 + float(planet.biome_weights.get(id, 0.0)),
		})
	if resolved.is_empty():
		return "biome_barrens"
	return _best_biome_fast(resolved, temperature, moisture)


static func _band_fit(value: float, lo: float, hi: float, soft: float) -> float:
	if value >= lo and value <= hi:
		return 1.0
	if value < lo:
		return clampf(1.0 - (lo - value) / soft, 0.0, 1.0)
	return clampf(1.0 - (value - hi) / soft, 0.0, 1.0)


static func _sites_in(planet: PlanetSeedResource, coord: Vector2i,
		elevation: PackedFloat32Array, biome_ids: PackedStringArray) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = planet.seed ^ hash("site:%d,%d" % [coord.x, coord.y])
	var sites: Array = []
	if rng.randf() < planet.ruin_density:
		var cell := _pick_elevated_cell(rng, elevation, biome_ids, false)
		sites.append({
			"kind": "ruin",
			"cell": [cell.x, cell.y],
			"key": "ruin_%d_%d" % [coord.x, coord.y],
		})
	if rng.randf() < planet.anomaly_density:
		var cell2 := _pick_elevated_cell(rng, elevation, biome_ids, true)
		sites.append({
			"kind": "anomaly",
			"cell": [cell2.x, cell2.y],
			"key": "anom_%d_%d" % [coord.x, coord.y],
		})
	# Occasional high-ground lookout — Odyssey "climb and survey" beat.
	if rng.randf() < 0.08 + planet.tectonic_activity * 0.1:
		var peak := _find_local_peak(elevation)
		sites.append({
			"kind": "lookout",
			"cell": [peak.x, peak.y],
			"key": "look_%d_%d" % [coord.x, coord.y],
		})
	return sites


static func _features_in(planet: PlanetSeedResource, coord: Vector2i,
		elevation: PackedFloat32Array, moisture: PackedFloat32Array,
		river_strength: float) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = planet.seed ^ hash("feat:%d,%d" % [coord.x, coord.y])
	var features: Array = []
	# Sparse landmark rocks / bone piles for survival texture.
	var count := rng.randi_range(0, 2 + int(planet.tectonic_activity * 2.0))
	for i in count:
		var cx := rng.randi() % CHUNK_SIZE
		var cy := rng.randi() % CHUNK_SIZE
		var elev := elevation[cy * CHUNK_SIZE + cx]
		if elev < -0.1:
			continue
		features.append({
			"kind": "rock" if elev > 0.15 else "bone",
			"cell": [cx, cy],
		})
	if river_strength > 0.4 and rng.randf() < 0.35:
		var cx2 := rng.randi() % CHUNK_SIZE
		var cy2 := rng.randi() % CHUNK_SIZE
		if moisture[cy2 * CHUNK_SIZE + cx2] > 0.45:
			features.append({"kind": "pool", "cell": [cx2, cy2]})
	return features


static func _pick_elevated_cell(rng: RandomNumberGenerator, elevation: PackedFloat32Array,
		_biome_ids: PackedStringArray, prefer_low: bool) -> Vector2i:
	var best := Vector2i(rng.randi() % CHUNK_SIZE, rng.randi() % CHUNK_SIZE)
	var best_v := elevation[best.y * CHUNK_SIZE + best.x]
	for _i in 6:
		var c := Vector2i(rng.randi() % CHUNK_SIZE, rng.randi() % CHUNK_SIZE)
		var v := elevation[c.y * CHUNK_SIZE + c.x]
		if prefer_low and v < best_v:
			best = c
			best_v = v
		elif not prefer_low and v > best_v:
			best = c
			best_v = v
	return best


static func _find_local_peak(elevation: PackedFloat32Array) -> Vector2i:
	var best := Vector2i(CHUNK_SIZE / 2, CHUNK_SIZE / 2)
	var best_v := -999.0
	# Sparse sample for speed.
	for y in range(4, CHUNK_SIZE - 4, 4):
		for x in range(4, CHUNK_SIZE - 4, 4):
			var v := elevation[y * CHUNK_SIZE + x]
			if v > best_v:
				best_v = v
				best = Vector2i(x, y)
	return best
