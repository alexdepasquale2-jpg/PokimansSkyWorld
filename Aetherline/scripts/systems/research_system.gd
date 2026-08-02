extends RefCounted
class_name ResearchSystem

## Two trees, one currency. Not an autoload (the project holds to a fixed six)
## — a RefCounted the campaign owns, saved via SaveSystem.register_provider
## exactly the way that seam was designed to be used back in Phase 0.

const RESEARCH_FILE := "res://data/research/research.json"
static var catalog: Dictionary = {}

var points: float = 0.0
var unlocked: Array[String] = []
var unlocked_structures: Array[String] = []


static func load_catalog() -> void:
	if not catalog.is_empty():
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(RESEARCH_FILE))
	if typeof(parsed) != TYPE_ARRAY:
		push_error("ResearchSystem: research.json missing or malformed")
		return
	for entry in parsed:
		var n := ResearchNodeResource.from_dict(entry)
		catalog[String(n.id)] = n


static func get_node_def(id) -> ResearchNodeResource:
	load_catalog()
	return catalog.get(String(id))


func add_points(amount: float) -> void:
	points = maxf(0.0, points + amount)


func is_unlocked(id) -> bool:
	return unlocked.has(String(id))


func can_unlock(id) -> bool:
	var node := get_node_def(id)
	if node == null or is_unlocked(id) or points < node.cost:
		return false
	for prereq in node.prerequisites:
		if not is_unlocked(prereq):
			return false
	return true


func unlock(id) -> bool:
	if not can_unlock(id):
		return false
	var node := get_node_def(id)
	points -= node.cost
	unlocked.append(String(id))
	_apply_effects(node)
	EventBus.trace("research_unlocked", {"id": String(id)})
	return true


func _apply_effects(node: ResearchNodeResource) -> void:
	if node.effects.has("mutation_rate_modifier"):
		BreedingSystem.research_mutation_modifier *= float(node.effects["mutation_rate_modifier"])
	if node.effects.has("heritability_bonus"):
		EpigeneticsComponent.research_heritability_bonus += float(node.effects["heritability_bonus"])
	if node.effects.has("unlock_structure"):
		var sid := String(node.effects["unlock_structure"])
		if not unlocked_structures.has(sid):
			unlocked_structures.append(sid)


func structure_available(structure_id) -> bool:
	# Anything without an explicit unlock requirement starts available —
	# a lean-to should not need a tech tree.
	var sid := String(structure_id)
	for id in catalog:
		if String((catalog[id] as ResearchNodeResource).effects.get("unlock_structure", "")) == sid:
			return unlocked_structures.has(sid)
	return true


func nodes_in_branch(branch: String) -> Array:
	load_catalog()
	return catalog.values().filter(func(n): return n.branch == branch)


func to_dict() -> Dictionary:
	return {"points": points, "unlocked": unlocked.duplicate(),
		"unlocked_structures": unlocked_structures.duplicate()}


## Re-applies every already-unlocked node's effects. Required because the
## downstream targets (BreedingSystem.research_mutation_modifier,
## EpigeneticsComponent.research_heritability_bonus) are process-wide statics
## that reset to their defaults on a fresh launch — a loaded save must rebuild
## them from scratch, not merely remember which ids were unlocked.
func from_dict(d: Dictionary) -> void:
	points = float(d.get("points", 0.0))
	unlocked.clear()
	unlocked_structures.clear()
	for id in d.get("unlocked", []):
		unlocked.append(String(id))
	for id in d.get("unlocked_structures", []):
		unlocked_structures.append(String(id))
	for id in unlocked:
		var node := get_node_def(id)
		if node != null:
			_apply_effects(node)
