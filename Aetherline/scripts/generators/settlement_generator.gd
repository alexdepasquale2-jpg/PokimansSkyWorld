extends RefCounted
class_name SettlementGenerator

## Procedural village from a planet seed — permanent fact of the world.
## Grown (not gridded): plaza, radial rings, paths, gardens, lookouts.
## Culture id is deterministic so the village's shared brain survives jumps.

const BUILDINGS_FILE := "res://data/settlements/buildings.json"
static var catalog: Dictionary = {}

const RING_STEP := 7
const PLAZA_RADIUS := 5


static func load_catalog() -> void:
	if not catalog.is_empty():
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(BUILDINGS_FILE))
	if typeof(parsed) != TYPE_ARRAY:
		push_error("SettlementGenerator: buildings.json missing or malformed")
		return
	for entry in parsed:
		catalog[String(entry["id"])] = entry


static func get_building(id) -> Dictionary:
	load_catalog()
	return catalog.get(String(id), {})


## 0 camp · 1 hamlet · 2 village · 3 town
static func tier_for(planet: PlanetSeedResource) -> int:
	var bonus := 0
	# Ship contact beacon raises how developed natives appear when you land.
	# (Checked softly — no ship required for pure generation.)
	if planet.habitability > 0.55:
		bonus = 1
	if planet.habitability > 0.45:
		return mini(3, 2 + bonus)
	if planet.habitability > 0.22:
		return mini(3, 1 + bonus)
	if planet.habitability > 0.10:
		return 0
	return 0


static func has_settlement(planet: PlanetSeedResource) -> bool:
	return planet.habitability > 0.08


## Ethos colors how the village lives and what its culture leans toward.
static func ethos_for(planet: PlanetSeedResource, rng: RandomNumberGenerator) -> String:
	var hazards: Dictionary = planet.hazard_profile
	if float(hazards.get("predators", 0.0)) > 0.4 or float(hazards.get("cold_snap", 0.0)) > 0.45:
		return "wary"
	if planet.hydrosphere_fraction > 0.55 and planet.habitability > 0.35:
		return "tender"
	if float(planet.resource_abundance.get("ore_ferrite", 0.0)) > 1.0 \
			or float(planet.resource_abundance.get("silica", 0.0)) > 1.0:
		return "maker"
	if planet.fauna_species_count >= 8:
		return "herder"
	var roll := rng.randf()
	if roll < 0.25:
		return "trader"
	if roll < 0.5:
		return "scavenger"
	if roll < 0.75:
		return "keeper"
	return "wanderer"


