extends RefCounted
class_name Ecology

## Seed-static chunk ecology: energy, resources, life, order.
## See docs/superpowers/specs/2026-08-03-ecological-field-design.md

const LIFE_SPAWN_FLOOR := 0.05
const BASE_FAUNA := 8
const MAX_FAUNA := 14

## Fallback personality when biome JSON lacks keys.
const DEFAULT_PERSONALITY := {
	"liveliness": 0.35,
	"forage_bias": 0.35,
	"structure": 0.5,
}

static func empty() -> Dictionary:
	return {"energy": 0.0, "resources": 0.0, "life": 0.0, "order": 0.0}


static func histogram(biomes: PackedStringArray) -> Dictionary:
	var counts := {}
	var n: int = biomes.size()
	if n <= 0:
		return {}
	for id in biomes:
		var s := String(id)
		counts[s] = int(counts.get(s, 0)) + 1
	var hist := {}
	for id in counts:
		hist[id] = float(counts[id]) / float(n)
	return hist


static func personality(biome_id: String) -> Dictionary:
	var b: Dictionary = PlanetGenerator.get_biome(biome_id)
	if b.is_empty():
		return DEFAULT_PERSONALITY.duplicate()
	return {
		"liveliness": float(b.get("liveliness", DEFAULT_PERSONALITY["liveliness"])),
		"forage_bias": float(b.get("forage_bias", DEFAULT_PERSONALITY["forage_bias"])),
		"structure": float(b.get("structure", DEFAULT_PERSONALITY["structure"])),
	}


static func derive(planet: PlanetSeedResource, _coord: Vector2i, hist: Dictionary) -> Dictionary:
	if planet == null:
		return empty()
	if hist.is_empty():
		hist = {"biome_barrens": 1.0}

	var L_biome := 0.0
	var F_biome := 0.0
	var S_biome := 0.0
	for id in hist:
		var w := float(hist[id])
		var p := personality(String(id))
		L_biome += w * float(p["liveliness"])
		F_biome += w * float(p["forage_bias"])
		S_biome += w * float(p["structure"])

	var E_planet := PlanetGenerator.liveability(planet)
	var energy := clampf(0.25 + 0.75 * E_planet * (0.5 + 0.5 * L_biome), 0.0, 1.0)

	var forage_ab := _forage_abundance(planet)
	var geo_ab := _geologic_abundance(planet)
	var resources := clampf(F_biome * forage_ab + (1.0 - F_biome) * geo_ab, 0.0, 1.0)

	var hazard_load := _hazard_load(planet)
	var life := clampf(energy * L_biome * (1.0 - 0.55 * hazard_load), 0.0, 1.0)
	life = minf(life, energy)

	var order := clampf(S_biome * (0.5 + 0.5 * energy) - 0.45 * hazard_load, 0.0, 1.0)

	return {
		"energy": energy,
		"resources": resources,
		"life": life,
		"order": order,
	}


static func expected_fauna(life: float, planet_scale: float = 1.0) -> int:
	if life < LIFE_SPAWN_FLOOR:
		return 0
	var n := int(round(float(BASE_FAUNA) * life * maxf(0.0, planet_scale)))
	return clampi(n, 0, MAX_FAUNA)


static func food_signal(eco: Dictionary) -> float:
	var resources := float(eco.get("resources", 0.0))
	var life := float(eco.get("life", 0.0))
	# Minerals are not meals. Life gates forage so ore barrens stay food-poor
	# even when `resources` is high (see ecological-field design §3/§4).
	return clampf(resources * life, 0.0, 1.0)


static func hazard_blend(biome_hazard: float, order: float, planet_hazard_load: float, k: float = 0.7) -> float:
	return maxf(biome_hazard, (1.0 - order) * planet_hazard_load * k)


static func yield_mult(resources: float) -> float:
	return 0.4 + 0.6 * clampf(resources, 0.0, 1.0)


static func _hazard_load(planet: PlanetSeedResource) -> float:
	var total := 0.0
	var n := 0
	for key in planet.hazard_profile:
		total += float(planet.hazard_profile[key])
		n += 1
	if n == 0:
		return 0.0
	return clampf(total / float(n), 0.0, 1.0)


static func _forage_abundance(planet: PlanetSeedResource) -> float:
	var a := planet.resource_abundance
	var forage := float(a.get("forage", 0.0))
	var grain := float(a.get("grain", 0.0))
	var reed := float(a.get("reed", 0.0))
	return clampf((forage + grain * 0.5 + reed * 0.4) / 2.2, 0.05, 1.0)


static func _geologic_abundance(planet: PlanetSeedResource) -> float:
	var a := planet.resource_abundance
	var ore := float(a.get("ore_ferrite", 0.0))
	var silica := float(a.get("silica", 0.0))
	var sulfur := float(a.get("sulfur", 0.0))
	return clampf((ore + silica + sulfur) / 3.0, 0.05, 1.0)