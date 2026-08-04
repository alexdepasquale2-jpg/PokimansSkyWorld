extends RefCounted
class_name BehaviorExecutor

## Turns AIController.State into spatial motion on the overworld.
## Culture decides; this executes. Pure function of (creature, context, delta).

const SEEK_RADIUS := 420.0


## context keys (all optional):
##   player: Node2D
##   world: PlanetWorld
##   allies: Array[Creature]
##   threats: Array[Creature]
##   food_point: Vector2  (precomputed forage attractor)
static func step(creature: Creature, delta: float, context: Dictionary = {}) -> void:
	if creature == null or not is_instance_valid(creature) or creature.ai == null:
		return
	if creature.stats != null and (creature.stats.hp <= 0.0 or creature.stats.downed):
		return
	var state: int = creature.ai.state
	var speed := 55.0
	if creature.stats != null:
		speed = maxf(28.0, creature.stats.stat("move_speed") * 0.85)
	var player: Node2D = context.get("player")
	var world: PlanetWorld = context.get("world")
	var pos := creature.global_position

	var home: Vector2 = context.get("home_point", pos)
	var plaza: Vector2 = context.get("plaza_point", pos)
	var work: Vector2 = context.get("work_point", pos)

	match state:
		AIController.State.IDLE, AIController.State.REST, AIController.State.PLAY:
			# Soft micro-sway so they do not look frozen.
			var sway := sin(Time.get_ticks_msec() * 0.002 + pos.x * 0.01) * 6.0 * delta
			creature.position += Vector2(sway, 0)
			# Settlers drift toward home when resting.
			if creature.get_meta("is_settler", false) and home.distance_to(pos) > 14.0:
				creature.position = pos.move_toward(home, speed * 0.35 * delta)
		AIController.State.WANDER:
			var ang := _wander_angle(creature)
			creature.position += Vector2(cos(ang), sin(ang)) * speed * 0.55 * delta
		AIController.State.SOCIALIZE:
			# Odyssey clan life: gather near the fire / plaza.
			var social_goal: Vector2 = plaza if plaza.distance_to(pos) > 1.0 else home
			if social_goal.distance_to(pos) > 12.0:
				creature.position = pos.move_toward(social_goal, speed * 0.5 * delta)
			else:
				var ang2 := _wander_angle(creature)
				creature.position += Vector2(cos(ang2), sin(ang2)) * speed * 0.25 * delta
		AIController.State.SEEK_FOOD, AIController.State.FORAGE:
			var food: Vector2 = context.get("food_point", pos)
			if food.distance_to(pos) > 8.0:
				creature.position = pos.move_toward(food, speed * 0.7 * delta)
		AIController.State.FLEE, AIController.State.MIGRATE:
			var threat := _nearest(pos, context.get("threats", []))
			if threat != null:
				var away := (pos - threat.global_position).normalized()
				if away.length_squared() < 0.01:
					away = Vector2.RIGHT.rotated(float(hash(creature.identity.uid) % 360) * TAU / 360.0)
				creature.position += away * speed * 1.05 * delta
			elif player != null:
				var away2 := (pos - player.global_position).normalized()
				creature.position += away2 * speed * 0.9 * delta
		AIController.State.FIGHT, AIController.State.PROTECT:
			var target := _nearest(pos, context.get("threats", []))
			if target == null and player != null:
				# Aggressive animals may treat the player party as prey.
				var aggro := 0.5
				if creature.stats != null:
					aggro = float(creature.stats.phenotype().get("aggression", 0.5))
				if aggro >= 0.55:
					target = player
			if target != null:
				creature.position = pos.move_toward(target.global_position, speed * 0.95 * delta)
		AIController.State.USE_TOOL:
			# Work at the bench / post if settler; else forage tools.
			var tool_goal: Vector2 = work if creature.get_meta("is_settler", false) \
				else context.get("food_point", pos)
			creature.position = pos.move_toward(tool_goal, speed * 0.4 * delta)
		_:
			pass

	# Keep creatures from stacking perfectly on the player.
	if player != null and creature.global_position.distance_to(player.global_position) < 18.0 \
			and state != AIController.State.FIGHT and state != AIController.State.PROTECT:
		var push := (creature.global_position - player.global_position).normalized()
		if push.length_squared() < 0.01:
			push = Vector2.RIGHT
		creature.position += push * 20.0 * delta


static func food_point_for(creature: Creature, world: PlanetWorld) -> Vector2:
	if world == null or creature == null:
		return Vector2.ZERO
	var best := creature.global_position
	var best_score := -1.0
	# Sample a few offsets; prefer high forage biomes / high ecology food signal.
	for i in 8:
		var ang := TAU * float(i) / 8.0 + float(hash(String(creature.identity.uid)) % 17) * 0.1
		var sample := creature.global_position + Vector2(cos(ang), sin(ang)) * 180.0
		var score := 0.0
		var eco: Dictionary = world.ecology_at(sample) if world.has_method("ecology_at") else {}
		if not eco.is_empty():
			score = Ecology.food_signal(eco)
		var biome_id := world.biome_at(sample)
		if not biome_id.is_empty():
			var res: Dictionary = PlanetGenerator.get_biome(biome_id).get("resources", {})
			score = maxf(score, float(res.get("forage", 0.0)) / 2.2)
		if score > best_score:
			best_score = score
			best = sample
	return best


static func _nearest(from: Vector2, nodes: Array) -> Node2D:
	var best: Node2D = null
	var best_d := SEEK_RADIUS
	for n in nodes:
		if n == null or not is_instance_valid(n) or not (n is Node2D):
			continue
		var d: float = from.distance_to((n as Node2D).global_position)
		if d < best_d:
			best_d = d
			best = n as Node2D
	return best


static func _wander_angle(creature: Creature) -> float:
	var seed := 0
	if creature.identity != null:
		seed = int(creature.identity.appearance_seed)
	var t := Time.get_ticks_msec() * 0.001
	return t * 0.35 + float(seed % 97) * 0.07 + sin(t * 0.2 + float(seed % 13)) * 0.8