## Full deterministic layout.
## {
##   name, tier, ethos, culture_id, culture_name, origin,
##   buildings: [...], paths: [[x0,y0,x1,y1],...],
##   landmarks: [{kind, cell}], population, specialty
## }
static func generate(planet: PlanetSeedResource) -> Dictionary:
	load_catalog()
	if not has_settlement(planet):
		return {}

	var rng := planet.rng_for("settlement")
	var tier := tier_for(planet)
	var ethos := ethos_for(planet, rng)
	var origin := Vector2i(rng.randi_range(-48, 48), rng.randi_range(-48, 48))
	var name := _settlement_name(rng, tier, ethos)
	var culture_id := "culture_settlement_%s" % planet.planet_id
	var culture_name := "%s folk" % name

	var wanted: int = [3, 6, 10, 14][clampi(tier, 0, 3)]
	# Ethos biases the building queue.
	var priority := _priority_for(ethos, tier)
	var queue: Array = []
	for id in priority:
		if int(get_building(id).get("min_tier", 0)) <= tier:
			queue.append(id)
	while queue.size() < wanted:
		queue.append("bld_dwelling")
	# Always at least one lookout on wary worlds, one garden on tender.
	if ethos == "wary" and not queue.has("bld_lookout") and tier >= 0:
		queue[mini(1, queue.size() - 1)] = "bld_lookout"
	if ethos == "tender" and not queue.has("bld_garden"):
		queue[mini(2, queue.size() - 1)] = "bld_garden"
	queue = queue.slice(0, wanted)

	var placed: Array = []
	var occupied := {}
	var ring := 1
	for building_id in queue:
		var definition := get_building(building_id)
		if definition.is_empty():
			continue
		var footprint := Vector2i(int(definition["footprint"][0]), int(definition["footprint"][1]))
		var found: Variant = _find_slot(origin, footprint, occupied, rng, ring)
		if found == null:
			ring += 1
			found = _find_slot(origin, footprint, occupied, rng, ring)
		if found == null:
			continue
		var cell: Vector2i = found
		for c in _cells(cell, footprint):
			occupied["%d,%d" % [c.x, c.y]] = true
		var npc_seed := rng.randi()
		placed.append({
			"building_id": building_id,
			"cell": [cell.x, cell.y],
			"footprint": [footprint.x, footprint.y],
			"npc_name": _npc_name(rng, ethos),
			"npc_role": String(definition.get("role", "Resident")),
			"npc_seed": npc_seed,
			"work": String(definition.get("work", "home")),
			"roof": String(definition.get("roof", "gable")),
		})
		if placed.size() % 3 == 0:
			ring += 1

	var paths: Array = []
	for entry in placed:
		var cell := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
		var fp := Vector2i(int(entry["footprint"][0]), int(entry["footprint"][1]))
		var door := Vector2i(cell.x + fp.x / 2, cell.y + fp.y)
		paths.append([origin.x, origin.y, door.x, door.y])

	var landmarks: Array = _landmarks(origin, ethos, tier, rng, occupied)

	var specialty_map := {
		"wary": "watchfulness",
		"tender": "cultivation",
		"maker": "craft",
		"herder": "husbandry",
		"trader": "trade",
		"scavenger": "foraging",
		"keeper": "memory",
		"wanderer": "travel",
	}
	var specialty: String = String(specialty_map.get(ethos, "survival"))

	var population := placed.size() + rng.randi_range(1, 2 + tier)

	return {
		"name": name,
		"tier": tier,
		"ethos": ethos,
		"culture_id": culture_id,
		"culture_name": culture_name,
		"origin": [origin.x, origin.y],
		"buildings": placed,
		"paths": paths,
		"landmarks": landmarks,
		"population": population,
		"specialty": specialty,
		"planet_id": planet.planet_id,
	}


static func _priority_for(ethos: String, tier: int) -> Array:
	var base: Array = ["bld_hall", "bld_trade_post", "bld_stable", "bld_infirmary",
		"bld_workshop", "bld_lookout", "bld_garden"]
	match ethos:
		"wary":
			base = ["bld_lookout", "bld_hall", "bld_infirmary", "bld_trade_post",
				"bld_stable", "bld_workshop", "bld_warehouse"]
		"tender":
			base = ["bld_garden", "bld_nursery", "bld_hall", "bld_stable",
				"bld_trade_post", "bld_infirmary", "bld_workshop"]
		"maker":
			base = ["bld_workshop", "bld_warehouse", "bld_trade_post", "bld_hall",
				"bld_infirmary", "bld_stable", "bld_archive"]
		"herder":
			base = ["bld_stable", "bld_garden", "bld_hall", "bld_trade_post",
				"bld_nursery", "bld_infirmary", "bld_lookout"]
		"trader":
			base = ["bld_trade_post", "bld_warehouse", "bld_hall", "bld_workshop",
				"bld_stable", "bld_infirmary", "bld_archive"]
		"keeper":
			base = ["bld_shrine", "bld_archive", "bld_hall", "bld_nursery",
				"bld_trade_post", "bld_infirmary", "bld_garden"]
		"scavenger":
			base = ["bld_trade_post", "bld_workshop", "bld_lookout", "bld_hall",
				"bld_infirmary", "bld_warehouse", "bld_stable"]
	if tier >= 1:
		base.append("bld_archive")
		base.append("bld_warehouse")
		base.append("bld_nursery")
	if tier >= 2:
		base.append("bld_shrine")
	return base


