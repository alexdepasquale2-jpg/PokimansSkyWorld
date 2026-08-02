extends RefCounted
class_name CombatDirector

## Runs one encounter: two rosters, round-based, with a pause-and-command
## layer over the top. Not an autoload — instantiated per-encounter by
## whatever scene starts a fight (the arena test bed, later real gameplay).
##
## PAUSE-AND-COMMAND: `paused` stops `advance_round()` from doing anything.
## While paused, the player can call `command_attack` to override what one of
## their creatures does this round; anything not commanded falls back to AI.
## This is the full real-time-with-pause contract in the smallest form that
## actually works.

var side_a: Array = []   ## Array[Creature] — player's side.
var side_b: Array = []   ## Array[Creature] — opponents.
var rng := RandomNumberGenerator.new()
var paused: bool = false
var round_number: int = 0
var finished: bool = false
var log: Array = []

## uid (String) -> Creature, this round's forced target for a side_a creature.
var _commands: Dictionary = {}


func start(a: Array, b: Array, seed_value: int = 0) -> void:
	side_a = a
	side_b = b
	rng.seed = seed_value if seed_value != 0 else randi()
	round_number = 0
	finished = false
	log.clear()
	EventBus.combat_started.emit(a.map(func(c): return c.identity.uid)
		+ b.map(func(c): return c.identity.uid))


func command_attack(actor: Creature, target: Creature) -> void:
	_commands[String(actor.identity.uid)] = target


func set_paused(value: bool) -> void:
	paused = value


func alive(side: Array) -> Array:
	return side.filter(func(c): return c.stats.hp > 0.0)


## One round: every living creature on both sides acts once, commanded
## creatures use their order, everyone else asks their AI.
func advance_round() -> void:
	if paused or finished:
		return
	round_number += 1

	var living_a := alive(side_a)
	var living_b := alive(side_b)
	if living_a.is_empty() or living_b.is_empty():
		_finish(living_a, living_b)
		return

	for actor in living_a:
		_act(actor, living_b, side_b, living_a)
		living_b = alive(side_b)
		if living_b.is_empty():
			break
	if not alive(side_b).is_empty():
		living_a = alive(side_a)
		for actor in alive(side_b):
			_act(actor, living_a, side_a, side_b)
			living_a = alive(side_a)
			if living_a.is_empty():
				break

	_commands.clear()
	if alive(side_a).is_empty() or alive(side_b).is_empty():
		_finish(alive(side_a), alive(side_b))


func _act(actor: Creature, enemies: Array, enemy_allies: Array, own_allies: Array) -> void:
	if actor.stats.hp <= 0.0 or enemies.is_empty():
		return
	var target: Creature = _commands.get(String(actor.identity.uid))
	if target == null or target.stats.hp <= 0.0:
		target = actor.ai.choose_combat_target(enemies, rng) if actor.ai != null else enemies[0]
	if target == null:
		return  # fled or abstained
	var outcome := CombatSystem.attack_with_protection(actor, target, enemy_allies, rng)
	log.append({"round": round_number, "attacker": String(actor.identity.uid),
		"defender": String((outcome["target"] as Creature).identity.uid),
		"result": outcome["result"]})


func _finish(winners: Array, losers: Array) -> void:
	finished = true
	EventBus.combat_ended.emit(
		winners.map(func(c): return c.identity.uid),
		losers.map(func(c): return c.identity.uid))


func winner_side() -> String:
	if not finished:
		return ""
	if not alive(side_a).is_empty():
		return "a"
	if not alive(side_b).is_empty():
		return "b"
	return "draw"
