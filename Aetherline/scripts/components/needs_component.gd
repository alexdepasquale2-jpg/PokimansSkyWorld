extends CreatureComponent
class_name NeedsComponent

## Hunger, energy, health and mood.
##
## Needs are stored as 0..1 satisfaction (1.0 = fully met) so every need reads
## the same way in UI and in AI utility scoring — no per-need polarity to
## remember. Drain rates are read from the resolved phenotype, which is what
## makes a giant, furnace-blooded animal genuinely expensive to keep.
##
## Phase 5 layers the full mood/relationship model on top; this is the
## substrate it will read.

## Satisfaction below which a need is "critical" and fires on the bus.
const CRITICAL_THRESHOLD: float = 0.15

## Base drain per in-game day at neutral phenotype, per need.
const BASE_DRAIN := {
	"hunger": 0.35,
	"energy": 0.45,
}

## Energy regained per day while resting. Deliberately faster than the drain,
## so a creature that stops to rest actually recovers within a day or two.
const RECOVERY_RATE := 0.7

@export var hunger: float = 1.0
@export var energy: float = 1.0
@export var health: float = 1.0
@export var mood: float = 0.7
@export var social: float = 0.5

## Needs already reported as critical, so the bus is not spammed every tick.
var _critical_flags: Dictionary = {}


func values() -> Dictionary:
	return {"hunger": hunger, "energy": energy, "health": health, "mood": mood, "social": social}


func get_need(key: String) -> float:
	match key:
		"hunger": return hunger
		"energy": return energy
		"health": return health
		"mood": return mood
		"social": return social
		_: return 1.0


## Integrate `days` of elapsed time. Written as an integration over days rather
## than a per-frame update specifically so a creature left behind on another
## planet for two years can be caught up in a single call.
func tick(days: float) -> void:
	if days <= 0.0:
		return
	var traits: Dictionary = creature.stats.phenotype() if creature != null else {}

	# A bigger, hungrier metabolism costs more to run; endurance offsets fatigue.
	var mass := maxf(0.1, float(traits.get("mass", 1.0)))
	var stamina := maxf(0.1, float(traits.get("stamina", 1.0)))

	hunger = clampf(hunger - BASE_DRAIN["hunger"] * mass * days, 0.0, 1.0)

	# Energy RECOVERS while resting and drains otherwise. Without this a
	# creature can never recoup exhaustion and dies of it however well fed —
	# and it is what gives the AI's rest decision real consequence.
	var resting: bool = creature.ai != null and creature.ai.state == AIController.State.REST
	if resting:
		energy = clampf(energy + RECOVERY_RATE * stamina * days, 0.0, 1.0)
	else:
		energy = clampf(energy - BASE_DRAIN["energy"] / stamina * days, 0.0, 1.0)

	# Starvation and exhaustion convert into health loss rather than simply
	# sitting at zero, so neglect has a real, recoverable cost.
	if hunger <= 0.0:
		health = clampf(health - 0.12 * days, 0.0, 1.0)
	if energy <= 0.0:
		health = clampf(health - 0.04 * days, 0.0, 1.0)

	# Social need tracks the strongest bond this creature has — an animal with
	# nobody it trusts drifts lonely regardless of how well-fed it is.
	if creature.relationships != null:
		var best: String = creature.relationships.strongest_bond()
		var target_social: float = 0.5 + creature.relationships.affinity(best) * 0.5 \
			if not best.is_empty() else 0.3
		social = clampf(lerpf(social, target_social, clampf(days * 0.2, 0.0, 1.0)), 0.0, 1.0)

	# Mood follows the worst unmet need, physical or social, and drifts back
	# up when things improve.
	var worst := minf(minf(hunger, energy), minf(health, social))
	mood = clampf(lerpf(mood, worst, clampf(days * 0.3, 0.0, 1.0)), 0.0, 1.0)

	_check_critical()


func feed(amount: float) -> void:
	hunger = clampf(hunger + amount, 0.0, 1.0)
	# Food is what brings a collapsed animal back — the neglect it fell to is
	# the same thing that revives it.
	if creature != null and creature.stats.downed and hunger > 0.4:
		health = maxf(health, 0.2)
		creature.stats.revive(0.35)


func rest(amount: float) -> void:
	energy = clampf(energy + amount, 0.0, 1.0)
	if creature != null and creature.stats.downed and energy > 0.5:
		creature.stats.revive(0.35)


func heal(amount: float) -> void:
	health = clampf(health + amount, 0.0, 1.0)
	if creature != null and health > 0.25:
		creature.stats.revive(0.4)


func _check_critical() -> void:
	for key in ["hunger", "energy", "health"]:
		var value := get_need(key)
		var is_critical := value <= CRITICAL_THRESHOLD
		if is_critical and not bool(_critical_flags.get(key, false)):
			_critical_flags[key] = true
			var uid: StringName = creature.identity.uid if creature != null else &""
			EventBus.need_critical.emit(uid, key, value)
		elif not is_critical:
			# Hysteresis: only re-arm once comfortably clear, so a need
			# hovering at the threshold does not flap.
			if value > CRITICAL_THRESHOLD * 2.0:
				_critical_flags[key] = false


func describe() -> Array[String]:
	return ["  hunger %.0f%%   energy %.0f%%   health %.0f%%   mood %.0f%%   social %.0f%%" % [
		hunger * 100.0, energy * 100.0, health * 100.0, mood * 100.0, social * 100.0]]


func to_dict() -> Dictionary:
	return {
		"hunger": hunger, "energy": energy, "health": health, "mood": mood, "social": social,
		"critical_flags": _critical_flags.duplicate(),
	}


func from_dict(d: Dictionary) -> void:
	hunger = float(d.get("hunger", 1.0))
	energy = float(d.get("energy", 1.0))
	health = float(d.get("health", 1.0))
	mood = float(d.get("mood", 0.7))
	social = float(d.get("social", 0.5))
	_critical_flags = d.get("critical_flags", {}).duplicate()
