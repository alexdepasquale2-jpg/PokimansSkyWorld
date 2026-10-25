extends Resource
class_name StructureDefinitionResource

## Catalog definition of a placeable structure. No room formulas, no snapping
## to a fixed grid of "buildings" — a structure is just a footprint and a
## cost, and the player decides what pattern of them means "base".

@export var id: StringName = &""
@export var display_name: String = ""
@export_multiline var description: String = ""
@export var category: String = "shelter"  ## shelter, storage, work, defense, husbandry

## Footprint in tiles, e.g. Vector2i(2,2). Placement checks this against
## occupied cells — nothing enforces adjacency, rooms, or a layout grammar.
@export var footprint: Vector2i = Vector2i(1, 1)

## resource_id -> amount required to build.
@export var build_cost: Dictionary = {}

## What standing here does, read by WorkComponent/colony systems:
## { "work_bonus": {"haul": 0.2}, "storage_capacity": 200.0, "shelter": 0.5 }
@export var effects: Dictionary = {}

@export var tags: Array[StringName] = []


func to_dict() -> Dictionary:
	return {
		"id": String(id), "display_name": display_name, "description": description,
		"category": category, "footprint": [footprint.x, footprint.y],
		"build_cost": build_cost.duplicate(true), "effects": effects.duplicate(true),
		"tags": tags.map(func(t): return String(t)),
	}


static func from_dict(d: Dictionary) -> StructureDefinitionResource:
	var s := StructureDefinitionResource.new()
	s.id = StringName(d.get("id", ""))
	s.display_name = String(d.get("display_name", ""))
	s.description = String(d.get("description", ""))
	s.category = String(d.get("category", "shelter"))
	var fp: Array = d.get("footprint", [1, 1])
	s.footprint = Vector2i(int(fp[0]), int(fp[1]))
	s.build_cost = d.get("build_cost", {}).duplicate(true)
	s.effects = d.get("effects", {}).duplicate(true)
	for t in d.get("tags", []):
		s.tags.append(StringName(t))
	return s
