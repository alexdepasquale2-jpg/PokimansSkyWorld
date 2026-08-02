extends RefCounted
class_name CraftingSystem

## Recipes, gated by station + research, executed by a specific creature so
## that its aptitude actually matters and the work is logged as experience.

const RECIPES_FILE := "res://data/economy/recipes.json"
static var catalog: Dictionary = {}


static func load_catalog() -> void:
	if not catalog.is_empty():
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(RECIPES_FILE))
	if typeof(parsed) != TYPE_ARRAY:
		push_error("CraftingSystem: recipes.json missing or malformed")
		return
	for entry in parsed:
		catalog[String(entry["id"])] = entry


static func get_recipe(id) -> Dictionary:
	load_catalog()
	return catalog.get(String(id), {})


## Everything craftable right now, given the base built and research done.
static func available(summary: PlanetSummaryResource, research: ResearchSystem) -> Array:
	load_catalog()
	var out: Array = []
	for id in catalog:
		if can_craft(id, summary, research).is_empty():
			out.append(id)
	return out


## "" if craftable, else the reason. Separate from `craft` so UI can grey out
## a recipe and say why without attempting it.
static func can_craft(recipe_id, summary: PlanetSummaryResource,
		research: ResearchSystem) -> String:
	var recipe := get_recipe(recipe_id)
	if recipe.is_empty():
		return "unknown recipe"
	var required_research := String(recipe.get("requires_research", ""))
	if not required_research.is_empty() and research != null \
			and not research.is_unlocked(required_research):
		return "needs %s" % required_research
	var station := String(recipe.get("station", ""))
	if not station.is_empty() and not _has_station(summary, station):
		return "needs a %s" % station
	return ""


static func _has_station(summary: PlanetSummaryResource, station_id: String) -> bool:
	if summary == null:
		return false
	for entry in summary.structures:
		if String(entry["structure_id"]) == station_id:
			return true
	return false


## Run one batch. The crafter's skill trait scales OUTPUT, not speed — a deft
## animal gets more out of the same materials, which makes breeding for work
## aptitude an economic decision rather than a cosmetic one.
## Returns {"ok": bool, "note": String, "produced": Dictionary}.
static func craft(recipe_id, crafter: Creature, stock: Stockpile,
		summary: PlanetSummaryResource, research: ResearchSystem) -> Dictionary:
	var blocked := can_craft(recipe_id, summary, research)
	if not blocked.is_empty():
		return {"ok": false, "note": blocked, "produced": {}}

	var recipe := get_recipe(recipe_id)
	if not stock.spend(recipe.get("inputs", {})):
		return {"ok": false, "note": "insufficient materials", "produced": {}}

	var skill := String(recipe.get("skill", "craft"))
	var aptitude: float = crafter.stats.trait_value(skill) if crafter != null else 1.0
	# Station bonuses stack on top of the creature's own aptitude.
	var station_bonus := BaseBuilder.total_effect(summary, "work_bonus." + skill)
	var multiplier := clampf(aptitude + station_bonus, 0.25, 4.0)

	var produced := {}
	for res_id in recipe.get("outputs", {}):
		var qty: float = float(recipe["outputs"][res_id]) * multiplier
		stock.add_local(res_id, qty)
		produced[res_id] = qty

	if crafter != null:
		crafter.work.perform(skill if skill == "husbandry" else "craft",
			float(recipe.get("work_hours", 1.0)))
	return {"ok": true, "note": "", "produced": produced}
