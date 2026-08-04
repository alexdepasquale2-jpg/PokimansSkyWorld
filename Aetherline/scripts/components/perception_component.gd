extends CreatureComponent
class_name PerceptionComponent

## What this creature currently senses, as the fixed vector the cultural network
## consumes.
##
## The composition itself lives in `Perception` (static, one owner of the layout);
## this component exists to hold the SMOOTHED result and to be the thing the
## creature scene can be missing. Drop this node and the creature still works —
## AIController falls back to composing directly, which is the same "found by
## name, not by type" property that lets a plant-creature have no AI.
##
## TEMPORAL SMOOTHING. Raw sensor values feed an exponential moving average
## rather than the network directly. A creature whose hunger crosses a threshold
## mid-decision should not have its whole policy snap; senses have inertia, and
## without it the drive outputs jitter frame to frame and the debug readout
## becomes unreadable. The first sensing seeds the average outright, so a
## newborn is not born half-blind.
##
## NOT SERIALIZED. This is derived state in the sense of assumption #11 — it
## rebuilds itself from the creature's real state on the next sensing, and
## storing it would freeze a stale view of a world that has moved on.

## Weight given to the newest reading. Low enough to smooth noise, high enough
## that a predator arriving is not news three decisions later.
const SMOOTHING: float = 0.45

var _vector: PackedFloat32Array = PackedFloat32Array()
var _sensed_tick: int = -1
var _has_sensed: bool = false

## Spatial senses from the world host (Overworld). Empty means Stage-1 zeros for
## DEAD_SLOTS 27–30 so pure culture tests stay bit-exact. Non-empty activates
## Odyssey Stage-2 inputs without re-initialising clan weights.
var world_senses: Dictionary = {}


func _on_setup() -> void:
	_vector = Perception.blank()


## Full Tier-1 sensing.
func sense() -> PackedFloat32Array:
	var fresh := Perception.compose(creature)
	apply_world_senses(fresh, world_senses)
	_blend(fresh)
	_sensed_tick = SimulationBudget.current_tick
	return _vector


## Tier-2 sensing: refresh the cheap slots, carry the rest forward.
## World senses are reapplied so a NEAR creature still feels predators/food
## without a full phenotype recompose of every trait slot.
func sense_coarse() -> PackedFloat32Array:
	var fresh := Perception.compose_coarse(creature, _vector)
	apply_world_senses(fresh, world_senses)
	_blend(fresh)
	_sensed_tick = SimulationBudget.current_tick
	return _vector


## Map host-supplied world distances/counts into slots 27–30. Safe no-op when
## `senses` is empty (culture lab / unit tests).
func apply_world_senses(v: PackedFloat32Array, senses: Dictionary) -> void:
	Perception.apply_world_senses(v, senses)


func _blend(fresh: PackedFloat32Array) -> void:
	if fresh.size() != Perception.SLOT_COUNT:
		return
	if not _has_sensed or _vector.size() != fresh.size():
		_vector = fresh
		_has_sensed = true
		return
	for i in fresh.size():
		_vector[i] = _vector[i] + (fresh[i] - _vector[i]) * SMOOTHING


## The last composed vector, without re-sensing. What the eligibility trace and
## the lab read.
func vector() -> PackedFloat32Array:
	return _vector


func has_sensed() -> bool:
	return _has_sensed


func ticks_since_sensed() -> int:
	return SimulationBudget.current_tick - _sensed_tick if _has_sensed else -1


func slot(slot_name: String) -> float:
	var index := Perception.slot_index(slot_name)
	return _vector[index] if index >= 0 and index < _vector.size() else 0.0


# --- Readout ------------------------------------------------------------------

func describe() -> Array[String]:
	if not _has_sensed:
		return ["  (has not sensed anything yet)"]
	var lines: Array[String] = ["  " + Perception.summarize(_vector)]
	lines.append("  last sensed %d tick(s) ago" % ticks_since_sensed())
	return lines


## The full 32-slot table, for the culture lab. Kept out of `describe` because
## the creature readout would drown in it.
func describe_full() -> Array[String]:
	return Perception.describe(_vector)


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	return {}


func post_load() -> void:
	# Sense fresh rather than restoring: the world this creature is waking up in
	# is not necessarily the one it fell asleep in.
	_vector = Perception.blank()
	_has_sensed = false
