extends Resource
class_name ResearchNodeResource

@export var id: StringName = &""
@export var display_name: String = ""
@export_multiline var description: String = ""
@export var branch: String = "technological"  ## "technological" or "biological"
@export var cost: float = 100.0
@export var prerequisites: Array[StringName] = []

## What unlocking this actually does. Interpreted by ResearchSystem.apply_effects:
##   "mutation_rate_modifier": multiplies BreedingSystem.research_mutation_modifier
##   "heritability_bonus": added to EpigeneticsComponent.research_heritability_bonus
##   "unlock_structure": StringName, allows that structure to be placed
@export var effects: Dictionary = {}


func to_dict() -> Dictionary:
	return {
		"id": String(id), "display_name": display_name, "description": description,
		"branch": branch, "cost": cost,
		"prerequisites": prerequisites.map(func(p): return String(p)),
		"effects": effects.duplicate(true),
	}


static func from_dict(d: Dictionary) -> ResearchNodeResource:
	var r := ResearchNodeResource.new()
	r.id = StringName(d.get("id", ""))
	r.display_name = String(d.get("display_name", ""))
	r.description = String(d.get("description", ""))
	r.branch = String(d.get("branch", "technological"))
	r.cost = float(d.get("cost", 100.0))
	r.effects = d.get("effects", {}).duplicate(true)
	for p in d.get("prerequisites", []):
		r.prerequisites.append(StringName(p))
	return r
