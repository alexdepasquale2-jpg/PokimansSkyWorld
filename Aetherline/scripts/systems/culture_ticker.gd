extends Node
class_name CultureTicker

## Drives the AI at the cadence each simulation tier deserves.
##
## THIS IS THE CONSUMER SimulationBudget WAS WAITING FOR. Phase 0 left a marked
## `TODO(phase 4/6)` there — the round-robin cursors and the per-frame budgets
## were already written and already accounted for; what was missing was somebody
## to call them.
##
## THE DRIVER DOES NOT LIVE INSIDE simulation_budget.gd, deliberately. That
## autoload's contract is accounting: LOD banding and slice budgets, and nothing
## else. The moment the governor knows what AI is, the thing that enforces "never
## simulate everything" becomes coupled to the thing it governs, and the next
## system that wants a slice has to edit the governor too. `take_near_slice()`
## and `take_abstract_slice()` are public and already do the accounting; they
## were written to be called from outside, so they are.
##
## WHAT EACH TIER COSTS, which is the whole point of the split:
##   FULL      one forward pass per creature per decision_interval ticks
##   NEAR      one forward pass per creature, but only for the slice this frame
##   ABSTRACT  NO forward pass at all — the band shares one cached policy
##
## PROCESS ORDER. SimulationBudget is an autoload and therefore enters the tree
## before any scene, so its _physics_process runs first: it advances the tick and
## zeroes `updates_this_frame` in _recount(), and this node then increments that
## counter by taking slices. Correct, but load-bearing and not obvious — if this
## ever moves into an autoload of its own, check the order again.

## Ticks between refreshes of the clan-wide mean policy that the ABSTRACT band
## acts on. Five seconds of game time at 1x.
const ABSTRACT_POLICY_INTERVAL: int = 300

## Set false to freeze all AI without pausing the simulation — the lab uses it
## so a designer can inspect a decision without it being overwritten.
@export var enabled: bool = true

var decisions_full: int = 0
var decisions_near: int = 0
var decisions_abstract: int = 0


func _ready() -> void:
	process_physics_priority = 100  # After SimulationBudget's tick advance.
	# The generational clock. Connected here rather than gated behind `enabled`,
	# which suspends DECISIONS for the lab's benefit — a clan that is not being
	# thought about is still getting older.
	EventBus.day_passed.connect(_on_day_passed)


func _exit_tree() -> void:
	if EventBus.day_passed.is_connected(_on_day_passed):
		EventBus.day_passed.disconnect(_on_day_passed)


## A day of lived time, for every clan somebody is simulating.
##
## Here rather than in the settlement, which is where it used to be: a clan ages
## whether or not it has a village, and hanging the boundary off village life
## meant a party in the field aged not at all.
func _on_day_passed(_day: int) -> void:
	CultureRegistry.age_simulated(1.0)


func _physics_process(_delta: float) -> void:
	if not enabled or SimulationBudget.is_paused():
		return

	# Tier 1. The band is small by construction (max_full_creatures), and
	# maybe_decide honours decision_interval, so most frames do almost nothing.
	for uid in SimulationBudget.uids_in_band(AetherTypes.SimLOD.FULL):
		var ai := _ai_for(uid)
		if ai != null:
			ai.maybe_decide()
			decisions_full += 1

	# Tier 2. Round-robin: cost is flat regardless of how large the band grows,
	# and every creature is still visited at a predictable rate.
	for uid in SimulationBudget.take_near_slice():
		var ai := _ai_for(uid)
		if ai != null:
			ai.decide_coarse()
			SimulationBudget.mark_updated(StringName(uid))
			decisions_near += 1

	# Tier 3.
	for uid in SimulationBudget.take_abstract_slice():
		var ai := _ai_for(uid)
		if ai != null:
			ai.decide_abstract()
			SimulationBudget.mark_updated(StringName(uid))
			decisions_abstract += 1

	if SimulationBudget.current_tick % ABSTRACT_POLICY_INTERVAL == 0:
		for culture in CultureRegistry.all():
			(culture as CultureResource).refresh_mean_policy()


func _ai_for(uid) -> AIController:
	var node := SimulationBudget.node_for(StringName(uid))
	return null if node == null else node.ai as AIController


func reset_counters() -> void:
	decisions_full = 0
	decisions_near = 0
	decisions_abstract = 0


func debug_summary() -> String:
	return "CultureTicker: %d full, %d near, %d abstract decisions" % [
		decisions_full, decisions_near, decisions_abstract]
