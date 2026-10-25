extends RefCounted
class_name PlanetGenerator

## Deterministic planet derivation: one 64-bit seed in, a whole world out.
##
## CONTRACT: idempotent and stage-isolated. Every stage draws from its own named
## RNG stream (`seed.rng_for("climate")`), so changing the climate model can
## never shift which biomes or fauna a previously-visited world had. That is the
## only reason a save can store a bare seed and trust it.
##
## Stages run in causal order â€” a planet's climate follows from its star and
## orbit, its biomes from its climate, its hazards from its geology, and the
## epigenetic pressure it exerts from all of it.

const BIOME_FILE := "res://data/biomes/biomes.json"

## id -> biome dictionary. Loaded once, shared.
static var biomes: Dictionary = {}


static func load_biomes() -> void:
	if not biomes.is_empty():
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(BIOME_FILE))
	if typeof(parsed) != TYPE_ARRAY:
		push_error("PlanetGenerator: biomes.json missing or malformed")
		return
	for entry in parsed:
		biomes[String(entry["id"])] = entry


static func get_biome(id) -> Dictionary:
	load_biomes()
	return biomes.get(String(id), {})


## Fill in every derived field. Safe to call repeatedly.
static func derive(planet: PlanetSeedResource) -> PlanetSeedResource:
	if planet == null or planet.derived:
		return planet
	load_biomes()

	_star_and_orbit(planet)
	_physical(planet)
	_climate(planet)
	_biomes(planet)
	_resources(planet)
	_hazards(planet)
	_sites(planet)
	_fauna(planet)
	_pressures(planet)
	_habitability(planet)

	if planet.display_name.is_empty():
		planet.display_name = name_for(planet.seed)
	planet.derived = true
	return planet


# --- Stages -------------------------------------------------------------------

static func _star_and_orbit(p: PlanetSeedResource) -> void:
	var rng := p.rng_for("star")
	# Weighted toward the cool, long-lived stars that actually dominate a galaxy.
	var classes := ["M", "M", "M", "K", "K", "G", "F", "A", "B", "X"]
	p.star_class = classes[rng.randi() % classes.size()]
	p.star_luminosity = {
		"M": 0.05, "K": 0.4, "G": 1.0, "F": 2.5, "A": 12.0, "B": 60.0, "X": 0.02,
	}.get(p.star_class, 1.0) * rng.randf_range(0.7, 1.4)

	var orbit := p.rng_for("orbit")
	# Bias the orbit toward where liquid water could exist for this star, then
	# let it wander. Most worlds are still hostile; a few are not.
	var habitable_au: float = sqrt(p.star_luminosity)
	p.orbital_radius_au = maxf(0.05, habitable_au * orbit.randf_range(0.45, 2.2))
	p.orbital_period_days = 365.0 * pow(p.orbital_radius_au, 1.5)
	p.orbital_eccentricity = pow(orbit.randf(), 2.5) * 0.5
	p.axial_tilt_deg = orbit.randf_range(0.0, 65.0)
	p.rotation_period_hours = exp(orbit.randf_range(0.7, 5.2))
	p.moon_count = maxi(0, int(orbit.randfn(1.0, 1.4)))


static func _physical(p: PlanetSeedResource) -> void:
	var rng := p.rng_for("physical")
	p.radius_km = rng.randf_range(2200.0, 11000.0)
	# Gravity scales with radius for a roughly constant density, plus variance.
	p.surface_gravity_g = clampf((p.radius_km / 6371.0) * rng.randf_range(0.75, 1.3), 0.1, 3.2)
	p.atmosphere_density = maxf(0.0, rng.randfn(1.0, 0.7))
	p.magnetosphere_strength = maxf(0.0, rng.randfn(0.9, 0.6))
	p.tectonic_activity = clampf(rng.randf(), 0.0, 1.0)
	p.hydrosphere_fraction = clampf(rng.randfn(0.45, 0.3), 0.0, 0.98)
	if p.atmosphere_density < 0.15:
		p.hydrosphere_fraction *= 0.2  # no air, no standing water
	var o2 := clampf(rng.randfn(0.16, 0.12), 0.0, 0.4)
	p.atmosphere_composition = {"o2": o2, "n2": clampf(1.0 - o2 - 0.05, 0.0, 1.0), "co2": 0.05}


