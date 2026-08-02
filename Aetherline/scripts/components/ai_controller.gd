extends CreatureComponent
class_name AIController

## Decides what the creature does with itself.
##
## PHASE SCOPE: Phase 4 owns real AI — utility scoring over a full action set,
## combat tactics, mounting, commands. What exists here is the decision *seam*
## and a working utility loop over a minimal action set, so that (a) the
## component stack is complete and testable now, and (b) Phase 4 extends a
## working system instead of starting from a stub.
##
## The important property, established now: the AI reads the resolved
## phenotype, never the raw genome. A creature that was bred placid but
## traumatised into aggression must behave as the traumatised animal it is.

enum State { IDLE, WANDER, SEEK_FOOD, REST, FLEE, FIGHT }

@export var state: State = State.IDLE

## Ticks between decisions. Deliberately coarse: creatures that re-decide every
## frame look twitchy and cost a fortune at population scale.
@export var decision_interval: int = 30

var _next_decision_tick: int = 0
var _last_scores: Dictionary = {}


func maybe_decide() -> void:
	if SimulationBudget.current_tick < _next_decision_tick:
		return
	_next_decision_tick = SimulationBudget.current_tick + decision_interval
	decide()


## Score every action and take the best. Scores are exposed via `_last_scores`
## so the debug readout can explain a creature's choice rather than just
## reporting it.
func decide() -> void:
	if creature == null:
		return
	var traits: Dictionary = creature.stats.phenotype()
	var needs: NeedsComponent = creature.needs
	var bias: Dictionary = creature.archetype.ai_bias() if creature.archetype != null else {}

	var scores := {
		# Unmet needs dominate: an animal that is starving is not curious.
		State.SEEK_FOOD: (1.0 - needs.hunger) * 1.2,
		State.REST: (1.0 - needs.energy) * 0.9,
		# Temperament decides what it does with the time it has left over.
		State.WANDER: 0.25 + float(traits.get("agility", 1.0)) * 0.15,
		State.IDLE: 0.2 + float(traits.get("sociability", 0.5)) * 0.1,
		State.FIGHT: float(traits.get("aggression", 0.5)) * 0.3,
		State.FLEE: (1.0 - float(traits.get("aggression", 0.5))) * 0.1,
	}

	# Crystallized archetypes bias the weights rather than overriding the
	# choice, so a Guardian is still an animal with needs, not a script.
	for key in bias:
		var as_state := _state_from_key(String(key))
		if as_state >= 0:
			scores[as_state] = float(scores.get(as_state, 0.0)) * float(bias[key])

	var best: int = State.IDLE
	var best_score := -INF
	for candidate in scores:
		if float(scores[candidate]) > best_score:
			best_score = float(scores[candidate])
			best = candidate

	_last_scores = scores
	if best != state:
		state = best


func _state_from_key(key: String) -> int:
	match key:
		"seek_food": return State.SEEK_FOOD
		"rest": return State.REST
		"wander": return State.WANDER
		"idle": return State.IDLE
		"fight", "protect": return State.FIGHT
		"flee": return State.FLEE
		_: return -1


func state_name() -> String:
	return AetherTypes.enum_to_key(State, state)


func describe() -> Array[String]:
	var lines: Array[String] = ["  state: %s" % state_name().to_lower()]
	if not _last_scores.is_empty():
		var parts: Array[String] = []
		for key in _last_scores:
			parts.append("%s %.2f" % [AetherTypes.enum_to_key(State, key).to_lower(), _last_scores[key]])
		lines.append("  weighing: " + ",  ".join(parts))
	return lines


func to_dict() -> Dictionary:
	# The enum name, not the integer — reordering State must not turn every
	# resting creature in every save into a fleeing one.
	return {"state": AetherTypes.enum_to_key(State, state)}


func from_dict(d: Dictionary) -> void:
	state = AetherTypes.key_to_enum(State, String(d.get("state", "IDLE")), State.IDLE)
