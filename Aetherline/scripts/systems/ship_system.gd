extends RefCounted
class_name ShipSystem

## The incremental layer — and the reason to come back to orbit.
##
## Everything you do planetside earns salvage; salvage buys modules; modules
## widen what the planet layer is allowed to contain. Crucially the modules do
## not just make numbers bigger: `fauna_depth`, `scan_depth` and `reveal_depth`
## gate how much of the simulation the player is permitted to SEE, so upgrading
## genuinely opens the game up rather than trivialising it.
##
## HOME: K3-4R1. The player is the last human off it, and the ship is what is
## left of the place.

const HOME_PLANET := "K3-4R1"
const MODULES_FILE := "res://data/ship/modules.json"
const ACHIEVEMENTS_FILE := "res://data/ship/achievements.json"

static var modules: Dictionary = {}
static var achievements: Dictionary = {}

var salvage: float = 0.0
var levels: Dictionary = {}            ## module_id -> int
var invested: Dictionary = {}          ## module_id -> total salvage spent (for sell refunds)
var unlocked_achievements: Array[String] = []
var lifetime: Dictionary = {}          ## metric -> float, never decreases

## Default action tags when modules.json omits `action` (used by ActionEffects).
const MODULE_ACTIONS := {
	"mod_drive": "upgrade", "mod_scanner": "scan", "mod_hold": "harvest",
	"mod_habitat": "rest", "mod_stasis": "rest", "mod_lab": "upgrade",
	"mod_sensor": "catch", "mod_beacon": "upgrade",
}


static func load_catalogs() -> void:
	if modules.is_empty():
		for entry in (JSON.parse_string(
				FileAccess.get_file_as_string(MODULES_FILE)) as Array):
			modules[String(entry["id"])] = entry
	if achievements.is_empty():
		for entry in (JSON.parse_string(
				FileAccess.get_file_as_string(ACHIEVEMENTS_FILE)) as Array):
			achievements[String(entry["id"])] = entry


func _init() -> void:
	load_catalogs()


# --- Modules ---------------------------------------------------------------------

func module_definition(module_id) -> Dictionary:
	load_catalogs()
	var key := String(module_id)
	var definition: Dictionary = modules.get(key, {}).duplicate(true)
	if definition.is_empty():
		return {}
	if not definition.has("action"):
		definition["action"] = MODULE_ACTIONS.get(key, "upgrade")
	return definition


func level_of(module_id) -> int:
	return int(levels.get(String(module_id), 0))


func max_level(module_id) -> int:
	return int(modules.get(String(module_id), {}).get("max_level", 1))


func cost_of(module_id) -> float:
	var definition: Dictionary = modules.get(String(module_id), {})
	if definition.is_empty():
		return INF
	var level := level_of(module_id)
	if level >= int(definition["max_level"]):
		return INF
	return float(definition["base_cost"]) * pow(float(definition["cost_growth"]), level)


func can_upgrade(module_id) -> bool:
	var cost := cost_of(module_id)
	return cost < INF and salvage >= cost


func upgrade(module_id) -> bool:
	if not can_upgrade(module_id):
		return false
	var key := String(module_id)
	var cost := cost_of(key)
	salvage -= cost
	invested[key] = float(invested.get(key, 0.0)) + cost
	levels[key] = level_of(key) + 1
	return true


## Total salvage spent on this module across all levels (for sell pricing UI).
func paid_cost(module_id) -> float:
	return float(invested.get(String(module_id), 0.0))


## Sell one level of a module back for 60% of the average invested cost.
func sell(module_id) -> bool:
	var key := String(module_id)
	var level := level_of(key)
	if level <= 0:
		return false
	var total_paid := float(invested.get(key, 0.0))
	var slice := total_paid / float(level) if level > 0 else 0.0
	var refund := slice * 0.6
	levels[key] = level - 1
	if levels[key] <= 0:
		levels.erase(key)
		invested.erase(key)
	else:
		invested[key] = maxf(0.0, total_paid - slice)
	salvage += refund
	return true


## Summed effect of a stat across every module that provides it.
func stat(key: String) -> float:
	var total := 0.0
	for module_id in modules:
		var per_level: Dictionary = modules[module_id].get("per_level", {})
		if per_level.has(key):
			total += float(per_level[key]) * float(level_of(module_id))
	return total