static func _climate(p: PlanetSeedResource) -> void:
	var rng := p.rng_for("climate")
	# Equilibrium temperature from insolation, warmed by greenhouse thickness.
	var insolation: float = p.star_luminosity / maxf(0.01, p.orbital_radius_au * p.orbital_radius_au)
	var base := 278.0 * pow(clampf(insolation, 0.0001, 400.0), 0.25) - 273.0
	p.mean_temperature_c = base + p.atmosphere_density * 22.0 + rng.randf_range(-12.0, 12.0)
	# Tilt drives seasonal contrast; a thick atmosphere and oceans smooth it.
	p.temperature_variance = (8.0 + p.axial_tilt_deg * 0.9) \
		* (1.0 - p.hydrosphere_fraction * 0.35) / maxf(0.3, p.atmosphere_density)
	p.precipitation_base = clampf(p.hydrosphere_fraction * 2.0 * p.atmosphere_density, 0.0, 3.0)
	p.wind_severity = clampf(p.atmosphere_density * 0.5
		+ 24.0 / maxf(1.0, p.rotation_period_hours) + rng.randf_range(-0.2, 0.2), 0.0, 2.0)


static func _biomes(p: PlanetSeedResource) -> void:
	# A biome's weight is how well the planet's average conditions sit inside
	# its tolerance band. Nothing is forced: a world too hot for anything in the
	# catalog gets barrens by default rather than a nonsense assignment.
	var weights := {}
	for id in biomes:
		var b: Dictionary = biomes[id]
		var temp_fit := _band_fit(p.mean_temperature_c,
			float(b["temp_min"]), float(b["temp_max"]), p.temperature_variance)
		var moisture := clampf(p.hydrosphere_fraction * p.precipitation_base, 0.0, 1.0)
		var wet_fit := _band_fit(moisture,
			float(b["moisture_min"]), float(b["moisture_max"]), 0.25)
		var weight := temp_fit * wet_fit
		if weight > 0.02:
			weights[id] = weight
	if weights.is_empty():
		weights["biome_barrens"] = 1.0
	p.biome_weights = weights


## 1.0 fully inside the band, tapering to 0 outside by `tolerance`.
static func _band_fit(value: float, low: float, high: float, tolerance: float) -> float:
	if value >= low and value <= high:
		return 1.0
	var distance: float = (low - value) if value < low else (value - high)
	return clampf(1.0 - distance / maxf(0.001, tolerance), 0.0, 1.0)


static func _resources(p: PlanetSeedResource) -> void:
	var rng := p.rng_for("resources")
	var abundance := {}
	# Resource availability is the union of what the present biomes offer,
	# scaled by geology â€” a tectonically dead world is metal-poor.
	for id in p.biome_weights:
		for key in (get_biome(id).get("resources", {}) as Dictionary):
			abundance[key] = maxf(float(abundance.get(key, 0.0)),
				float(get_biome(id)["resources"][key]) * float(p.biome_weights[id]))
	for key in abundance:
		abundance[key] = float(abundance[key]) * rng.randf_range(0.6, 1.5)
	abundance["ore_ferrite"] = float(abundance.get("ore_ferrite", 0.5)) * (0.5 + p.tectonic_activity)
	p.resource_abundance = abundance


static func _hazards(p: PlanetSeedResource) -> void:
	var rng := p.rng_for("hazards")
	var profile := {}
	for id in p.biome_weights:
		for key in (get_biome(id).get("hazards", {}) as Dictionary):
			profile[key] = maxf(float(profile.get(key, 0.0)),
				float(get_biome(id)["hazards"][key]) * float(p.biome_weights[id]))
	# Planet-wide hazards that no biome owns.
	var radiation := clampf((1.0 - p.magnetosphere_strength) * 0.8
		+ (0.4 if p.star_class in ["B", "A", "X"] else 0.0), 0.0, 1.0)
	if radiation > 0.05:
		profile["radiation"] = maxf(float(profile.get("radiation", 0.0)), radiation)
	if p.tectonic_activity > 0.6:
		profile["quake"] = maxf(float(profile.get("quake", 0.0)), p.tectonic_activity - 0.4)
	if p.atmosphere_density < 0.4:
		profile["thin_atmosphere"] = clampf(0.6 - p.atmosphere_density, 0.0, 1.0)
	if p.surface_gravity_g > 1.5:
		profile["crushing_gravity"] = clampf((p.surface_gravity_g - 1.5) * 0.6, 0.0, 1.0)
	for key in profile:
		profile[key] = clampf(float(profile[key]) * rng.randf_range(0.8, 1.25), 0.0, 1.0)
	p.hazard_profile = profile


static func _sites(p: PlanetSeedResource) -> void:
	var rng := p.rng_for("sites")
	p.ruin_density = pow(rng.randf(), 3.0) * 0.35
	p.anomaly_density = pow(rng.randf(), 4.0) * 0.25