static func _landmarks(origin: Vector2i, ethos: String, tier: int,
		rng: RandomNumberGenerator, occupied: Dictionary) -> Array:
	var out: Array = []
	# Central hearth always.
	out.append({"kind": "hearth", "cell": [origin.x, origin.y]})
	# Well near plaza.
	var well := origin + Vector2i(rng.randi_range(-3, 3), rng.randi_range(-3, 3))
	if well != origin:
		out.append({"kind": "well", "cell": [well.x, well.y]})
	# Totem / bone pile / garden beds by ethos.
	var kind_map := {
		"wary": "watch_post",
		"tender": "garden_bed",
		"maker": "anvil",
		"herder": "pen_fence",
		"trader": "stall",
		"keeper": "totem",
		"scavenger": "scrap_pile",
		"wanderer": "marker_stone",
	}
	var extra_kind: String = String(kind_map.get(ethos, "marker_stone"))
	for i in (1 + tier):
		var ang := rng.randf() * TAU
		var r := PLAZA_RADIUS + 2 + rng.randi_range(0, 4)
		var cell := origin + Vector2i(int(cos(ang) * r), int(sin(ang) * r))
		var key := "%d,%d" % [cell.x, cell.y]
		if occupied.has(key):
			continue
		out.append({"kind": extra_kind, "cell": [cell.x, cell.y]})
	return out


static func _find_slot(origin: Vector2i, footprint: Vector2i, occupied: Dictionary,
		rng: RandomNumberGenerator, ring: int) -> Variant:
	for attempt in 48:
		var radius := PLAZA_RADIUS + ring * RING_STEP + rng.randi_range(0, 3)
		var angle := rng.randf() * TAU
		var cell := origin + Vector2i(
			int(cos(angle) * float(radius)), int(sin(angle) * float(radius)))
		var clear := true
		for c in _cells(cell - Vector2i.ONE, footprint + Vector2i(2, 2)):
			if occupied.has("%d,%d" % [c.x, c.y]):
				clear = false
				break
		if clear:
			return cell
	return null


static func _cells(origin: Vector2i, footprint: Vector2i) -> Array:
	var out: Array = []
	for y in footprint.y:
		for x in footprint.x:
			out.append(origin + Vector2i(x, y))
	return out


const _PREFIX := ["Ash", "Cold", "Stone", "Far", "Low", "Bright", "Iron", "Salt",
	"Green", "Old", "Kel", "Vane", "Thorn", "Moss", "Reed", "Dust"]
const _SUFFIX := ["hollow", "reach", "ford", "gate", "rest", "market", "watch",
	"barrow", "landing", "crossing", "hearth", "fold", "camp", "rise"]

static func _settlement_name(rng: RandomNumberGenerator, tier: int, ethos: String) -> String:
	var base: String = _PREFIX[rng.randi() % _PREFIX.size()] \
		+ _SUFFIX[rng.randi() % _SUFFIX.size()]
	var titles: Array[String] = ["Camp ", "Hamlet of ", "", "Town of "]
	var title: String = titles[clampi(tier, 0, 3)]
	if ethos == "wary" and rng.randf() < 0.4:
		return base + " Watch"
	return title + base


const _NAMES_COMMON := ["Halden", "Mora", "Tesk", "Vinn", "Ordrey", "Sella", "Brack",
	"Ilm", "Rowan", "Kesh", "Dana", "Peth", "Oswin", "Marra", "Eira", "Torvin"]
const _NAMES_WARY := ["Skarn", "Vetch", "Harrow", "Nim", "Creed", "Ulsa"]
const _NAMES_TENDER := ["Lina", "Sol", "Mira", "Fen", "Asha", "Pell"]

static func _npc_name(rng: RandomNumberGenerator, ethos: String) -> String:
	var pool: Array = _NAMES_COMMON
	if ethos == "wary" and rng.randf() < 0.5:
		pool = _NAMES_WARY
	elif ethos == "tender" and rng.randf() < 0.5:
		pool = _NAMES_TENDER
	return pool[rng.randi() % pool.size()]


## Human-readable tier label for UI.
static func tier_name(tier: int) -> String:
	return ["camp", "hamlet", "village", "town"][clampi(tier, 0, 3)]
