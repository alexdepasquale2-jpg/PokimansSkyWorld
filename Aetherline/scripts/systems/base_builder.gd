extends RefCounted
class_name BaseBuilder

## Flexible, tile-based placement — no room grammar, no forced adjacency.
## A "base" is whatever pattern of structures the player put down. Persists
## directly into PlanetSummaryResource.structures, which already existed as a
## Phase 0 field waiting for exactly this.

const STRUCTURES_FILE := "res://data/colony/structures.json"
static var catalog: Dictionary = {}


static func load_catalog() -> void:
	if not catalog.is_empty():
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(STRUCTURES_FILE))
	if typeof(parsed) != TYPE_ARRAY:
		push_error("BaseBuilder: structures.json missing or malformed")
		return
	for entry in parsed:
		var s := StructureDefinitionResource.from_dict(entry)
		catalog[String(s.id)] = s


static func get_structure(id) -> StructureDefinitionResource:
	load_catalog()
	return catalog.get(String(id))


## Cells this structure would occupy if placed with its origin at `cell`.
static func footprint_cells(structure: StructureDefinitionResource, cell: Vector2i) -> Array:
	var cells: Array = []
	for y in structure.footprint.y:
		for x in structure.footprint.x:
			cells.append(cell + Vector2i(x, y))
	return cells


## True if every cell the structure needs is empty in this summary.
static func can_place(summary: PlanetSummaryResource, structure_id, cell: Vector2i) -> bool:
	var structure := get_structure(structure_id)
	if structure == null:
		return false
	var occupied := _occupied_cells(summary)
	for c in footprint_cells(structure, cell):
		if occupied.has("%d,%d" % [c.x, c.y]):
			return false
	return true


## Places the structure, checking cost against `resources` (mutated in place —
## caller owns the colony's stockpile) and footprint collision.
## Returns "" on success, or a reason string on failure.
static func place(summary: PlanetSummaryResource, structure_id, cell: Vector2i,
		resources: Dictionary) -> String:
	var structure := get_structure(structure_id)
	if structure == null:
		return "unknown structure"
	if not can_place(summary, structure_id, cell):
		return "footprint blocked"
	for res_id in structure.build_cost:
		if float(resources.get(res_id, 0.0)) < float(structure.build_cost[res_id]):
			return "insufficient %s" % res_id
	for res_id in structure.build_cost:
		resources[res_id] = float(resources[res_id]) - float(structure.build_cost[res_id])

	summary.structures.append({
		"cell": [cell.x, cell.y], "structure_id": String(structure_id), "state": {},
	})
	EventBus.trace("structure_placed", {"id": String(structure_id), "cell": str(cell)})
	return ""


static func remove_at(summary: PlanetSummaryResource, cell: Vector2i) -> bool:
	for i in summary.structures.size():
		var entry: Dictionary = summary.structures[i]
		var origin := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
		var structure := get_structure(entry["structure_id"])
		if structure == null:
			continue
		if footprint_cells(structure, origin).any(func(c): return c == cell):
			summary.structures.remove_at(i)
			return true
	return false


static func _occupied_cells(summary: PlanetSummaryResource) -> Dictionary:
	var occupied := {}
	for entry in summary.structures:
		var origin := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
		var structure := get_structure(entry["structure_id"])
		if structure == null:
			continue
		for c in footprint_cells(structure, origin):
			occupied["%d,%d" % [c.x, c.y]] = true
	return occupied


## Sum of one effect across every structure standing, e.g. total shelter or
## total work_bonus.craft. `path` is dot-separated: "work_bonus.craft".
static func total_effect(summary: PlanetSummaryResource, path: String) -> float:
	var parts := path.split(".")
	var total := 0.0
	for entry in summary.structures:
		var structure := get_structure(entry["structure_id"])
		if structure == null:
			continue
		var value: Variant = structure.effects
		var ok := true
		for part in parts:
			if typeof(value) == TYPE_DICTIONARY and (value as Dictionary).has(part):
				value = (value as Dictionary)[part]
			else:
				ok = false
				break
		if ok and (typeof(value) == TYPE_FLOAT or typeof(value) == TYPE_INT):
			total += float(value)
	return total