func flavor_for(module_id) -> String:
	var definition: Dictionary = modules.get(String(module_id), {})
	var flavor: Array = definition.get("flavor", [])
	var level := level_of(module_id)
	if flavor.is_empty():
		return ""
	return String(flavor[clampi(level - 1, 0, flavor.size() - 1)]) if level > 0 \
		else "(not installed)"


# --- What the ship permits the planet layer to be ---------------------------------

## How many fauna species a world may present. A weak ship simply cannot
## perceive or survive a rich biosphere; upgrading reveals it.
func fauna_depth() -> float:
	return 0.45 + stat("scan_depth") * 0.14 + stat("jump_range") * 0.06


## 0 orbit-only .. 5 everything. Drives what the star map will tell you.
func scan_depth() -> int:
	return int(stat("scan_depth"))


## 0 nothing .. 4 archetype progress. Drives creature inspection.
func reveal_depth() -> int:
	return int(stat("reveal_depth"))


func jump_candidates() -> int:
	return 3 + int(stat("candidates"))


## Exotic worlds — the extremes of the generator — only become reachable once
## the drive can get there.
func exotic_chance() -> float:
	return clampf(stat("exotic_chance"), 0.0, 0.8)


func carry_capacity() -> float:
	return 200.0 + stat("carry_capacity")


func colony_cap() -> int:
	return 6 + int(stat("colony_cap"))


func abandonment_protection() -> float:
	return clampf(stat("abandonment_protection"), 0.0, 0.95)


func settlement_tier_bonus() -> int:
	return int(stat("settlement_tier"))


## Applied to the campaign-wide genetics knobs when the ship changes.
func apply_biology_bonuses() -> void:
	EpigeneticsComponent.research_heritability_bonus = \
		maxf(EpigeneticsComponent.research_heritability_bonus, stat("heritability"))


# --- Salvage & achievements ---------------------------------------------------------

func add_salvage(amount: float) -> void:
	salvage += maxf(0.0, amount)


## Record progress on a lifetime metric. Returns any achievements it unlocked,
## so the caller can celebrate them.
func record(metric: String, value: float, cumulative: bool = false) -> Array:
	var current := float(lifetime.get(metric, 0.0))
	lifetime[metric] = (current + value) if cumulative else maxf(current, value)
	return check_achievements()


func check_achievements() -> Array:
	var earned: Array = []
	for id in achievements:
		if unlocked_achievements.has(String(id)):
			continue
		var definition: Dictionary = achievements[id]
		if float(lifetime.get(String(definition["metric"]), 0.0)) \
				>= float(definition["threshold"]):
			unlocked_achievements.append(String(id))
			add_salvage(float(definition.get("salvage", 0.0)))
			earned.append(definition)
	return earned


func achievement_progress() -> Array:
	var out: Array = []
	for id in achievements:
		var definition: Dictionary = achievements[id]
		out.append({
			"id": id,
			"name": definition["display_name"],
			"description": definition["description"],
			"done": unlocked_achievements.has(String(id)),
			"have": float(lifetime.get(String(definition["metric"]), 0.0)),
			"need": float(definition["threshold"]),
			"reward": definition.get("reward_text", ""),
		})
	var fraction := func(e): return float(e["have"]) / maxf(1.0, float(e["need"]))
	out.sort_custom(func(a, b):
		if a["done"] != b["done"]:
			return not a["done"]
		return fraction.call(a) > fraction.call(b))
	return out


# --- Serialization ---------------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"salvage": salvage,
		"levels": levels.duplicate(),
		"invested": invested.duplicate(),
		"unlocked": unlocked_achievements.duplicate(),
		"lifetime": lifetime.duplicate(),
	}


func from_dict(d: Dictionary) -> void:
	salvage = float(d.get("salvage", 0.0))
	levels = d.get("levels", {}).duplicate()
	invested = d.get("invested", {}).duplicate()
	# Backfill invested for older saves so sell still refunds something.
	if invested.is_empty() and not levels.is_empty():
		for module_id in levels:
			var paid := 0.0
			var definition: Dictionary = modules.get(String(module_id), {})
			if definition.is_empty():
				continue
			var base := float(definition.get("base_cost", 30.0))
			var growth := float(definition.get("cost_growth", 1.5))
			for lv in int(levels[module_id]):
				paid += base * pow(growth, lv)
			invested[String(module_id)] = paid
	lifetime = d.get("lifetime", {}).duplicate()
	unlocked_achievements.clear()
	for id in d.get("unlocked", []):
		unlocked_achievements.append(String(id))
	apply_biology_bonuses()
