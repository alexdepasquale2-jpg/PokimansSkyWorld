extends RefCounted
class_name SettlementGenerator

## Procedurally lays out a settlement — deterministic from the planet seed, so
## a town is a permanent fact about a world rather than something spawned when
## you look at it.
##
## LAYOUT: buildings are placed by radial growth outward from a plaza, each one
## pushed to the first free ring position that fits its footprint. That gives
## the organic, grown-not-planned feel of a Minecraft village while keeping
## roads implicit (the gaps between rings) — no rigid Pokemon-town grid, but
## also nothing overlapping.
##
## TIER scales with the planet's habitability: a comfortable world supports a
## proper town with an archive and a warehouse; a hostile one gets a hamlet of
## dwellings, a trade post and little else.

const BUILDINGS_FILE := "res://data/settlements/buildings.json"
static var catalog: Dictionary = {}

## Tiles between concentric rings — the implicit street width.
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


## How developed a settlement on this world can be: 0 hamlet, 1 village, 2 town.
static func tier_for(planet: PlanetSeedResource) -> int:
	if planet.habitability > 0.45:
		return 2
	if planet.habitability > 0.2:
		return 1
	return 0


## Does this world have a settlement at all? Dead worlds do not.
static func has_settlement(planet: PlanetSeedResource) -> bool:
	return planet.habitability > 0.08


## Full deterministic layout. Returns:
##   { "name": String, "tier": int, "origin": Vector2i (tile coords),
##     "buildings": [ {building_id, cell, footprint, npc_name, npc_role} ] }
static func generate(planet: PlanetSeedResource) -> Dictionary:
	load_catalog()
	if not has_settlement(planet):
		return {}

	var rng := planet.rng_for("settlement")
	var tier := tier_for(planet)
	# Placed away from the landing point so arriving somewhere is a journey,
	# but close enough to find without a compass.
	var origin := Vector2i(rng.randi_range(-40, 40), rng.randi_range(-40, 40))

	var wanted: int = [4, 7, 11][tier]
	var placed: Array = []
	var occupied := {}
	var ring := 1

	# Guarantee the settlement's defining services exist before filling out
	# with dwellings — a village without a trade post is just houses.
	var priority := ["bld_trade_post", "bld_hall", "bld_stable", "bld_infirmary",
		"bld_workshop", "bld_archive", "bld_warehouse", "bld_shrine"]
	var queue: Array = []
	for id in priority:
		if int(get_building(id).get("min_tier", 0)) <= tier:
			queue.append(id)
	while queue.size() < wanted:
		queue.append("bld_dwelling")
	queue = queue.slice(0, wanted)

	for building_id in queue:
		var definition := get_building(building_id)
		var footprint := Vector2i(int(definition["footprint"][0]), int(definition["footprint"][1]))
		var found: Variant = _find_slot(origin, footprint, occupied, rng, ring)
		if found == null:
			continue
		var cell: Vector2i = found
		for c in _cells(cell, footprint):
			occupied["%d,%d" % [c.x, c.y]] = true
		placed.append({
			"building_id": building_id,
			"cell": [cell.x, cell.y],
			"footprint": [footprint.x, footprint.y],
			"npc_name": _npc_name(rng),
			"npc_role": String(definition.get("role", "Resident")),
		})
		if placed.size() % 3 == 0:
			ring += 1

	return {
		"name": _settlement_name(rng, tier),
		"tier": tier,
		"origin": [origin.x, origin.y],
		"buildings": placed,
	}


## Walks positions around a ring looking for one where the footprint fits.
## Returns null if the ring is full — the caller widens and retries.
static func _find_slot(origin: Vector2i, footprint: Vector2i, occupied: Dictionary,
		rng: RandomNumberGenerator, ring: int) -> Variant:
	for attempt in 40:
		var radius := PLAZA_RADIUS + ring * RING_STEP + rng.randi_range(0, 3)
		var angle := rng.randf() * TAU
		var cell := origin + Vector2i(
			int(cos(angle) * float(radius)), int(sin(angle) * float(radius)))
		var clear := true
		# Leave a one-tile gap so buildings never share a wall — that gap is
		# what reads as a street.
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
	"Green", "Old", "Kel", "Vane"]
const _SUFFIX := ["hollow", "reach", "ford", "gate", "rest", "market", "watch",
	"barrow", "landing", "crossing"]

static func _settlement_name(rng: RandomNumberGenerator, tier: int) -> String:
	var base: String = _PREFIX[rng.randi() % _PREFIX.size()] \
		+ _SUFFIX[rng.randi() % _SUFFIX.size()]
	return base + ["", "", ""][tier]


const _NAMES := ["Halden", "Mora", "Tesk", "Vinn", "Ordrey", "Sella", "Brack",
	"Ilm", "Rowan", "Kesh", "Dana", "Peth", "Oswin", "Marra"]

static func _npc_name(rng: RandomNumberGenerator) -> String:
	return _NAMES[rng.randi() % _NAMES.size()]
