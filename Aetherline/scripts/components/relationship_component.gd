extends CreatureComponent
class_name RelationshipComponent

## Bonds between this creature and specific others — the social half of Needs,
## and what makes the colony feel like individuals rather than a headcount.
## Affinity is built by shared events (protection, tending, fighting together),
## never assigned directly, so a bond is always a record of something that
## actually happened.

## uid (String) -> { "affinity": float (-1..1), "trust": float (0..1),
##                    "events": int, "last_tick": int }
@export var bonds: Dictionary = {}

const DECAY_PER_DAY := 0.004  ## Unattended bonds fade slowly, never vanish outright.


func adjust(other_uid: StringName, affinity_delta: float, trust_delta: float = 0.0) -> void:
	var key := String(other_uid)
	if key.is_empty() or (creature != null and key == String(creature.identity.uid)):
		return
	if not bonds.has(key):
		bonds[key] = {"affinity": 0.0, "trust": 0.0, "events": 0, "last_tick": 0}
	var b: Dictionary = bonds[key]
	b["affinity"] = clampf(float(b["affinity"]) + affinity_delta, -1.0, 1.0)
	b["trust"] = clampf(float(b["trust"]) + trust_delta, 0.0, 1.0)
	b["events"] = int(b["events"]) + 1
	b["last_tick"] = SimulationBudget.current_tick


func affinity(other_uid) -> float:
	return float((bonds.get(String(other_uid), {}) as Dictionary).get("affinity", 0.0))


func trust(other_uid) -> float:
	return float((bonds.get(String(other_uid), {}) as Dictionary).get("trust", 0.0))


func strongest_bond() -> String:
	var best: String = ""
	var best_value: float = -2.0
	for uid in bonds:
		var a := float((bonds[uid] as Dictionary)["affinity"])
		if a > best_value:
			best_value = a
			best = uid
	return best


func decay_all(days: float) -> void:
	for uid in bonds:
		var b: Dictionary = bonds[uid]
		b["affinity"] = move_toward(float(b["affinity"]), 0.0, DECAY_PER_DAY * days)


func describe() -> Array[String]:
	if bonds.is_empty():
		return ["  (no bonds formed)"]
	var lines: Array[String] = []
	var keys := bonds.keys()
	keys.sort_custom(func(a, b): return float(bonds[a]["affinity"]) > float(bonds[b]["affinity"]))
	for uid in keys:
		var b: Dictionary = bonds[uid]
		lines.append("  %-20s affinity %+.2f  trust %.2f  (%d events)" % [
			uid, b["affinity"], b["trust"], b["events"]])
	return lines


func to_dict() -> Dictionary:
	return {"bonds": bonds.duplicate(true)}


func from_dict(d: Dictionary) -> void:
	bonds = d.get("bonds", {}).duplicate(true)
