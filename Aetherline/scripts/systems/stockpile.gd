extends RefCounted
class_name Stockpile

## The colony's goods. Split deliberately into what is HERE (on the active
## planet, subject to storage capacity, lost if abandoned) and what is CARRIED
## (aboard the ship, travels between worlds, tightly limited).
##
## That split is the economic spine of the whole game: an infinite universe of
## resources means nothing if you can take everything with you. Scarcity comes
## from the carry limit, not from the ground.

## resource_id -> amount, on the current planet.
var local: Dictionary = {}
## resource_id -> amount, aboard the ship.
var carried: Dictionary = {}

## Total mass the ship can move between worlds. Raised by research/hull upgrades.
var carry_capacity: float = 300.0


func amount(res_id, include_carried: bool = true) -> float:
	var total := float(local.get(String(res_id), 0.0))
	if include_carried:
		total += float(carried.get(String(res_id), 0.0))
	return total


func add_local(res_id, qty: float) -> void:
	var key := String(res_id)
	local[key] = maxf(0.0, float(local.get(key, 0.0)) + qty)


## Spends from local first, then the hold. Returns false and changes nothing
## if the total is insufficient — partial spends would corrupt recipe atomicity.
func spend(costs: Dictionary) -> bool:
	for res_id in costs:
		if amount(res_id) < float(costs[res_id]):
			return false
	for res_id in costs:
		var owed := float(costs[res_id])
		var key := String(res_id)
		var from_local := minf(owed, float(local.get(key, 0.0)))
		local[key] = float(local.get(key, 0.0)) - from_local
		owed -= from_local
		if owed > 0.0:
			carried[key] = maxf(0.0, float(carried.get(key, 0.0)) - owed)
	return true


func carried_mass() -> float:
	var total := 0.0
	for res_id in carried:
		total += float(carried[res_id])
	return total


## Move goods into the hold ahead of a jump. Refuses to exceed capacity —
## deciding what to leave behind is the point.
func load_for_travel(res_id, qty: float) -> float:
	var key := String(res_id)
	var available := minf(qty, float(local.get(key, 0.0)))
	var room := maxf(0.0, carry_capacity - carried_mass())
	var moved := minf(available, room)
	if moved <= 0.0:
		return 0.0
	local[key] = float(local[key]) - moved
	if local[key] <= 0.001:
		local.erase(key)
	carried[key] = float(carried.get(key, 0.0)) + moved
	return moved


## Move goods out of the hold onto the active planet (manual cargo manage).
func unload_from_hold(res_id, qty: float) -> float:
	var key := String(res_id)
	var available := minf(qty, float(carried.get(key, 0.0)))
	if available <= 0.0:
		return 0.0
	carried[key] = float(carried[key]) - available
	if carried[key] <= 0.001:
		carried.erase(key)
	add_local(key, available)
	return available


## On landing, the hold spills onto the new world's local pile.
func unload_on_arrival() -> void:
	for res_id in carried:
		add_local(res_id, float(carried[res_id]))
	carried.clear()


## All non-zero lines for UI lists: [{id, local, carried, total}, ...]
func lines(include_empty: bool = false) -> Array:
	var keys: Dictionary = {}
	for k in local:
		keys[String(k)] = true
	for k in carried:
		keys[String(k)] = true
	var out: Array = []
	var sorted: Array = keys.keys()
	sorted.sort()
	for key in sorted:
		var loc := float(local.get(key, 0.0))
		var car := float(carried.get(key, 0.0))
		if not include_empty and loc + car <= 0.001:
			continue
		out.append({"id": key, "local": loc, "carried": car, "total": loc + car})
	return out



## Anything still local when the player jumps stays behind, on that planet.
func abandon_local() -> Dictionary:
	var left := local.duplicate()
	local.clear()
	return left


func to_dict() -> Dictionary:
	return {"local": local.duplicate(), "carried": carried.duplicate(),
		"carry_capacity": carry_capacity}


func from_dict(d: Dictionary) -> void:
	local = d.get("local", {}).duplicate()
	carried = d.get("carried", {}).duplicate()
	carry_capacity = float(d.get("carry_capacity", 300.0))
