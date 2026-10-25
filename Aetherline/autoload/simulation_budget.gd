extends Node
## SimulationBudget — the governor that keeps an infinite universe playable.
##
## CORE PROMISE OF THE PROJECT: never fully simulate every creature on every
## planet at once. This autoload is where that promise is enforced, and every
## other system is required to ask it before doing expensive work.
##
## Two mechanisms:
##  1. LOD banding. Each registered creature is assigned an AetherTypes.SimLOD.
##     Systems check `lod_of(uid)` and scale their work accordingly.
##  2. Round-robin tick slicing. Creatures below FULL are updated on a rotating
##     schedule, so the per-frame cost stays flat as population grows.
##
## Phase 0 establishes the interface and the accounting. The distance-based
## LOD assignment and the catch-up integration for DORMANT creatures are
## fleshed out in Phases 3 and 6 — the seams are marked with TODO(phase N).

## Simulation ticks per in-game day. Central constant: anything that converts
## between ticks and days must read it from here.
const TICKS_PER_DAY: float = 1200.0

## How many ABSTRACT/NEAR creatures we are willing to update per frame.
## Tuned later against real populations; conservative by default.
@export var near_updates_per_frame: int = 24
@export var abstract_updates_per_frame: int = 64

## Hard ceiling on fully-simulated creatures. Beyond this, the furthest FULL
## creatures are demoted regardless of distance thresholds.
@export var max_full_creatures: int = 64

## Distance bands in world pixels, measured from the camera/player focus.
@export var full_radius: float = 1400.0
@export var near_radius: float = 4000.0

var current_tick: int = 0
var current_day: int = 0

## uid -> { "node": Node (may be null), "lod": int, "last_tick": int,
##          "planet_id": String, "priority": float }
var _registry: Dictionary = {}

## Round-robin cursors into the uid lists per band.
var _near_cursor: int = 0
var _abstract_cursor: int = 0

## Per-frame accounting, surfaced in the debug overlay.
var stats: Dictionary = {
	"full": 0, "near": 0, "abstract": 0, "dormant": 0, "frozen": 0,
	"updates_this_frame": 0,
}

var _paused: bool = false

## Ticks between LOD reassignment passes.
const LOD_REASSIGN_INTERVAL: int = 30

## Where "near the player" is measured from. Set by the world scene each frame
## it moves; creatures are banded by distance from this point.
var focus_point: Vector2 = Vector2.ZERO


func set_focus_point(point: Vector2) -> void:
	focus_point = point


## Bands every registered creature by distance from the focus, then enforces
## the FULL-band ceiling by demoting the furthest, lowest-priority creatures.
func reassign_lod() -> void:
	var active := PlanetManager.active_planet_id
	var candidates: Array = []

	for uid in _registry:
		var entry: Dictionary = _registry[uid]
		if String(entry["planet_id"]) != active:
			_assign(uid, AetherTypes.SimLOD.DORMANT)
			continue
		var node: Node = entry["node"]
		if node == null or not is_instance_valid(node):
			_assign(uid, AetherTypes.SimLOD.DORMANT)
			continue
		if not (node is Node2D):
			_assign(uid, AetherTypes.SimLOD.ABSTRACT)
			continue
		var distance: float = (node as Node2D).global_position.distance_to(focus_point)
		if distance <= full_radius:
			candidates.append({"uid": uid, "distance": distance,
				"priority": float(entry["priority"])})
		elif distance <= near_radius:
			_assign(uid, AetherTypes.SimLOD.NEAR)
		else:
			_assign(uid, AetherTypes.SimLOD.ABSTRACT)

	candidates.sort_custom(func(a, b):
		if not is_equal_approx(a["priority"], b["priority"]):
			return a["priority"] > b["priority"]
		return a["distance"] < b["distance"])
	for i in candidates.size():
		_assign(candidates[i]["uid"],
			AetherTypes.SimLOD.FULL if i < max_full_creatures else AetherTypes.SimLOD.NEAR)


func _assign(uid: String, lod: AetherTypes.SimLOD) -> void:
	var entry: Dictionary = _registry[uid]
	if entry["lod"] == lod:
		return
	entry["lod"] = lod
	EventBus.sim_lod_changed.emit(StringName(uid), int(lod))


func _ready() -> void:
	# Runs even when the game logic is paused so the debug overlay stays live.
	process_mode = Node.PROCESS_MODE_ALWAYS


# --- Registration -------------------------------------------------------------

## Every creature that exists anywhere — loaded or archived — registers here.
## `node` may be null for creatures that have no body right now (left behind on
## another planet, in cold storage). That is the normal case for most of the
## universe, and is exactly why this registry is uid-keyed rather than
## node-keyed.
func register_creature(uid: StringName, node: Node, planet_id: String,
		lod: AetherTypes.SimLOD = AetherTypes.SimLOD.FULL) -> void:
	_registry[String(uid)] = {
		"node": node,
		"lod": lod,
		"last_tick": current_tick,
		"planet_id": planet_id,
		"priority": 0.0,
	}


func unregister_creature(uid: StringName) -> void:
	_registry.erase(String(uid))


func has_creature(uid: StringName) -> bool:
	return _registry.has(String(uid))


func lod_of(uid: StringName) -> AetherTypes.SimLOD:
	var entry: Variant = _registry.get(String(uid))
	if entry == null:
		return AetherTypes.SimLOD.FROZEN
	return entry["lod"]