static func _fauna(p: PlanetSeedResource) -> void:
	var rng := p.rng_for("fauna")
	# Life needs somewhere to live. A hostile world carries less of it, and what
	# it does carry has drifted further from the base stock.
	var liveable: float = _liveability(p)
	p.fauna_species_count = maxi(0, int(round(liveable * rng.randf_range(4.0, 14.0))))
	p.fauna_divergence = clampf((1.0 - liveable) * 0.8 + rng.randf_range(0.0, 0.25), 0.0, 1.0)
	# Radiation and stellar hardness raise the mutation rate for anything
	# conceived here â€” the reason a geneticist might deliberately settle a
	# world nobody sane would.
	p.mutation_rate_modifier = clampf(
		0.6 + float(p.hazard_profile.get("radiation", 0.0)) * 3.0
		+ rng.randf_range(-0.1, 0.3), 0.4, 4.0)


static func _pressures(p: PlanetSeedResource) -> void:
	# What this world writes into the bloodlines living on it. Assembled from
	# its biomes plus planet-wide physical facts.
	var pressures := {}
	for id in p.biome_weights:
		for key in (get_biome(id).get("pressures", {}) as Dictionary):
			pressures[key] = maxf(float(pressures.get(key, 0.0)),
				float(get_biome(id)["pressures"][key]) * float(p.biome_weights[id]))
	if p.surface_gravity_g > 1.25:
		pressures["epi_dense_frame"] = clampf((p.surface_gravity_g - 1.0) * 0.7, 0.0, 1.0)
	if p.atmosphere_density < 0.7:
		pressures["epi_thin_air"] = clampf(0.8 - p.atmosphere_density, 0.0, 1.0)
	if p.rotation_period_hours > 60.0:
		pressures["epi_night_shifted"] = clampf(p.rotation_period_hours / 300.0, 0.0, 0.8)
	if p.mean_temperature_c < -5.0:
		pressures["epi_cold_hardening"] = maxf(float(pressures.get("epi_cold_hardening", 0.0)),
			clampf(-p.mean_temperature_c / 50.0, 0.0, 1.0))
	if p.mean_temperature_c > 32.0:
		pressures["epi_heat_hardening"] = maxf(float(pressures.get("epi_heat_hardening", 0.0)),
			clampf((p.mean_temperature_c - 25.0) / 45.0, 0.0, 1.0))
	p.epigenetic_pressures = pressures


static func _habitability(p: PlanetSeedResource) -> void:
	var hazard_load := 0.0
	for key in p.hazard_profile:
		hazard_load += float(p.hazard_profile[key])
	p.habitability = clampf(_liveability(p) - hazard_load * 0.08, 0.0, 1.0)


static func liveability(p: PlanetSeedResource) -> float:
	return _liveability(p)


static func _liveability(p: PlanetSeedResource) -> float:
	var temperature := _band_fit(p.mean_temperature_c, -25.0, 40.0, 30.0)
	var air := _band_fit(p.atmosphere_density, 0.4, 2.5, 0.4)
	var oxygen := _band_fit(float(p.atmosphere_composition.get("o2", 0.0)), 0.12, 0.35, 0.1)
	var gravity := _band_fit(p.surface_gravity_g, 0.4, 1.8, 0.5)
	var water := clampf(p.hydrosphere_fraction * 3.0, 0.0, 1.0)
	return clampf(temperature * air * oxygen * gravity * (0.3 + 0.7 * water), 0.0, 1.0)


# --- Naming -------------------------------------------------------------------

const _SYLLABLES_A := ["Kel", "Ard", "Vos", "Thal", "Mire", "Sethe", "Orun", "Bask",
	"Cind", "Ryn", "Nix", "Peleth", "Iri", "Sael", "Tor", "Venn"]
const _SYLLABLES_B := ["hollow", "vale", "reach", "spire", "mere", "fall", "wound",
	"cradle", "march", "rift", "wake", "shoal", "crown", "ash", "bloom", "dusk"]

static func name_for(seed_value: int) -> String:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value ^ hash("name")
	# Odyssey-style place names: spoken, not serial numbers.
	if rng.randf() < 0.55:
		return "%s%s" % [
			_SYLLABLES_A[rng.randi() % _SYLLABLES_A.size()],
			_SYLLABLES_B[rng.randi() % _SYLLABLES_B.size()],
		]
	return "%s-%s" % [
		_SYLLABLES_A[rng.randi() % _SYLLABLES_A.size()],
		_SYLLABLES_A[rng.randi() % _SYLLABLES_A.size()].to_lower(),
	]