## Manually pin a creature's LOD — used for the creature the player is
## currently controlling or mounted on, which must never be demoted.
func set_lod(uid: StringName, lod: AetherTypes.SimLOD) -> void:
	var key := String(uid)
	if not _registry.has(key):
		return
	if _registry[key]["lod"] == lod:
		return
	_registry[key]["lod"] = lod
	EventBus.sim_lod_changed.emit(uid, int(lod))


## Story-relevant creatures (named, archetyped, player favourites) get priority
## when the FULL band is oversubscribed. Attachment should not be evicted by a
## herd of anonymous grazers.
func set_priority(uid: StringName, priority: float) -> void:
	var key := String(uid)
	if _registry.has(key):
		_registry[key]["priority"] = priority


# --- Query --------------------------------------------------------------------

func uids_in_band(lod: AetherTypes.SimLOD) -> Array:
	var out: Array = []
	for uid in _registry:
		if _registry[uid]["lod"] == lod:
			out.append(uid)
	return out


func uids_on_planet(planet_id: String) -> Array:
	var out: Array = []
	for uid in _registry:
		if _registry[uid]["planet_id"] == planet_id:
			out.append(uid)
	return out


## Every creature the simulation knows about, whatever band it is in.
##
## The registry is the only place that knows the whole population — party,
## settlers, colonists left behind on another world. Anything that counts people
## by walking one of those lists instead counts a subset, and the subsets differ.
func uids() -> Array:
	return _registry.keys()


func node_for(uid: StringName) -> Node:
	var entry: Variant = _registry.get(String(uid))
	return null if entry == null else entry["node"]


func population() -> int:
	return _registry.size()


## Days elapsed for this creature since it was last updated. DORMANT creatures
## use this to catch up in one integration step instead of ticking.
func days_since_update(uid: StringName) -> float:
	var entry: Variant = _registry.get(String(uid))
	if entry == null:
		return 0.0
	return float(current_tick - int(entry["last_tick"])) / TICKS_PER_DAY


func mark_updated(uid: StringName) -> void:
	var key := String(uid)
	if _registry.has(key):
		_registry[key]["last_tick"] = current_tick


# --- Tick ---------------------------------------------------------------------

func set_paused(paused: bool) -> void:
	_paused = paused


func is_paused() -> bool:
	return _paused


func _physics_process(_delta: float) -> void:
	if _paused:
		return
	current_tick += 1
	EventBus.game_tick.emit(current_tick)

	var day := int(float(current_tick) / TICKS_PER_DAY)
	if day != current_day:
		current_day = day
		EventBus.day_passed.emit(day)

	_recount()
	# TODO(phase 3): distance-based LOD reassignment against the active planet's
	# focus point, plus demotion when max_full_creatures is exceeded.
	#
	# The Phase 4 half of this is done: CultureTicker consumes take_near_slice()
	# and take_abstract_slice() to drive the AI at each tier's cadence. The driver
	# lives there rather than here on purpose — this autoload's contract is
	# accounting, and a governor that knows what it is governing is one the next
	# system has to edit too. TODO(phase 6): the needs system wants the same
	# slices for statistical catch-up.


## Returns the slice of NEAR-band uids that should be updated this frame.
## Callers iterate the returned uids and do their coarse update. Because the
## cursor advances, every creature is visited at a predictable rate regardless
## of how large the population grows.
func take_near_slice() -> Array:
	var band := uids_in_band(AetherTypes.SimLOD.NEAR)
	return _slice(band, near_updates_per_frame, "_near_cursor")


func take_abstract_slice() -> Array:
	var band := uids_in_band(AetherTypes.SimLOD.ABSTRACT)
	return _slice(band, abstract_updates_per_frame, "_abstract_cursor")


func _slice(band: Array, budget: int, cursor_name: String) -> Array:
	if band.is_empty():
		return []
	var cursor: int = get(cursor_name)
	var count: int = mini(budget, band.size())
	var out: Array = []
	for i in count:
		out.append(band[(cursor + i) % band.size()])
	set(cursor_name, (cursor + count) % band.size())
	stats["updates_this_frame"] = int(stats["updates_this_frame"]) + count
	return out


func _recount() -> void:
	stats["full"] = 0
	stats["near"] = 0
	stats["abstract"] = 0
	stats["dormant"] = 0
	stats["frozen"] = 0
	stats["updates_this_frame"] = 0
	for uid in _registry:
		match _registry[uid]["lod"]:
			AetherTypes.SimLOD.FULL: stats["full"] += 1
			AetherTypes.SimLOD.NEAR: stats["near"] += 1
			AetherTypes.SimLOD.ABSTRACT: stats["abstract"] += 1
			AetherTypes.SimLOD.DORMANT: stats["dormant"] += 1
			AetherTypes.SimLOD.FROZEN: stats["frozen"] += 1


func debug_summary() -> String:
	return "tick %d (day %d) | pop %d | full %d near %d abs %d dorm %d frozen %d" % [
		current_tick, current_day, population(),
		stats["full"], stats["near"], stats["abstract"],
		stats["dormant"], stats["frozen"],
	]


# --- Save hooks ---------------------------------------------------------------

func to_dict() -> Dictionary:
	return {"current_tick": current_tick, "current_day": current_day}


func from_dict(d: Dictionary) -> void:
	current_tick = int(d.get("current_tick", 0))
	current_day = int(d.get("current_day", 0))
